const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const { AttemptRepository } = require('../src/repositories/attempt.repository');
const questionRepository = require('../src/repositories/question.repository');
const ScoringService = require('../src/services/scoring.service');

function createMockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key(idx) {
      return Array.from(store.keys())[idx] ?? null;
    },
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    }
  };
}

function createMockElement(id = '') {
  const classes = new Set();
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    src: '',
    title: '',
    disabled: false,
    style: {},
    options: [],
    dataset: {},
    children: [],
    className: '',
    classList: {
      add: (...tokens) => tokens.forEach(t => classes.add(t)),
      remove: (...tokens) => tokens.forEach(t => classes.delete(t)),
      toggle: (t, force) => {
        if (force === undefined) {
          if (classes.has(t)) classes.delete(t);
          else classes.add(t);
        } else if (force) {
          classes.add(t);
        } else {
          classes.delete(t);
        }
      },
      contains: (t) => classes.has(t)
    },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    scrollIntoView() {}
  };
}

function createAppHarness({ email = 'user@test.com', initialStorage = {}, confirmResult = true, fetchImpl = null } = {}) {
  const localStorage = createMockLocalStorage({
    ...(email ? { apti_user_email: email } : {}),
    ...initialStorage
  });

  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, createMockElement(id));
    return elements.get(id);
  };

  let nextTimerId = 1;
  const intervals = new Map();

  const mockDocument = {
    visibilityState: 'visible',
    activeElement: null,
    body: createMockElement('body'),
    getElementById: (id) => getEl(id),
    querySelector: () => createMockElement('main'),
    querySelectorAll: () => [],
    addEventListener() {}
  };

  const mockWindow = {
    location: { hostname: 'localhost', port: '3000', pathname: '/', search: '' },
    innerWidth: 1280,
    scrollTo() {},
    addEventListener() {},
    AptiPrep: {}
  };

  const appSource = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
    .replace(/const app = new AptiPrepApp\(\);/, '');

  const context = {
    window: mockWindow,
    document: mockDocument,
    localStorage,
    URLSearchParams,
    console,
    Math,
    Date,
    JSON,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
    confirm: () => confirmResult,
    alert: () => {},
    fetch: fetchImpl || (async () => ({ ok: false, json: async () => ({}) })),
    requestAnimationFrame: (cb) => cb(),
    setTimeout: (cb) => {
      void cb;
      return 0;
    },
    clearTimeout: () => {},
    setInterval: (cb, ms) => {
      const id = nextTimerId++;
      intervals.set(id, { cb, ms });
      return id;
    },
    clearInterval: (id) => {
      intervals.delete(id);
    }
  };
  mockWindow.APTIPREP_CONFIG = { USE_LOCAL_API_IF_AVAILABLE: true };

  vm.createContext(context);
  vm.runInContext(`${appSource}\nthis.__AptiPrepApp = AptiPrepApp;`, context);

  const AptiPrepApp = context.__AptiPrepApp;
  const origInit = AptiPrepApp.prototype.init;
  const origBind = AptiPrepApp.prototype.bindKeyboardShortcuts;
  AptiPrepApp.prototype.init = function() {};
  AptiPrepApp.prototype.bindKeyboardShortcuts = function() {};

  const app = new AptiPrepApp();
  AptiPrepApp.prototype.init = origInit;
  AptiPrepApp.prototype.bindKeyboardShortcuts = origBind;

  return {
    app,
    localStorage,
    elements,
    getEl,
    mockDocument,
    intervals,
    tickIntervals(times = 1) {
      for (let i = 0; i < times; i++) {
        for (const entry of Array.from(intervals.values())) {
          entry.cb();
        }
      }
    }
  };
}

function loadClientService(relativePath, mockStorage = {}, fetchImpl = null) {
  const localStorage = createMockLocalStorage(mockStorage);
  const mockWindow = { AptiPrep: {}, APTIPREP_CONFIG: { USE_LOCAL_API_IF_AVAILABLE: true } };
  const src = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const ctx = {
    window: mockWindow,
    localStorage,
    fetch: fetchImpl || (async () => ({ ok: false, json: async () => ({}) })),
    encodeURIComponent,
    console,
    Date,
    JSON,
    Map,
    Set,
    Array
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { AptiPrep: mockWindow.AptiPrep, localStorage };
}

describe('Home Page Attempt Sessions Unit Tests', () => {
  test('saveChapterStudyProgress stores progress, correctCount, questionTimes, and ignores test mode', () => {
    const { app, localStorage } = createAppHarness({ email: 'Student@Example.com' });
    app.practiceSubjectFilter = 'aptitude';
    app.practice = {
      chapter: 'Ratio & Proportion',
      modeType: 'study',
      currentIndex: 1,
      questions: [
        { id: 'q1', correctAnswer: 2 },
        { id: 'q2', correctAnswer: 0 },
        { id: 'q3', correctAnswer: 1 }
      ],
      userAnswers: { 0: 2, 1: 3 },
      reviewFlags: { 1: true },
      questionTimes: { q1: 14, q2: 22 }
    };

    app.saveChapterStudyProgress();
    const key = app.getChapterStudyStorageKey('Ratio & Proportion');
    assert.equal(key, 'apti_study_student_example_com_ratio___proportion');

    const saved = JSON.parse(localStorage.getItem(key));
    assert.equal(saved.chapter, 'Ratio & Proportion');
    assert.equal(saved.subjectFilter, 'aptitude');
    assert.equal(saved.totalQuestions, 3);
    assert.equal(saved.correctCount, 1);
    assert.equal(saved.currentIndex, 1);
    assert.deepEqual(saved.questionTimes, { q1: 14, q2: 22 });

    // Must not overwrite study progress when in test mode
    app.practice.modeType = 'test';
    app.practice.userAnswers = { 0: 0 };
    app.saveChapterStudyProgress();
    const afterTestMode = JSON.parse(localStorage.getItem(key));
    assert.equal(afterTestMode.correctCount, 1);
  });

  test('getSavedStudySessions isolates by user email, skips 0-answer entries, enriches metadata, and sorts newest first', () => {
    const { app } = createAppHarness({
      email: 'alice@test.com',
      initialStorage: {
        apti_study_alice_test_com_ages: JSON.stringify({
          chapter: 'Ages',
          userAnswers: { 0: 1, 1: 2 },
          currentIndex: 1,
          savedAt: 1000
        }),
        apti_study_alice_test_com_cell: JSON.stringify({
          chapter: 'Cell',
          subjectFilter: 'science',
          totalQuestions: 45,
          correctCount: 3,
          userAnswers: { 0: 0, 1: 1, 2: 2, 3: 3 },
          currentIndex: 3,
          savedAt: 5000
        }),
        apti_study_alice_test_com_empty: JSON.stringify({
          chapter: 'Empty Chapter',
          userAnswers: {},
          savedAt: 9000
        }),
        apti_study_bob_test_com_ages: JSON.stringify({
          chapter: 'Ages',
          userAnswers: { 0: 1 },
          savedAt: 9999
        })
      }
    });

    app.chapters = [
      { name: 'Ages', subject: 'Quantitative Aptitude', subSubject: 'Aptitude', count: 50 },
      { name: 'Cell', subject: 'General Science', subSubject: 'Biology', count: 45 }
    ];

    const sessions = app.getSavedStudySessions();
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].chapter, 'Cell');
    assert.equal(sessions[0].answeredCount, 4);
    assert.equal(sessions[1].chapter, 'Ages');
    assert.equal(sessions[1].totalQuestions, 50);
    assert.equal(sessions[1].subjectFilter, 'aptitude');
  });

  test('getHomeAttemptSessions combines active mock, active chapter test, and saved study sessions for active user only', () => {
    const { app } = createAppHarness({
      email: 'jitesh@local',
      initialStorage: {
        apti_active_mock: JSON.stringify({
          userEmail: 'jitesh@local',
          subject: 'science',
          questions: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
          userAnswers: { m1: 0, m2: 1 },
          currentIndex: 2,
          timeLeftSeconds: 1500,
          savedAt: 3000
        }),
        apti_active_practice: JSON.stringify({
          userEmail: 'jitesh@local',
          modeType: 'test',
          chapter: 'Motion',
          questions: [{ id: 'p1' }, { id: 'p2' }],
          userAnswers: { 0: 1 },
          currentIndex: 1,
          savedAt: 4000
        }),
        apti_study_jitesh_local_ages: JSON.stringify({
          chapter: 'Ages',
          userAnswers: { 0: 0 },
          totalQuestions: 20,
          currentIndex: 0,
          savedAt: 2000
        })
      }
    });

    const sessions = app.getHomeAttemptSessions();
    assert.equal(sessions.length, 3);
    assert.deepEqual([...sessions.map(s => s.type)], ['chapter_test', 'mock', 'study']);
    assert.equal(sessions[1].chapter, 'Mock Test (science)');
    assert.equal(sessions[1].answeredCount, 2);
  });

  test('renderAttemptSessionsSection renders cards with Resume/Reset controls and hides when empty', () => {
    const { app, getEl, localStorage } = createAppHarness({
      email: 'jitesh@local',
      initialStorage: {
        apti_study_jitesh_local_percentage: JSON.stringify({
          chapter: 'Percentage',
          subjectFilter: 'aptitude',
          totalQuestions: 100,
          correctCount: 8,
          userAnswers: { 0: 1, 1: 2, 2: 0, 3: 1, 4: 2, 5: 3, 6: 0, 7: 1, 8: 2, 9: 3 },
          currentIndex: 9,
          savedAt: Date.now() - 120000
        })
      }
    });

    const container = getEl('dashboard-attempt-sessions');
    app.renderAttemptSessionsSection();
    assert.equal(container.classList.contains('hidden'), false);
    assert.match(container.innerHTML, /Active &amp; Saved Attempt Sessions/);
    assert.match(container.innerHTML, /Percentage/);
    assert.match(container.innerHTML, /10 \/ 100 attempted \(10%\)/);
    assert.match(container.innerHTML, /80% acc/);
    assert.match(container.innerHTML, /Resume &rarr;/);
    assert.match(container.innerHTML, /Reset/);

    app.discardHomeAttemptSession('study', 'Percentage');
    assert.equal(localStorage.getItem('apti_study_jitesh_local_percentage'), null);
    assert.equal(container.classList.contains('hidden'), true);
    assert.equal(container.innerHTML, '');
  });

  test('renderChaptersGrid renders saved session progress badge on matching chapters only', () => {
    const { app, getEl } = createAppHarness({
      email: 'jitesh@local',
      initialStorage: {
        apti_study_jitesh_local_ages: JSON.stringify({
          chapter: 'Ages',
          subjectFilter: 'aptitude',
          totalQuestions: 40,
          userAnswers: { 0: 1, 1: 2, 2: 0, 3: 1 },
          savedAt: Date.now()
        })
      }
    });

    app.chapters = [
      { name: 'Ages', subject: 'Quantitative Aptitude', subSubject: 'Aptitude', count: 40 },
      { name: 'Cell', subject: 'General Science', subSubject: 'Biology', count: 30 }
    ];
    app.rkChapters = [
      { name: 'Ages', subject: 'Quantitative Aptitude', subSubject: 'RK Ranjan Math', faculty: 'RK Ranjan', count: 60 }
    ];

    app.currentSubjectFilter = 'aptitude';
    app.renderChaptersGrid();
    const grid = getEl('chapters-grid');
    assert.match(grid.innerHTML, /4\/40 done/);

    // Same-named RK Ranjan chapter must not display Dixit aptitude session badge
    app.currentSubjectFilter = 'rk_ranjan';
    app.renderChaptersGrid();
    assert.doesNotMatch(grid.innerHTML, /4\/40 done/);
  });

  test('saveAttempt deduplicates by attemptId and renderAttemptsHistory handles Google Sheet rows safely', () => {
    const { app, localStorage, getEl } = createAppHarness({ email: 'jitesh@local' });
    const a1 = {
      attemptId: 'att-1',
      timestamp: '2026-11-27T10:00:00Z',
      userEmail: 'jitesh@local',
      mode: 'Mock Test',
      chapter: '<script>All</script>',
      correctCount: 20,
      totalQuestions: 30,
      scorePercentage: 66.7,
      timeTakenFormatted: '12m 10s'
    };

    app.saveAttempt(a1);
    app.saveAttempt(a1);

    assert.equal(app.attempts.length, 1);
    const stored = JSON.parse(localStorage.getItem('apti_attempts'));
    assert.equal(stored.length, 1);

    app.renderDashboard();
    const tbody = getEl('attempts-table-body');
    assert.match(tbody.innerHTML, /12m 10s/);
    assert.doesNotMatch(tbody.innerHTML, /<script>/);
    assert.match(tbody.innerHTML, /&lt;script&gt;All&lt;\/script&gt;/);

    const widget = getEl('dashboard-study-widget');
    assert.match(widget.innerHTML, /1<\/span>\s*<span[^>]*>Full 30-min exams/);
  });

  test('formatRelativeSessionTime formats seconds, minutes, hours, and days', () => {
    const { app } = createAppHarness();
    const now = Date.now();
    assert.equal(app.formatRelativeSessionTime(now - 5000), 'Just now');
    assert.equal(app.formatRelativeSessionTime(now - 5 * 60000), '5m ago');
    assert.equal(app.formatRelativeSessionTime(now - 3 * 3600000), '3h ago');
    assert.equal(app.formatRelativeSessionTime(now - 2 * 86400000), '2d ago');
  });
});

describe('Study Mode Per-Question Timer Unit Tests', () => {
  test('formatQuestionTimer and getPracticeQuestionTimeKey handle valid and fallback inputs', () => {
    const { app } = createAppHarness();
    assert.equal(app.formatQuestionTimer(0), '00:00');
    assert.equal(app.formatQuestionTimer(9), '00:09');
    assert.equal(app.formatQuestionTimer(75), '01:15');
    assert.equal(app.formatQuestionTimer(-5), '00:00');
    assert.equal(app.formatQuestionTimer(null), '00:00');

    assert.equal(app.getPracticeQuestionTimeKey({ id: 'sci_cell_q1' }, 0), 'sci_cell_q1');
    assert.equal(app.getPracticeQuestionTimeKey({}, 4), '4');
  });

  test('startPracticeTimer tracks independent per-question times, pauses when answered, and resumes on clear', () => {
    const { app, getEl, tickIntervals, mockDocument } = createAppHarness();
    app.currentMode = 'practice';
    app.practice = {
      chapter: 'Cell',
      modeType: 'study',
      currentIndex: 0,
      questions: [
        { id: 'q_1', question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
        { id: 'q_2', question: 'Q2', options: ['A', 'B', 'C', 'D'], correctAnswer: 2 }
      ],
      userAnswers: {},
      reviewFlags: {},
      questionTimes: {},
      timerInterval: null,
      startTime: Date.now()
    };

    app.startPracticeTimer();
    tickIntervals(4);
    assert.equal(app.practice.questionTimes.q_1, 4);
    assert.equal(getEl('practice-question-timer-text').textContent, '00:04');

    // Hidden tab pauses ticking
    mockDocument.visibilityState = 'hidden';
    tickIntervals(3);
    assert.equal(app.practice.questionTimes.q_1, 4);
    mockDocument.visibilityState = 'visible';

    // Answering in Study Mode pauses timer and styles badge green
    app.selectPracticeOption(1);
    tickIntervals(5);
    assert.equal(app.practice.questionTimes.q_1, 4);
    assert.match(getEl('practice-question-timer').className, /bg-emerald-50/);

    // Moving to Q2 tracks Q2 independently
    app.nextPracticeQuestion();
    assert.equal(app.practice.currentIndex, 1);
    assert.equal(getEl('practice-question-timer-text').textContent, '00:00');
    tickIntervals(92);
    assert.equal(app.practice.questionTimes.q_2, 92);
    assert.equal(getEl('practice-question-timer-text').textContent, '01:32');
    assert.match(getEl('practice-question-timer').className, /bg-amber-50/);

    // Returning to Q1 and clearing response resumes Q1 from 4s
    app.prevPracticeQuestion();
    assert.equal(getEl('practice-question-timer-text').textContent, '00:04');
    app.clearPracticeResponse();
    tickIntervals(2);
    assert.equal(app.practice.questionTimes.q_1, 6);
    assert.equal(getEl('practice-question-timer-text').textContent, '00:06');
  });

  test('switchView, showDashboard, and resetPracticeProgress clean up and reset questionTimes properly', () => {
    const { app, intervals, tickIntervals, getEl } = createAppHarness();
    app.currentMode = 'practice';
    app.practice = {
      chapter: 'Motion',
      modeType: 'study',
      currentIndex: 0,
      questions: [{ id: 'q_m1', question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }],
      userAnswers: {},
      reviewFlags: {},
      questionTimes: {},
      timerInterval: null,
      startTime: Date.now()
    };

    app.startPracticeTimer();
    assert.equal(intervals.size, 1);
    tickIntervals(3);
    assert.equal(app.practice.questionTimes.q_m1, 3);

    // Reset clears questionTimes
    app.resetPracticeProgress();
    assert.deepEqual(JSON.parse(JSON.stringify(app.practice.questionTimes)), {});
    assert.equal(getEl('practice-question-timer-text').textContent, '00:00');

    // Leaving practice view clears interval
    app.switchView('dashboard');
    assert.equal(intervals.size, 0);
    assert.equal(app.practice.timerInterval, null);
  });
});

describe('Client Services & Backend Repository Unit Tests', () => {
  test('SessionService validates emails, supports guest login, and formats display names', () => {
    const { AptiPrep, localStorage } = loadClientService('public/js/services/session.service.js');
    const svc = new AptiPrep.SessionService();

    assert.equal(svc.isLoggedIn(), false);
    assert.equal(svc.login('invalid-email').success, false);

    const res = svc.login('  Jitesh.Kumar@Example.COM ');
    assert.equal(res.success, true);
    assert.equal(res.email, 'jitesh.kumar@example.com');
    assert.equal(localStorage.getItem('apti_user_email'), 'jitesh.kumar@example.com');
    assert.equal(svc.getUserDisplayName(), 'Jitesh kumar');
    assert.equal(svc.getUserInitial(), 'J');

    svc.loginAsGuest();
    assert.equal(svc.isGuest(), true);
    assert.equal(svc.getUserDisplayName(), 'Jitesh');

    svc.logout();
    assert.equal(svc.isLoggedIn(), false);
    assert.equal(localStorage.getItem('apti_user_email'), null);
  });

  test('StorageService deduplicates, merges offline and API attempts, and sorts newest first', async () => {
    const apiAttempts = [
      { attemptId: 'a2', userEmail: 'u@test.com', timestamp: '2026-11-20T10:00:00Z', scorePercentage: 80 }
    ];
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ attempts: apiAttempts })
    });

    const { AptiPrep } = loadClientService('public/js/services/storage.service.js', {
      apti_attempts: JSON.stringify([
        { attemptId: 'a1', userEmail: 'u@test.com', timestamp: '2026-11-25T10:00:00Z', scorePercentage: 90 },
        { attemptId: 'a2', userEmail: 'u@test.com', timestamp: '2026-11-20T10:00:00Z', scorePercentage: 50 },
        { attemptId: 'other', userEmail: 'other@test.com', timestamp: '2026-11-26T10:00:00Z', scorePercentage: 100 }
      ])
    }, mockFetch);

    const storage = new AptiPrep.StorageService({ useLocalApi: true });
    const merged = await storage.fetchAttempts('u@test.com');
    assert.deepEqual([...merged.map(a => a.attemptId)], ['a1', 'a2']);
    assert.equal(merged[1].scorePercentage, 80, 'API version should take precedence on duplicate attemptId');
  });

  test('AttemptRepository isolates emails while matching legacy missing-email records to guest@local', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apti-attempts-'));
    const tmpFile = path.join(tmpDir, 'attempts.json');
    try {
      fs.writeFileSync(tmpFile, JSON.stringify([
        { attemptId: 'legacy-1', scorePercentage: 40 },
        { attemptId: 'guest-1', userEmail: 'guest@local', scorePercentage: 70 },
        { attemptId: 'alice-1', userEmail: 'alice@test.com', scorePercentage: 90 }
      ]));

      const repo = new AttemptRepository(tmpFile);
      const guestList = repo.getAll('guest@local');
      assert.deepEqual(guestList.map(a => a.attemptId), ['legacy-1', 'guest-1']);

      const aliceList = repo.getAll('ALICE@TEST.COM');
      assert.deepEqual(aliceList.map(a => a.attemptId), ['alice-1']);
      assert.equal(repo.getById('legacy-1').scorePercentage, 40);
      assert.equal(repo.getById('nonexistent'), null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('ScoringService.enrichAttemptReview enriches both core and RK Ranjan questions using getCombinedMap', () => {
    const coreQ = questionRepository.getAll()[0];
    const rkQ = questionRepository.getRkQuestions()[0];
    const rawAttempt = {
      attemptId: 'mix-1',
      mode: 'chapter_test',
      answers: [
        { questionId: coreQ.id, userAnswer: coreQ.correctAnswer, isCorrect: true },
        { questionId: rkQ.id, userAnswer: null, isCorrect: false }
      ]
    };

    const enriched = ScoringService.enrichAttemptReview(rawAttempt, questionRepository.getCombinedMap());
    assert.equal(enriched.detailedAnswers.length, 2);
    assert.equal(enriched.detailedAnswers[0].question, coreQ.question);
    assert.equal(enriched.detailedAnswers[1].question, rkQ.question);
    assert.equal(enriched.detailedAnswers[1].userAnswer, null);
  });
});
