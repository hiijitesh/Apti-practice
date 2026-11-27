const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('RK Ranjan Sheet Tiers (Pro Level vs ClassRoom) Tests', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const appJsPath = path.join(__dirname, '../public/app.js');
  const rkDataPath = path.join(__dirname, '../public/data/rk_ranjan_questions.json');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const rkQuestions = JSON.parse(fs.readFileSync(rkDataPath, 'utf8'));

  test('1. UI DOM Elements exist for RK Ranjan tier filters & headers', () => {
    // Main dashboard subfilter bar
    assert.ok(html.includes('id="rk-subfilter-bar"'), 'Must have #rk-subfilter-bar on dashboard');
    assert.ok(html.includes('id="rk-tier-btn-all"'), 'Must have #rk-tier-btn-all');
    assert.ok(html.includes('id="rk-tier-btn-pro"'), 'Must have #rk-tier-btn-pro');
    assert.ok(html.includes('id="rk-tier-btn-classroom"'), 'Must have #rk-tier-btn-classroom');

    // Chapter selection modal subfilter bar
    assert.ok(html.includes('id="modal-rk-subfilter-bar"'), 'Must have #modal-rk-subfilter-bar in modal');
    assert.ok(html.includes('id="modal-rk-subtab-all"'), 'Must have #modal-rk-subtab-all');
    assert.ok(html.includes('id="modal-rk-subtab-pro"'), 'Must have #modal-rk-subtab-pro');
    assert.ok(html.includes('id="modal-rk-subtab-classroom"'), 'Must have #modal-rk-subtab-classroom');

    // Practice header tier toggle & question badge
    assert.ok(html.includes('id="practice-rk-tier-toggle"'), 'Must have #practice-rk-tier-toggle in practice header');
    assert.ok(html.includes('id="practice-tier-btn-pro"'), 'Must have #practice-tier-btn-pro');
    assert.ok(html.includes('id="practice-tier-btn-classroom"'), 'Must have #practice-tier-btn-classroom');
    assert.ok(html.includes('id="practice-tier-btn-all"'), 'Must have #practice-tier-btn-all');
    assert.ok(html.includes('id="practice-q-tier-badge"'), 'Must have #practice-q-tier-badge in question header');
  });

  test('2. Dataset integrity: Both Pro Level and ClassRoom sheets exist across all 33 chapters', () => {
    assert.strictEqual(rkQuestions.length, 5327, 'Total questions must be 5,327');
    const proQuestions = rkQuestions.filter(q => (q.sheetType || '').toLowerCase().includes('pro'));
    const classroomQuestions = rkQuestions.filter(q => !(q.sheetType || '').toLowerCase().includes('pro'));

    assert.strictEqual(proQuestions.length, 1310, 'Expected exactly 1,310 Pro Level questions');
    assert.strictEqual(classroomQuestions.length, 4017, 'Expected exactly 4,017 ClassRoom questions');

    // Verify all 33 chapters have questions in both tiers
    const byChapter = {};
    rkQuestions.forEach(q => {
      const c = q.chapter;
      if (!byChapter[c]) byChapter[c] = { pro: 0, classroom: 0 };
      if ((q.sheetType || '').toLowerCase().includes('pro')) {
        byChapter[c].pro++;
      } else {
        byChapter[c].classroom++;
      }
    });

    assert.strictEqual(Object.keys(byChapter).length, 33, 'Must have exactly 33 chapters');
    Object.entries(byChapter).forEach(([ch, counts]) => {
      assert.ok(counts.pro > 0, `Chapter "${ch}" must contain Pro Level questions (got ${counts.pro})`);
      assert.ok(counts.classroom > 0, `Chapter "${ch}" must contain ClassRoom questions (got ${counts.classroom})`);
    });
  });

  test('3. app.js buildRkChaptersFromQuestions accurately computes proCount and classroomCount', () => {
    // Create sandbox app
    const mockApp = {
      rkQuestions: rkQuestions,
      rkChapters: [],
      currentMode: 'dashboard',
      currentSubjectFilter: 'rk_ranjan',
      sortChapters: (chs) => chs,
      renderAttemptSessionsSection: () => {},
      renderChaptersGrid: () => {}
    };

    // Provide mock document for Node environment
    global.document = {
      getElementById: () => null
    };

    // Extract buildRkChaptersFromQuestions
    const match = appJs.match(/buildRkChaptersFromQuestions\(\)\s*\{([\s\S]*?)\n  \}\n\n  updateDashboardBadges/);
    assert.ok(match, 'buildRkChaptersFromQuestions must be extractable');
    const fn = new Function(match[1]);
    fn.call(mockApp);

    assert.strictEqual(mockApp.rkChapters.length, 33);
    const totalPro = mockApp.rkChapters.reduce((acc, c) => acc + (c.proCount || 0), 0);
    const totalClassroom = mockApp.rkChapters.reduce((acc, c) => acc + (c.classroomCount || 0), 0);
    const totalAll = mockApp.rkChapters.reduce((acc, c) => acc + (c.count || 0), 0);

    assert.strictEqual(totalPro, 1310, 'Total proCount must equal 1,310');
    assert.strictEqual(totalClassroom, 4017, 'Total classroomCount must equal 4,017');
    assert.strictEqual(totalAll, 5327, 'Total count must equal 5,327');

    const ages = mockApp.rkChapters.find(c => c.name === 'Ages');
    assert.ok(ages, 'Ages chapter must exist');
    assert.strictEqual(ages.proCount, 20, 'Ages must have 20 Pro Level questions');
    assert.strictEqual(ages.classroomCount, 27, 'Ages must have 27 ClassRoom questions');
    assert.strictEqual(ages.count, 47, 'Ages must have 47 total questions');

    const geom = mockApp.rkChapters.find(c => c.name === 'Geometry');
    assert.ok(geom, 'Geometry chapter must exist');
    assert.strictEqual(geom.proCount, 165, 'Geometry must have 165 Pro Level questions');
    assert.strictEqual(geom.classroomCount, 427, 'Geometry must have 427 ClassRoom questions');
    assert.strictEqual(geom.count, 592, 'Geometry must have 592 total questions');
  });

  test('4. startPractice filters by tier correctly (pro vs classroom vs all)', async () => {
    let capturedState = null;
    const mockApp = {
      currentUserEmail: 'student@rrb.in',
      isStaticMode: true,
      allQuestions: [],
      rkQuestions: rkQuestions,
      chapters: [],
      rkChapters: [
        { name: 'Ages', count: 47, proCount: 20, classroomCount: 27 },
        { name: 'Geometry', count: 592, proCount: 165, classroomCount: 427 }
      ],
      currentRkTier: 'all',
      practice: {
        modeType: 'study',
        chapter: '',
        questions: [],
        currentIndex: 0,
        tier: 'all'
      },
      initPracticeState: function(chapterName, questions, preferredSubjectFilter) {
        capturedState = { chapterName, questions, preferredSubjectFilter, tier: this.practice.tier };
      },
      loadRkRanjanData: async () => {},
      switchView: () => {},
      enterFullscreen: async () => {}
    };

    const match = appJs.match(/async startPractice\(chapterName, preferredSubjectFilter = null\)\s*\{([\s\S]*?)\n  \}\n\n  setPracticeChapterTitle/);
    assert.ok(match, 'startPractice must be extractable');
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const startPracticeFn = new AsyncFunction('chapterName', 'preferredSubjectFilter', match[1]);

    // A. Practice Ages with 'pro' tier
    await startPracticeFn.call(mockApp, 'Ages', 'rk_ranjan', 'pro');
    assert.ok(capturedState);
    assert.strictEqual(capturedState.chapterName, 'Ages');
    assert.strictEqual(capturedState.tier, 'pro');
    assert.strictEqual(capturedState.questions.length, 20, 'Must load exactly 20 Pro Level questions for Ages');
    assert.ok(capturedState.questions.every(q => (q.sheetType || '').toLowerCase().includes('pro')));

    // B. Practice Ages with 'classroom' tier
    await startPracticeFn.call(mockApp, 'Ages', 'rk_ranjan', 'classroom');
    assert.strictEqual(capturedState.chapterName, 'Ages');
    assert.strictEqual(capturedState.tier, 'classroom');
    assert.strictEqual(capturedState.questions.length, 27, 'Must load exactly 27 ClassRoom questions for Ages');
    assert.ok(capturedState.questions.every(q => !(q.sheetType || '').toLowerCase().includes('pro')));

    // C. Practice Ages with 'all' tier
    await startPracticeFn.call(mockApp, 'Ages', 'rk_ranjan', 'all');
    assert.strictEqual(capturedState.chapterName, 'Ages');
    assert.strictEqual(capturedState.tier, 'all');
    assert.strictEqual(capturedState.questions.length, 47, 'Must load all 47 questions for Ages');

    // D. Practice Geometry with 'pro' tier
    await startPracticeFn.call(mockApp, 'Geometry', 'rk_ranjan', 'pro');
    assert.strictEqual(capturedState.questions.length, 165, 'Must load 165 Pro Level questions for Geometry');
  });

  test('5. Session isolation and tier persistence across Pro Level and ClassRoom study progress', () => {
    const mockStorage = new Map();
    const mockApp = {
      currentUserEmail: 'student@rrb.in',
      practice: {
        modeType: 'study',
        chapter: 'Ages',
        tier: 'pro',
        questions: rkQuestions.filter(q => q.chapter === 'Ages' && (q.sheetType || '').toLowerCase().includes('pro')),
        userAnswers: { 0: 1, 1: 2 },
        reviewFlags: { 0: true },
        questionTimes: { 'rkr_ages_age_pro_level_sheet_q001': 45 },
        currentIndex: 1
      },
      practiceSubjectFilter: 'rk_ranjan'
    };

    // Extract getChapterStudyStorageKey and saveChapterStudyProgress
    const keyMatch = appJs.match(/getChapterStudyStorageKey\(chapterName\)\s*\{([\s\S]*?)\n  \}\n\n  saveChapterStudyProgress/);
    assert.ok(keyMatch, 'getChapterStudyStorageKey must be extractable');
    const getKeyFn = new Function('chapterName', keyMatch[1]);

    const proKey = getKeyFn.call(mockApp, 'Ages', 'pro');
    const classroomKey = getKeyFn.call(mockApp, 'Ages', 'classroom');
    const allKey = getKeyFn.call(mockApp, 'Ages', 'all');

    assert.ok(proKey.includes('ages_pro'), 'Pro key must contain tier suffix');
    assert.ok(classroomKey.includes('ages_classroom'), 'Classroom key must contain tier suffix');
    assert.ok(!allKey.endsWith('_all'), 'All key must be base key without tier suffix for backwards compatibility');
    assert.notStrictEqual(proKey, classroomKey, 'Pro and ClassRoom keys must be completely isolated');
  });
});
