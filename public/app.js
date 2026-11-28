// public/app.js - AptiPrep CBT Engine Frontend Logic (Minimal, Distraction-Free & Email Session Ready)

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// "Source: <pdf> · Q23 · p. 3" plus whether scripts/verify_against_pdfs.py matched it to that page.
// Undo is offered for 30 s after marking a question verified, to catch mis-taps.
const UNDO_SECONDS = 30;
const undoLeft = id => Math.max(0, Math.ceil((((window.APTI_UNDO_UNTIL || {})[id] || 0) - Date.now()) / 1000));

function sourceHtml(q) {
  const src = q && q.source;
  if (!src || !src.file) return '';
  const parts = [escapeHtml(src.file)];
  if (src.q) parts.push(`Q${src.q}`);
  if (src.page) parts.push(`p. ${src.page}`);
  const c = q.check || {};
  const qid = q.id || q.questionId;
  (window.APTI_SRC_Q = window.APTI_SRC_Q || {})[qid] = q;          // lets markVerified re-render this line
  const manual = !!(window.APTI_MANUAL && window.APTI_MANUAL.has(qid));
  const autoOk = c.text && c.options && c.key !== false;
  const verified = autoOk || manual;
  const btn = (on, label) => !window.APTI_IS_ADMIN ? '' : ` &nbsp;<button type="button" onclick="app.markVerified('${escapeHtml(qid)}', ${on}, this)" class="text-zinc-500 underline underline-offset-2 hover:text-zinc-800">${label}</button>`;
  const sym = (cls, text, label) => `<span class="${cls}" title="${label}" aria-label="${label}" role="img">${text}</span>`;
  const badge = autoOk
    ? sym('text-emerald-600', '✓', `Matches the PDF${c.key ? ' and its answer key' : ''}`)
    : manual
      ? sym('text-emerald-600', '✓', 'Verified by you') + (undoLeft(qid) ? btn(false, `Undo (${undoLeft(qid)}s)`) : '')
      : sym('text-amber-600', '⚠', 'Not yet verified - check the PDF') + btn(true, 'Mark verified');
  const a = (href, label) => ` &nbsp;<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="text-sky-700 underline underline-offset-2">${label}</a>`;
  // Drive's viewer ignores #page, so the exact slide is a pre-rendered image; Drive link stays for the full PDF.
  const crop = !verified && window.APTI_CROPS && window.APTI_CROPS.has(q.id || q.questionId) ? `data/crops/${q.id || q.questionId}.webp` : '';
  const link = (!verified && /^data\/slides\/[\w.-]+\.webp$/.test(src.slide || '') ? a(src.slide, 'Open slide ↗') : '')
    + (crop ? a(crop, 'Check slide ↗') : '')
    + (!verified && /^https:\/\/drive\.google\.com\//.test(src.url || '') ? a(src.url.split('#')[0], 'Full PDF ↗') : '');
  return `<span data-src-id="${escapeHtml(qid)}"><span class="text-zinc-400">Source:</span> ${parts.join(' · ')} &nbsp;${badge}${link}</span>`;
}

class AptiPrepApp {
  constructor() {
    this.chapters = [];
    this.attempts = [];
    this.allQuestions = [];
    this.rkQuestions = [];
    this.rkChapters = [];
    this.currentMode = 'dashboard';
    this.zenMode = false;
    this.isStaticMode = false;

    // Modular Service Delegators (DIP / SRP)
    this.sessionService = (window.AptiPrep && window.AptiPrep.SessionService)
      ? new window.AptiPrep.SessionService()
      : null;
    this.storageService = (window.AptiPrep && window.AptiPrep.StorageService)
      ? new window.AptiPrep.StorageService({
          useLocalApi: window.APTIPREP_CONFIG ? window.APTIPREP_CONFIG.USE_LOCAL_API_IF_AVAILABLE !== false : true
        })
      : null;

    // Email Session
    this.currentUserEmail = this.sessionService
      ? this.sessionService.currentUserEmail
      : (localStorage.getItem('apti_user_email') || '').trim().toLowerCase();

    // Google Sheet Backend URL
    this.googleSheetUrl = this.storageService
      ? this.storageService.getGoogleSheetUrl()
      : (localStorage.getItem('apti_google_sheet_url') || (window.APTIPREP_CONFIG && window.APTIPREP_CONFIG.GOOGLE_SHEET_URL) || '');

    // Practice / Chapter Test State
    this.practice = {
      chapter: '',
      questions: [],
      currentIndex: 0,
      userAnswers: {}, // { [qIndex]: number (selected option index) }
      reviewFlags: {}, // { [qIndex]: boolean }
      questionTimes: {}, // { [questionId || qIndex]: elapsed seconds }
      timerInterval: null,
      modeType: 'study', // Default: 'study' (instant feedback) or 'test' (show answers at end)
      tier: 'all', // 'all' | 'pro' | 'classroom'
      drawerOpen: false,
      startTime: null
    };

    // Full Mock Test State
    this.mock = {
      questions: [],
      currentIndex: 0,
      userAnswers: {}, // { [questionId]: number }
      reviewFlags: {}, // { [questionId]: boolean }
      timeLeftSeconds: 1800, // 30 mins
      timerInterval: null,
      startTime: null
    };

    // Results & Review State
    this.results = {
      attempt: null,
      currentFilter: 'all'
    };

    // Subject Filters
    this.currentSubjectFilter = 'all'; // 'all' | 'aptitude' | 'science' | 'rk_ranjan' | 'top300'
    this.currentSubSubjectFilter = 'all'; // 'all' | 'Biology' | 'Chemistry' | 'Physics'
    this.currentRkTier = 'all'; // 'all' | 'pro' | 'classroom'

    // Fullscreen & Auto-Pause State
    this.isTestPaused = false;
    this.pauseStartTime = null;
    this.totalPausedDuration = 0; // ms
    this.isSubmitting = false;

    // Modal Chapter Select State
    this.modalSubject = 'aptitude';
    this.modalScienceSub = 'all';
    this.modalRkTier = 'all'; // 'all' | 'pro' | 'classroom'

    // Revision Materials & PDFs State
    this.revision = {
      folderUrl: 'https://drive.google.com/drive/folders/1DpWFTDuPRoHvCcKeqK_FPo2u4Zp13sHJ?usp=sharing',
      folderName: 'Merged Science & Revision Materials',
      pdfs: [],
      activePdfId: 'bio',
      isLoading: false,
      sidebarOpen: false,
      isFullscreen: false
    };

    this.init();
    this.bindKeyboardShortcuts();
  }

  async init() {
    this.loadManualVerified();
    this.initFontScale();
    this.setupFullscreenListeners();
    this.setupSwipeNavigation();
    this.setupRefreshGuard();
    this.updateSheetStatusUI();

    if (window.AptiPrep && window.AptiPrep.EventRouter) {
      this.eventRouter = new window.AptiPrep.EventRouter(this);
    }

    document.addEventListener('click', (e) => {
      const header = document.getElementById('global-header');
      if (header && !header.contains(e.target)) {
        this.closeMobileNav();
      }
    });

    const revIframe = document.getElementById('revision-view-iframe');
    if (revIframe) {
      revIframe.addEventListener('load', () => this.handleRevisionViewIframeLoaded());
    }

    if (!this.currentUserEmail) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === 'mock' || params.get('autostart') === 'practice') {
        this.currentUserEmail = 'jitesh@local';
        localStorage.setItem('apti_user_email', 'jitesh@local');
      } else {
        // First time user: immediately activate login view with zero flash/network wait
        this.switchView('login');
        this.updateUserSessionUI();
        setTimeout(() => {
          const inp = document.getElementById('login-email-input');
          if (inp) inp.focus();
        }, 50);
        await Promise.all([this.loadChapters(), this.loadRevisionMaterials()]);
        return;
      }
    }

    // Check for active test or practice session to restore across page refreshes
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart');

    let activeMock = null;
    let activePractice = null;
    try {
      const rawMock = localStorage.getItem('apti_active_mock');
      if (rawMock) activeMock = JSON.parse(rawMock);
    } catch (e) {}

    try {
      const rawPrac = localStorage.getItem('apti_active_practice');
      if (rawPrac) activePractice = JSON.parse(rawPrac);
    } catch (e) {}

    if (activeMock && Array.isArray(activeMock.questions) && activeMock.questions.length > 0) {
      try {
        await Promise.all([this.loadChapters(), this.loadAttempts(), this.loadRevisionMaterials()]);
      } catch (e) {}
      this.updateUserSessionUI();
      if (this.restoreActiveMockSession(activeMock)) {
        try {
          if (autostart) window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {}
        return;
      }
    } else if (activePractice && Array.isArray(activePractice.questions) && activePractice.questions.length > 0) {
      try {
        await Promise.all([this.loadChapters(), this.loadAttempts(), this.loadRevisionMaterials()]);
      } catch (e) {}
      this.updateUserSessionUI();
      if (this.restoreActivePracticeSession(activePractice)) {
        try {
          if (autostart) window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {}
        return;
      }
    }

    // Existing authenticated user: show dashboard and load data
    this.switchView('dashboard');
    this.updateUserSessionUI();
    try {
      await Promise.all([this.loadChapters(), this.loadAttempts(), this.loadRevisionMaterials()]);
    } catch (e) {
      console.warn('Init data load error:', e);
    }
    this.renderDashboard();

    if (params.get('autostart') === 'mock') {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {}
      await this.startMockTest('all');
      if (params.get('pause') === '1') {
        this.pauseMockTest();
      } else if (params.get('drawer') === '1') {
        this.toggleMockDrawer();
      }
    } else if (params.get('autostart') === 'practice') {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {}
      if (!this.chapters || this.chapters.length === 0) await this.loadChapters();
      if (this.chapters && this.chapters.length > 0) {
        await this.startPractice(this.chapters[0].name);
      }
    }
  }

  // ==========================================
  // USER SESSION & EMAIL GATEWAY
  // ==========================================

  updateUserSessionUI() {
    this.refreshAdmin();
    const widget = document.getElementById('user-header-widget');
    const label = document.getElementById('header-user-email');
    const btnChapters = document.getElementById('nav-btn-practice');
    const btnDashboard = document.getElementById('nav-btn-home');
    const btnMock = document.getElementById('nav-btn-mock');
    const btnRevision = document.getElementById('nav-btn-revision');

    const isLoggedIn = !!this.currentUserEmail && this.currentMode !== 'login';

    if (btnChapters) {
      if (isLoggedIn) {
        btnChapters.classList.remove('hidden');
      } else {
        btnChapters.classList.add('hidden');
      }
    }

    if (btnDashboard) {
      if (isLoggedIn) {
        btnDashboard.classList.remove('hidden');
      } else {
        btnDashboard.classList.add('hidden');
      }
    }

    if (btnMock) {
      if (isLoggedIn) {
        btnMock.classList.remove('hidden');
      } else {
        btnMock.classList.add('hidden');
      }
    }

    if (btnRevision) {
      if (isLoggedIn) {
        btnRevision.classList.remove('hidden');
        btnRevision.classList.add('inline-flex');
      } else {
        btnRevision.classList.add('hidden');
        btnRevision.classList.remove('inline-flex');
      }
    }

    if (widget && label) {
      if (isLoggedIn) {
        widget.classList.remove('hidden');
        widget.classList.add('flex');
        label.textContent = this.currentUserEmail;
      } else {
        widget.classList.add('hidden');
        widget.classList.remove('flex');
      }
    }

    // Mobile Navigation UI Sync
    const mobToggle = document.getElementById('mobile-nav-toggle-btn');
    const mobEmail = document.getElementById('mobile-user-email');
    const mobName = document.getElementById('mobile-user-name');
    const mobInit = document.getElementById('mobile-user-initial');

    if (mobToggle) {
      if (isLoggedIn) {
        mobToggle.classList.remove('hidden');
      } else {
        mobToggle.classList.add('hidden');
        this.closeMobileNav();
      }
    }
    if (mobEmail) mobEmail.textContent = this.currentUserEmail || 'guest@local';
    const dispName = this.getUserDisplayName();
    if (mobName) mobName.textContent = dispName;
    if (mobInit) mobInit.textContent = dispName.charAt(0).toUpperCase();
  }

  toggleMobileNav() {
    const menu = document.getElementById('mobile-nav-menu');
    const iconMenu = document.getElementById('mobile-nav-icon-menu');
    const iconClose = document.getElementById('mobile-nav-icon-close');
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
      menu.classList.remove('hidden');
      if (iconMenu) iconMenu.classList.add('hidden');
      if (iconClose) iconClose.classList.remove('hidden');
    } else {
      this.closeMobileNav();
    }
  }

  closeMobileNav() {
    const menu = document.getElementById('mobile-nav-menu');
    const iconMenu = document.getElementById('mobile-nav-icon-menu');
    const iconClose = document.getElementById('mobile-nav-icon-close');
    if (menu) menu.classList.add('hidden');
    if (iconMenu) iconMenu.classList.remove('hidden');
    if (iconClose) iconClose.classList.add('hidden');
  }

  getUserDisplayName() {
    if (this.sessionService) {
      this.sessionService.currentUserEmail = this.currentUserEmail;
      return this.sessionService.getUserDisplayName();
    }
    if (!this.currentUserEmail || this.currentUserEmail === 'guest@local') {
      return 'Jitesh';
    }
    const part = this.currentUserEmail.split('@')[0];
    if (!part || part.toLowerCase() === 'guest') return 'Jitesh';
    return part.charAt(0).toUpperCase() + part.slice(1);
  }

  async handleEmailSubmit(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const input = document.getElementById('login-email-input');
    const err = document.getElementById('login-error-msg');
    const val = (input ? input.value : '').trim().toLowerCase();

    if (!val || !val.includes('@') || !val.includes('.')) {
      if (err) {
        err.textContent = 'Please enter a valid email address.';
        err.classList.remove('hidden');
      }
      return false;
    }

    if (err) err.classList.add('hidden');
    this.currentUserEmail = val;
    localStorage.setItem('apti_user_email', val);
    this.updateUserSessionUI();

    // Immediately switch to dashboard with zero network or blocking wait
    this.switchView('dashboard');
    this.renderDashboard();

    // Load user attempts in background safely
    if (typeof this.loadAttempts === 'function') {
      try {
        await this.loadAttempts();
        this.renderDashboard();
      } catch (e) {
        console.warn('Background attempt load notice:', e);
      }
    }
    return false;
  }

  async loginAsGuest() {
    this.currentUserEmail = 'guest@local';
    localStorage.setItem('apti_user_email', 'guest@local');
    this.updateUserSessionUI();

    // Immediately switch to dashboard with zero network or blocking wait
    this.switchView('dashboard');
    this.renderDashboard();

    // Load guest attempts in background safely
    if (typeof this.loadAttempts === 'function') {
      try {
        await this.loadAttempts();
        this.renderDashboard();
      } catch (e) {
        console.warn('Background guest attempt load notice:', e);
      }
    }
  }

  promptSwitchUser() {
    this.currentUserEmail = null;
    this.clearActivePracticeSession();
    this.clearActiveMockSession();
    localStorage.removeItem('apti_user_email');
    this.updateUserSessionUI();
    this.switchView('login');
    const input = document.getElementById('login-email-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  // ==========================================
  // ACTIVE TEST REFRESH PERSISTENCE & GUARDS
  // ==========================================

  // ==========================================
  // MANUALLY VERIFIED QUESTIONS (public/data/manual_verified.json)
  // ==========================================

  async loadManualVerified() {
    try {
      const res = await fetch('data/manual_verified.json', { cache: 'no-store' });
      window.APTI_MANUAL = new Set(res.ok ? await res.json() : []);
    } catch (e) {
      window.APTI_MANUAL = new Set();
    }
    this.refreshSourceLines();
  }

  // Mark/Undo buttons only for the admin email (compared by SHA-256; needs a secure context: localhost or https).
  async refreshAdmin() {
    const ADMIN_SHA256 = '6f042462e112492d5aa71a6167b56ac2892b8a13487ea573bc01d941ad7fd057';
    let ok = false;
    try {
      const data = new TextEncoder().encode((this.currentUserEmail || '').trim().toLowerCase());
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
      ok = hash === ADMIN_SHA256;
    } catch (e) { /* crypto.subtle missing (plain-http LAN address) -> not admin */ }
    if (ok !== !!window.APTI_IS_ADMIN) { window.APTI_IS_ADMIN = ok; this.refreshSourceLines(); }
  }

  refreshSourceLines(id) {
    const sel = id ? `[data-src-id="${CSS.escape(id)}"]` : '[data-src-id]';
    document.querySelectorAll(sel).forEach(el => {
      const q = (window.APTI_SRC_Q || {})[el.dataset.srcId];
      if (q) el.outerHTML = sourceHtml(q);
    });
  }

  // Saving needs the local Node server (GitHub Pages is read-only); commit manual_verified.json to publish.
  async markVerified(id, verified, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const res = await fetch(`/api/questions/${encodeURIComponent(id)}/verified`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: this.currentUserEmail, verified })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.APTI_MANUAL = window.APTI_MANUAL || new Set();
      if (verified) window.APTI_MANUAL.add(id); else window.APTI_MANUAL.delete(id);
      window.APTI_UNDO_UNTIL = window.APTI_UNDO_UNTIL || {};
      clearInterval((this.undoTimers = this.undoTimers || {})[id]);
      if (verified) {
        window.APTI_UNDO_UNTIL[id] = Date.now() + UNDO_SECONDS * 1000;
        this.undoTimers[id] = setInterval(() => {       // tick the countdown, then drop the Undo button
          this.refreshSourceLines(id);
          if (!undoLeft(id)) clearInterval(this.undoTimers[id]);
        }, 1000);
      } else {
        delete window.APTI_UNDO_UNTIL[id];
      }
      this.refreshSourceLines(id);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Not saved - run the local server'; }
    }
  }

  setupRefreshGuard() {
    window.addEventListener('beforeunload', (e) => {
      if (this.isSubmitting) return;

      if (this.currentMode === 'mock' && this.mock.questions && this.mock.questions.length > 0) {
        this.saveActiveMockSession();
        e.preventDefault();
        e.returnValue = '';
        return '';
      } else if (this.currentMode === 'practice' && this.practice.questions && this.practice.questions.length > 0) {
        this.saveActivePracticeSession();
        if (this.practice.modeType === 'test') {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (this.currentMode === 'mock') {
          this.saveActiveMockSession();
        } else if (this.currentMode === 'practice') {
          this.saveActivePracticeSession();
        }
      }
    });
  }

  saveActiveMockSession() {
    if (!this.mock || !Array.isArray(this.mock.questions) || this.mock.questions.length === 0 || this.isSubmitting) {
      return;
    }
    try {
      const payload = {
        questions: this.mock.questions,
        subject: this.mock.subject || 'all',
        currentIndex: this.mock.currentIndex || 0,
        userAnswers: this.mock.userAnswers || {},
        reviewFlags: this.mock.reviewFlags || {},
        visited: this.mock.visited || {},
        questionTimes: this.mock.questionTimes || {},
        timeLeftSeconds: this.mock.timeLeftSeconds,
        startTime: this.mock.startTime || Date.now(),
        savedAt: Date.now(),
        userEmail: this.currentUserEmail || 'guest@local'
      };
      localStorage.setItem('apti_active_mock', JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save active mock session to localStorage:', e);
    }
  }

  clearActiveMockSession() {
    try {
      localStorage.removeItem('apti_active_mock');
    } catch (e) {}
  }

  restoreActiveMockSession(saved) {
    if (!saved || !Array.isArray(saved.questions) || saved.questions.length === 0) {
      this.clearActiveMockSession();
      return false;
    }

    if (saved.userEmail && this.currentUserEmail && saved.userEmail !== this.currentUserEmail) {
      this.clearActiveMockSession();
      return false;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - (saved.savedAt || Date.now())) / 1000));
    const remainingSeconds = Math.max(0, (saved.timeLeftSeconds !== undefined ? saved.timeLeftSeconds : 1800) - elapsedSeconds);

    this.mock.questions = saved.questions;
    this.mock.subject = saved.subject || 'all';
    this.mock.currentIndex = Math.min(Math.max(0, saved.currentIndex || 0), saved.questions.length - 1);
    this.mock.userAnswers = saved.userAnswers || {};
    this.mock.reviewFlags = saved.reviewFlags || {};
    this.mock.visited = saved.visited || { [this.mock.currentIndex]: true };
    this.mock.questionTimes = saved.questionTimes || {};
    this.mock.timeLeftSeconds = remainingSeconds;
    this.mock.startTime = saved.startTime || Date.now();
    this.mock.isSidebarCollapsed = false;
    this.mock.drawerOpen = false;

    // Set Header Titles
    const titleEl = document.getElementById('mock-test-header-title');
    const subtitleEl = document.getElementById('mock-test-header-subtitle');
    const mobSubEl = document.getElementById('mock-mobile-exam-subtitle');
    const sub = (this.mock.subject || '').toLowerCase();
    let titleStr = 'Full Mock Test: Quantitative Aptitude & General Science';
    let subtitleStr = '30 Questions • 30 Minutes • Negative Marking: 1/3 (-0.33)';

    if (sub === 'aptitude') {
      titleStr = 'Full Mock Test: Quantitative Aptitude';
    } else if (sub === 'science') {
      titleStr = 'Full Mock Test: General Science';
    } else if (sub === 'top300') {
      titleStr = 'Full Mock Test: TOP 300 High-Yield Science';
    } else {
      titleStr = 'Full Mock Test: Quantitative Aptitude & General Science';
    }

    if (titleEl) titleEl.textContent = titleStr;
    if (subtitleEl) subtitleEl.textContent = subtitleStr;
    if (mobSubEl) mobSubEl.textContent = titleStr;

    // Set Candidate Profile
    const userNameEl = document.getElementById('mock-user-name-display');
    const userEmailEl = document.getElementById('mock-user-email-display');
    const userAvatarEl = document.getElementById('mock-user-avatar-text');
    const displayName = this.getUserDisplayName();
    if (userNameEl) userNameEl.textContent = displayName;
    if (userEmailEl) userEmailEl.textContent = this.currentUserEmail || 'Candidate';
    if (userAvatarEl) userAvatarEl.textContent = displayName.charAt(0).toUpperCase();

    const initTab = (sub === 'aptitude') ? 'aptitude' : (sub === 'science' || sub === 'top300' || sub === 'biology' || sub === 'chemistry' || sub === 'physics') ? 'science' : 'all';
    this.setMockSectionTab(initTab);

    this.switchView('mock');
    this.renderMockQuestion();
    this.updateMockPalette();

    if (remainingSeconds <= 0) {
      alert('Time expired while you were away! Your mock examination will now be automatically submitted.');
      this.autoSubmitMock();
    } else {
      this.startMockTimer();
    }
    return true;
  }

  getChapterStudyStorageKey(chapterName) {
    const email = (this.currentUserEmail || 'guest@local').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const chap = (chapterName || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const tier = (arguments.length > 1 ? arguments[1] : this.practice?.tier) || 'all';
    if (tier && tier !== 'all') {
      return `apti_study_${email}_${chap}_${tier.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    }
    return `apti_study_${email}_${chap}`;
  }

  saveChapterStudyProgress() {
    if (!this.practice || !this.practice.chapter || this.practice.modeType !== 'study') return;
    try {
      const tier = this.practice.tier || 'all';
      const key = this.getChapterStudyStorageKey(this.practice.chapter, tier);
      const questions = Array.isArray(this.practice.questions) ? this.practice.questions : [];
      const answers = this.practice.userAnswers || {};
      let correctCount = 0;
      Object.keys(answers).forEach(idxKey => {
        const q = questions[Number(idxKey)];
        if (q && answers[idxKey] === q.correctAnswer) {
          correctCount++;
        }
      });
      const data = {
        chapter: this.practice.chapter,
        subjectFilter: this.practiceSubjectFilter || 'all',
        tier,
        totalQuestions: questions.length,
        correctCount,
        userAnswers: answers,
        reviewFlags: this.practice.reviewFlags || {},
        questionTimes: this.practice.questionTimes || {},
        currentIndex: this.practice.currentIndex || 0,
        savedAt: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save chapter study progress:', e);
    }
  }

  loadChapterStudyProgress(chapterName) {
    try {
      const activeTier = (arguments.length > 1 ? arguments[1] : this.practice?.tier) || 'all';
      const key = this.getChapterStudyStorageKey(chapterName, activeTier);
      let raw = localStorage.getItem(key);
      if (!raw && activeTier !== 'all') {
        raw = localStorage.getItem(this.getChapterStudyStorageKey(chapterName, 'all'));
      }
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data && typeof data.userAnswers === 'object') {
        return data;
      }
    } catch (e) {
      console.warn('Failed to load chapter study progress:', e);
    }
    return null;
  }

  clearChapterStudyProgress(chapterName) {
    try {
      const activeTier = (arguments.length > 1 ? arguments[1] : this.practice?.tier) || 'all';
      const key = this.getChapterStudyStorageKey(chapterName || this.practice?.chapter, activeTier);
      localStorage.removeItem(key);
    } catch (e) {}
  }

  getSavedStudySessions() {
    const emailPrefix = (this.currentUserEmail || 'guest@local').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const prefix = `apti_study_${emailPrefix}_`;
    const sessions = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (!data || !data.chapter || !data.userAnswers) continue;

        const answeredCount = Object.keys(data.userAnswers).length;
        if (answeredCount === 0) continue;

        const coreMatch = (this.chapters || []).find(c => c.name.toLowerCase() === data.chapter.toLowerCase());
        const rkMatch = (this.rkChapters || []).find(c => c.name.toLowerCase() === data.chapter.toLowerCase());
        const isRk = data.subjectFilter === 'rk_ranjan' || (!coreMatch && !!rkMatch);
        const chapInfo = isRk ? (rkMatch || coreMatch) : (coreMatch || rkMatch);
        const totalQuestions = data.totalQuestions || (chapInfo ? chapInfo.count : 0);
        const tier = data.tier || 'all';
        let subSubjectTitle = isRk ? 'RK Ranjan Math' : (chapInfo?.subSubject || chapInfo?.subject || 'Practice');
        if (isRk && tier === 'pro') subSubjectTitle = 'RK Ranjan • Pro Level';
        else if (isRk && tier === 'classroom') subSubjectTitle = 'RK Ranjan • ClassRoom';

        sessions.push({
          type: 'study',
          storageKey: key,
          chapter: data.chapter,
          tier,
          subjectFilter: data.subjectFilter && data.subjectFilter !== 'all'
            ? data.subjectFilter
            : (isRk ? 'rk_ranjan' : ((chapInfo?.subject || '').includes('Science') ? 'science' : 'aptitude')),
          subSubject: subSubjectTitle,
          answeredCount,
          correctCount: typeof data.correctCount === 'number' ? data.correctCount : null,
          totalQuestions,
          currentIndex: data.currentIndex || 0,
          savedAt: data.savedAt || 0
        });
      }
    } catch (e) {
      console.warn('Failed to enumerate saved study sessions:', e);
    }

    sessions.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return sessions;
  }

  getHomeAttemptSessions() {
    const sessions = [];
    const activeEmail = (this.currentUserEmail || 'guest@local').trim().toLowerCase();

    try {
      const rawMock = localStorage.getItem('apti_active_mock');
      if (rawMock) {
        const mockData = JSON.parse(rawMock);
        const mockOwner = (mockData.userEmail || 'guest@local').trim().toLowerCase();
        if (mockData && Array.isArray(mockData.questions) && mockData.questions.length > 0 && mockOwner === activeEmail) {
          const answeredCount = Object.keys(mockData.userAnswers || {}).length;
          sessions.push({
            type: 'mock',
            chapter: mockData.subject && mockData.subject !== 'all' ? `Mock Test (${mockData.subject})` : 'Full Mock Test',
            subjectFilter: mockData.subject || 'all',
            subSubject: 'Timed CBT Mock',
            answeredCount,
            correctCount: null,
            totalQuestions: mockData.questions.length,
            currentIndex: mockData.currentIndex || 0,
            timeLeftSeconds: mockData.timeLeftSeconds,
            savedAt: mockData.savedAt || mockData.startTime || Date.now()
          });
        }
      }
    } catch (e) {}

    try {
      const rawPrac = localStorage.getItem('apti_active_practice');
      if (rawPrac) {
        const pracData = JSON.parse(rawPrac);
        const pracOwner = (pracData.userEmail || 'guest@local').trim().toLowerCase();
        if (pracData && pracData.modeType === 'test' && Array.isArray(pracData.questions) && pracData.questions.length > 0 && pracOwner === activeEmail) {
          sessions.push({
            type: 'chapter_test',
            chapter: pracData.chapter,
            subjectFilter: pracData.practiceSubjectFilter || 'all',
            subSubject: 'Chapter Test (In Progress)',
            answeredCount: Object.keys(pracData.userAnswers || {}).length,
            correctCount: null,
            totalQuestions: pracData.questions.length,
            currentIndex: pracData.currentIndex || 0,
            savedAt: pracData.savedAt || pracData.startTime || Date.now()
          });
        }
      }
    } catch (e) {}

    return [...sessions, ...this.getSavedStudySessions()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  resumeHomeAttemptSession(type, chapterName = '', subjectFilter = '', tier = null) {
    if (type === 'mock') {
      try {
        const rawMock = localStorage.getItem('apti_active_mock');
        if (rawMock && this.restoreActiveMockSession(JSON.parse(rawMock))) return;
      } catch (e) {}
      this.startMockTestPrompt();
      return;
    }

    if (type === 'chapter_test') {
      try {
        const rawPrac = localStorage.getItem('apti_active_practice');
        if (rawPrac && this.restoreActivePracticeSession(JSON.parse(rawPrac))) return;
      } catch (e) {}
    }

    if (chapterName) {
      this.practice.modeType = 'study';
      this.startPractice(chapterName, subjectFilter || null, tier || null);
    }
  }

  discardHomeAttemptSession(type, chapterName = '') {
    if (type === 'mock') {
      if (!confirm('Discard your in-progress Mock Test session?')) return;
      this.clearActiveMockSession();
    } else if (type === 'chapter_test') {
      if (!confirm(`Discard your in-progress Chapter Test for "${chapterName}"?`)) return;
      this.clearActivePracticeSession();
    } else if (chapterName) {
      if (!confirm(`Reset saved practice session for "${chapterName}"?`)) return;
      this.clearChapterStudyProgress(chapterName);
      try {
        const rawPrac = localStorage.getItem('apti_active_practice');
        if (rawPrac) {
          const parsed = JSON.parse(rawPrac);
          if (parsed && parsed.chapter && parsed.chapter.toLowerCase() === chapterName.toLowerCase() && parsed.modeType === 'study') {
            this.clearActivePracticeSession();
          }
        }
      } catch (e) {}
    }
    this.renderDashboard();
  }

  resetPracticeProgress() {
    if (!this.practice || !this.practice.chapter) return;
    const chap = this.practice.chapter;
    if (confirm(`Reset practice progress for "${chap}"?\n\nAll your answered questions for this chapter will be cleared.`)) {
      this.practice.userAnswers = {};
      this.practice.reviewFlags = {};
      this.practice.questionTimes = {};
      this.practice.currentIndex = 0;
      this.clearChapterStudyProgress(chap);
      this.saveActivePracticeSession();
      this.renderPracticeQuestion();
      this.renderPracticePalette();
      this.startPracticeTimer();
    }
  }

  saveActivePracticeSession() {
    if (!this.practice || !this.practice.chapter || !Array.isArray(this.practice.questions) || this.practice.questions.length === 0 || this.isSubmitting) {
      return;
    }
    try {
      const payload = {
        chapter: this.practice.chapter,
        questions: this.practice.questions,
        currentIndex: this.practice.currentIndex || 0,
        userAnswers: this.practice.userAnswers || {},
        reviewFlags: this.practice.reviewFlags || {},
        questionTimes: this.practice.questionTimes || {},
        modeType: this.practice.modeType || 'study',
        practiceSubjectFilter: this.practiceSubjectFilter || 'all',
        tier: this.practice.tier || 'all',
        startTime: this.practice.startTime || Date.now(),
        savedAt: Date.now(),
        userEmail: this.currentUserEmail || 'guest@local'
      };
      localStorage.setItem('apti_active_practice', JSON.stringify(payload));
      if (this.practice.modeType === 'study') {
        this.saveChapterStudyProgress();
      }
    } catch (e) {
      console.warn('Failed to save active practice session to localStorage:', e);
    }
  }

  clearActivePracticeSession() {
    try {
      localStorage.removeItem('apti_active_practice');
    } catch (e) {}
  }

  restoreActivePracticeSession(saved) {
    if (!saved || !saved.chapter || !Array.isArray(saved.questions) || saved.questions.length === 0) {
      this.clearActivePracticeSession();
      return false;
    }

    if (saved.userEmail && this.currentUserEmail && saved.userEmail !== this.currentUserEmail) {
      this.clearActivePracticeSession();
      return false;
    }

    this.practice.chapter = saved.chapter;
    this.practice.questions = saved.questions;
    this.practice.currentIndex = Math.min(Math.max(0, saved.currentIndex || 0), saved.questions.length - 1);
    this.practice.userAnswers = saved.userAnswers || {};
    this.practice.reviewFlags = saved.reviewFlags || {};
    this.practice.questionTimes = saved.questionTimes || {};
    this.practice.modeType = saved.modeType || 'study';
    this.practice.tier = saved.tier || 'all';
    this.practice.startTime = saved.startTime || Date.now();
    this.practiceSubjectFilter = saved.practiceSubjectFilter || 'all';
    if (this.practiceSubjectFilter === 'rk_ranjan') {
      this.currentRkTier = saved.tier || 'all';
    }

    this.setPracticeChapterTitle(saved.chapter);

    // Sync dropdowns
    this.populateChapterDropdown(this.practiceSubjectFilter);
    const subjSelect = document.getElementById('practice-subject-dropdown');
    if (subjSelect) subjSelect.value = this.practiceSubjectFilter;
    const dd = document.getElementById('practice-chapter-dropdown');
    if (dd) dd.value = saved.chapter;

    // Toggle and sync RK Ranjan Tier bar in practice header
    const rkTierToggle = document.getElementById('practice-rk-tier-toggle');
    if (rkTierToggle) {
      if (this.practiceSubjectFilter === 'rk_ranjan') {
        rkTierToggle.classList.remove('hidden');
        this.updatePracticeRkTierUI();
      } else {
        rkTierToggle.classList.add('hidden');
      }
    }

    this.setPracticeModeType(this.practice.modeType);
    this.switchView('practice');
    this.renderPracticeQuestion();
    this.renderPracticePalette();
    this.startPracticeTimer();
    return true;
  }

  // ==========================================
  // FULLSCREEN & AUTO-PAUSE INTEGRATION
  // ==========================================

  setupFullscreenListeners() {
    const handleFsChange = () => this.handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);
  }

  handleFullscreenChange() {
    if (this.isSubmitting || this.currentMode === 'results' || this.currentMode === 'dashboard' || this.currentMode === 'login') {
      return;
    }

    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );

    // Sync Revision fullscreen state when exiting browser fullscreen
    if (this.currentMode === 'revision') {
      if (!isFullscreen && this.revision && this.revision.isFullscreen) {
        this.toggleRevisionFullscreen(false);
      }
      return;
    }

    // If user comes out of fullscreen in test mode, pause test automatically!
    if (!isFullscreen) {
      if (this.currentMode === 'mock' && !this.isTestPaused) {
        this.pauseMockTest();
      } else if (this.currentMode === 'practice' && this.practice.modeType === 'test' && !this.isTestPaused) {
        this.pausePracticeTest();
      }
      // Note: In study mode, exiting full screen does NOT pause the test
    }
  }

  async enterFullscreen() {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          const p = el.requestFullscreen();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen entry not permitted or supported:', err);
    }
  }

  exitFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen exit error:', err);
    }
  }

  hideTestPausedModal() {
    this.isTestPaused = false;
    const modal = document.getElementById('test-paused-modal');
    if (modal) modal.classList.add('hidden');
  }

  pauseMockTest() {
    if (this.isSubmitting || this.currentMode !== 'mock') return;
    this.isTestPaused = true;
    this.clearMockTimer();
    this.showTestPausedModal('Full Mock Examination', false);
  }

  pausePracticeTest() {
    if (this.isSubmitting || this.currentMode !== 'practice' || this.practice.modeType !== 'test') return;
    this.isTestPaused = true;
    this.pauseStartTime = Date.now();
    this.showTestPausedModal(`Chapter Test: ${this.practice.chapter}`, true);
  }

  showTestPausedModal(testTitle, canSwitchToStudy = false) {
    if (this.isSubmitting) return;
    const modal = document.getElementById('test-paused-modal');
    const titleEl = document.getElementById('test-paused-exam-name');
    const studyBtn = document.getElementById('pause-modal-study-btn');
    if (titleEl && testTitle) {
      titleEl.textContent = testTitle;
      titleEl.classList.remove('hidden');
    }
    if (studyBtn) {
      if (canSwitchToStudy) {
        studyBtn.classList.remove('hidden');
      } else {
        studyBtn.classList.add('hidden');
      }
    }

    // Populate Pause Summary Table (Image 1 replica)
    if (this.currentMode === 'mock' && this.mock && this.mock.questions) {
      let answered = 0;
      let unanswered = 0;
      let marked = 0;
      let notVisited = 0;

      this.mock.questions.forEach((q, idx) => {
        const isVisited = !!(this.mock.visited && this.mock.visited[idx]);
        const isAns = (this.mock.userAnswers && this.mock.userAnswers[q.id] !== undefined && this.mock.userAnswers[q.id] !== null);
        const isMark = !!(this.mock.reviewFlags && this.mock.reviewFlags[q.id]);

        if (isAns) answered++;
        if (isMark) marked++;
        if (!isAns && isVisited && !isMark) unanswered++;
        if (!isVisited && !isAns && !isMark) notVisited++;
      });

      const secEl = document.getElementById('pause-table-section');
      const totEl = document.getElementById('pause-table-total');
      const ansEl = document.getElementById('pause-table-answered');
      const unansEl = document.getElementById('pause-table-unanswered');
      const markEl = document.getElementById('pause-table-marked');
      const notVisEl = document.getElementById('pause-table-not-visited');

      if (secEl) secEl.textContent = 'Test';
      if (totEl) totEl.textContent = this.mock.questions.length;
      if (ansEl) ansEl.textContent = answered;
      if (unansEl) unansEl.textContent = unanswered;
      if (markEl) markEl.textContent = marked;
      if (notVisEl) notVisEl.textContent = notVisited;
    } else if (this.currentMode === 'practice') {
      let answered = 0;
      let unanswered = 0;
      let total = (this.practice.questions || []).length;
      (this.practice.questions || []).forEach((q, idx) => {
        if (this.practice.userAnswers[idx] !== undefined && this.practice.userAnswers[idx] !== null) answered++;
        else unanswered++;
      });
      const secEl = document.getElementById('pause-table-section');
      const totEl = document.getElementById('pause-table-total');
      const ansEl = document.getElementById('pause-table-answered');
      const unansEl = document.getElementById('pause-table-unanswered');
      const markEl = document.getElementById('pause-table-marked');
      const notVisEl = document.getElementById('pause-table-not-visited');
      if (secEl) secEl.textContent = (this.practice.chapter || 'Chapter');
      if (totEl) totEl.textContent = total;
      if (ansEl) ansEl.textContent = answered;
      if (unansEl) unansEl.textContent = unanswered;
      if (markEl) markEl.textContent = 0;
      if (notVisEl) notVisEl.textContent = 0;
    }

    if (modal) modal.classList.remove('hidden');
  }

  exitMockFromPauseModal() {
    if (confirm('Do you want to leave this examination and return to Dashboard?')) {
      this.hideTestPausedModal();
      this.clearMockTimer();
      this.clearActiveMockSession();
      this.exitFullscreen();
      this.showDashboard();
    }
  }

  async resumeFromPauseModal() {
    await this.enterFullscreen();
    const modal = document.getElementById('test-paused-modal');
    if (modal) modal.classList.add('hidden');
    this.isTestPaused = false;

    if (this.currentMode === 'mock') {
      this.startMockTimer();
    } else if (this.currentMode === 'practice' && this.practice.modeType === 'test') {
      if (this.pauseStartTime) {
        this.totalPausedDuration += (Date.now() - this.pauseStartTime);
        this.pauseStartTime = null;
      }
    }
  }

  switchFromPauseToStudy() {
    const modal = document.getElementById('test-paused-modal');
    if (modal) modal.classList.add('hidden');
    this.isTestPaused = false;
    this.setPracticeModeType('study');
  }

  // ==========================================
  // GOOGLE SHEET BACKEND CONFIGURATION
  // ==========================================

  updateSheetStatusUI() {
    const dot = document.getElementById('sheet-status-dot');
    const label = document.getElementById('sheet-status-text');
    if (!dot || !label) return;

    if (this.googleSheetUrl && this.googleSheetUrl.trim().length > 0) {
      dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
      label.textContent = 'Sheet Synced';
    } else {
      dot.className = 'w-1.5 h-1.5 rounded-full bg-zinc-300';
      label.textContent = 'Connect Sheet';
    }
  }

  openSheetModal() {
    const input = document.getElementById('sheet-url-input');
    const result = document.getElementById('sheet-test-result');
    if (input) input.value = this.googleSheetUrl;
    if (result) {
      result.textContent = '';
      result.className = 'text-[11px] font-medium hidden';
    }
    const modal = document.getElementById('google-sheet-modal');
    if (modal) modal.classList.remove('hidden');
  }

  closeSheetModal() {
    const modal = document.getElementById('google-sheet-modal');
    if (modal) modal.classList.add('hidden');
  }

  saveSheetConfig() {
    const input = document.getElementById('sheet-url-input');
    if (!input) return;
    const url = input.value.trim();
    this.googleSheetUrl = url;
    localStorage.setItem('apti_google_sheet_url', url);
    this.updateSheetStatusUI();
    this.closeSheetModal();
  }

  async testSheetConnection() {
    const input = document.getElementById('sheet-url-input');
    const result = document.getElementById('sheet-test-result');
    const btn = document.getElementById('btn-test-sheet');
    if (!input || !result) return;

    const url = input.value.trim();
    if (!url) {
      result.textContent = 'Please enter a valid Google Apps Script Web App URL.';
      result.className = 'text-[11px] font-medium text-rose-600 block';
      return;
    }

    if (btn) btn.textContent = 'Testing...';
    result.textContent = 'Pinging Google Sheet...';
    result.className = 'text-[11px] font-medium text-zinc-500 block';

    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: 'ping_' + Date.now(),
          timestamp: new Date().toISOString(),
          userEmail: this.currentUserEmail || 'test@ping.local',
          mode: 'connection_test',
          chapter: 'System Ping',
          totalQuestions: 0,
          correctCount: 0,
          scorePercentage: 100,
          timeTakenSeconds: 0
        })
      });

      result.textContent = 'Connection test signal sent! Check your Google Sheet to verify the ping row.';
      result.className = 'text-[11px] font-medium text-emerald-600 block';
    } catch (err) {
      result.textContent = 'Error connecting: ' + err.message;
      result.className = 'text-[11px] font-medium text-rose-600 block';
    } finally {
      if (btn) btn.textContent = 'Test Connection';
    }
  }

  exportAttemptsJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.attempts, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `apti_attempts_${(this.currentUserEmail || 'user').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchorElem.click();
  }

  async syncToGoogleSheet(attempt) {
    if (!this.googleSheetUrl || this.googleSheetUrl.trim().length === 0) return;

    try {
      const payload = {
        attemptId: attempt.attemptId,
        timestamp: attempt.timestamp,
        userEmail: attempt.userEmail || this.currentUserEmail || 'guest@local',
        mode: attempt.mode,
        chapter: attempt.chapter || 'All Chapters',
        totalQuestions: attempt.totalQuestions,
        correctCount: attempt.correctCount,
        incorrectCount: attempt.incorrectCount,
        unattemptedCount: attempt.unattemptedCount,
        scorePercentage: attempt.scorePercentage,
        timeTakenSeconds: attempt.timeTakenSeconds
      };

      await fetch(this.googleSheetUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Google Sheet background sync notice:', err);
    }
  }

  async loadAttempts() {
    if (!this.currentUserEmail) {
      this.attempts = [];
      this.renderStudyAnalyticsWidget();
      this.renderAttemptSessionsSection();
      this.renderAttemptsHistory();
      return;
    }

    let loaded = [];
    const activeEmail = this.currentUserEmail.trim().toLowerCase();

    // 1. Load from browser localStorage
    try {
      const stored = localStorage.getItem('apti_attempts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          loaded = parsed.filter(a => ((a && a.userEmail) || 'guest@local').toLowerCase() === activeEmail);
        }
      }
    } catch (e) {
      console.warn('LocalStorage loadAttempts error:', e);
    }

    // 2. If running locally with Node backend, load from /api/attempts
    const isLocalhost = Boolean(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(window.location.hostname) ||
      window.location.port !== ''
    );
    if (isLocalhost && !this.isStaticMode) {
      try {
        const res = await fetch(`/api/attempts?email=${encodeURIComponent(activeEmail)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.attempts && Array.isArray(data.attempts)) {
            loaded = [...data.attempts, ...loaded];
          }
        }
      } catch (e) {
        // Offline / static mode - keep loaded attempts
      }
    }

    // 3. Also load from Google Sheet if configured
    if (this.googleSheetUrl && this.googleSheetUrl.trim().length > 0) {
      try {
        const sheetUrl = `${this.googleSheetUrl.trim()}?action=getAttempts&email=${encodeURIComponent(activeEmail)}`;
        const sRes = await fetch(sheetUrl);
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData && Array.isArray(sData.attempts)) {
            const sheetAttempts = sData.attempts
              .map(a => this.normalizeSheetAttempt(a))
              .filter(Boolean);
            loaded = [...loaded, ...sheetAttempts];
          }
        }
      } catch (e) {
        console.warn('Google Sheet loadAttempts notice:', e);
      }
    }

    const dedupedMap = new Map();
    loaded.forEach(a => {
      if (a && a.attemptId && !dedupedMap.has(a.attemptId)) {
        dedupedMap.set(a.attemptId, a);
      }
    });
    const deduped = Array.from(dedupedMap.values());
    deduped.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    this.attempts = deduped;
    this.renderStudyAnalyticsWidget();
    this.renderAttemptSessionsSection();
    this.renderAttemptsHistory();
  }

  /**
   * Google Sheet rows store display labels ("Mock Test", "All Chapters", "3m 5s").
   * Convert them back to the shape the rest of the app expects, and drop
   * connection-test ping rows so they don't show up as fake attempts.
   */
  normalizeSheetAttempt(raw) {
    if (!raw || !raw.attemptId) return null;
    const id = String(raw.attemptId);
    const modeLabel = String(raw.mode || '').trim().toLowerCase();
    if (id.startsWith('ping_') || modeLabel === 'connection_test' || raw.chapter === 'System Ping') {
      return null;
    }

    let mode = 'practice';
    if (modeLabel === 'mock' || modeLabel === 'mock test') mode = 'mock';
    else if (modeLabel === 'chapter_test' || modeLabel === 'chapter test') mode = 'chapter_test';

    let timeTakenSeconds = Number(raw.timeTakenSeconds);
    if (!Number.isFinite(timeTakenSeconds)) {
      const m = /(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i.exec(String(raw.timeTakenFormatted || ''));
      timeTakenSeconds = m ? (Number(m[1] || 0) * 60 + Number(m[2] || 0)) : 0;
    }

    const chapter = (mode === 'mock' || raw.chapter === 'All Chapters') ? null : (raw.chapter || null);

    return {
      ...raw,
      attemptId: id,
      mode,
      chapter,
      timeTakenSeconds,
      totalQuestions: Number(raw.totalQuestions) || 0,
      correctCount: Number(raw.correctCount) || 0,
      incorrectCount: Number(raw.incorrectCount) || 0,
      unattemptedCount: Number(raw.unattemptedCount) || 0,
      scorePercentage: parseFloat(raw.scorePercentage) || 0
    };
  }

  // Keyboard Navigation for Distraction-Free Test Taking
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing into input or select
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      const key = e.key.toLowerCase();

      // Escape key handles Revision view, open Modals, and Drawers
      if (key === 'escape') {
        if (this.currentMode === 'revision') {
          e.preventDefault();
          if (this.revision && this.revision.isFullscreen) {
            this.toggleRevisionFullscreen(false);
          } else if (this.revision && this.revision.sidebarOpen) {
            this.setRevisionSidebarOpen(false);
          } else if (this.zenMode) {
            this.toggleZenMode(false);
          } else {
            this.exitRevisionView();
          }
          return;
        }

        const shortcutsModal = document.getElementById('keyboard-shortcuts-modal');
        if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) {
          e.preventDefault();
          this.closeShortcutsModal();
          return;
        }

        const qPaperModal = document.getElementById('mock-question-paper-modal');
        if (qPaperModal && !qPaperModal.classList.contains('hidden')) {
          e.preventDefault();
          this.closeQuestionPaperModal();
          return;
        }

        const confirmModal = document.getElementById('mock-confirm-modal');
        if (confirmModal && !confirmModal.classList.contains('hidden')) {
          e.preventDefault();
          this.closeSubmitModal();
          return;
        }

        const chSelectModal = document.getElementById('chapter-select-modal');
        if (chSelectModal && !chSelectModal.classList.contains('hidden')) {
          e.preventDefault();
          this.closeChapterSelectModal();
          return;
        }

        const mockSelectModal = document.getElementById('mock-select-modal');
        if (mockSelectModal && !mockSelectModal.classList.contains('hidden')) {
          e.preventDefault();
          this.closeMockSelectModal();
          return;
        }

        const sheetModal = document.getElementById('google-sheet-modal');
        if (sheetModal && !sheetModal.classList.contains('hidden')) {
          e.preventDefault();
          this.closeGoogleSheetModal();
          return;
        }

        if (this.currentMode === 'mock' && this.mock.drawerOpen) {
          e.preventDefault();
          this.toggleMockDrawer();
          return;
        }

        if (this.currentMode === 'practice' && this.practice.drawerOpen) {
          e.preventDefault();
          this.togglePracticeDrawer();
          return;
        }
      }

      // 'f' toggles Fullscreen in Revision Mode
      if (key === 'f' && this.currentMode === 'revision') {
        e.preventDefault();
        this.toggleRevisionFullscreen();
        return;
      }

      // 'z' toggles Zen / Distraction-Free in Revision Mode
      if (key === 'z' && this.currentMode === 'revision' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        this.toggleZenMode();
        return;
      }

      // 'c' toggles Chapters Sidebar in Revision Mode
      if (key === 'c' && this.currentMode === 'revision') {
        e.preventDefault();
        this.toggleRevisionSidebar();
        return;
      }

      // Left/Right arrows navigate chapters in Revision Mode
      if (this.currentMode === 'revision') {
        if (key === 'arrowleft') {
          e.preventDefault();
          this.prevRevisionChapter();
          return;
        }
        if (key === 'arrowright') {
          e.preventDefault();
          this.nextRevisionChapter();
          return;
        }
      }

      // Zen mode toggle shortcut: 'z'
      if (key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.toggleZenMode();
        return;
      }

      if (this.currentMode === 'practice') {
        if (key === '1' || key === 'a') { e.preventDefault(); this.selectPracticeOption(0); }
        else if (key === '2' || key === 'b') { e.preventDefault(); this.selectPracticeOption(1); }
        else if (key === '3' || key === 'c') { e.preventDefault(); this.selectPracticeOption(2); }
        else if (key === '4' || key === 'd') { e.preventDefault(); this.selectPracticeOption(3); }
        else if (key === 'r') { e.preventDefault(); this.togglePracticeReview(); }
        else if (key === 'arrowright' || key === 'enter') { e.preventDefault(); this.nextPracticeQuestion(); }
        else if (key === 'arrowleft') { e.preventDefault(); this.prevPracticeQuestion(); }
      } else if (this.currentMode === 'mock') {
        if (key === '1' || key === 'a') { e.preventDefault(); this.selectMockOption(0); }
        else if (key === '2' || key === 'b') { e.preventDefault(); this.selectMockOption(1); }
        else if (key === '3' || key === 'c') { e.preventDefault(); this.selectMockOption(2); }
        else if (key === '4' || key === 'd') { e.preventDefault(); this.selectMockOption(3); }
        else if (key === 'r') { e.preventDefault(); this.toggleMockReview(); }
        else if (key === 'arrowright' || key === 'enter') { e.preventDefault(); this.nextMockQuestion(); }
        else if (key === 'arrowleft') { e.preventDefault(); this.prevMockQuestion(); }
      }

      // '?' or 'h' opens Keyboard Shortcuts Help modal
      if (e.key === '?' || (key === 'h' && this.currentMode !== 'mock' && this.currentMode !== 'practice')) {
        e.preventDefault();
        this.toggleShortcutsModal();
        return;
      }
    });
  }

  setupSwipeNavigation() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let touchCurrentY = 0;
    let touchStartTime = 0;
    let isTracking = false;
    let lastSwipeTime = 0;

    const extractPoint = (e) => {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        return { clientX: t.clientX ?? t.pageX, clientY: t.clientY ?? t.pageY };
      }
      if (e.changedTouches && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        return { clientX: t.clientX ?? t.pageX, clientY: t.clientY ?? t.pageY };
      }
      if (e.targetTouches && e.targetTouches.length > 0) {
        const t = e.targetTouches[0];
        return { clientX: t.clientX ?? t.pageX, clientY: t.clientY ?? t.pageY };
      }
      if (e.detail && typeof e.detail.clientX === 'number') {
        return { clientX: e.detail.clientX, clientY: e.detail.clientY };
      }
      if (typeof e.clientX === 'number' && !isNaN(e.clientX)) {
        return { clientX: e.clientX, clientY: e.clientY };
      }
      if (typeof e.pageX === 'number' && !isNaN(e.pageX)) {
        return { clientX: e.pageX, clientY: e.pageY };
      }
      return null;
    };

    const handleStart = (e) => {
      if (this.currentMode !== 'practice' && this.currentMode !== 'mock') return;

      const pt = extractPoint(e);
      if (!pt || typeof pt.clientX !== 'number') return;

      const target = e.target;

      // Ignore interactive controls that handle their own interactions
      if (target && target.closest && target.closest('select, input, textarea, button, a, [role="button"], [role="slider"]')) {
        return;
      }

      // Ignore if touch/interaction is inside drawers, modals, or palette sheet
      if (target && target.closest && target.closest('#practice-drawer-panel, #mock-drawer-panel, .palette-sheet-drawer, .palette-backdrop, #practice-palette-backdrop, #mock-palette-backdrop, #chapter-select-modal, #test-paused-modal')) {
        return;
      }

      // Ignore if drawer is actively open on mobile
      if (window.innerWidth < 1024) {
        if (this.currentMode === 'practice' && this.practice?.drawerOpen) return;
        if (this.currentMode === 'mock' && this.mock?.drawerOpen) return;
      }

      // Ignore if near left edge (margin for iOS / Android edge swipe back navigation)
      if (pt.clientX < 16) {
        return;
      }

      // Check if target is inside a horizontally scrollable element
      let el = target;
      while (el && el !== document.body) {
        if (el.scrollWidth > el.clientWidth) {
          const style = window.getComputedStyle(el);
          if (style && (style.overflowX === 'auto' || style.overflowX === 'scroll')) {
            return;
          }
        }
        el = el.parentElement;
      }

      touchStartX = pt.clientX;
      touchStartY = pt.clientY;
      touchCurrentX = touchStartX;
      touchCurrentY = touchStartY;
      touchStartTime = Date.now();
      isTracking = true;
    };

    const showSwipeHint = (dir) => {
      if (typeof document === 'undefined' || !document.getElementById) return;
      const isMock = (this.currentMode === 'mock');
      const prevEl = document.getElementById(isMock ? 'mock-mobile-arrow-prev' : 'practice-mobile-arrow-prev');
      const nextEl = document.getElementById(isMock ? 'mock-mobile-arrow-next' : 'practice-mobile-arrow-next');

      if (dir === 'next') {
        if (nextEl && !nextEl.classList.contains('arrow-disabled')) {
          nextEl.classList.add('swipe-hint-active');
        }
        if (prevEl) prevEl.classList.remove('swipe-hint-active');
      } else if (dir === 'prev') {
        if (prevEl && !prevEl.classList.contains('arrow-disabled')) {
          prevEl.classList.add('swipe-hint-active');
        }
        if (nextEl) nextEl.classList.remove('swipe-hint-active');
      }
    };

    const clearSwipeHints = () => {
      if (typeof document === 'undefined' || !document.querySelectorAll) return;
      const activeHints = document.querySelectorAll('.mobile-swipe-arrow.swipe-hint-active');
      activeHints.forEach(el => el.classList.remove('swipe-hint-active'));
    };

    const handleMove = (e) => {
      if (!isTracking) return;
      const pt = extractPoint(e);
      if (pt && typeof pt.clientX === 'number') {
        touchCurrentX = pt.clientX;
        touchCurrentY = pt.clientY;

        const currentDiffX = touchCurrentX - touchStartX;
        const currentDiffY = touchCurrentY - touchStartY;

        // If swipe gesture is moving horizontally, show visual feedback on edge arrows
        if (Math.abs(currentDiffX) > 15 && Math.abs(currentDiffX) > Math.abs(currentDiffY)) {
          if (currentDiffX < 0) {
            showSwipeHint('next');
          } else {
            showSwipeHint('prev');
          }
        } else {
          clearSwipeHints();
        }
      }
    };

    const handleEnd = (e) => {
      clearSwipeHints();
      if (!isTracking || !touchStartTime) {
        isTracking = false;
        return;
      }

      const pt = extractPoint(e);
      const endX = (pt && typeof pt.clientX === 'number') ? pt.clientX : touchCurrentX;
      const endY = (pt && typeof pt.clientY === 'number') ? pt.clientY : touchCurrentY;

      const diffX = endX - touchStartX;
      const diffY = endY - touchStartY;
      const elapsed = Date.now() - touchStartTime;

      isTracking = false;
      touchStartX = 0;
      touchStartY = 0;
      touchCurrentX = 0;
      touchCurrentY = 0;
      touchStartTime = 0;

      // Swipe criteria
      const minDistance = 30;
      if (elapsed > 1000) return; // Must be under 1000ms gesture
      if (Math.abs(diffX) < minDistance) return; // Must meet min distance
      if (Math.abs(diffX) < Math.abs(diffY)) return; // Must be predominantly horizontal
      if (window.getSelection && window.getSelection().toString().trim().length > 0) return; // Ignore text selection

      // Debounce rapid swipe actions
      const now = Date.now();
      if (now - lastSwipeTime < 350) return;
      lastSwipeTime = now;

      // Temporarily suppress option click so swipe across option card doesn't accidentally trigger selection
      this._suppressOptionClick = true;
      setTimeout(() => { this._suppressOptionClick = false; }, 350);

      if (this.currentMode === 'practice') {
        if (diffX < 0) {
          // Swipe left -> Next question
          if (this.practice.currentIndex < this.practice.questions.length - 1) {
            this.nextPracticeQuestion();
          }
        } else if (diffX > 0) {
          // Swipe right -> Previous question
          if (this.practice.currentIndex > 0) {
            this.prevPracticeQuestion();
          }
        }
      } else if (this.currentMode === 'mock') {
        if (diffX < 0) {
          // Swipe left -> Next question
          if (this.mock.currentIndex < this.mock.questions.length - 1) {
            this.nextMockQuestion();
          }
        } else if (diffX > 0) {
          // Swipe right -> Previous question
          if (this.mock.currentIndex > 0) {
            this.prevMockQuestion();
          }
        }
      }
    };

    const handleCancel = () => {
      clearSwipeHints();
      isTracking = false;
      touchStartX = 0;
      touchStartY = 0;
      touchCurrentX = 0;
      touchCurrentY = 0;
      touchStartTime = 0;
    };

    // Attach touch listeners to document (passive so browser scrolling remains 60fps)
    document.addEventListener('touchstart', handleStart, { passive: true });
    document.addEventListener('touchmove', handleMove, { passive: true });
    document.addEventListener('touchend', handleEnd, { passive: true });
    document.addEventListener('touchcancel', handleCancel, { passive: true });

    // Pointer events support (for touch screens, styluses, and pointer dragging)
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      handleStart(e);
    }, { passive: true });
    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointerup', handleEnd, { passive: true });
    document.addEventListener('pointercancel', handleCancel, { passive: true });
  }

  toggleZenMode(forcedState) {
    this.zenMode = (typeof forcedState === 'boolean') ? forcedState : !this.zenMode;
    document.body.classList.toggle('zen-mode', this.zenMode);

    const btnHeaderZen = document.getElementById('btn-zen');
    const btnRevZen = document.getElementById('rev-zen-btn');

    if (btnHeaderZen) {
      btnHeaderZen.classList.toggle('btn-primary', this.zenMode);
      btnHeaderZen.classList.toggle('text-white', this.zenMode);
      btnHeaderZen.title = this.zenMode ? 'Exit Distraction-Free Mode (Z)' : 'Toggle Distraction-Free Zen Mode (Z)';
    }

    if (btnRevZen) {
      if (this.zenMode) {
        btnRevZen.classList.add('btn-primary', 'text-white');
        btnRevZen.classList.remove('btn-secondary', 'text-zinc-700');
        btnRevZen.title = 'Exit Distraction-Free Zen Mode (Z)';
        const label = btnRevZen.querySelector('.zen-btn-label');
        if (label) label.textContent = 'Exit Zen';
      } else {
        btnRevZen.classList.remove('btn-primary', 'text-white');
        btnRevZen.classList.add('btn-secondary', 'text-zinc-700');
        btnRevZen.title = 'Toggle Distraction-Free Zen Mode (Z)';
        const label = btnRevZen.querySelector('.zen-btn-label');
        if (label) label.textContent = 'Zen';
      }
    }
  }

  // ==========================================
  // CBT FONT SIZE ZOOM SCALING (A / A+ / A++)
  // ==========================================

  cycleFontSize() {
    const scales = ['normal', 'lg', 'xl'];
    const current = localStorage.getItem('apti_font_scale') || 'normal';
    const nextIdx = (scales.indexOf(current) + 1) % scales.length;
    const next = scales[nextIdx];
    this.setFontScale(next);
  }

  setFontScale(scale) {
    document.body.classList.remove('font-scale-lg', 'font-scale-xl');
    if (scale === 'lg') document.body.classList.add('font-scale-lg');
    else if (scale === 'xl') document.body.classList.add('font-scale-xl');
    localStorage.setItem('apti_font_scale', scale);

    const labels = { 'normal': 'A', 'lg': 'A+', 'xl': 'A++' };
    const btnText = document.querySelectorAll('.font-scale-indicator');
    btnText.forEach(el => el.textContent = labels[scale] || 'A');
  }

  initFontScale() {
    const saved = localStorage.getItem('apti_font_scale') || 'normal';
    this.setFontScale(saved);
  }

  // View Switching
  switchView(viewName) {
    this.closeMobileNav();
    if (this.currentMode === 'revision' && viewName !== 'revision') {
      this.toggleRevisionFullscreen(false);
      this.toggleZenMode(false);
    }

    this.currentMode = viewName;
    this.updateUserSessionUI();

    if (viewName === 'mock' || viewName === 'practice') {
      document.body.classList.add('cbt-portal-active');
      if (viewName === 'mock') {
        document.body.classList.add('in-mock-portal');
      } else {
        document.body.classList.remove('in-mock-portal');
      }
    } else {
      document.body.classList.remove('cbt-portal-active');
      document.body.classList.remove('in-mock-portal');
    }
    const views = ['login', 'dashboard', 'practice', 'mock', 'results', 'revision'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== viewName);
    });

    // Adapt main container padding: tight vertical spacing for revision view, aligned with navbar
    const mainEl = document.querySelector('main');
    if (viewName === 'revision') {
      document.body.classList.add('overflow-y-hidden');
      if (mainEl) {
        mainEl.classList.remove('py-6', 'sm:py-8');
        mainEl.classList.add('py-2', 'sm:py-3');
      }
      this.toggleZenMode(true);
    } else {
      document.body.classList.remove('overflow-y-hidden');
      if (mainEl) {
        mainEl.classList.remove('py-2', 'sm:py-3');
        mainEl.classList.add('py-6', 'sm:py-8');
      }
      this.toggleZenMode(false);
    }

    const btnHome = document.getElementById('nav-btn-home');
    const btnPractice = document.getElementById('nav-btn-practice');
    const btnRevision = document.getElementById('nav-btn-revision');

    if (btnHome) btnHome.classList.toggle('bg-zinc-100', viewName === 'dashboard');
    if (btnPractice) btnPractice.classList.toggle('bg-zinc-100', viewName === 'practice');
    if (btnRevision) btnRevision.classList.toggle('bg-indigo-100', viewName === 'revision');

    if (viewName === 'practice') {
      this.startPracticeTimer();
    } else {
      this.clearPracticeTimer();
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  showDashboard() {
    this.isSubmitting = false;
    this.hideTestPausedModal();
    this.clearPracticeTimer();

    if (!this.currentUserEmail) {
      this.switchView('login');
      return;
    }

    if (this.mock.timerInterval || (this.currentMode === 'mock' && this.mock.questions && this.mock.questions.length > 0)) {
      if (!confirm('You have an ongoing mock test. Leaving will abandon the current test. Continue?')) {
        return;
      }
      this.clearMockTimer();
      this.clearActiveMockSession();
    } else if (this.currentMode === 'practice' && this.practice.modeType === 'test' && this.practice.questions && this.practice.questions.length > 0) {
      if (!confirm('You have an ongoing chapter test. Leaving will abandon the current test. Continue?')) {
        return;
      }
      this.clearActivePracticeSession();
    }
    if (this.currentMode === 'practice' && this.practice.modeType === 'study') {
      this.saveChapterStudyProgress();
    }
    this.clearActivePracticeSession();
    this.clearActiveMockSession();
    this.exitFullscreen();
    this.switchView('dashboard');
    this.updateUserSessionUI();
    this.renderDashboard();
    this.loadAttempts().catch(() => {});
  }

  showChapterSelect() {
    this.openChapterSelectModal();
  }

  // ==========================================
  // CHAPTER TEST SELECTION MODAL
  // ==========================================

  handlePracticeChapterTitleClick() {
    if (this.practice.modeType === 'test') {
      return; // Cannot change chapter during test mode
    }
    this.openChapterSelectModal();
  }

  openChapterSelectModal(defaultSubj = 'aptitude') {
    if (this.currentMode === 'practice' && this.practice.modeType === 'test') {
      alert('You cannot change chapter or subject during an active chapter test. Please submit the test or switch to Study mode.');
      return;
    }
    if (!this.currentUserEmail) {
      this.switchView('login');
      return;
    }

    if (this.currentMode === 'practice' && this.practiceSubjectFilter === 'rk_ranjan') {
      this.modalSubject = 'rk_ranjan';
    } else {
      this.modalSubject = defaultSubj;
    }
    this.modalScienceSub = 'all';

    const modal = document.getElementById('chapter-select-modal');
    if (modal) modal.classList.remove('hidden');

    this.updateModalTabsUI();
    this.renderModalChapters();
  }

  closeChapterSelectModal() {
    const modal = document.getElementById('chapter-select-modal');
    if (modal) modal.classList.add('hidden');
  }

  toggleShortcutsModal() {
    const modal = document.getElementById('keyboard-shortcuts-modal');
    if (modal) {
      modal.classList.toggle('hidden');
    }
  }

  closeShortcutsModal() {
    const modal = document.getElementById('keyboard-shortcuts-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  setModalSubjectTab(subj) {
    this.modalSubject = subj;
    this.modalScienceSub = 'all';
    this.updateModalTabsUI();
    if (subj === 'rk_ranjan' && (!this.rkQuestions || this.rkQuestions.length === 0)) {
      this.loadRkRanjanData().then(() => this.renderModalChapters());
      return;
    }
    this.renderModalChapters();
  }

  setModalScienceSubTab(sub) {
    this.modalScienceSub = sub;
    this.updateModalTabsUI();
    this.renderModalChapters();
  }

  setModalRkTierTab(tier) {
    this.modalRkTier = tier;
    this.updateModalTabsUI();
    this.renderModalChapters();
  }

  updateModalTabsUI() {
    const tabApti = document.getElementById('modal-tab-aptitude');
    const tabRk = document.getElementById('modal-tab-rk-ranjan');
    const tabSci = document.getElementById('modal-tab-science');
    const tabTop300 = document.getElementById('modal-tab-top300');
    const sciBar = document.getElementById('modal-science-subfilter-bar');
    const rkBar = document.getElementById('modal-rk-subfilter-bar');

    const activeTab = 'flex-1 py-1.5 rounded-md font-semibold transition bg-white text-zinc-900 shadow-xs text-center';
    const inactiveTab = 'flex-1 py-1.5 rounded-md font-medium text-zinc-600 hover:text-zinc-900 transition text-center';
    const activeTop300 = 'flex-1 py-1.5 rounded-md font-semibold transition bg-amber-600 text-white shadow-xs text-center';
    const inactiveTop300 = 'flex-1 py-1.5 rounded-md font-medium text-amber-800 hover:text-amber-900 transition text-center';
    const activeRk = 'flex-1 py-1.5 rounded-md font-semibold transition bg-violet-600 text-white shadow-xs text-center';
    const inactiveRk = 'flex-1 py-1.5 rounded-md font-medium text-violet-700 hover:text-violet-900 transition text-center';

    if (tabApti) tabApti.className = (this.modalSubject === 'aptitude' ? activeTab : inactiveTab);
    if (tabRk) tabRk.className = (this.modalSubject === 'rk_ranjan' ? activeRk : inactiveRk);
    if (tabSci) tabSci.className = (this.modalSubject === 'science' ? activeTab : inactiveTab);
    if (tabTop300) tabTop300.className = (this.modalSubject === 'top300' ? activeTop300 : inactiveTop300);

    if (sciBar) {
      sciBar.classList.toggle('hidden', this.modalSubject !== 'science');
    }
    if (rkBar) {
      rkBar.classList.toggle('hidden', this.modalSubject !== 'rk_ranjan');
    }

    if (this.modalSubject === 'science') {
      const subTabs = {
        'all': document.getElementById('modal-subtab-all'),
        'Biology': document.getElementById('modal-subtab-bio'),
        'Chemistry': document.getElementById('modal-subtab-chem'),
        'Physics': document.getElementById('modal-subtab-phys')
      };
      Object.keys(subTabs).forEach(k => {
        const btn = subTabs[k];
        if (btn) {
          if (k === this.modalScienceSub) {
            btn.className = 'px-2 py-0.5 rounded font-semibold btn-primary text-white transition';
          } else {
            btn.className = 'px-2 py-0.5 rounded font-medium text-zinc-600 hover:text-zinc-900 transition';
          }
        }
      });
    }

    if (this.modalSubject === 'rk_ranjan') {
      const rkModalTabs = {
        'all': document.getElementById('modal-rk-subtab-all'),
        'pro': document.getElementById('modal-rk-subtab-pro'),
        'classroom': document.getElementById('modal-rk-subtab-classroom')
      };
      Object.keys(rkModalTabs).forEach(k => {
        const btn = rkModalTabs[k];
        if (btn) {
          if (k === this.modalRkTier) {
            if (k === 'pro') {
              btn.className = 'px-2 py-0.5 rounded font-bold bg-violet-600 text-white transition shadow-xs';
            } else {
              btn.className = 'px-2 py-0.5 rounded font-semibold btn-primary text-white transition';
            }
          } else {
            if (k === 'pro') {
              btn.className = 'px-2 py-0.5 rounded font-bold text-violet-700 hover:text-violet-900 transition';
            } else {
              btn.className = 'px-2 py-0.5 rounded font-medium text-zinc-600 hover:text-zinc-900 transition';
            }
          }
        }
      });
    }
  }

  renderModalChapters() {
    const list = document.getElementById('modal-chapters-list');
    if (!list) return;

    let filtered = this.chapters;
    if (this.modalSubject === 'rk_ranjan') {
      filtered = this.rkChapters || [];
    } else if (this.modalSubject === 'aptitude') {
      filtered = filtered.filter(c => (c.subject || '').includes('Aptitude') && c.subSubject !== 'RK Ranjan Math');
    } else if (this.modalSubject === 'science') {
      filtered = filtered.filter(c => (c.subject || '').includes('Science') && c.name !== 'Top 300 Questions');
      if (this.modalScienceSub !== 'all') {
        filtered = filtered.filter(c => (c.subSubject || '').toLowerCase() === this.modalScienceSub.toLowerCase());
      }
    } else if (this.modalSubject === 'top300') {
      filtered = filtered.filter(c => c.name === 'Top 300 Questions');
    }

    if (filtered.length === 0) {
      list.innerHTML = `<p class="col-span-full py-8 text-center text-xs text-zinc-400">No chapters found.</p>`;
      return;
    }

    list.innerHTML = filtered.map(ch => {
      let badge = '';
      if (ch.name === 'Top 300 Questions') {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">🔥 TOP 300</span>';
      } else if (ch.subSubject === 'RK Ranjan Math' || ch.faculty === 'RK Ranjan') {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200/60">RK Math</span>';
      } else if ((ch.subject || '').includes('Aptitude')) {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200/60">Apti</span>';
      } else if (ch.subSubject === 'Biology') {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">Bio</span>';
      } else if (ch.subSubject === 'Chemistry') {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200/60">Chem</span>';
      } else if (ch.subSubject === 'Physics') {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200/60">Phys</span>';
      }

      const isRkModal = (this.modalSubject === 'rk_ranjan');
      let displayedCount = ch.count;
      let modalBadge = badge;
      let modalTierArg = '';
      if (isRkModal) {
        if (this.modalRkTier === 'pro') {
          displayedCount = ch.proCount !== undefined ? ch.proCount : ch.count;
          modalBadge = '<span class="text-[9px] font-bold uppercase tracking-wider text-violet-800 bg-violet-100 px-1.5 py-0.5 rounded border border-violet-200">⭐ Pro</span>';
          modalTierArg = ", 'pro'";
        } else if (this.modalRkTier === 'classroom') {
          displayedCount = ch.classroomCount !== undefined ? ch.classroomCount : ch.count;
          modalBadge = '<span class="text-[9px] font-medium uppercase tracking-wider text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">ClassRoom</span>';
          modalTierArg = ", 'classroom'";
        }
      }

      const clickHandler = (this.modalSubject === 'rk_ranjan')
        ? `app.startPracticeFromModal('${ch.name.replace(/'/g, "\\'")}', 'rk_ranjan'${modalTierArg})`
        : `app.startPracticeFromModal('${ch.name.replace(/'/g, "\\'")}', '${this.modalSubject}')`;

      return `
        <div onclick="${clickHandler}"
             class="p-2.5 rounded-lg border border-zinc-200 hover:border-sky-300 hover:bg-sky-50/80 cursor-pointer transition flex items-center justify-between group">
          <div class="overflow-hidden pr-2">
            <div class="flex items-center gap-1.5 mb-0.5">
              ${modalBadge}
              <span class="text-[10px] text-zinc-400 font-mono">${displayedCount} Qs</span>
            </div>
            <h4 class="text-xs font-semibold text-zinc-900 group-hover:text-zinc-700 truncate">${ch.name}</h4>
          </div>
          <span class="text-xs text-zinc-300 group-hover:text-zinc-800 transition font-bold">&rarr;</span>
        </div>
      `;
    }).join('');
  }

  startPracticeFromModal(chapterName, preferredSubjectFilter = null, preferredTier = null) {
    this.closeChapterSelectModal();
    let filter = preferredSubjectFilter || this.modalSubject;
    if (this.modalSubject === 'science' && this.modalScienceSub !== 'all') {
      filter = this.modalScienceSub.toLowerCase();
    }
    const tier = preferredTier || (this.modalSubject === 'rk_ranjan' ? (this.modalRkTier || 'all') : null);
    this.startPractice(chapterName, filter, tier);
  }

  // ==========================================
  // DATA FETCHING (DUAL MODE: API & STATIC)
  // ==========================================

  sortChapters(chapters) {
    if (window.AptiPrep && window.AptiPrep.ChapterOrder) {
      return window.AptiPrep.ChapterOrder.sortChapters(chapters);
    }
    return [...(chapters || [])].sort((a, b) => {
      const subjA = a.subject || '';
      const subjB = b.subject || '';
      if (subjA !== subjB) return subjA.localeCompare(subjB);
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  async loadChapters() {
    const isLocalhost = Boolean(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(window.location.hostname) ||
      window.location.port !== ''
    );

    if (isLocalhost) {
      // 1. Try local Express API first
      try {
        const res = await fetch('/api/chapters');
        if (res.ok) {
          const data = await res.json();
          if (data.chapters && data.chapters.length > 0) {
            this.chapters = this.sortChapters(data.chapters);
            this.updateDashboardBadges(data.totalQuestions, data.totalChapters);
            this.renderChaptersGrid();
            this.populateChapterDropdown();
            this.loadRkRanjanData().catch(() => {});
            return;
          }
        }
      } catch (e) {}
    }

    // 2. Direct static data loading (GitHub Pages / offline mode)
    this.isStaticMode = true;
    await this.loadAllQuestionsStatic();
    this.loadRkRanjanData().catch(() => {});
  }

  async loadAllQuestionsStatic() {
    try {
      const res = await fetch('./data/questions.json');
      const questions = await res.json();
      this.allQuestions = questions || [];

      const chapterMap = {};
      this.allQuestions.forEach(q => {
        const chap = q.chapter || 'General';
        if (!chapterMap[chap]) {
          chapterMap[chap] = {
            name: chap,
            subject: q.subject || 'Quantitative Aptitude',
            subSubject: q.subSubject || (q.subject === 'General Science' ? 'General Science' : 'Aptitude'),
            count: 0
          };
        }
        chapterMap[chap].count += 1;
      });

      this.chapters = this.sortChapters(Object.values(chapterMap));

      this.updateDashboardBadges(this.allQuestions.length, this.chapters.length);
      this.renderChaptersGrid();
      this.populateChapterDropdown();
    } catch (err) {
      console.error('Failed to load static questions.json:', err);
    }
  }

  async loadRkRanjanData() {
    if (this.rkQuestions && this.rkQuestions.length > 0) return;

    const isLocalhost = Boolean(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(window.location.hostname) ||
      window.location.port !== ''
    );

    if (isLocalhost) {
      try {
        const res = await fetch('/api/rk-questions');
        if (res.ok) {
          const data = await res.json();
          if (data.questions && data.questions.length > 0) {
            this.rkQuestions = data.questions;
            this.buildRkChaptersFromQuestions();
            return;
          }
        }
      } catch (e) {}
    }

    try {
      const res = await fetch('./data/rk_ranjan_questions.json');
      const questions = await res.json();
      this.rkQuestions = questions || [];
      this.buildRkChaptersFromQuestions();
    } catch (err) {
      console.error('Failed to load static rk_ranjan_questions.json:', err);
    }
  }

  buildRkChaptersFromQuestions() {
    const chapMap = {};
    (this.rkQuestions || []).forEach(q => {
      const chap = q.chapter || 'General';
      if (!chapMap[chap]) {
        chapMap[chap] = {
          name: chap,
          subject: 'Quantitative Aptitude',
          subSubject: 'RK Ranjan Math',
          faculty: 'RK Ranjan',
          count: 0,
          proCount: 0,
          classroomCount: 0
        };
      }
      chapMap[chap].count += 1;
      const isPro = (q.sheetType || '').toLowerCase().includes('pro');
      if (isPro) {
        chapMap[chap].proCount += 1;
      } else {
        chapMap[chap].classroomCount += 1;
      }
    });

    this.rkChapters = this.sortChapters(Object.values(chapMap));

    const badgeRk = document.getElementById('badge-count-rk-ranjan');
    if (badgeRk) badgeRk.textContent = `(${this.rkChapters.length})`;

    if (this.currentMode === 'dashboard') {
      this.renderAttemptSessionsSection();
      if (this.currentSubjectFilter === 'rk_ranjan') {
        this.renderChaptersGrid();
      }
    }
  }

  updateDashboardBadges(totalQuestions, totalChapters) {
    const badge = document.getElementById('total-questions-badge');
    if (badge) badge.textContent = `${totalQuestions.toLocaleString()} questions`;

    const chapBadge = document.getElementById('dashboard-total-chapters-badge');
    if (chapBadge) chapBadge.textContent = `${totalChapters} Chapters`;

    const heroSub = document.getElementById('dashboard-hero-subtitle');
    if (heroSub) heroSub.innerHTML = `${totalChapters} chapters &bull; ${totalQuestions.toLocaleString()} questions &bull; Offline & local`;

    const aptiCount = this.chapters.filter(c => (c.subject || '').includes('Aptitude')).length;
    const sciCount = this.chapters.filter(c => (c.subject || '').includes('Science')).length;

    const bAll = document.getElementById('badge-count-all');
    if (bAll) bAll.textContent = `(${totalChapters})`;
    const bApti = document.getElementById('badge-count-aptitude');
    if (bApti) bApti.textContent = `(${aptiCount})`;
    const bSci = document.getElementById('badge-count-science');
    if (bSci) bSci.textContent = `(${sciCount})`;

    const bRk = document.getElementById('badge-count-rk-ranjan');
    if (bRk) bRk.textContent = `(${this.rkChapters.length || 33})`;

    const bTop300 = document.getElementById('badge-count-top300');
    const top300Count = this.chapters.filter(c => c.name === 'Top 300 Questions').reduce((sum, c) => sum + c.count, 0) || 170;
    if (bTop300) bTop300.textContent = `(${top300Count} Qs)`;
  }

  // ==========================================
  // SUBJECT FILTERING
  // ==========================================

  async setSubjectFilter(filter) {
    this.currentSubjectFilter = filter;
    this.currentSubSubjectFilter = 'all';

    const btnAll = document.getElementById('filter-btn-all');
    const btnApti = document.getElementById('filter-btn-aptitude');
    const btnRk = document.getElementById('filter-btn-rk-ranjan');
    const btnSci = document.getElementById('filter-btn-science');
    const btnTop300 = document.getElementById('filter-btn-top300');
    const subBar = document.getElementById('subsubject-filter-bar');
    const rkBar = document.getElementById('rk-subfilter-bar');

    const activeClass = 'px-2.5 py-1 rounded-md text-xs font-semibold transition btn-primary shadow-xs';
    const inactiveClass = 'px-2.5 py-1 rounded-md text-xs font-medium transition btn-secondary border border-zinc-200 text-zinc-600 hover:text-zinc-900';
    const activeRk = 'px-2.5 py-1 rounded-md text-xs font-semibold transition bg-violet-600 text-white shadow-xs border border-violet-600';
    const inactiveRk = 'px-2.5 py-1 rounded-md text-xs font-semibold transition bg-white border border-zinc-200 text-violet-700 hover:text-violet-900 hover:border-violet-300';
    const activeTop300 = 'px-2.5 py-1 rounded-md text-xs font-semibold transition bg-amber-600 text-white shadow-xs border border-amber-600';
    const inactiveTop300 = 'px-2.5 py-1 rounded-md text-xs font-semibold transition bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100';

    if (btnAll) btnAll.className = (filter === 'all' ? activeClass : inactiveClass);
    if (btnApti) btnApti.className = (filter === 'aptitude' ? activeClass : inactiveClass);
    if (btnRk) btnRk.className = (filter === 'rk_ranjan' ? activeRk : inactiveRk);
    if (btnSci) btnSci.className = (filter === 'science' ? activeClass : inactiveClass);
    if (btnTop300) btnTop300.className = (filter === 'top300' ? activeTop300 : inactiveTop300);

    if (subBar) {
      if (filter === 'science') {
        subBar.classList.remove('hidden');
      } else {
        subBar.classList.add('hidden');
      }
    }

    if (rkBar) {
      if (filter === 'rk_ranjan') {
        rkBar.classList.remove('hidden');
        this.updateRkTierButtonsUI();
      } else {
        rkBar.classList.add('hidden');
      }
    }

    if (filter === 'rk_ranjan') {
      if (!this.rkQuestions || this.rkQuestions.length === 0) {
        await this.loadRkRanjanData();
      }
      this.updateRkHeroSubtitle();
    } else {
      const heroSub = document.getElementById('dashboard-hero-subtitle');
      if (heroSub && this.chapters.length > 0) {
        const totalQ = this.chapters.reduce((sum, c) => sum + (c.count || 0), 0);
        heroSub.innerHTML = `${this.chapters.length} chapters &bull; ${totalQ.toLocaleString()} questions &bull; Offline & local`;
      }
    }

    this.renderChaptersGrid();
  }

  updateRkTierButtonsUI() {
    const tier = this.currentRkTier || 'all';
    const rkBtns = {
      'all': document.getElementById('rk-tier-btn-all'),
      'pro': document.getElementById('rk-tier-btn-pro'),
      'classroom': document.getElementById('rk-tier-btn-classroom')
    };

    Object.keys(rkBtns).forEach(key => {
      const btn = rkBtns[key];
      if (btn) {
        if (key === tier) {
          if (key === 'pro') {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-bold transition bg-violet-600 text-white shadow-xs';
          } else {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-semibold transition bg-white text-zinc-900 shadow-xs border border-zinc-200';
          }
        } else {
          if (key === 'pro') {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-bold transition text-violet-700 hover:text-violet-900';
          } else {
            btn.className = 'px-2 py-0.5 rounded text-[11px] font-medium transition text-zinc-600 hover:text-zinc-900';
          }
        }
      }
    });
  }

  updateRkHeroSubtitle() {
    const heroSub = document.getElementById('dashboard-hero-subtitle');
    if (!heroSub) return;
    const tier = this.currentRkTier || 'all';
    const totalChapters = (this.rkChapters || []).length;
    if (tier === 'pro') {
      const totalPro = (this.rkChapters || []).reduce((sum, c) => sum + (c.proCount || 0), 0);
      heroSub.innerHTML = `<strong>RK Ranjan Math (⭐ Pro Level):</strong> ${totalChapters} chapters &bull; ${totalPro.toLocaleString()} advanced & high-difficulty questions`;
    } else if (tier === 'classroom') {
      const totalCr = (this.rkChapters || []).reduce((sum, c) => sum + (c.classroomCount || 0), 0);
      heroSub.innerHTML = `<strong>RK Ranjan Math (ClassRoom):</strong> ${totalChapters} chapters &bull; ${totalCr.toLocaleString()} foundation & core questions`;
    } else {
      const totalAll = (this.rkQuestions || []).length;
      heroSub.innerHTML = `<strong>RK Ranjan Math Series:</strong> ${totalChapters} chapters &bull; ${totalAll.toLocaleString()} questions &bull; ClassRoom & Pro Level Sheets`;
    }
  }

  setRkTierFilter(tier) {
    this.currentRkTier = tier;
    this.updateRkTierButtonsUI();
    this.updateRkHeroSubtitle();
    this.renderChaptersGrid();
  }

  setSubSubjectFilter(subfilter) {
    this.currentSubSubjectFilter = subfilter;

    const subBtns = {
      'all': document.getElementById('subfilter-btn-all'),
      'Biology': document.getElementById('subfilter-btn-biology'),
      'Chemistry': document.getElementById('subfilter-btn-chemistry'),
      'Physics': document.getElementById('subfilter-btn-physics')
    };

    Object.keys(subBtns).forEach(key => {
      const btn = subBtns[key];
      if (btn) {
        if (key === subfilter) {
          btn.className = 'px-2 py-0.5 rounded text-[11px] font-medium transition bg-white text-zinc-900 shadow-xs';
        } else {
          btn.className = 'px-2 py-0.5 rounded text-[11px] font-medium transition text-zinc-600 hover:text-zinc-900';
        }
      }
    });

    this.renderChaptersGrid();
  }

  getFilteredChapters() {
    if (this.currentSubjectFilter === 'rk_ranjan') {
      return this.rkChapters || [];
    }
    return this.chapters.filter(ch => {
      const subj = (ch.subject || '').toLowerCase();
      const subSubj = (ch.subSubject || '').toLowerCase();

      if (this.currentSubjectFilter === 'top300') {
        return ch.name === 'Top 300 Questions';
      } else if (this.currentSubjectFilter === 'aptitude') {
        if (!subj.includes('aptitude') || subSubj === 'rk ranjan math') return false;
      } else if (this.currentSubjectFilter === 'science') {
        if (!subj.includes('science')) return false;
        if (this.currentSubSubjectFilter !== 'all') {
          if (subSubj !== this.currentSubSubjectFilter.toLowerCase()) return false;
        }
      }
      return true;
    });
  }

  launchTop300ChapterTest() {
    this.startPractice('Top 300 Questions');
  }

  // ==========================================
  // DASHBOARD RENDERING
  // ==========================================

  renderDashboard() {
    this.renderStudyAnalyticsWidget();
    this.renderAttemptSessionsSection();
    this.renderChaptersGrid();
    this.renderAttemptsHistory();
  }

  formatRelativeSessionTime(ts) {
    if (!ts) return 'Recently';
    const diffMs = Math.max(0, Date.now() - Number(ts));
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  renderAttemptSessionsSection() {
    const container = document.getElementById('dashboard-attempt-sessions');
    if (!container) return;

    const sessions = this.getHomeAttemptSessions();
    if (!sessions || sessions.length === 0) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-zinc-900">Active &amp; Saved Attempt Sessions</h3>
          <span class="text-[11px] font-mono font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">${sessions.length}</span>
        </div>
        <span class="text-[11px] text-zinc-400">Pick up where you left off</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${sessions.map(sess => {
          const total = sess.totalQuestions || 0;
          const pct = total > 0 ? Math.min(100, Math.round((sess.answeredCount / total) * 100)) : 0;
          const safeChap = (sess.chapter || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const safeFilter = (sess.subjectFilter || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const safeType = (sess.type || 'study').replace(/'/g, "\\'");
          const safeTier = (sess.tier || 'all').replace(/'/g, "\\'");

          let modePill = '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200/70">Study Session</span>';
          let barColor = 'bg-sky-600';
          if (sess.type === 'mock') {
            modePill = '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">In-Progress Mock</span>';
            barColor = 'bg-amber-500';
          } else if (sess.type === 'chapter_test') {
            modePill = '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">Chapter Test</span>';
            barColor = 'bg-indigo-600';
          }

          let tierPill = '';
          if (sess.subjectFilter === 'rk_ranjan' && sess.tier === 'pro') {
            tierPill = ' <span class="text-[9px] font-bold text-violet-700 bg-violet-100 px-1 py-0.2 rounded border border-violet-200">⭐ Pro</span>';
          } else if (sess.subjectFilter === 'rk_ranjan' && sess.tier === 'classroom') {
            tierPill = ' <span class="text-[9px] font-medium text-zinc-600 bg-zinc-100 px-1 py-0.2 rounded border border-zinc-200">ClassRoom</span>';
          }

          const progressLabel = total > 0
            ? `${sess.answeredCount} / ${total} attempted (${pct}%)`
            : `${sess.answeredCount} attempted`;
          const accLabel = (sess.correctCount !== null && sess.answeredCount > 0)
            ? ` • ${Math.round((sess.correctCount / sess.answeredCount) * 100)}% acc`
            : '';
          const timeLabel = this.formatRelativeSessionTime(sess.savedAt);

          return `
            <div class="bg-white border border-zinc-200 hover:border-sky-300 rounded-xl p-4 shadow-2xs transition flex flex-col justify-between gap-3">
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  ${modePill}
                  <span class="text-[11px] text-zinc-400 font-medium">${escapeHtml(timeLabel)}</span>
                </div>
                <div>
                  <h4 class="text-sm font-bold text-zinc-900 truncate" title="${escapeHtml(sess.chapter)}">${escapeHtml(sess.chapter)}${tierPill}</h4>
                  <p class="text-[11px] text-zinc-500 mt-0.5 truncate">${escapeHtml(sess.subSubject || '')} &bull; On Q${(sess.currentIndex || 0) + 1}${accLabel}</p>
                </div>
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-[11px] font-mono text-zinc-600">
                    <span>${progressLabel}</span>
                  </div>
                  <div class="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div class="${barColor} h-full rounded-full transition-all" style="width: ${pct}%"></div>
                  </div>
                </div>
              </div>

              <div class="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                <button onclick="app.resumeHomeAttemptSession('${safeType}', '${safeChap}', '${safeFilter}', '${safeTier}')"
                        class="flex-1 py-1.5 px-3 rounded-lg btn-primary text-white text-xs font-semibold transition text-center">
                  Resume &rarr;
                </button>
                <button onclick="app.discardHomeAttemptSession('${safeType}', '${safeChap}')"
                        class="py-1.5 px-2.5 rounded-lg border border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50 text-xs font-medium transition"
                        title="Clear saved session">
                  Reset
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderStudyAnalyticsWidget() {
    const container = document.getElementById('dashboard-study-widget');
    if (!container) return;

    const totalAttempts = (this.attempts || []).length;
    if (totalAttempts === 0) {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="bg-gradient-to-r from-sky-50/70 via-indigo-50/40 to-white border border-sky-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-sm">🎯</span>
                <h3 class="text-sm sm:text-base font-bold text-zinc-900">Start Your Prep Journey</h3>
                <span class="text-[10px] font-semibold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">New Account</span>
              </div>
              <p class="text-xs text-zinc-600">Take a full mock test or pick a chapter test to unlock personal accuracy tracking, weakness analysis, and targeted drills.</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button onclick="app.startMockTestPrompt()" class="px-3.5 py-2 rounded-lg btn-primary text-white font-semibold text-xs shadow-xs transition whitespace-nowrap">
                Take Diagnostic Mock &rarr;
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Aggregate statistics
    let totalQuestionsSolved = 0;
    let totalCorrect = 0;
    let mockScores = [];
    const chapterStats = {};

    this.attempts.forEach(att => {
      const qCount = att.totalQuestions || (att.detailedAnswers ? att.detailedAnswers.length : 0);
      const cCount = att.correctCount || (att.detailedAnswers ? att.detailedAnswers.filter(a => a.isCorrect).length : 0);
      totalQuestionsSolved += qCount;
      totalCorrect += cCount;

      if ((att.mode || '').toLowerCase().includes('mock')) {
        mockScores.push(att.scorePercentage !== undefined ? att.scorePercentage : (qCount > 0 ? Math.round((cCount / qCount) * 100) : 0));
      }

      if (att.chapter) {
        if (!chapterStats[att.chapter]) {
          chapterStats[att.chapter] = { correct: 0, total: 0, attempts: 0 };
        }
        chapterStats[att.chapter].correct += cCount;
        chapterStats[att.chapter].total += qCount;
        chapterStats[att.chapter].attempts += 1;
      }
    });

    const overallAccuracy = totalQuestionsSolved > 0 ? Math.round((totalCorrect / totalQuestionsSolved) * 100) : 0;
    const avgMockScore = mockScores.length > 0 ? Math.round(mockScores.reduce((a, b) => a + b, 0) / mockScores.length) : null;
    const bestScore = Math.max(...this.attempts.map(a => a.scorePercentage || 0), 0);

    // Identify weak or recommended chapters
    const weakChapters = [];
    const chapterNames = (this.chapters || []).map(c => c.name);

    // First check attempted chapters with accuracy < 65%
    Object.keys(chapterStats).forEach(ch => {
      const st = chapterStats[ch];
      const acc = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
      if (acc < 65) {
        weakChapters.push({ name: ch, accuracy: acc, attempted: true });
      }
    });

    // If less than 3 weak chapters, add high-yield unattempted chapters
    if (weakChapters.length < 3) {
      for (const ch of chapterNames) {
        if (!chapterStats[ch] && weakChapters.length < 3) {
          weakChapters.push({ name: ch, accuracy: null, attempted: false });
        }
      }
    }

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-sm">📊</span>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-zinc-900">Your Prep Analytics</h3>
              <p class="text-[11px] text-zinc-400">Calibrated from ${totalAttempts} total evaluation session${totalAttempts > 1 ? 's' : ''}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="text-zinc-400">Best Score:</span>
            <span class="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">${bestScore}%</span>
          </div>
        </div>

        <!-- 4 Key Metrics Bar -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div class="bg-zinc-50/80 border border-zinc-100 rounded-xl p-3 text-center">
            <span class="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-0.5">Accuracy</span>
            <span class="text-lg sm:text-xl font-bold font-mono ${overallAccuracy >= 70 ? 'text-emerald-700' : overallAccuracy >= 50 ? 'text-amber-700' : 'text-rose-600'}">${overallAccuracy}%</span>
            <span class="text-[10px] text-zinc-400 block mt-0.5">${totalCorrect}/${totalQuestionsSolved} correct</span>
          </div>
          <div class="bg-zinc-50/80 border border-zinc-100 rounded-xl p-3 text-center">
            <span class="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-0.5">Solved</span>
            <span class="text-lg sm:text-xl font-bold font-mono text-zinc-900">${totalQuestionsSolved}</span>
            <span class="text-[10px] text-zinc-400 block mt-0.5">Questions</span>
          </div>
          <div class="bg-zinc-50/80 border border-zinc-100 rounded-xl p-3 text-center">
            <span class="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-0.5">Mocks</span>
            <span class="text-lg sm:text-xl font-bold font-mono text-zinc-900">${mockScores.length}</span>
            <span class="text-[10px] text-zinc-400 block mt-0.5">Full 30-min exams</span>
          </div>
          <div class="bg-zinc-50/80 border border-zinc-100 rounded-xl p-3 text-center">
            <span class="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-0.5">Mock Avg</span>
            <span class="text-lg sm:text-xl font-bold font-mono text-indigo-700">${avgMockScore !== null ? `${avgMockScore}%` : 'N/A'}</span>
            <span class="text-[10px] text-zinc-400 block mt-0.5">${avgMockScore !== null ? 'CBT average' : 'Take 1st mock'}</span>
          </div>
        </div>

        ${weakChapters.length > 0 ? `
          <!-- Recommended Priority Focus Chapters -->
          <div class="pt-2 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-amber-500 text-xs">⚡</span>
              <span class="font-semibold text-zinc-700">Recommended Next:</span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 flex-1 justify-start sm:justify-end">
              ${weakChapters.map(ch => `
                <button onclick="app.startPractice('${ch.name.replace(/'/g, "\\'")}')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 hover:border-zinc-300 transition text-[11px] font-medium text-zinc-800 shadow-2xs group">
                  <span class="group-hover:text-sky-700 truncate max-w-[140px]">${ch.name}</span>
                  ${ch.accuracy !== null ? `<span class="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 px-1 py-0.2 rounded">${ch.accuracy}%</span>` : `<span class="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-1 py-0.2 rounded">Unattempted</span>`}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderChaptersGrid() {
    const grid = document.getElementById('chapters-grid');
    if (!grid) return;

    const filtered = this.getFilteredChapters();

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="text-zinc-400 text-xs col-span-full py-8 text-center">No chapters found for selected filter.</p>';
      return;
    }

    const savedStudyMap = new Map();
    this.getSavedStudySessions().forEach(s => {
      if (s && s.chapter) {
        savedStudyMap.set(s.chapter.toLowerCase(), s);
      }
    });

    grid.innerHTML = filtered.map(ch => {
      const isSci = (ch.subject === 'General Science');
      const isRk = (ch.subSubject === 'RK Ranjan Math' || ch.faculty === 'RK Ranjan' || this.currentSubjectFilter === 'rk_ranjan');
      let badgeHtml = '';
      let cardBorder = 'bg-white hover:bg-sky-50/80 hover:border-sky-300 border border-zinc-200';
      if (ch.name === 'Top 300 Questions') {
        badgeHtml = '<span class="text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">🔥 TOP 300</span>';
        cardBorder = 'bg-gradient-to-r from-amber-50/70 to-white hover:bg-sky-50 hover:border-sky-400 border border-amber-200 shadow-xs';
      } else if (isRk) {
        badgeHtml = '<span class="text-[11px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200/60">RK Math</span>';
        cardBorder = 'bg-white hover:bg-violet-50/80 hover:border-violet-300 border border-zinc-200 shadow-2xs hover:shadow-xs';
      } else if (isSci) {
        if (ch.subSubject === 'Biology') {
          badgeHtml = '<span class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">Bio</span>';
        } else if (ch.subSubject === 'Chemistry') {
          badgeHtml = '<span class="text-[11px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200/60">Chem</span>';
        } else if (ch.subSubject === 'Physics') {
          badgeHtml = '<span class="text-[11px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200/60">Phys</span>';
        } else {
          badgeHtml = '<span class="text-[11px] font-bold uppercase tracking-wider text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">Sci</span>';
        }
      } else {
        badgeHtml = '<span class="text-[11px] font-bold uppercase tracking-wider text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/60">Apti</span>';
      }

      const savedSess = savedStudyMap.get((ch.name || '').toLowerCase());
      const showProgress = savedSess && (!isRk || savedSess.subjectFilter === 'rk_ranjan') && (isRk || savedSess.subjectFilter !== 'rk_ranjan');

      let displayedCount = ch.count;
      let displayedBadgeHtml = badgeHtml;
      let clickHandler = '';

      if (isRk) {
        if (this.currentRkTier === 'pro') {
          displayedCount = ch.proCount !== undefined ? ch.proCount : ch.count;
          displayedBadgeHtml = '<span class="text-[11px] font-bold uppercase tracking-wider text-violet-800 bg-violet-100 px-2 py-0.5 rounded border border-violet-300 shadow-2xs">⭐ Pro Level</span>';
          cardBorder = 'bg-violet-50/40 hover:bg-violet-50 hover:border-violet-300 border border-violet-200/80 shadow-2xs hover:shadow-xs';
          clickHandler = `app.startPractice('${ch.name.replace(/'/g, "\\'")}', 'rk_ranjan', 'pro')`;
        } else if (this.currentRkTier === 'classroom') {
          displayedCount = ch.classroomCount !== undefined ? ch.classroomCount : ch.count;
          displayedBadgeHtml = '<span class="text-[11px] font-medium uppercase tracking-wider text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">ClassRoom</span>';
          cardBorder = 'bg-white hover:bg-zinc-50 hover:border-zinc-300 border border-zinc-200 shadow-2xs hover:shadow-xs';
          clickHandler = `app.startPractice('${ch.name.replace(/'/g, "\\'")}', 'rk_ranjan', 'classroom')`;
        } else {
          clickHandler = `app.startPractice('${ch.name.replace(/'/g, "\\'")}', 'rk_ranjan', 'all')`;
        }
      } else {
        clickHandler = (isSci ? `app.startPractice('${ch.name.replace(/'/g, "\\'")}', 'science')` : `app.startPractice('${ch.name.replace(/'/g, "\\'")}', 'aptitude')`);
      }

      const attemptedCount = showProgress ? savedSess.answeredCount : 0;
      const pct = showProgress && displayedCount > 0 ? Math.min(100, Math.round((attemptedCount / displayedCount) * 100)) : 0;

      return `
        <div onclick="${clickHandler}"
             class="${cardBorder} rounded-xl p-3.5 sm:p-4 cursor-pointer transition-all duration-150 flex items-center justify-between group shadow-2xs hover:shadow-xs">
          <div class="space-y-1.5 overflow-hidden pr-2 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              ${displayedBadgeHtml}
              <span class="text-xs text-zinc-500 group-hover:text-sky-700 font-mono font-medium transition-colors">${displayedCount} Qs</span>
              ${showProgress ? `<span class="text-[10px] font-mono font-semibold text-sky-700 bg-sky-50 border border-sky-200/80 px-1.5 py-0.2 rounded">${attemptedCount}/${displayedCount} done</span>` : ''}
            </div>
            <h4 class="font-semibold text-zinc-900 group-hover:text-sky-900 text-sm sm:text-base leading-snug truncate transition-colors" title="${escapeHtml(ch.name)}">${escapeHtml(ch.name)}</h4>
            ${showProgress ? `<div class="w-full h-1 bg-zinc-100 rounded-full overflow-hidden"><div class="h-full bg-sky-500 rounded-full" style="width: ${pct}%"></div></div>` : ''}
          </div>
          <span class="text-sm text-zinc-300 group-hover:text-sky-600 transition-colors shrink-0 font-bold ml-1">&rarr;</span>
        </div>
      `;
    }).join('');
  }

  populateChapterDropdown(filterSubject = 'all') {
    const dd = document.getElementById('practice-chapter-dropdown');
    if (!dd) return;

    const s = (filterSubject || 'all').toLowerCase();

    if (s === 'rk_ranjan') {
      const list = this.rkChapters && this.rkChapters.length > 0 ? this.rkChapters : [];
      dd.innerHTML = list.map(ch => `
        <option value="${ch.name}">${ch.name} (${ch.count} Qs)</option>
      `).join('');
      return;
    }

    let chapsToDisplay = [...this.chapters];

    if (s === 'aptitude') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subject || '').includes('Aptitude') && c.subSubject !== 'RK Ranjan Math');
    } else if (s === 'science') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subject || '').includes('Science'));
    } else if (s === 'biology') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subSubject || '').toLowerCase() === 'biology');
    } else if (s === 'chemistry') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subSubject || '').toLowerCase() === 'chemistry');
    } else if (s === 'physics') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subSubject || '').toLowerCase() === 'physics');
    } else if (s === 'top300' || s === 'top 300') {
      chapsToDisplay = chapsToDisplay.filter(c => c.name === 'Top 300 Questions');
    }

    if (s === 'all') {
      const groups = {
        '🔥 TOP 300 Science Series': [],
        'Quantitative Aptitude': [],
        'General Science — Biology': [],
        'General Science — Chemistry': [],
        'General Science — Physics': []
      };

      if (this.rkChapters && this.rkChapters.length > 0) {
        groups['🔥 RK Ranjan Math Series'] = this.rkChapters;
      }

      chapsToDisplay.forEach(ch => {
        if (ch.name === 'Top 300 Questions') {
          groups['🔥 TOP 300 Science Series'].push(ch);
        } else if ((ch.subject || '').includes('Aptitude')) {
          groups['Quantitative Aptitude'].push(ch);
        } else if (ch.subSubject === 'Biology') {
          groups['General Science — Biology'].push(ch);
        } else if (ch.subSubject === 'Chemistry') {
          groups['General Science — Chemistry'].push(ch);
        } else if (ch.subSubject === 'Physics') {
          groups['General Science — Physics'].push(ch);
        }
      });

      let html = '';
      Object.entries(groups).forEach(([groupName, chaps]) => {
        if (chaps.length > 0) {
          html += `<optgroup label="${groupName} (${chaps.length})">`;
          chaps.forEach(ch => {
            html += `<option value="${ch.name}">${ch.name} (${ch.count} Qs)</option>`;
          });
          html += `</optgroup>`;
        }
      });
      dd.innerHTML = html;
    } else if (s === 'science') {
      const groups = {
        'General Science — Biology': [],
        'General Science — Chemistry': [],
        'General Science — Physics': []
      };

      chapsToDisplay.forEach(ch => {
        if (ch.subSubject === 'Biology') {
          groups['General Science — Biology'].push(ch);
        } else if (ch.subSubject === 'Chemistry') {
          groups['General Science — Chemistry'].push(ch);
        } else if (ch.subSubject === 'Physics') {
          groups['General Science — Physics'].push(ch);
        }
      });

      let html = '';
      Object.entries(groups).forEach(([groupName, chaps]) => {
        if (chaps.length > 0) {
          html += `<optgroup label="${groupName} (${chaps.length})">`;
          chaps.forEach(ch => {
            html += `<option value="${ch.name}">${ch.name} (${ch.count} Qs)</option>`;
          });
          html += `</optgroup>`;
        }
      });
      dd.innerHTML = html;
    } else {
      dd.innerHTML = chapsToDisplay.map(ch => `
        <option value="${ch.name}">${ch.name} (${ch.count} Qs)</option>
      `).join('');
    }
  }

  async filterPracticeChaptersBySubject(subjectValue) {
    if (this.practice.modeType === 'test') {
      alert('You cannot change subject during an active chapter test. Please submit the test or switch to Study mode.');
      const subjSelect = document.getElementById('practice-subject-dropdown');
      if (subjSelect) subjSelect.value = this.practiceSubjectFilter || 'all';
      return;
    }
    this.practiceSubjectFilter = subjectValue;
    if (subjectValue === 'rk_ranjan' && (!this.rkQuestions || this.rkQuestions.length === 0)) {
      await this.loadRkRanjanData();
    }
    this.populateChapterDropdown(subjectValue);

    const dd = document.getElementById('practice-chapter-dropdown');
    if (!dd || dd.options.length === 0) return;

    let targetChapter = dd.options[0].value;
    for (let i = 0; i < dd.options.length; i++) {
      if (dd.options[i].value === this.practice.chapter) {
        targetChapter = this.practice.chapter;
        break;
      }
    }
    dd.value = targetChapter;
    await this.startPractice(targetChapter, subjectValue);
  }

  renderAttemptsHistory() {
    const tbody = document.getElementById('attempts-table-body');
    const emptyState = document.getElementById('empty-attempts-state');
    const summaryBar = document.getElementById('summary-stats-bar');
    if (!tbody) return;

    if (this.attempts.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (summaryBar) summaryBar.innerHTML = '';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    const totalTests = this.attempts.length;
    const avgScore = (this.attempts.reduce((sum, a) => sum + (a.scorePercentage || 0), 0) / totalTests).toFixed(1);
    const bestScore = Math.max(...this.attempts.map(a => a.scorePercentage || 0)).toFixed(1);

    if (summaryBar) {
      summaryBar.innerHTML = `
        <span class="text-zinc-500">Taken: <strong class="text-zinc-900">${totalTests}</strong></span>
        <span class="text-zinc-300">&bull;</span>
        <span class="text-zinc-500">Avg: <strong class="text-zinc-900">${avgScore}%</strong></span>
        <span class="text-zinc-300">&bull;</span>
        <span class="text-zinc-500">Best: <strong class="text-zinc-900">${bestScore}%</strong></span>
      `;
    }

    tbody.innerHTML = this.attempts.map(att => {
      const date = new Date(att.timestamp);
      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

      const normMode = (att.mode || '').toLowerCase();
      let modeBadge = '<span class="text-[11px] font-medium text-zinc-700">Mock</span>';
      if (normMode === 'chapter_test' || normMode === 'chapter test') {
        modeBadge = '<span class="text-[11px] font-medium text-zinc-700">Chapter Test</span>';
      } else if (normMode === 'practice') {
        modeBadge = '<span class="text-[11px] font-medium text-zinc-500">Practice</span>';
      }

      const accuracy = att.scorePercentage || 0;
      let accBadge = 'text-zinc-700';
      if (accuracy >= 75) accBadge = 'text-emerald-700 font-semibold';
      else if (accuracy >= 50) accBadge = 'text-amber-700 font-semibold';
      else accBadge = 'text-rose-600 font-semibold';

      let timeTakenStr = att.timeTakenFormatted || '0s';
      if (att.timeTakenSeconds !== undefined && att.timeTakenSeconds !== null) {
        const mins = Math.floor((att.timeTakenSeconds || 0) / 60);
        const secs = (att.timeTakenSeconds || 0) % 60;
        timeTakenStr = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
      }

      return `
        <tr class="hover:bg-zinc-50 transition">
          <td class="py-2.5 px-4 font-normal text-zinc-600 whitespace-nowrap">
            <span>${dateStr}</span> <span class="text-zinc-400 text-[10px] ml-1">${timeStr}</span>
          </td>
          <td class="py-2.5 px-4 whitespace-nowrap">${modeBadge}</td>
          <td class="py-2.5 px-4 font-medium text-zinc-800 whitespace-nowrap">${escapeHtml(att.chapter || 'All Chapters')}</td>
          <td class="py-2.5 px-4 font-mono font-medium text-zinc-900 whitespace-nowrap">
            ${att.correctCount} / ${att.totalQuestions}
          </td>
          <td class="py-2.5 px-4 whitespace-nowrap">
            <span class="${accBadge}">${accuracy}%</span>
          </td>
          <td class="py-2.5 px-4 text-zinc-500 font-mono text-[11px] whitespace-nowrap">${timeTakenStr}</td>
          <td class="py-2.5 px-4 text-right whitespace-nowrap">
            <button onclick="app.viewPastAttempt('${att.attemptId}')" class="px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded transition">
              Review &rarr;
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ==========================================
  // MODE 1: CHAPTER TEST / PRACTICE
  // ==========================================

  async startPractice(chapterName, preferredSubjectFilter = null) {
    const preferredTier = arguments[2] || null;
    if (!this.currentUserEmail) {
      this.switchView('login');
      return;
    }

    const isCoreChapter = (this.chapters || []).some(
      c => c.name.toLowerCase() === (chapterName || '').toLowerCase()
    );

    const isCoreFilter = ['aptitude', 'science', 'biology', 'chemistry', 'physics', 'top300'].includes(
      (preferredSubjectFilter || '').toLowerCase()
    );

    const isRk = (preferredSubjectFilter === 'rk_ranjan') ||
      (!isCoreFilter && !isCoreChapter && (
        (this.rkChapters && this.rkChapters.some(c => c.name.toLowerCase() === (chapterName || '').toLowerCase())) ||
        (this.rkQuestions && this.rkQuestions.some(q => q.chapter.toLowerCase() === (chapterName || '').toLowerCase()))
      ));

    if (isRk) {
      if (!this.rkQuestions || this.rkQuestions.length === 0) {
        await this.loadRkRanjanData();
      }
      if (!chapterName && this.rkChapters.length > 0) {
        chapterName = this.rkChapters[0].name;
      }
      const tier = preferredTier || this.currentRkTier || 'all';
      let filtered = (this.rkQuestions || []).filter(q => q.chapter.toLowerCase() === chapterName.toLowerCase());
      if (tier === 'pro') {
        const proOnly = filtered.filter(q => (q.sheetType || '').toLowerCase().includes('pro'));
        if (proOnly.length > 0) filtered = proOnly;
      } else if (tier === 'classroom') {
        const crOnly = filtered.filter(q => !(q.sheetType || '').toLowerCase().includes('pro'));
        if (crOnly.length > 0) filtered = crOnly;
      }
      this.practice.tier = tier;
      this.initPracticeState(chapterName, filtered, 'rk_ranjan');
      return;
    }

    if (!chapterName && this.chapters.length > 0) {
      chapterName = this.chapters[0].name;
    }

    // Determine appropriate core filter (aptitude vs science)
    const chObj = (this.chapters || []).find(c => c.name.toLowerCase() === chapterName.toLowerCase());
    const effectiveFilter = preferredSubjectFilter ||
      (chObj?.subject?.includes('Science') ? 'science' : 'aptitude');

    // Reset pause trackers
    this.isTestPaused = false;
    this.pauseStartTime = null;
    this.totalPausedDuration = 0;

    // When test starts, enter full screen mode (only in test mode, not study mode!)
    if (this.practice.modeType === 'test') {
      this.enterFullscreen().catch(() => {});
    }

    if (this.isStaticMode || this.allQuestions.length > 0) {
      if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
      const filtered = this.allQuestions.filter(q => q.chapter.toLowerCase() === chapterName.toLowerCase());
      this.initPracticeState(chapterName, filtered, effectiveFilter);
      return;
    }

    try {
      const res = await fetch(`/api/questions?chapter=${encodeURIComponent(chapterName)}`);
      if (res.ok) {
        const data = await res.json();
        this.initPracticeState(chapterName, data.questions || [], effectiveFilter);
        return;
      }
    } catch (err) {}

    this.isStaticMode = true;
    if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
    const filtered = this.allQuestions.filter(q => q.chapter.toLowerCase() === chapterName.toLowerCase());
    this.initPracticeState(chapterName, filtered, effectiveFilter);
  }

  setPracticeChapterTitle(title) {
    const titleText = document.getElementById('practice-chapter-title-text');
    const titleEl = document.getElementById('practice-chapter-title');
    let displayTitle = title;
    if (this.practiceSubjectFilter === 'rk_ranjan') {
      const tier = this.practice?.tier || this.currentRkTier || 'all';
      if (tier === 'pro') {
        displayTitle = `${title} (⭐ Pro Level)`;
      } else if (tier === 'classroom') {
        displayTitle = `${title} (ClassRoom)`;
      }
    }
    if (titleText) {
      titleText.textContent = displayTitle;
    } else if (titleEl) {
      titleEl.textContent = displayTitle;
    }
  }

  initPracticeState(chapterName, questions, preferredSubjectFilter = null) {
    this.practice.chapter = chapterName;
    this.practice.questions = questions;
    const tier = this.practice.tier || 'all';

    const mode = this.practice.modeType || 'study';
    let restored = false;
    if (mode === 'study') {
      const savedProgress = this.loadChapterStudyProgress(chapterName);
      if (savedProgress && savedProgress.userAnswers && Object.keys(savedProgress.userAnswers).length > 0) {
        this.practice.userAnswers = savedProgress.userAnswers;
        this.practice.reviewFlags = savedProgress.reviewFlags || {};
        this.practice.questionTimes = savedProgress.questionTimes || {};
        this.practice.currentIndex = Math.min(Math.max(0, savedProgress.currentIndex || 0), questions.length - 1);
        restored = true;
      }
    }

    if (!restored) {
      this.practice.currentIndex = 0;
      this.practice.userAnswers = {};
      this.practice.reviewFlags = {};
      this.practice.questionTimes = {};
    }
    this.practice.startTime = Date.now();

    this.setPracticeChapterTitle(chapterName);

    // Sync the subject dropdown in Chapter Test
    const chInfo = (this.chapters || []).find(c => c.name.toLowerCase() === chapterName.toLowerCase()) ||
                   (this.rkChapters || []).find(c => c.name.toLowerCase() === chapterName.toLowerCase());
    const subjSelect = document.getElementById('practice-subject-dropdown');

    const isRkSession = (preferredSubjectFilter === 'rk_ranjan') ||
      (preferredSubjectFilter !== 'aptitude' && !this.chapters?.some(c => c.name.toLowerCase() === chapterName.toLowerCase()) && (chInfo && (chInfo.subSubject === 'RK Ranjan Math' || chInfo.faculty === 'RK Ranjan')));

    if (isRkSession) {
      this.practiceSubjectFilter = 'rk_ranjan';
      if (subjSelect) subjSelect.value = 'rk_ranjan';
      this.populateChapterDropdown('rk_ranjan');
    } else {
      if (preferredSubjectFilter) {
        this.practiceSubjectFilter = preferredSubjectFilter;
      }

      if (subjSelect) {
        const activeFilter = this.practiceSubjectFilter || 'all';
        let keepFilter = false;
        if (activeFilter === 'all') {
          keepFilter = true;
        } else if (activeFilter === 'aptitude' && (chInfo?.subject || '').includes('Aptitude')) {
          keepFilter = true;
        } else if (activeFilter === 'science' && (chInfo?.subject || '').includes('Science')) {
          keepFilter = true;
        } else if (activeFilter === 'biology' && (chInfo?.subSubject || '').toLowerCase() === 'biology') {
          keepFilter = true;
        } else if (activeFilter === 'chemistry' && (chInfo?.subSubject || '').toLowerCase() === 'chemistry') {
          keepFilter = true;
        } else if (activeFilter === 'physics' && (chInfo?.subSubject || '').toLowerCase() === 'physics') {
          keepFilter = true;
        }

        if (keepFilter) {
          subjSelect.value = activeFilter;
          this.populateChapterDropdown(activeFilter);
        } else if (chInfo) {
          const newFilter = (chInfo.subject || '').includes('Science') ? 'science' : 'aptitude';
          this.practiceSubjectFilter = newFilter;
          subjSelect.value = newFilter;
          this.populateChapterDropdown(newFilter);
        } else {
          this.practiceSubjectFilter = 'all';
          subjSelect.value = 'all';
          this.populateChapterDropdown('all');
        }
      } else {
        this.populateChapterDropdown('all');
      }
    }

    const dd = document.getElementById('practice-chapter-dropdown');
    if (dd) dd.value = chapterName;

    // Toggle and sync RK Ranjan Tier bar in practice header
    const rkTierToggle = document.getElementById('practice-rk-tier-toggle');
    if (rkTierToggle) {
      if (isRkSession) {
        rkTierToggle.classList.remove('hidden');
        this.updatePracticeRkTierUI();
      } else {
        rkTierToggle.classList.add('hidden');
      }
    }

    this.practice.modeType = this.practice.modeType || 'study';
    this.setPracticeModeType(this.practice.modeType);
    this.switchView('practice');
    this.renderPracticeQuestion();
    this.renderPracticePalette();
    this.startPracticeTimer();
    this.saveActivePracticeSession();
  }

  updatePracticeRkTierUI() {
    const tier = this.practice?.tier || 'all';
    const btns = {
      'pro': document.getElementById('practice-tier-btn-pro'),
      'classroom': document.getElementById('practice-tier-btn-classroom'),
      'all': document.getElementById('practice-tier-btn-all')
    };
    Object.keys(btns).forEach(k => {
      const b = btns[k];
      if (b) {
        if (k === tier) {
          if (k === 'pro') {
            b.className = 'px-1.5 sm:px-2 py-0.5 rounded font-bold bg-violet-600 text-white shadow-2xs transition';
          } else {
            b.className = 'px-1.5 sm:px-2 py-0.5 rounded font-semibold bg-white text-zinc-900 shadow-2xs transition';
          }
        } else {
          if (k === 'pro') {
            b.className = 'px-1.5 sm:px-2 py-0.5 rounded font-bold text-violet-700 hover:text-violet-900 transition';
          } else {
            b.className = 'px-1.5 sm:px-2 py-0.5 rounded font-medium text-zinc-600 hover:text-zinc-900 transition';
          }
        }
      }
    });
  }

  setPracticeRkTier(tier) {
    if (!this.practice || !this.practice.chapter) return;
    if (this.practice.tier === tier) return;
    if (this.practice.modeType === 'test') {
      if (!confirm('Switching sheet tier will reset the current active test. Proceed?')) return;
    } else {
      this.saveChapterStudyProgress();
    }
    this.currentRkTier = tier;
    this.startPractice(this.practice.chapter, 'rk_ranjan', tier);
  }

  getPracticeQuestionTimeKey(q, idx) {
    return (q && q.id) ? q.id : String(idx);
  }

  formatQuestionTimer(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(safe / 60).toString().padStart(2, '0');
    const secs = (safe % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  updatePracticeQuestionTimerUI() {
    const textEl = document.getElementById('practice-question-timer-text');
    const badgeEl = document.getElementById('practice-question-timer');
    if (!textEl) return;

    const idx = this.practice ? this.practice.currentIndex : 0;
    const q = this.practice && Array.isArray(this.practice.questions) ? this.practice.questions[idx] : null;
    if (!q) {
      textEl.textContent = '00:00';
      return;
    }

    if (!this.practice.questionTimes) this.practice.questionTimes = {};
    const key = this.getPracticeQuestionTimeKey(q, idx);
    const spent = this.practice.questionTimes[key] || 0;
    textEl.textContent = this.formatQuestionTimer(spent);

    if (badgeEl) {
      const isStudySolved = (this.practice.modeType === 'study') &&
        (this.practice.userAnswers[idx] !== undefined && this.practice.userAnswers[idx] !== null);
      if (isStudySolved) {
        badgeEl.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/70 font-mono text-[11px] font-medium';
        badgeEl.title = 'Time taken for this question (paused)';
      } else if (spent >= 90) {
        badgeEl.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 font-mono text-[11px] font-medium';
        badgeEl.title = 'Time spent on this question';
      } else {
        badgeEl.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-mono text-[11px] font-medium';
        badgeEl.title = 'Time spent on this question';
      }
    }
  }

  startPracticeTimer() {
    this.clearPracticeTimer();
    this.updatePracticeQuestionTimerUI();

    if (!this.practice || !Array.isArray(this.practice.questions) || this.practice.questions.length === 0) {
      return;
    }

    this.practice.timerInterval = setInterval(() => {
      if (this.currentMode !== 'practice' || this.isTestPaused || this.isSubmitting) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const idx = this.practice.currentIndex;
      const q = this.practice.questions && this.practice.questions[idx];
      if (!q) return;

      // In Study Mode, pause the per-question timer once the user answers that question
      const isStudySolved = (this.practice.modeType === 'study') &&
        (this.practice.userAnswers[idx] !== undefined && this.practice.userAnswers[idx] !== null);
      if (isStudySolved) {
        this.updatePracticeQuestionTimerUI();
        return;
      }

      if (!this.practice.questionTimes) this.practice.questionTimes = {};
      const key = this.getPracticeQuestionTimeKey(q, idx);
      const nextSeconds = (this.practice.questionTimes[key] || 0) + 1;
      this.practice.questionTimes[key] = nextSeconds;

      this.updatePracticeQuestionTimerUI();

      if (nextSeconds % 5 === 0) {
        this.saveActivePracticeSession();
      }
    }, 1000);
  }

  clearPracticeTimer() {
    if (this.practice && this.practice.timerInterval) {
      clearInterval(this.practice.timerInterval);
      this.practice.timerInterval = null;
    }
  }

  async setPracticeModeType(type) {
    this.practice.modeType = type;
    this.saveActivePracticeSession();

    const btnTest = document.getElementById('toggle-btn-test');
    const btnStudy = document.getElementById('toggle-btn-study');
    const badge = document.getElementById('practice-mode-badge');
    const subtitle = document.getElementById('practice-mode-subtitle');
    const row2 = document.getElementById('practice-selectors-row');
    const titleEl = document.getElementById('practice-chapter-title');
    const chevronEl = document.getElementById('practice-chapter-chevron');

    const activeClasses = 'px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold bg-white text-zinc-900 shadow-2xs transition';
    const inactiveClasses = 'px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium text-zinc-500 hover:text-zinc-900 transition';

    if (type === 'test') {
      if (btnTest) btnTest.className = activeClasses;
      if (btnStudy) btnStudy.className = inactiveClasses;
      if (badge) badge.textContent = 'Chapter Test';
      if (subtitle) subtitle.textContent = 'Answers revealed on submission (Full Screen)';

      // Hide second row clutter in test mode - user cannot change chapter or subject in test mode
      if (row2) row2.classList.add('hidden');

      // Disable chapter browsing via title click in test mode
      if (titleEl) {
        titleEl.classList.remove('cursor-pointer', 'hover:text-zinc-600');
        titleEl.classList.add('cursor-default');
        titleEl.title = 'Chapter Test in progress (cannot change chapter during test)';
      }
      if (chevronEl) chevronEl.classList.add('hidden');
      const resetBtn = document.getElementById('practice-reset-btn');
      if (resetBtn) resetBtn.classList.add('hidden');

      // Enter full screen when switching to test mode
      if (this.currentMode === 'practice') {
        await this.enterFullscreen();
      }
    } else {
      if (btnStudy) btnStudy.className = activeClasses;
      if (btnTest) btnTest.className = inactiveClasses;
      if (badge) badge.textContent = 'Study Mode';
      if (subtitle) subtitle.textContent = 'Instant answers & explanation';

      // Show second row in study mode
      if (row2) row2.classList.remove('hidden');

      // Enable chapter browsing via title click in study mode
      if (titleEl) {
        titleEl.classList.add('cursor-pointer', 'hover:text-zinc-600');
        titleEl.classList.remove('cursor-default');
        titleEl.title = 'Click to browse all chapters';
      }
      if (chevronEl) chevronEl.classList.remove('hidden');
      const resetBtn = document.getElementById('practice-reset-btn');
      if (resetBtn) resetBtn.classList.remove('hidden');

      if (this.practice.chapter && (!this.practice.userAnswers || Object.keys(this.practice.userAnswers).length === 0)) {
        const savedProgress = this.loadChapterStudyProgress(this.practice.chapter);
        if (savedProgress && savedProgress.userAnswers && Object.keys(savedProgress.userAnswers).length > 0) {
          this.practice.userAnswers = savedProgress.userAnswers;
          this.practice.reviewFlags = savedProgress.reviewFlags || {};
          if (savedProgress.currentIndex !== undefined && this.practice.questions) {
            this.practice.currentIndex = Math.min(savedProgress.currentIndex, this.practice.questions.length - 1);
          }
        }
      }

      // Study mode: dismiss pause modal if open and unpause!
      if (this.isTestPaused) {
        this.isTestPaused = false;
        const modal = document.getElementById('test-paused-modal');
        if (modal) modal.classList.add('hidden');
      }
    }

    this.renderPracticeQuestion();
    this.renderPracticePalette();
  }

  switchPracticeChapter(newChap) {
    if (this.practice.modeType === 'test') {
      alert('You cannot change chapter during an active chapter test. Please submit the test or switch to Study mode.');
      const dd = document.getElementById('practice-chapter-dropdown');
      if (dd) dd.value = this.practice.chapter;
      return;
    }
    const curFilter = this.practiceSubjectFilter || document.getElementById('practice-subject-dropdown')?.value || 'all';
    this.startPractice(newChap, curFilter, this.practice?.tier || 'all');
  }

  renderPracticeQuestion() {
    const q = this.practice.questions[this.practice.currentIndex];
    if (!q) return;

    const total = this.practice.questions.length;
    const current = this.practice.currentIndex + 1;
    const isTestMode = (this.practice.modeType === 'test');

    const chapDisplay = q.subSubject && q.subSubject !== q.chapter ? `${q.subSubject} • ${q.chapter}` : q.chapter;

    document.getElementById('practice-q-number').textContent = `Q${current}`;
    document.getElementById('practice-q-chapter').textContent = chapDisplay;
    const srcEl = document.getElementById('practice-q-source');
    if (srcEl) srcEl.innerHTML = sourceHtml(q);

    // Render RK Ranjan Sheet Tier Badge (Pro Level vs ClassRoom)
    const tierBadge = document.getElementById('practice-q-tier-badge');
    if (tierBadge) {
      const isRkQuestion = q.faculty === 'RK Ranjan' || q.subSubject === 'RK Ranjan Math' || !!q.sheetType;
      if (isRkQuestion && q.sheetType) {
        const isPro = q.sheetType.toLowerCase().includes('pro');
        tierBadge.textContent = isPro ? '⭐ Pro Level' : 'ClassRoom';
        tierBadge.className = isPro
          ? 'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-violet-100 text-violet-800 border border-violet-200 shadow-2xs'
          : 'text-[10px] font-medium px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200';
        tierBadge.classList.remove('hidden');
      } else {
        tierBadge.classList.add('hidden');
      }
    }

    document.getElementById('practice-progress-text').textContent = `Question ${current} of ${total}`;

    const fillPercent = (current / total) * 100;
    document.getElementById('practice-progress-fill').style.width = `${fillPercent}%`;

    document.getElementById('practice-q-text').textContent = q.question;

    // Render Diagram
    const diagBox = document.getElementById('practice-q-diagram-box');
    const diagImg = document.getElementById('practice-q-diagram');
    if (diagBox && diagImg) {
      if (q.diagram && q.diagram.trim()) {
        diagImg.src = q.diagram;
        diagBox.classList.remove('hidden');
      } else {
        diagImg.src = '';
        diagBox.classList.add('hidden');
      }
    }

    const optContainer = document.getElementById('practice-options-container');
    const selected = this.practice.userAnswers[this.practice.currentIndex];
    const letters = ['A', 'B', 'C', 'D'];

    optContainer.innerHTML = (q.options || []).map((opt, idx) => {
      const isSelected = (selected === idx);
      let radioState = '';
      let textStyle = 'text-zinc-800';
      let stateClass = '';

      if (isTestMode) {
        if (isSelected) {
          radioState = '<span class="tb-option-radio-dot bg-indigo-600"></span>';
          textStyle = 'text-indigo-950 font-semibold';
        }
      } else {
        if (selected !== undefined && selected !== null) {
          if (idx === q.correctAnswer) {
            radioState = '<span class="text-xs text-emerald-600 font-black">✓</span>';
            textStyle = 'text-emerald-950 font-bold';
            stateClass = 'is-correct';
          } else if (idx === selected) {
            radioState = '<span class="text-xs text-rose-600 font-black">✕</span>';
            textStyle = 'text-rose-950 font-medium';
            stateClass = 'is-wrong';
          } else {
            textStyle = 'text-zinc-400 opacity-60';
            stateClass = 'is-dim';
          }
        } else if (isSelected) {
          radioState = '<span class="tb-option-radio-dot bg-indigo-600"></span>';
          textStyle = 'text-indigo-950 font-semibold';
        }
      }

      return `
        <label onclick="app.selectPracticeOption(${idx})" tabindex="0" role="radio" aria-checked="${isSelected}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"
               class="tb-unboxed-option ${isSelected && !stateClass ? 'selected' : ''} ${stateClass}">
          <span class="tb-option-radio">
            ${radioState}
          </span>
          <span class="tb-option-prefix">${letters[idx]}.</span>
          <span class="tb-option-text ${textStyle}">${opt}</span>
        </label>
      `;
    }).join('');

    const expBox = document.getElementById('practice-explanation-box');
    if (!isTestMode && selected !== undefined && selected !== null) {
      expBox.classList.remove('hidden');
      const isCorrect = (selected === q.correctAnswer);
      const badge = document.getElementById('practice-eval-badge');
      const correctLabel = document.getElementById('practice-eval-correct-label');
      const expText = document.getElementById('practice-explanation-text');

      if (isCorrect) {
        expBox.className = 'mt-5 p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/50 text-emerald-900 text-xs';
        badge.className = 'font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white';
        badge.textContent = 'Correct';
      } else {
        expBox.className = 'mt-5 p-3.5 rounded-lg border border-rose-200 bg-rose-50/50 text-rose-900 text-xs';
        badge.className = 'font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-rose-600 text-white';
        badge.textContent = 'Incorrect';
      }

      correctLabel.textContent = `Correct: Option ${letters[q.correctAnswer] || 'A'}`;
      expText.textContent = q.explanation || 'No detailed explanation provided.';
    } else {
      expBox.classList.add('hidden');
    }

    const btnPrev = document.getElementById('practice-btn-prev');
    const btnNext = document.getElementById('practice-btn-next');
    const mobileBtnNext = document.getElementById('practice-mobile-btn-next');
    if (btnPrev) btnPrev.disabled = (this.practice.currentIndex === 0);
    if (btnNext) {
      const targetText = (this.practice.currentIndex === total - 1) ? 'Submit Test' : 'Save & Next →';
      if (btnNext.textContent.trim() !== targetText) {
        btnNext.textContent = targetText;
      }
    }
    if (mobileBtnNext) {
      mobileBtnNext.textContent = (this.practice.currentIndex === total - 1) ? 'Submit Test' : 'Save & Next →';
    }

    // Update floating mobile swipe navigation arrows
    const mobileArrowPrev = document.getElementById('practice-mobile-arrow-prev');
    const mobileArrowNext = document.getElementById('practice-mobile-arrow-next');
    if (mobileArrowPrev) mobileArrowPrev.classList.toggle('arrow-disabled', this.practice.currentIndex === 0);
    if (mobileArrowNext) mobileArrowNext.classList.toggle('arrow-disabled', this.practice.currentIndex === total - 1);

    // Update Mark for Review button state in Practice bottom bar
    const isMarked = !!(this.practice.reviewFlags && this.practice.reviewFlags[this.practice.currentIndex]);
    const btnReview = document.getElementById('practice-btn-review');
    const btnReviewLabel = document.getElementById('practice-btn-review-label');
    if (btnReview) {
      if (isMarked) {
        btnReview.className = 'px-2 sm:px-3 py-2 rounded-lg border border-purple-400 bg-purple-50 text-purple-700 font-bold text-xs flex items-center gap-1 active:scale-95 transition shadow-2xs whitespace-nowrap';
        if (btnReviewLabel) btnReviewLabel.textContent = '★ Marked';
      } else {
        btnReview.className = 'px-2 sm:px-3 py-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-medium text-xs flex items-center gap-1 active:scale-95 transition whitespace-nowrap';
        if (btnReviewLabel) btnReviewLabel.textContent = 'Review';
      }
    }

    this.updatePracticeQuestionTimerUI();
    this.updatePracticeScoreboard();
    this.renderPracticePalette();
  }

  selectPracticeOption(idx) {
    if (this._suppressOptionClick) return;
    this.practice.userAnswers[this.practice.currentIndex] = idx;
    this.saveActivePracticeSession();
    this.renderPracticeQuestion();
    if (this.practice.modeType === 'study' || this.practice.isStudyMode) {
      setTimeout(() => {
        const solBox = document.getElementById('practice-solution-box');
        if (solBox) {
          solBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }

  clearPracticeResponse() {
    delete this.practice.userAnswers[this.practice.currentIndex];
    this.saveActivePracticeSession();
    this.renderPracticeQuestion();
  }

  togglePracticeReview(andNext = false) {
    const idx = this.practice.currentIndex;
    if (!this.practice.reviewFlags) this.practice.reviewFlags = {};
    this.practice.reviewFlags[idx] = !this.practice.reviewFlags[idx];
    if (andNext && this.practice.currentIndex < this.practice.questions.length - 1) {
      this.practice.currentIndex++;
    }
    this.saveActivePracticeSession();
    this.renderPracticeQuestion();
    this.renderPracticePalette();
  }

  prevPracticeQuestion() {
    if (this.practice.currentIndex > 0) {
      this.practice.currentIndex--;
      this.saveActivePracticeSession();
      this.renderPracticeQuestion();
    }
  }

  nextPracticeQuestion() {
    const total = this.practice.questions.length;
    if (this.practice.currentIndex < total - 1) {
      this.practice.currentIndex++;
      this.saveActivePracticeSession();
      this.renderPracticeQuestion();
    } else {
      this.promptSubmitChapterTest();
    }
  }

  jumpPracticeQuestion(idx) {
    this.practice.currentIndex = idx;
    this.saveActivePracticeSession();
    this.renderPracticeQuestion();
    if (window.innerWidth < 1024) {
      const panel = document.getElementById('practice-drawer-panel');
      const backdrop = document.getElementById('practice-palette-backdrop');
      if (panel) panel.classList.add('hidden');
      if (backdrop) backdrop.classList.add('hidden');
      this.practice.drawerOpen = false;
    }
  }

  togglePracticeDrawer() {
    const panel = document.getElementById('practice-drawer-panel');
    const backdrop = document.getElementById('practice-palette-backdrop');
    if (panel) {
      this.practice.drawerOpen = !this.practice.drawerOpen;
      panel.classList.toggle('hidden', !this.practice.drawerOpen);
      if (backdrop) {
        backdrop.classList.toggle('hidden', !this.practice.drawerOpen || window.innerWidth >= 1024);
      }
      if (this.practice.drawerOpen) {
        setTimeout(() => {
          const grid = document.getElementById('practice-palette-grid');
          if (grid) {
            const currentBtn = grid.querySelector(`[data-palette-idx="${this.practice.currentIndex}"]`);
            if (currentBtn && typeof currentBtn.scrollIntoView === 'function') {
              currentBtn.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
            }
          }
        }, 50);
      }
    }
  }

  updatePracticeScoreboard() {
    const total = this.practice.questions.length;
    const answeredCount = Object.keys(this.practice.userAnswers).length;
    const reviewCount = Object.values(this.practice.reviewFlags || {}).filter(Boolean).length;

    const statsEl = document.getElementById('practice-score-stats');
    if (statsEl) {
      statsEl.textContent = reviewCount > 0
        ? `${answeredCount} / ${total} • ${reviewCount} marked`
        : `${answeredCount} / ${total}`;
    }

    const summaryEl = document.getElementById('practice-palette-summary');
    if (summaryEl) summaryEl.textContent = `${answeredCount} / ${total}`;

    const mobPracPalText = document.getElementById('practice-mobile-palette-btn-text');
    if (mobPracPalText) mobPracPalText.textContent = `Palette (${answeredCount}/${total})`;
  }

  renderPracticePalette() {
    const grid = document.getElementById('practice-palette-grid');
    if (!grid) return;

    const isTestMode = (this.practice.modeType === 'test');

    grid.innerHTML = this.practice.questions.map((q, idx) => {
      const selected = this.practice.userAnswers[idx];
      const isAnswered = (selected !== undefined && selected !== null);
      const isMarked = !!(this.practice.reviewFlags && this.practice.reviewFlags[idx]);
      const isCurrent = (idx === this.practice.currentIndex);

      let btnClass = 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border-zinc-200';

      if (isMarked) {
        btnClass = isAnswered
          ? 'bg-purple-600 text-white font-bold border-purple-700 shadow-2xs'
          : 'bg-purple-100 text-purple-900 font-semibold border-purple-300 shadow-2xs';
      } else if (isAnswered) {
        if (isTestMode) {
          btnClass = 'bg-indigo-100 text-indigo-900 font-semibold border-indigo-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition';
        } else {
          btnClass = (selected === q.correctAnswer)
            ? 'bg-emerald-600 text-white font-medium border-emerald-600'
            : 'bg-rose-600 text-white font-medium border-rose-600';
        }
      }

      const ringClass = isCurrent ? 'ring-2 ring-indigo-600 ring-offset-1 font-bold' : '';

      return `
        <button onclick="app.jumpPracticeQuestion(${idx})"
                data-palette-idx="${idx}"
                class="w-full py-1.5 rounded text-xs border ${btnClass} ${ringClass} transition relative">
          ${idx + 1}
          ${isMarked ? '<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-purple-500"></span>' : ''}
        </button>
      `;
    }).join('');

    // Auto-scroll active question button into view inside the palette
    requestAnimationFrame(() => {
      const currentBtn = grid.querySelector(`[data-palette-idx="${this.practice.currentIndex}"]`);
      if (currentBtn && typeof currentBtn.scrollIntoView === 'function') {
        currentBtn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    });
  }

  promptSubmitChapterTest() {
    const total = this.practice.questions.length;
    const answered = Object.keys(this.practice.userAnswers).length;
    const unanswered = total - answered;

    const confirmed = confirm(
      `Submit Chapter Test for "${this.practice.chapter}"?\n\nUser: ${this.currentUserEmail}\nAnswered: ${answered}\nUnanswered: ${unanswered}\nTotal: ${total}\n\nUpon submission, your full score, correct answers, and step-by-step solutions will be shown.`
    );

    if (confirmed) {
      this.isSubmitting = true;
      this.executeChapterTestSubmission();
    }
  }

  async executeChapterTestSubmission() {
    this.isSubmitting = true;
    this.clearPracticeTimer();
    this.clearActivePracticeSession();
    this.hideTestPausedModal();
    this.exitFullscreen();
    const elapsedMs = (Date.now() - (this.practice.startTime || Date.now())) - this.totalPausedDuration;
    const timeTakenSeconds = Math.max(1, Math.round(elapsedMs / 1000));

    const answersPayload = this.practice.questions.map((q, idx) => ({
      questionId: q.id,
      userAnswer: this.practice.userAnswers[idx] !== undefined ? this.practice.userAnswers[idx] : null
    }));

    if (!this.isStaticMode) {
      try {
        const res = await fetch('/api/submit-attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'chapter_test',
            chapter: this.practice.chapter,
            userEmail: this.currentUserEmail || 'guest@local',
            timeTakenSeconds,
            answers: answersPayload
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.attempt) {
            this.saveAttempt(data.attempt);
            this.syncToGoogleSheet(data.attempt);
            this.renderResults(data.attempt);
            return;
          }
        }
      } catch (err) {
        console.warn('Network submit failed, using local calculation fallback:', err);
      }
    }

    if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
    const attempt = this.calculateAttemptLocally({
      mode: 'chapter_test',
      chapter: this.practice.chapter,
      timeTakenSeconds,
      answers: answersPayload
    });

    this.saveAttempt(attempt);
    this.syncToGoogleSheet(attempt);
    this.renderResults(attempt);
  }

  // ==========================================
  // MODE 2: FULL MOCK TEST (CBT EXAM PORTAL)
  // ==========================================

  startMockTestPrompt() {
    if (!this.currentUserEmail) {
      this.switchView('login');
      return;
    }

    const modal = document.getElementById('mock-select-modal');
    if (modal) {
      modal.classList.remove('hidden');
    } else {
      this.startMockTest('all');
    }
  }

  closeMockSelectModal() {
    const modal = document.getElementById('mock-select-modal');
    if (modal) modal.classList.add('hidden');
  }

  handleMockChoiceChange(radio) {
    document.querySelectorAll('.mock-choice-card').forEach(card => {
      card.classList.remove('border-zinc-900', 'bg-zinc-50/70');
      card.classList.add('border-zinc-200');
    });
    const parent = radio.closest('.mock-choice-card');
    if (parent) {
      parent.classList.remove('border-zinc-200');
      parent.classList.add('border-zinc-900', 'bg-zinc-50/70');
    }
  }

  async confirmStartMockTest() {
    const checked = document.querySelector('input[name="mock_subject_option"]:checked');
    const choice = checked ? checked.value : 'all';
    this.closeMockSelectModal();
    await this.startMockTest(choice);
  }

  getWeakChapters() {
    const chapterStats = {};
    (this.attempts || []).forEach(att => {
      const cb = att.chapterBreakdown || {};
      for (const [ch, stat] of Object.entries(cb)) {
        if (!chapterStats[ch]) chapterStats[ch] = { correct: 0, total: 0 };
        chapterStats[ch].correct += (stat.correct || 0);
        chapterStats[ch].total += (stat.total || 0);
      }
    });

    const weak = [];
    for (const [ch, s] of Object.entries(chapterStats)) {
      if (s.total >= 3 && (s.correct / s.total) < 0.5) {
        weak.push(ch);
      }
    }
    return weak;
  }

  async startMockTest(subject = 'all') {
    this.isTestPaused = false;
    this.pauseStartTime = null;
    this.totalPausedDuration = 0;

    // When test start enter full screen mode!
    this.enterFullscreen().catch(() => {});

    const weakChaps = this.getWeakChapters();

    if (this.isStaticMode || this.allQuestions.length > 0) {
      if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
      const mockQuestions = this.generateMockQuestionsStatic(30, subject);
      this.initMockState(mockQuestions, subject);
      return;
    }

    try {
      let url = (subject && subject !== 'all') ? `/api/mock?subject=${encodeURIComponent(subject)}` : '/api/mock?subject=all';
      if (weakChaps.length > 0) {
        url += `&weakChapters=${encodeURIComponent(weakChaps.slice(0, 10).join(','))}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.questions && data.questions.length > 0) {
          this.initMockState(data.questions, subject);
          return;
        }
      }
    } catch (err) {}

    this.isStaticMode = true;
    if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
    const mockQuestions = this.generateMockQuestionsStatic(30, subject);
    this.initMockState(mockQuestions, subject);
  }

  generateMockQuestionsStatic(count = 30, subject = 'all') {
    const weakChapters = this.getWeakChapters();
    if (window.AptiPrep && window.AptiPrep.MockGenerator) {
      return window.AptiPrep.MockGenerator.generate(this.allQuestions, count, subject, { weakChapters });
    }
    let pool = [...this.allQuestions];
    const sq = (subject || '').trim().toLowerCase();
    if (sq === 'aptitude' || sq === 'quantitative aptitude') {
      pool = pool.filter(q => (q.subject || '').toLowerCase().includes('aptitude'));
    } else if (sq === 'science' || sq === 'general science') {
      pool = pool.filter(q => (q.subject || '').toLowerCase().includes('science'));
    } else if (sq === 'biology' || sq === 'chemistry' || sq === 'physics') {
      pool = pool.filter(q => (q.subSubject || '').toLowerCase() === sq);
    } else if (sq === 'top300' || sq === 'top 300' || sq === 'top_300') {
      pool = pool.filter(q => q.chapter === 'Top 300 Questions');
    }

    const byChapter = {};
    pool.forEach(q => {
      if (!byChapter[q.chapter]) byChapter[q.chapter] = [];
      byChapter[q.chapter].push(q);
    });

    const chapters = Object.keys(byChapter);
    if (chapters.length === 0) return [];

    const totalTarget = Math.min(count, pool.length);
    const basePerChap = Math.floor(totalTarget / chapters.length);
    const remainder = totalTarget % chapters.length;
    const selected = [];
    const shuffle = arr => [...arr].sort(() => 0.5 - Math.random());
    const shuffledChapters = shuffle(chapters);

    shuffledChapters.forEach((chap, idx) => {
      const target = basePerChap + (idx < remainder ? 1 : 0);
      const chPool = shuffle(byChapter[chap]);
      selected.push(...chPool.slice(0, target));
    });

    if (selected.length < totalTarget) {
      const pickedIds = new Set(selected.map(q => q.id));
      const leftovers = pool.filter(q => !pickedIds.has(q.id));
      selected.push(...shuffle(leftovers).slice(0, totalTarget - selected.length));
    }

    return shuffle(selected).slice(0, totalTarget);
  }

  initMockState(questions, subject = 'all') {
    this.mock.questions = questions;
    this.mock.subject = subject;
    this.mock.currentIndex = 0;
    this.mock.userAnswers = {};
    this.mock.reviewFlags = {};
    this.mock.visited = { 0: true };
    this.mock.questionTimes = {};
    this.mock.timeLeftSeconds = 1800; // 30 minutes
    this.mock.startTime = Date.now();
    this.mock.isSidebarCollapsed = false;
    this.mock.drawerOpen = false;

    // Set Header Titles
    const titleEl = document.getElementById('mock-test-header-title');
    const subtitleEl = document.getElementById('mock-test-header-subtitle');
    const mobSubEl = document.getElementById('mock-mobile-exam-subtitle');
    const sub = (subject || '').toLowerCase();
    let titleStr = 'Full Mock Test: Quantitative Aptitude & General Science';
    let subtitleStr = '30 Questions • 30 Minutes • Negative Marking: 1/3 (-0.33)';

    if (sub === 'aptitude') {
      titleStr = 'Full Mock Test: Quantitative Aptitude';
    } else if (sub === 'science') {
      titleStr = 'Full Mock Test: General Science';
    } else if (sub === 'top300') {
      titleStr = 'Full Mock Test: TOP 300 High-Yield Science';
    } else {
      titleStr = 'Full Mock Test: Quantitative Aptitude & General Science';
    }

    if (titleEl) titleEl.textContent = titleStr;
    if (subtitleEl) subtitleEl.textContent = subtitleStr;
    if (mobSubEl) mobSubEl.textContent = titleStr;

    // Set Candidate Profile
    const userNameEl = document.getElementById('mock-user-name-display');
    const userEmailEl = document.getElementById('mock-user-email-display');
    const userAvatarEl = document.getElementById('mock-user-avatar-text');
    const displayName = this.getUserDisplayName();
    if (userNameEl) userNameEl.textContent = displayName;
    if (userEmailEl) userEmailEl.textContent = this.currentUserEmail || 'Candidate';
    if (userAvatarEl) userAvatarEl.textContent = displayName.charAt(0).toUpperCase();

    // Reset Sidebar Collapse state
    const mockSection = document.getElementById('view-mock');
    if (mockSection) mockSection.classList.remove('sidebar-collapsed');
    const arrowEl = document.getElementById('mock-sidebar-collapse-arrow');
    if (arrowEl) arrowEl.innerHTML = '&gt;';

    const initTab = (sub === 'aptitude') ? 'aptitude' : (sub === 'science' || sub === 'top300' || sub === 'biology' || sub === 'chemistry' || sub === 'physics') ? 'science' : 'all';
    this.setMockSectionTab(initTab);

    this.switchView('mock');
    this.renderMockQuestion();
    this.updateMockPalette();
    this.saveActiveMockSession();
    this.startMockTimer();
  }

  startMockTimer() {
    this.clearMockTimer();
    const timerDisplay = document.getElementById('mock-timer-display');
    const hhEl = document.getElementById('mock-timer-hh');
    const mmEl = document.getElementById('mock-timer-mm');
    const ssEl = document.getElementById('mock-timer-ss');
    const timerContainer = document.getElementById('mock-timer-container');

    const updateTimerUI = () => {
      const hrs = Math.floor(this.mock.timeLeftSeconds / 3600);
      const mins = Math.floor((this.mock.timeLeftSeconds % 3600) / 60);
      const secs = this.mock.timeLeftSeconds % 60;

      const hhStr = hrs.toString().padStart(2, '0');
      const mmStr = mins.toString().padStart(2, '0');
      const ssStr = secs.toString().padStart(2, '0');

      if (hhEl) hhEl.textContent = hhStr;
      if (mmEl) mmEl.textContent = mmStr;
      if (ssEl) ssEl.textContent = ssStr;
      if (timerDisplay) timerDisplay.textContent = `${mmStr}:${ssStr}`;

      const mobTimer = document.getElementById('mock-mobile-timer-display');
      if (mobTimer) mobTimer.textContent = `${hhStr}:${mmStr}:${ssStr}`;

      const progressCircle = document.getElementById('mock-mobile-progress-circle');
      if (progressCircle) {
        const totalSecs = 1800;
        const pct = Math.max(0, Math.min(100, (this.mock.timeLeftSeconds / totalSecs) * 100));
        progressCircle.setAttribute('stroke-dashoffset', (100 - pct).toString());
      }

      if (timerContainer) {
        if (this.mock.timeLeftSeconds <= 60) {
          timerContainer.className = 'flex items-center gap-1 sm:gap-2 bg-rose-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-rose-300';
        } else if (this.mock.timeLeftSeconds <= 300) {
          timerContainer.className = 'flex items-center gap-1 sm:gap-2 bg-amber-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-amber-300';
        } else {
          timerContainer.className = 'flex items-center gap-1 sm:gap-2 bg-zinc-100/90 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-200';
        }
      }

      // Live update question spent time
      if (this.mock.questions && this.mock.questions[this.mock.currentIndex]) {
        const currentQ = this.mock.questions[this.mock.currentIndex];
        const spent = this.mock.questionTimes[currentQ.id] || 0;
        const qM = Math.floor(spent / 60).toString().padStart(2, '0');
        const qS = (spent % 60).toString().padStart(2, '0');
        const qTimeEl = document.getElementById('mock-question-spent-time');
        if (qTimeEl) qTimeEl.textContent = `${qM}:${qS}`;
      }
    };

    updateTimerUI();

    // Wall-clock deadline: Chrome throttles setInterval in background tabs / locked phones,
    // so counting ticks would let the 30 minutes stretch.
    const deadline = Date.now() + this.mock.timeLeftSeconds * 1000;
    this.mock.timerInterval = setInterval(() => {
      const prevLeft = this.mock.timeLeftSeconds;
      this.mock.timeLeftSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      const elapsed = Math.max(0, prevLeft - this.mock.timeLeftSeconds);

      if (elapsed > 0 && this.mock.questions && this.mock.questions[this.mock.currentIndex]) {
        const currentQ = this.mock.questions[this.mock.currentIndex];
        this.mock.questionTimes[currentQ.id] = (this.mock.questionTimes[currentQ.id] || 0) + elapsed;
      }

      updateTimerUI();

      if (this.mock.timeLeftSeconds % 5 === 0) {
        this.saveActiveMockSession();
      }

      if (this.mock.timeLeftSeconds <= 0) {
        this.clearMockTimer();
        alert('Time is up! Your mock examination will now be automatically submitted.');
        this.autoSubmitMock();
      }
    }, 1000);
  }

  clearMockTimer() {
    if (this.mock.timerInterval) {
      clearInterval(this.mock.timerInterval);
      this.mock.timerInterval = null;
    }
  }

  renderMockQuestion() {
    const q = this.mock.questions[this.mock.currentIndex];
    if (!q) return;

    if (!this.mock.visited) this.mock.visited = {};
    this.mock.visited[this.mock.currentIndex] = true;

    const total = this.mock.questions.length;
    const current = this.mock.currentIndex + 1;

    const chapDisplay = q.subSubject && q.subSubject !== q.chapter ? `${q.subSubject} • ${q.chapter}` : (q.chapter || 'Mathematics');

    const qNumEl = document.getElementById('mock-q-number');
    if (qNumEl) qNumEl.textContent = `Question No. ${current}`;

    const mobQNumEl = document.getElementById('mock-mobile-q-num');
    if (mobQNumEl) mobQNumEl.textContent = current.toString().padStart(2, '0');

    const qChapEl = document.getElementById('mock-q-chapter');
    if (qChapEl) qChapEl.textContent = `• ${chapDisplay}`;

    // Question spent time
    if (!this.mock.questionTimes) this.mock.questionTimes = {};
    const spent = this.mock.questionTimes[q.id] || 0;
    const qM = Math.floor(spent / 60).toString().padStart(2, '0');
    const qS = (spent % 60).toString().padStart(2, '0');
    const qTimeEl = document.getElementById('mock-question-spent-time');
    if (qTimeEl) qTimeEl.textContent = `${qM}:${qS}`;

    const isMarked = !!this.mock.reviewFlags[q.id];
    const reviewBtn = document.getElementById('mock-btn-review-toggle');
    const reviewLabel = document.getElementById('mock-review-toggle-label');
    if (reviewBtn && reviewLabel) {
      if (isMarked) {
        reviewBtn.className = 'tb-btn-primary px-3.5 py-2 rounded-md font-medium text-xs flex items-center gap-1.5 transition';
        reviewLabel.textContent = '★ Marked for Review & Next';
      } else {
        reviewBtn.className = 'tb-btn-secondary px-3.5 py-2 rounded-md font-medium text-xs flex items-center gap-1.5 transition';
        reviewLabel.textContent = 'Mark for Review & Next';
      }
    }

    const mobileReviewBtn = document.getElementById('mock-mobile-btn-review');
    const mobileReviewLabel = document.getElementById('mock-mobile-review-label');
    if (mobileReviewBtn) {
      if (isMarked) {
        mobileReviewBtn.className = 'tb-btn-primary px-2 py-2 rounded-md text-xs font-bold text-center active:scale-95 transition flex items-center gap-1';
        if (mobileReviewLabel) mobileReviewLabel.textContent = '★ Marked';
        else mobileReviewBtn.textContent = '★ Marked';
      } else {
        mobileReviewBtn.className = 'tb-btn-outline px-2 py-2 rounded-md text-xs font-semibold text-center active:scale-95 transition flex items-center gap-1 text-purple-700 border-purple-200';
        if (mobileReviewLabel) mobileReviewLabel.textContent = 'Review';
        else mobileReviewBtn.textContent = 'Review';
      }
    }

    const mobBookmarkBtn = document.getElementById('mock-mobile-bookmark-btn');
    if (mobBookmarkBtn) {
      if (isMarked) {
        mobBookmarkBtn.className = 'p-1 text-[#7c3aed] transition flex items-center justify-center';
        mobBookmarkBtn.innerHTML = '<svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>';
      } else {
        mobBookmarkBtn.className = 'p-1 text-zinc-400 hover:text-[#7c3aed] transition flex items-center justify-center';
        mobBookmarkBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>';
      }
    }

    const qTextEl = document.getElementById('mock-q-text');
    if (qTextEl) qTextEl.textContent = q.question;

    // Render Diagram
    const mockDiagBox = document.getElementById('mock-q-diagram-box');
    const mockDiagImg = document.getElementById('mock-q-diagram');
    if (mockDiagBox && mockDiagImg) {
      if (q.diagram && q.diagram.trim()) {
        mockDiagImg.src = q.diagram;
        mockDiagBox.classList.remove('hidden');
      } else {
        mockDiagImg.src = '';
        mockDiagBox.classList.add('hidden');
      }
    }

    // Render Unboxed Options (Exact CBT style: ○ Option text)
    const optContainer = document.getElementById('mock-options-container');
    const selectedOption = this.mock.userAnswers[q.id];

    if (optContainer) {
      optContainer.innerHTML = (q.options || []).map((opt, idx) => {
        const isSelected = (selectedOption === idx);
        return `
          <label onclick="app.selectMockOption(${idx})" tabindex="0" role="radio" aria-checked="${isSelected}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"
                 class="tb-mobile-option-card ${isSelected ? 'selected' : ''}">
            <span class="tb-option-radio">
              ${isSelected ? '<span class="tb-option-radio-dot"></span>' : ''}
            </span>
            <span class="tb-option-text">${escapeHtml(opt)}</span>
          </label>
        `;
      }).join('');
    }

    // Sync active section tab and palette section title with current question subject
    const currentSubj = (q.subject || '').toLowerCase();
    const tabAll = document.getElementById('mock-tab-all');
    const tabApti = document.getElementById('mock-tab-apti');
    const tabSci = document.getElementById('mock-tab-sci');
    const sectionTitleEl = document.getElementById('mock-palette-section-title');

    if (this.mockSectionTab && this.mockSectionTab !== 'all') {
      if (this.mockSectionTab === 'science') {
        if (tabAll) tabAll.className = 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
        if (tabApti) tabApti.className = 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
        if (tabSci) tabSci.className = 'tb-mobile-tab-active px-3 py-2.5 text-xs whitespace-nowrap transition';
        if (sectionTitleEl) sectionTitleEl.textContent = 'SECTION : General Science';
      } else if (this.mockSectionTab === 'aptitude') {
        if (tabAll) tabAll.className = 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
        if (tabApti) tabApti.className = 'tb-mobile-tab-active px-3 py-2.5 text-xs whitespace-nowrap transition';
        if (tabSci) tabSci.className = 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
        if (sectionTitleEl) sectionTitleEl.textContent = 'SECTION : Quantitative Aptitude';
      }
    } else {
      if (tabAll) tabAll.className = 'tb-mobile-tab-active px-3 py-2.5 text-xs whitespace-nowrap transition';
      if (tabApti) tabApti.className = 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
      if (tabSci) tabSci.className = 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
      if (sectionTitleEl) {
        sectionTitleEl.textContent = currentSubj.includes('science') ? 'SECTION : General Science' : 'SECTION : Quantitative Aptitude';
      }
    }

    const btnPrev = document.getElementById('mock-btn-prev');
    const mobileBtnPrev = document.getElementById('mock-mobile-btn-prev');
    const btnNext = document.getElementById('mock-btn-next');
    const mobileBtnNext = document.getElementById('mock-mobile-btn-next');
    if (btnPrev) btnPrev.disabled = (this.mock.currentIndex === 0);
    if (mobileBtnPrev) mobileBtnPrev.disabled = (this.mock.currentIndex === 0);
    if (btnNext) {
      const targetText = (this.mock.currentIndex === total - 1) ? 'Submit Test' : 'Save & Next';
      btnNext.textContent = targetText;
    }
    if (mobileBtnNext) {
      mobileBtnNext.textContent = (this.mock.currentIndex === total - 1) ? 'Submit Test' : 'Save & Next →';
    }

    // Update floating mobile swipe navigation arrows
    const mobileArrowPrev = document.getElementById('mock-mobile-arrow-prev');
    const mobileArrowNext = document.getElementById('mock-mobile-arrow-next');
    if (mobileArrowPrev) mobileArrowPrev.classList.toggle('arrow-disabled', this.mock.currentIndex === 0);
    if (mobileArrowNext) mobileArrowNext.classList.toggle('arrow-disabled', this.mock.currentIndex === total - 1);

    this.updateMockPalette();
  }

  setMockSectionTab(filter = 'all') {
    this.mockSectionTab = filter;

    const tabAll = document.getElementById('mock-tab-all');
    const tabApti = document.getElementById('mock-tab-apti');
    const tabSci = document.getElementById('mock-tab-sci');
    const sectionTitleEl = document.getElementById('mock-palette-section-title');

    if (tabAll) {
      tabAll.className = (filter === 'all')
        ? 'tb-mobile-tab-active px-3 py-2.5 text-xs whitespace-nowrap transition'
        : 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
    }
    if (tabApti) {
      tabApti.className = (filter === 'aptitude')
        ? 'tb-mobile-tab-active px-3 py-2.5 text-xs whitespace-nowrap transition'
        : 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
    }
    if (tabSci) {
      tabSci.className = (filter === 'science')
        ? 'tb-mobile-tab-active px-3 py-2.5 text-xs whitespace-nowrap transition'
        : 'tb-mobile-tab-inactive px-3 py-2.5 text-xs whitespace-nowrap transition';
    }

    if (sectionTitleEl) {
      if (filter === 'aptitude') sectionTitleEl.textContent = 'SECTION : Quantitative Aptitude';
      else if (filter === 'science') sectionTitleEl.textContent = 'SECTION : General Science';
      else sectionTitleEl.textContent = 'SECTION : Test';
    }

    if (this.mock && this.mock.questions && this.mock.questions.length > 0) {
      if (filter === 'aptitude') {
        const idx = this.mock.questions.findIndex(q => (q.subject || '').toLowerCase().includes('aptitude'));
        if (idx !== -1 && idx !== this.mock.currentIndex) {
          this.mock.currentIndex = idx;
          this.renderMockQuestion();
        }
      } else if (filter === 'science') {
        const idx = this.mock.questions.findIndex(q => (q.subject || '').toLowerCase().includes('science'));
        if (idx !== -1 && idx !== this.mock.currentIndex) {
          this.mock.currentIndex = idx;
          this.renderMockQuestion();
        }
      } else if (filter === 'all') {
        if (this.mock.currentIndex !== 0) {
          this.mock.currentIndex = 0;
          this.renderMockQuestion();
        }
      }
    }
  }

  selectMockOption(idx) {
    if (this._suppressOptionClick) return;
    const q = this.mock.questions[this.mock.currentIndex];
    if (!q) return;
    this.mock.userAnswers[q.id] = idx;
    this.saveActiveMockSession();
    this.renderMockQuestion();
  }

  clearMockResponse() {
    const q = this.mock.questions[this.mock.currentIndex];
    if (!q) return;
    delete this.mock.userAnswers[q.id];
    this.saveActiveMockSession();
    this.renderMockQuestion();
  }

  toggleMockReview(andNext = false) {
    const q = this.mock.questions[this.mock.currentIndex];
    if (!q) return;
    this.mock.reviewFlags[q.id] = !this.mock.reviewFlags[q.id];
    if (andNext && this.mock.currentIndex < this.mock.questions.length - 1) {
      this.mock.currentIndex++;
    }
    this.saveActiveMockSession();
    this.renderMockQuestion();
  }

  prevMockQuestion() {
    if (this.mock.currentIndex > 0) {
      this.mock.currentIndex--;
      this.saveActiveMockSession();
      this.renderMockQuestion();
    }
  }

  nextMockQuestion() {
    const total = this.mock.questions.length;
    if (this.mock.currentIndex < total - 1) {
      this.mock.currentIndex++;
      this.saveActiveMockSession();
      this.renderMockQuestion();
    } else {
      this.promptSubmitMock();
    }
  }

  jumpMockQuestion(idx) {
    this.mock.currentIndex = idx;
    this.saveActiveMockSession();
    this.renderMockQuestion();
    if (window.innerWidth < 1024) {
      const panel = document.getElementById('mock-drawer-panel');
      const backdrop = document.getElementById('mock-palette-backdrop');
      if (panel) panel.classList.add('hidden');
      if (backdrop) backdrop.classList.add('hidden');
      this.mock.drawerOpen = false;
    }
  }

  toggleMockDrawer() {
    const panel = document.getElementById('mock-drawer-panel');
    const backdrop = document.getElementById('mock-palette-backdrop');
    if (panel) {
      this.mock.drawerOpen = !this.mock.drawerOpen;
      panel.classList.toggle('hidden', !this.mock.drawerOpen);
      if (backdrop) {
        backdrop.classList.toggle('hidden', !this.mock.drawerOpen || window.innerWidth >= 1024);
      }
      if (this.mock.drawerOpen) {
        setTimeout(() => {
          const grid = document.getElementById('mock-palette-grid');
          if (grid) {
            const currentBtn = grid.children[this.mock.currentIndex];
            if (currentBtn && typeof currentBtn.scrollIntoView === 'function') {
              currentBtn.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
            }
          }
        }, 50);
      }
    }
  }

  toggleFullScreenMock() {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const btnText = document.getElementById('mock-fullscreen-btn-text');
    if (isFullscreen) {
      this.exitFullscreen();
      if (btnText) btnText.textContent = 'Switch Full Screen';
    } else {
      this.enterFullscreen();
      if (btnText) btnText.textContent = 'Exit Full Screen';
    }
  }

  toggleMockSidebarCollapse() {
    const mockSection = document.getElementById('view-mock');
    const arrowEl = document.getElementById('mock-sidebar-collapse-arrow');
    const btn = document.getElementById('mock-sidebar-collapse-btn');
    if (!mockSection) return;

    this.mock.isSidebarCollapsed = !this.mock.isSidebarCollapsed;
    mockSection.classList.toggle('sidebar-collapsed', this.mock.isSidebarCollapsed);

    if (this.mock.isSidebarCollapsed) {
      if (arrowEl) arrowEl.innerHTML = '&lt;';
      if (btn) btn.style.right = '0px';
    } else {
      if (arrowEl) arrowEl.innerHTML = '&gt;';
      if (btn) btn.style.right = '';
    }
  }

  openQuestionPaperModal() {
    const modal = document.getElementById('mock-question-paper-modal');
    const listEl = document.getElementById('mock-question-paper-list');
    if (!modal || !listEl) return;

    const letters = ['A', 'B', 'C', 'D'];
    listEl.innerHTML = this.mock.questions.map((q, idx) => {
      const selected = this.mock.userAnswers[q.id];
      const diagHtml = (q.diagram && q.diagram.trim())
        ? `<div class="my-2"><img src="${q.diagram}" class="max-h-48 rounded border border-zinc-200 bg-white p-1" /></div>`
        : '';
      const optsHtml = (q.options || []).map((opt, oIdx) => {
        const isSel = (selected === oIdx);
        const selClass = isSel ? 'bg-sky-50 font-bold border-sky-400 text-sky-950' : 'bg-white border-zinc-200 text-zinc-800';
        return `
          <div class="p-2 rounded border ${selClass} flex items-start gap-2 text-xs">
            <span class="font-mono font-bold">${letters[oIdx]}.</span>
            <span>${escapeHtml(opt)}</span>
            ${isSel ? '<span class="ml-auto text-[10px] text-[#00a8cc] font-bold">Selected</span>' : ''}
          </div>
        `;
      }).join('');

      return `
        <div class="p-4 rounded-lg border border-zinc-200 bg-zinc-50/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-xs text-zinc-900">Question ${idx + 1}</span>
            <span class="text-[11px] text-zinc-400 font-medium">${escapeHtml(q.chapter || '')}</span>
          </div>
          <p class="text-xs sm:text-sm text-zinc-900 leading-relaxed">${escapeHtml(q.question)}</p>
          ${diagHtml}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            ${optsHtml}
          </div>
        </div>
      `;
    }).join('');

    modal.classList.remove('hidden');
  }

  closeQuestionPaperModal() {
    const modal = document.getElementById('mock-question-paper-modal');
    if (modal) modal.classList.add('hidden');
  }


  reportMockQuestion() {
    const current = this.mock.currentIndex + 1;
    alert(`Question No. ${current} has been reported. Our academic team will verify the solution and question content. Thank you for helping keep question quality top notch!`);
  }

  updateMockPalette() {
    const grid = document.getElementById('mock-palette-grid');
    if (!grid) return;

    let answeredCount = 0;
    let markedCount = 0;
    let notVisitedCount = 0;
    let markedAnsweredCount = 0;
    let unansweredCount = 0;

    grid.innerHTML = this.mock.questions.map((q, idx) => {
      const isVisited = !!(this.mock.visited && this.mock.visited[idx]);
      const isAnswered = (this.mock.userAnswers[q.id] !== undefined && this.mock.userAnswers[q.id] !== null);
      const isMarked = !!this.mock.reviewFlags[q.id];
      const isCurrent = (idx === this.mock.currentIndex);

      let badgeClass = 'cbt-badge-not-visited';

      if (isAnswered && !isMarked) {
        answeredCount++;
        badgeClass = 'cbt-badge-answered';
      } else if (isAnswered && isMarked) {
        markedAnsweredCount++;
        badgeClass = 'cbt-badge-marked-answered';
      } else if (!isAnswered && isMarked) {
        markedCount++;
        badgeClass = 'cbt-badge-marked';
      } else if (!isAnswered && !isMarked && isVisited) {
        unansweredCount++;
        badgeClass = 'cbt-badge-unanswered';
      } else {
        notVisitedCount++;
        badgeClass = 'cbt-badge-not-visited';
      }

      const ringClass = isCurrent ? 'cbt-badge-current font-bold' : '';

      return `
        <button onclick="app.jumpMockQuestion(${idx})"
                class="cbt-badge ${badgeClass} ${ringClass}"
                title="Question ${idx + 1}">
          ${idx + 1}
        </button>
      `;
    }).join('');

    // Update 5-State Legend Counters
    const elAns = document.getElementById('legend-count-answered');
    const elMarked = document.getElementById('legend-count-marked');
    const elNotVisited = document.getElementById('legend-count-not-visited');
    const elMarkedAns = document.getElementById('legend-count-marked-answered');
    const elUnans = document.getElementById('legend-count-unanswered');

    if (elAns) elAns.textContent = answeredCount;
    if (elMarked) elMarked.textContent = markedCount;
    if (elNotVisited) elNotVisited.textContent = notVisitedCount;
    if (elMarkedAns) elMarkedAns.textContent = markedAnsweredCount;
    if (elUnans) elUnans.textContent = unansweredCount;

    // Legacy bindings for backward compatibility
    const legAns = document.getElementById('legend-answered');
    const legUnans = document.getElementById('legend-unanswered');
    const legRev = document.getElementById('legend-review');
    if (legAns) legAns.textContent = answeredCount + markedAnsweredCount;
    if (legUnans) legUnans.textContent = unansweredCount + notVisitedCount;
    if (legRev) legRev.textContent = markedCount + markedAnsweredCount;

    const mobPalText = document.getElementById('mock-mobile-palette-btn-text');
    if (mobPalText) mobPalText.textContent = `Palette (${answeredCount + markedAnsweredCount}/${this.mock.questions.length})`;

    // Auto-scroll active question button into view in mock palette
    requestAnimationFrame(() => {
      const currentBtn = grid.children[this.mock.currentIndex];
      if (currentBtn && typeof currentBtn.scrollIntoView === 'function') {
        currentBtn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    });
  }

  promptSubmitMock() {
    let answered = 0;
    let review = 0;
    let unanswered = 0;

    this.mock.questions.forEach(q => {
      if (this.mock.userAnswers[q.id] !== undefined && this.mock.userAnswers[q.id] !== null) {
        answered++;
      } else {
        unanswered++;
      }
      if (this.mock.reviewFlags[q.id]) review++;
    });

    const mins = Math.floor(this.mock.timeLeftSeconds / 60);
    const secs = this.mock.timeLeftSeconds % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    document.getElementById('modal-stat-answered').textContent = answered;
    document.getElementById('modal-stat-unanswered').textContent = unanswered;
    document.getElementById('modal-stat-review').textContent = review;
    document.getElementById('modal-stat-time-left').textContent = timeStr;

    const modal = document.getElementById('mock-confirm-modal');
    if (modal) modal.classList.remove('hidden');
  }

  closeSubmitModal() {
    const modal = document.getElementById('mock-confirm-modal');
    if (modal) modal.classList.add('hidden');
  }

  confirmSubmitMock() {
    this.isSubmitting = true;
    this.hideTestPausedModal();
    this.exitFullscreen();
    this.closeSubmitModal();
    this.clearMockTimer();
    this.executeMockSubmission();
  }

  autoSubmitMock() {
    this.isSubmitting = true;
    this.hideTestPausedModal();
    this.exitFullscreen();
    this.closeSubmitModal();
    this.clearMockTimer();
    this.executeMockSubmission();
  }

  async executeMockSubmission() {
    this.isSubmitting = true;
    this.clearActiveMockSession();
    this.hideTestPausedModal();
    this.exitFullscreen();
    const timeTakenSeconds = 1800 - Math.max(0, this.mock.timeLeftSeconds);

    const answersPayload = this.mock.questions.map(q => ({
      questionId: q.id,
      userAnswer: this.mock.userAnswers[q.id] !== undefined ? this.mock.userAnswers[q.id] : null
    }));

    if (!this.isStaticMode) {
      try {
        const res = await fetch('/api/submit-attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'mock',
            chapter: null,
            userEmail: this.currentUserEmail || 'guest@local',
            timeTakenSeconds,
            answers: answersPayload
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.attempt) {
            this.saveAttempt(data.attempt);
            this.syncToGoogleSheet(data.attempt);
            this.renderResults(data.attempt);
            return;
          }
        }
      } catch (err) {
        console.warn('Network mock submit failed, using local calculation fallback:', err);
      }
    }

    if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
    const attempt = this.calculateAttemptLocally({
      mode: 'mock',
      chapter: null,
      timeTakenSeconds,
      answers: answersPayload
    });

    this.saveAttempt(attempt);
    this.syncToGoogleSheet(attempt);
    this.renderResults(attempt);
  }

  // ==========================================
  // LOCAL ATTEMPT CALCULATION & STORAGE
  // ==========================================

  calculateAttemptLocally({ mode, chapter, timeTakenSeconds, answers }) {
    const combinedQuestions = [...(this.allQuestions || []), ...(this.rkQuestions || [])];
    if (window.AptiPrep && window.AptiPrep.ScoringService) {
      const { fullAttempt } = window.AptiPrep.ScoringService.calculate({
        questions: combinedQuestions,
        answers,
        mode,
        chapter,
        timeTakenSeconds,
        userEmail: this.currentUserEmail
      });
      return fullAttempt;
    }

    const detailedAnswers = answers.map(ans => {
      const q = combinedQuestions.find(item => item.id === ans.questionId);
      const isCorrect = (ans.userAnswer !== null && ans.userAnswer !== undefined && q && ans.userAnswer === q.correctAnswer);
      return {
        questionId: ans.questionId,
        chapter: q ? q.chapter : (chapter || 'General'),
        subject: q ? q.subject : undefined,
        subSubject: q ? q.subSubject : undefined,
        question: q ? q.question : '',
        options: q ? q.options : [],
        diagram: (q && q.diagram) ? q.diagram : undefined,
        source: q ? q.source : undefined,
        check: q ? q.check : undefined,
        userAnswer: ans.userAnswer,
        correctAnswer: q ? q.correctAnswer : null,
        isCorrect: !!isCorrect,
        explanation: q ? q.explanation : ''
      };
    });

    const totalQuestions = answers.length;
    const correctCount = detailedAnswers.filter(a => a.isCorrect).length;
    const incorrectCount = detailedAnswers.filter(a => a.userAnswer !== null && !a.isCorrect).length;
    const unattemptedCount = detailedAnswers.filter(a => a.userAnswer === null).length;
    const scorePercentage = totalQuestions > 0 ? parseFloat(((correctCount / totalQuestions) * 100).toFixed(1)) : 0;

    const chapterBreakdown = {};
    detailedAnswers.forEach(a => {
      const ch = a.chapter;
      if (!chapterBreakdown[ch]) {
        chapterBreakdown[ch] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
      }
      chapterBreakdown[ch].total++;
      if (a.isCorrect) chapterBreakdown[ch].correct++;
      else if (a.userAnswer === null) chapterBreakdown[ch].unattempted++;
      else chapterBreakdown[ch].incorrect++;
    });

    return {
      attemptId: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: new Date().toISOString(),
      userEmail: this.currentUserEmail || 'guest@local',
      mode,
      chapter,
      totalQuestions,
      correctCount,
      incorrectCount,
      unattemptedCount,
      scorePercentage,
      timeTakenSeconds,
      chapterBreakdown,
      detailedAnswers,
      // Only store user answered questions, omitting unattempted/null answers
      answers: detailedAnswers
        .filter(a => a.userAnswer !== null && a.userAnswer !== undefined)
        .map(a => ({
          questionId: a.questionId,
          userAnswer: a.userAnswer,
          isCorrect: a.isCorrect
        }))
    };
  }

  saveAttempt(attempt) {
    try {
      this.attempts = [
        attempt,
        ...(this.attempts || []).filter(a => a && a.attemptId !== attempt.attemptId)
      ];

      // Save to global attempts array in localStorage
      let all = [];
      try {
        const stored = localStorage.getItem('apti_attempts');
        if (stored) all = JSON.parse(stored);
      } catch (e) {}

      all = [
        attempt,
        ...(Array.isArray(all) ? all.filter(a => a && a.attemptId !== attempt.attemptId) : [])
      ];
      this.persistAttemptsWithinQuota(all);
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  /**
   * Each attempt carries full question text + explanations in `detailedAnswers`,
   * which quickly fills the ~5MB localStorage quota. When a write fails, strip the
   * heavy review payload from the oldest attempts (it can be rebuilt from
   * `answers` + the question bank) until the history fits again.
   */
  persistAttemptsWithinQuota(all) {
    const tryWrite = (list) => {
      try {
        localStorage.setItem('apti_attempts', JSON.stringify(list));
        return true;
      } catch (e) {
        return false;
      }
    };

    if (tryWrite(all)) return true;

    const slim = all.map(a => ({ ...a }));
    for (let i = slim.length - 1; i >= 1; i--) {
      const a = slim[i];
      if (a.detailedAnswers) {
        if (!Array.isArray(a.answers) || a.answers.length < a.detailedAnswers.length) {
          a.answers = a.detailedAnswers.map(d => ({
            questionId: d.questionId,
            userAnswer: d.userAnswer,
            isCorrect: d.isCorrect
          }));
        }
        delete a.detailedAnswers;
        if (tryWrite(slim)) return true;
      }
    }

    // Still too large: drop the oldest records rather than losing the newest one.
    while (slim.length > 1) {
      slim.pop();
      if (tryWrite(slim)) return true;
    }
    console.warn('LocalStorage quota exceeded: unable to persist attempt history.');
    return false;
  }

  // ==========================================
  // VIEW 4: RESULTS & REVIEW SCREEN
  // ==========================================

  async viewPastAttempt(attemptId) {
    const found = this.attempts.find(a => a.attemptId === attemptId);
    if (found && found.detailedAnswers) {
      this.renderResults(found);
      return;
    }

    try {
      if (this.isStaticMode) throw new Error('static mode: no local API');
      const res = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.attemptId) {
          this.renderResults(data);
          return;
        }
      }
    } catch (err) {}

    // Fallback: reconstruct detailedAnswers from local allQuestions/rkQuestions if available
    const combinedQuestions = [...(this.allQuestions || []), ...(this.rkQuestions || [])];
    if (found && found.answers && combinedQuestions.length > 0) {
      const qMap = new Map(combinedQuestions.map(q => [q.id, q]));
      found.detailedAnswers = found.answers.map(ans => {
        const q = qMap.get(ans.questionId);
        return {
          questionId: ans.questionId,
          userAnswer: ans.userAnswer,
          isCorrect: ans.isCorrect,
          correctAnswer: q ? q.correctAnswer : null,
          explanation: q ? q.explanation : '',
          question: q ? q.question : '',
          options: q ? q.options : [],
          chapter: q ? q.chapter : 'General',
          subject: q ? q.subject : undefined,
          subSubject: q ? q.subSubject : undefined
        };
      });
      this.renderResults(found);
      return;
    }
    alert('Attempt record not found.');
  }

  renderResults(attempt) {
    this.isSubmitting = false;
    this.hideTestPausedModal();
    this.results.attempt = attempt;
    this.results.currentFilter = 'all';

    const modeTag = document.getElementById('result-mode-tag');
    if (modeTag) {
      if (attempt.mode === 'mock') {
        modeTag.textContent = 'Mock Examination Result';
      } else if (attempt.mode === 'chapter_test') {
        modeTag.textContent = `Chapter Test: ${attempt.chapter}`;
      } else {
        modeTag.textContent = `Practice: ${attempt.chapter || 'Chapter'}`;
      }
    }

    const timeEl = document.getElementById('result-timestamp');
    if (timeEl) {
      const d = new Date(attempt.timestamp);
      timeEl.textContent = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    const titleEl = document.getElementById('result-score-title');
    if (titleEl) {
      if (attempt.netMarks !== undefined) {
        titleEl.textContent = `Net Score: ${attempt.netMarks} / ${attempt.totalQuestions} (${attempt.netPercentage}%)`;
      } else {
        titleEl.textContent = `Score: ${attempt.correctCount} / ${attempt.totalQuestions} (${attempt.scorePercentage}%)`;
      }
    }

    const feedbackEl = document.getElementById('result-feedback-message');
    if (feedbackEl) {
      if (attempt.performanceBand) {
        feedbackEl.innerHTML = `<span class="inline-block px-2 py-0.5 rounded font-semibold text-[11px] bg-sky-50 text-sky-800 border border-sky-200 mr-1.5">${attempt.performanceBand}</span> • Percentile: <strong>${attempt.estimatedPercentile || 50}%</strong>`;
      } else {
        const pct = attempt.scorePercentage || 0;
        if (pct >= 85) feedbackEl.textContent = 'Outstanding accuracy. Concepts are well-cemented.';
        else if (pct >= 70) feedbackEl.textContent = 'Strong performance. Review occasional misses below.';
        else if (pct >= 50) feedbackEl.textContent = 'Satisfactory. Read through the step-by-step solutions below.';
        else feedbackEl.textContent = 'Focus on reviewing the missed questions and their formulas below.';
      }
    }

    const resCorrect = document.getElementById('res-correct');
    if (resCorrect) resCorrect.textContent = attempt.correctCount;
    const resIncorrect = document.getElementById('res-incorrect');
    if (resIncorrect) resIncorrect.textContent = attempt.incorrectCount;
    const resUnattempted = document.getElementById('res-unattempted');
    if (resUnattempted) resUnattempted.textContent = attempt.unattemptedCount;

    // Penalty lost
    const penaltyEl = document.getElementById('res-penalty-lost');
    if (penaltyEl) {
      const penalty = attempt.negativeMarksLost !== undefined
        ? attempt.negativeMarksLost
        : Number(((attempt.incorrectCount || 0) * (1 / 3)).toFixed(2));
      penaltyEl.textContent = penalty > 0 ? `-${penalty.toFixed(2)}` : '0.00';
    }

    // Accuracy %
    const accEl = document.getElementById('res-accuracy');
    if (accEl) {
      const attempted = (attempt.correctCount || 0) + (attempt.incorrectCount || 0);
      const acc = attempt.accuracyPercentage !== undefined
        ? attempt.accuracyPercentage
        : (attempted > 0 ? Number((((attempt.correctCount || 0) / attempted) * 100).toFixed(1)) : 0);
      accEl.textContent = `${acc}%`;
    }

    // Percentile
    const percEl = document.getElementById('res-percentile');
    if (percEl) {
      percEl.textContent = attempt.estimatedPercentile !== undefined ? `${attempt.estimatedPercentile}%` : '50.0%';
    }

    // Speed & Pacing
    const mins = Math.floor((attempt.timeTakenSeconds || 0) / 60);
    const secs = (attempt.timeTakenSeconds || 0) % 60;
    const timeDisplay = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const resTime = document.getElementById('res-time-taken');
    if (resTime) resTime.textContent = timeDisplay;

    const speedEl = document.getElementById('res-speed');
    if (speedEl) {
      const avgSecs = attempt.pacingAnalytics?.avgSecondsPerQuestion || (attempt.totalQuestions > 0 ? Math.round((attempt.timeTakenSeconds || 0) / attempt.totalQuestions) : 0);
      speedEl.textContent = `${avgSecs}s/Q (${timeDisplay})`;
    }

    this.renderChapterBreakdown(attempt.chapterBreakdown || {});

    const detailed = attempt.detailedAnswers || [];
    document.getElementById('filter-count-all').textContent = detailed.length;
    document.getElementById('filter-count-correct').textContent = detailed.filter(a => a.isCorrect).length;
    document.getElementById('filter-count-incorrect').textContent = detailed.filter(a => a.userAnswer !== null && !a.isCorrect).length;
    document.getElementById('filter-count-unattempted').textContent = detailed.filter(a => a.userAnswer === null).length;

    // Mistakes badges & re-attempt buttons
    const incorrectCount = detailed.filter(a => a.userAnswer !== null && !a.isCorrect).length;
    const unattemptedCount = detailed.filter(a => a.userAnswer === null).length;
    const mistakesCount = incorrectCount + unattemptedCount;

    const badgeMistakes = document.getElementById('res-badge-mistakes-count');
    if (badgeMistakes) badgeMistakes.textContent = mistakesCount;

    const btnReattempt = document.getElementById('res-btn-reattempt-mistakes');
    const badgeReattempt = document.getElementById('res-badge-reattempt-count');
    if (btnReattempt && badgeReattempt) {
      badgeReattempt.textContent = mistakesCount;
      if (mistakesCount > 0) {
        btnReattempt.classList.remove('hidden');
      } else {
        btnReattempt.classList.add('hidden');
      }
    }

    this.renderSubjectAggregates(detailed);

    this.renderReviewQuestionsList();
    this.switchView('results');
  }

  renderSubjectAggregates(detailed) {
    const container = document.getElementById('result-subject-aggregates');
    const summaryText = document.getElementById('results-subject-summary-text');
    if (!container) return;

    if (!detailed || detailed.length === 0) {
      container.innerHTML = '';
      if (summaryText) summaryText.textContent = '';
      return;
    }

    const chapterToSubj = {};
    (this.chapters || []).forEach(ch => {
      chapterToSubj[ch.name] = (ch.subject && ch.subject.includes('Science')) ? 'General Science' : 'Quantitative Aptitude';
    });

    const subjects = {
      'Quantitative Aptitude': { total: 0, correct: 0, incorrect: 0, unattempted: 0, icon: '📐' },
      'General Science': { total: 0, correct: 0, incorrect: 0, unattempted: 0, icon: '🔬' }
    };

    detailed.forEach(item => {
      const subj = chapterToSubj[item.chapter] || (item.chapter?.toLowerCase().includes('cell') || item.chapter?.toLowerCase().includes('chemistry') || item.chapter?.toLowerCase().includes('physics') || item.chapter?.toLowerCase().includes('light') || item.chapter?.toLowerCase().includes('motion') ? 'General Science' : 'Quantitative Aptitude');
      const target = subjects[subj] || subjects['Quantitative Aptitude'];
      target.total++;
      if (item.isCorrect) target.correct++;
      else if (item.userAnswer === null) target.unattempted++;
      else target.incorrect++;
    });

    const subKeys = Object.keys(subjects).filter(k => subjects[k].total > 0);
    if (summaryText) {
      summaryText.textContent = `${subKeys.length} Subjects Evaluated • Tap "Show Chapter Details" below for breakdown`;
    }

    container.innerHTML = subKeys.map(k => {
      const data = subjects[k];
      const acc = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      let barColor = 'bg-emerald-600';
      if (acc < 50) barColor = 'bg-rose-500';
      else if (acc < 75) barColor = 'bg-amber-500';

      return `
        <div class="bg-zinc-50 border border-zinc-200/80 rounded-xl p-3.5 space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span>${data.icon}</span>
              <span class="font-bold text-xs text-zinc-900">${k}</span>
            </div>
            <span class="font-mono font-bold text-sm ${acc >= 70 ? 'text-emerald-700' : acc >= 50 ? 'text-amber-700' : 'text-rose-600'}">${acc}%</span>
          </div>
          <div class="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
            <div class="${barColor} h-full rounded-full transition-all" style="width: ${acc}%"></div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
            <span><strong>${data.correct}</strong> / ${data.total} correct</span>
            <span><strong>${data.incorrect}</strong> wrong • <strong>${data.unattempted}</strong> skipped</span>
          </div>
        </div>
      `;
    }).join('');
  }

  toggleResultsChapterBreakdown() {
    const el = document.getElementById('result-chapter-breakdown');
    const btnText = document.getElementById('toggle-results-breakdown-text');
    const icon = document.getElementById('toggle-results-breakdown-icon');
    if (!el) return;

    const isHidden = el.classList.contains('hidden');
    if (isHidden) {
      el.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Hide Chapter Details';
      if (icon) icon.classList.add('rotate-180');
    } else {
      el.classList.add('hidden');
      if (btnText) btnText.textContent = 'Show Chapter Details';
      if (icon) icon.classList.remove('rotate-180');
    }
  }

  scrollToQuestionsSection() {
    const section = document.getElementById('result-questions-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  reattemptMistakes() {
    if (!this.results.attempt || !this.results.attempt.detailedAnswers) return;

    const missed = this.results.attempt.detailedAnswers.filter(a => !a.isCorrect);
    if (missed.length === 0) {
      alert('No mistakes in this attempt! Outstanding job.');
      return;
    }

    const reattemptQuestions = missed.map(item => ({
      id: item.questionId || (item.question ? item.question.slice(0, 32) : Math.random().toString(36).slice(2)),
      question: item.question,
      options: item.options || [],
      correctAnswer: item.correctAnswer,
      explanation: item.explanation || '',
      chapter: item.chapter || 'Mistakes Drill'
    }));

    this.practice = {
      chapter: `Mistakes Drill (${reattemptQuestions.length} Qs)`,
      questions: reattemptQuestions,
      currentIndex: 0,
      userAnswers: {},
      reviewFlags: {},
      questionTimes: {},
      startTime: Date.now(),
      timerInterval: null,
      modeType: 'study',
      isStudyMode: true,
      subjectFilter: 'all',
      drawerOpen: false,
      isFullscreen: false
    };

    this.switchView('practice');
    this.renderPracticeQuestion();
    this.renderPracticePalette();
    this.startPracticeTimer();

    this.setPracticeChapterTitle(`⚡ Mistakes Drill (${reattemptQuestions.length} Questions)`);
  }

  renderChapterBreakdown(breakdown) {
    const container = document.getElementById('result-chapter-breakdown');
    if (!container) return;

    const chapters = Object.keys(breakdown);
    if (chapters.length === 0) {
      container.innerHTML = '<p class="text-xs text-zinc-400 col-span-full">No chapter breakdown recorded.</p>';
      return;
    }

    container.innerHTML = chapters.map(chap => {
      const stats = breakdown[chap];
      const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      let barColor = 'bg-indigo-600';
      if (acc < 50) barColor = 'bg-rose-500';
      else if (acc < 75) barColor = 'bg-amber-500';

      return `
        <div class="bg-zinc-50 border border-zinc-100 rounded-lg p-3 space-y-1.5 text-xs">
          <div class="flex justify-between items-center">
            <span class="font-medium text-zinc-800 line-clamp-1">${chap}</span>
            <span class="font-mono font-bold text-zinc-900">${acc}%</span>
          </div>
          <div class="w-full bg-zinc-200 h-1 rounded-full overflow-hidden">
            <div class="${barColor} h-full rounded-full" style="width: ${acc}%"></div>
          </div>
          <div class="flex justify-between text-[11px] text-zinc-400">
            <span>${stats.correct}/${stats.total} correct</span>
            <span>${stats.incorrect} wrong</span>
          </div>
        </div>
      `;
    }).join('');
  }

  filterReview(filterType) {
    this.results.currentFilter = filterType;

    const filters = ['all', 'correct', 'incorrect', 'unattempted'];
    filters.forEach(f => {
      const btn = document.getElementById(`filter-btn-${f}`);
      if (btn) {
        if (f === filterType) {
          btn.className = 'px-2.5 py-1 rounded-md bg-white text-zinc-900 font-medium shadow-xs';
        } else {
          btn.className = 'px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-900';
        }
      }
    });

    this.renderReviewQuestionsList();
  }

  renderReviewQuestionsList() {
    const list = document.getElementById('result-questions-list');
    if (!list || !this.results.attempt) return;

    const detailed = this.results.attempt.detailedAnswers || [];
    const filter = this.results.currentFilter;

    const filtered = detailed.filter(item => {
      if (filter === 'correct') return item.isCorrect;
      if (filter === 'incorrect') return (item.userAnswer !== null && !item.isCorrect);
      if (filter === 'unattempted') return (item.userAnswer === null);
      return true;
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div class="p-6 text-center text-zinc-400 text-xs">No questions in filter category.</div>`;
      return;
    }

    const letters = ['A', 'B', 'C', 'D'];

    list.innerHTML = filtered.map((item, idx) => {
      let statusTag = '';

      if (item.isCorrect) {
        statusTag = '<span class="text-emerald-700 font-medium text-xs">Correct (+1)</span>';
      } else if (item.userAnswer === null) {
        statusTag = '<span class="text-zinc-400 font-medium text-xs">Skipped (0)</span>';
      } else {
        statusTag = '<span class="text-rose-600 font-medium text-xs">Incorrect (0)</span>';
      }

      const optionsHtml = (item.options || []).map((opt, optIdx) => {
        let optStyle = 'border-zinc-100 bg-zinc-50/50 text-zinc-700';
        let badgeStyle = 'border border-zinc-200 text-zinc-500 bg-white';
        let badgeText = letters[optIdx];

        if (optIdx === item.correctAnswer) {
          optStyle = 'border-emerald-300 bg-emerald-50/60 text-emerald-950 font-medium';
          badgeStyle = 'bg-emerald-600 text-white border-emerald-600';
          badgeText = '✓';
        } else if (optIdx === item.userAnswer && !item.isCorrect) {
          optStyle = 'border-rose-300 bg-rose-50/60 text-rose-950 font-medium';
          badgeStyle = 'bg-rose-600 text-white border-rose-600';
          badgeText = '✕';
        }

        return `
          <div class="p-3 sm:p-3.5 rounded-xl border ${optStyle} flex items-center gap-3">
            <span class="w-7 h-7 min-w-7 rounded-lg flex items-center justify-center text-xs font-bold ${badgeStyle}">${badgeText}</span>
            <span class="option-text flex-1 font-normal">${escapeHtml(opt)}</span>
            ${optIdx === item.userAnswer ? '<span class="ml-auto text-xs text-zinc-500 font-medium bg-zinc-100 px-2.5 py-0.5 rounded border border-zinc-200 shrink-0">Your Choice</span>' : ''}
          </div>
        `;
      }).join('');

      return `
        <div class="bg-white rounded-xl p-5 border border-zinc-200 space-y-3">
          <div class="flex items-center justify-between border-b border-zinc-100 pb-2 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-mono font-medium text-zinc-500">Q${idx + 1}</span>
              <span class="text-zinc-300">&bull;</span>
              <span class="text-zinc-500">${escapeHtml(item.chapter || '')}</span>
            </div>
            ${statusTag}
          </div>

          <div class="text-zinc-950 font-medium text-[15px] sm:text-[16px] question-content leading-relaxed">
            ${escapeHtml(item.question)}
          </div>

          ${item.diagram ? `
            <div class="my-3 flex justify-center">
              <img src="${item.diagram}" alt="Question Diagram" class="max-h-60 max-w-full rounded-xl border border-zinc-200 shadow-xs bg-white p-2 object-contain" />
            </div>
          ` : ''}

          <div class="space-y-1.5 pt-1">
            ${optionsHtml}
          </div>

          <div class="bg-zinc-50 border border-zinc-100 rounded-lg p-3 text-xs text-zinc-600 space-y-1">
            <span class="font-medium text-zinc-900 block text-[11px] uppercase tracking-wider">Solution:</span>
            <p class="leading-relaxed">${item.explanation || 'Option ' + letters[item.correctAnswer]}</p>
          </div>
          ${item.source ? `<div class="text-[11px] leading-relaxed">${sourceHtml(item)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // CHAPTER REVISION STUDIO & FULLSCREEN PREVIEW
  // ==========================================

  async loadRevisionMaterials() {
    try {
      let data = null;
      const isLocalhost = Boolean(
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(window.location.hostname) ||
        window.location.port !== ''
      );
      if (isLocalhost) {
        try {
          const res = await fetch('/api/revision-materials');
          if (res.ok) data = await res.json();
        } catch (e) {}
      }

      if (!data) {
        const res = await fetch('./data/revision_materials.json');
        if (res.ok) data = await res.json();
      }

      if (data) {
        if (data.folderUrl) this.revision.folderUrl = data.folderUrl;
        if (data.chapters && typeof data.chapters === 'object') {
          this.revision.chapters = data.chapters;
        }
        if (Array.isArray(data.pdfs)) {
          this.revision.pdfs = data.pdfs;
        }
      }
    } catch (err) {
      console.warn('Could not fetch revision_materials.json:', err);
    }
  }

  getCurrentSubjectChapters(subject = this.revision.activeSubject) {
    const chaptersMap = this.revision.chapters || {};
    let list = Object.values(chaptersMap);

    if (subject === 'Biology') {
      list = list.filter(c => c.subSubject === 'Biology');
    } else if (subject === 'Chemistry') {
      list = list.filter(c => c.subSubject === 'Chemistry');
    } else if (subject === 'Physics') {
      list = list.filter(c => c.subSubject === 'Physics');
    } else if (subject === 'top300') {
      list = list.filter(c => c.chapter === 'Top 300 Questions' || c.subSubject === 'Top 300 Questions');
    }

    list.sort((a, b) => a.chapter.localeCompare(b.chapter));
    return list;
  }

  showRevisionView(defaultSubject = 'Biology', defaultChapter = null) {
    this.revision.returnView = 'dashboard';
    this.revision.returnInfo = null;

    if (!defaultChapter) {
      try {
        const lastSaved = localStorage.getItem('apti_last_revision_chapter');
        if (lastSaved && this.revision.chapters && this.revision.chapters[lastSaved]) {
          defaultChapter = lastSaved;
          defaultSubject = this.revision.chapters[lastSaved].subSubject || defaultSubject;
        }
      } catch (e) {}
    }

    const returnBtnLabel = document.getElementById('revision-return-btn-label');
    const testBadge = document.getElementById('revision-test-badge');

    if (returnBtnLabel) returnBtnLabel.textContent = 'Dashboard';
    if (testBadge) testBadge.classList.add('hidden');

    this.setRevisionSidebarOpen(false);
    this.switchView('revision');
    this.setRevisionSubject(defaultSubject, defaultChapter);
  }

  openRevisionViewFromTest() {
    const fromMode = this.currentMode;
    this.revision.returnView = fromMode;

    let targetSubject = 'Biology';
    let targetChapter = 'Cell';
    let returnLabel = 'Return to Test';

    if (fromMode === 'practice') {
      const qNum = this.practice.currentIndex + 1;
      const q = this.practice.questions[this.practice.currentIndex] || {};
      const activeChap = q.chapter || this.practice.chapter || '';
      const activeSubj = (q.subSubject || q.subject || '').toLowerCase();

      returnLabel = `Return to Test (Q${qNum})`;

      if (activeChap && this.revision.chapters && this.revision.chapters[activeChap]) {
        targetChapter = activeChap;
        targetSubject = this.revision.chapters[activeChap].subSubject || 'Biology';
      } else if (activeSubj.includes('chem')) {
        targetSubject = 'Chemistry';
        targetChapter = 'Acids, Bases and Salt';
      } else if (activeSubj.includes('phys')) {
        targetSubject = 'Physics';
        targetChapter = 'Electricity';
      } else if (activeChap.toLowerCase().includes('top 300')) {
        targetSubject = 'top300';
        targetChapter = 'Top 300 Questions';
      }
    } else if (fromMode === 'mock') {
      const qNum = this.mock.currentIndex + 1;
      const q = this.mock.questions[this.mock.currentIndex] || {};
      const activeChap = q.chapter || '';
      const activeSubj = (q.subSubject || q.subject || '').toLowerCase();

      returnLabel = `Return to Mock (Q${qNum})`;

      if (activeChap && this.revision.chapters && this.revision.chapters[activeChap]) {
        targetChapter = activeChap;
        targetSubject = this.revision.chapters[activeChap].subSubject || 'Biology';
      } else if (activeSubj.includes('chem')) {
        targetSubject = 'Chemistry';
        targetChapter = 'Acids, Bases and Salt';
      } else if (activeSubj.includes('phys')) {
        targetSubject = 'Physics';
        targetChapter = 'Electricity';
      } else if (activeChap.toLowerCase().includes('top 300')) {
        targetSubject = 'top300';
        targetChapter = 'Top 300 Questions';
      }
    }

    const returnBtnLabel = document.getElementById('revision-return-btn-label');
    const testBadge = document.getElementById('revision-test-badge');

    if (returnBtnLabel) returnBtnLabel.textContent = returnLabel;
    if (testBadge) testBadge.classList.remove('hidden');

    this.setRevisionSidebarOpen(false);
    this.switchView('revision');
    this.setRevisionSubject(targetSubject, targetChapter);
  }

  exitRevisionView() {
    this.toggleRevisionFullscreen(false);
    this.setRevisionSidebarOpen(false);
    if (this.zenMode) this.toggleZenMode(false);
    document.body.classList.remove('overflow-y-hidden');

    if (this.revision.returnView === 'practice') {
      this.switchView('practice');
    } else if (this.revision.returnView === 'mock') {
      this.switchView('mock');
    } else {
      this.showDashboard();
    }
  }

  setRevisionSubject(subject, preferredChapter = null) {
    this.revision.activeSubject = subject;
    this.revision.searchQuery = '';

    const searchInput = document.getElementById('revision-search-input');
    if (searchInput) searchInput.value = '';

    const subjButtons = {
      'Biology': document.getElementById('rev-subj-btn-Biology'),
      'Chemistry': document.getElementById('rev-subj-btn-Chemistry'),
      'Physics': document.getElementById('rev-subj-btn-Physics'),
      'top300': document.getElementById('rev-subj-btn-top300')
    };

    const subjDisplayNames = {
      'Biology': 'General Science — Biology',
      'Chemistry': 'General Science — Chemistry',
      'Physics': 'General Science — Physics',
      'top300': 'RRB Top 300 Series'
    };

    const subjLabel = document.getElementById('revision-selected-subj-label');
    if (subjLabel) subjLabel.textContent = subjDisplayNames[subject] || subject;

    const breadcrumbSubj = document.getElementById('revision-breadcrumb-subject');
    if (breadcrumbSubj) breadcrumbSubj.textContent = subject === 'top300' ? 'Top 300' : subject;

    // Style active subject pill
    Object.entries(subjButtons).forEach(([key, btn]) => {
      if (!btn) return;
      if (key === subject) {
        btn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold transition btn-primary text-white shadow-2xs whitespace-nowrap';
      } else if (key === 'top300') {
        btn.className = 'px-2.5 py-1 rounded-md text-xs font-medium transition border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-800 whitespace-nowrap';
      } else {
        btn.className = 'px-2.5 py-1 rounded-md text-xs font-medium transition border border-zinc-200 hover:border-zinc-300 bg-white text-zinc-700 whitespace-nowrap';
      }
    });

    this.renderRevisionChapterButtons(subject, preferredChapter);
  }

  handleRevisionSearch(query) {
    this.revision.searchQuery = (query || '').toLowerCase().trim();
    this.renderRevisionChapterButtons(this.revision.activeSubject, this.revision.activeChapter);
  }

  renderRevisionChapterButtons(subject, preferredChapter = null) {
    const container = document.getElementById('revision-chapter-buttons-container');
    const mobileDropdown = document.getElementById('revision-chapter-dropdown-mobile');
    const countLabel = document.getElementById('revision-chapter-count-label');

    const fullList = this.getCurrentSubjectChapters(subject);
    if (countLabel) countLabel.textContent = `${fullList.length} ch`;

    let filteredList = fullList;
    if (this.revision.searchQuery) {
      filteredList = fullList.filter(c => c.chapter.toLowerCase().includes(this.revision.searchQuery));
    }

    let chosen = preferredChapter && fullList.find(c => c.chapter === preferredChapter)
      ? preferredChapter
      : (fullList[0] ? fullList[0].chapter : null);

    this.revision.activeChapter = chosen;

    // Render mobile dropdown
    if (mobileDropdown) {
      mobileDropdown.innerHTML = fullList.map(item => `
        <option value="${item.chapter.replace(/"/g, '&quot;')}" ${item.chapter === chosen ? 'selected' : ''}>
          ${item.icon || '📄'} ${item.chapter}
        </option>
      `).join('');
    }

    // Render sidebar list
    if (container) {
      if (filteredList.length === 0) {
        container.innerHTML = `
          <div class="py-8 text-center text-zinc-400 text-xs">
            No chapters match "${this.revision.searchQuery}"
          </div>
        `;
      } else {
        container.innerHTML = filteredList.map(item => {
          const isSelected = item.chapter === chosen;
          const cls = isSelected
            ? 'p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 font-bold shadow-2xs flex items-center justify-between text-left transition select-none w-full'
            : 'p-2 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-100 bg-white text-zinc-700 font-medium flex items-center justify-between text-left transition select-none w-full';

          return `
            <button onclick="app.selectRevisionChapter('${item.chapter.replace(/'/g, "\\'")}')" class="${cls}">
              <div class="flex items-center gap-1.5 min-w-0 pr-1">
                <span class="text-xs shrink-0">${item.icon || '📄'}</span>
                <span class="text-xs truncate">${item.chapter}</span>
              </div>
              <span class="text-[10px] ${isSelected ? 'text-zinc-300' : 'text-zinc-400'} font-mono shrink-0">&rarr;</span>
            </button>
          `;
        }).join('');
      }
    }

    if (chosen) {
      this.selectRevisionChapter(chosen);
    }
  }

  selectRevisionChapter(chapterName) {
    const chaptersMap = this.revision.chapters || {};
    const info = chaptersMap[chapterName];
    if (!info) return;

    this.revision.activeChapter = chapterName;
    try {
      localStorage.setItem('apti_last_revision_chapter', chapterName);
    } catch (e) {}

    // Auto-close sidebar drawer when a chapter is selected
    if (this.revision.sidebarOpen) {
      this.setRevisionSidebarOpen(false);
    }

    // Update active highlight in sidebar list
    const container = document.getElementById('revision-chapter-buttons-container');
    if (container) {
      const buttons = container.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent || '';
        const match = text.includes(chapterName);
        if (match) {
          btn.className = 'p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 font-bold shadow-2xs flex items-center justify-between text-left transition select-none w-full';
        } else {
          btn.className = 'p-2 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-100 bg-white text-zinc-700 font-medium flex items-center justify-between text-left transition select-none w-full';
        }
      });
    }

    // Sync mobile dropdown
    const mobileDropdown = document.getElementById('revision-chapter-dropdown-mobile');
    if (mobileDropdown && mobileDropdown.value !== chapterName) {
      mobileDropdown.value = chapterName;
    }

    // Update Breadcrumb & Header Info
    const breadcrumbChapter = document.getElementById('revision-breadcrumb-chapter');
    const titleEl = document.getElementById('revision-preview-title');
    const badgeEl = document.getElementById('revision-preview-badge');
    const fileEl = document.getElementById('revision-preview-file');

    if (breadcrumbChapter) breadcrumbChapter.textContent = chapterName;
    if (titleEl) titleEl.textContent = info.title || `${chapterName} Revision Notes`;
    if (fileEl) fileEl.textContent = info.fileName || `${chapterName}.pdf`;

    let previewUrl = info.previewUrl || `https://drive.google.com/file/d/${info.fileId}/preview`;
    if (!previewUrl.includes('#')) {
      previewUrl += '#view=FitH';
    }

    if (badgeEl) {
      const disc = info.subSubject || 'General Science';
      badgeEl.textContent = disc;
      if (disc === 'Biology') {
        badgeEl.className = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0';
      } else if (disc === 'Chemistry') {
        badgeEl.className = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 text-sky-800 shrink-0';
      } else if (disc === 'Physics') {
        badgeEl.className = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-100 text-violet-800 shrink-0';
      } else {
        badgeEl.className = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0';
      }
    }

    // Google Drive direct view link setup
    const fallbackContainer = document.getElementById('revision-fallback-container');
    const fallbackLink = document.getElementById('revision-fallback-link');
    if (fallbackContainer) fallbackContainer.classList.add('hidden');
    if (fallbackLink && info.fileId) {
      fallbackLink.href = `https://drive.google.com/file/d/${info.fileId}/view?usp=sharing`;
    }

    if (this.revisionFallbackTimer) {
      clearTimeout(this.revisionFallbackTimer);
      this.revisionFallbackTimer = null;
    }

    this.revisionFallbackTimer = setTimeout(() => {
      const curLoader = document.getElementById('revision-view-loader');
      if (curLoader && !curLoader.classList.contains('opacity-0') && fallbackContainer) {
        fallbackContainer.classList.remove('hidden');
      }
    }, 3500);

    // Load PDF in iframe with true full-screen support
    const iframe = document.getElementById('revision-view-iframe');
    const loader = document.getElementById('revision-view-loader');
    const loaderText = document.getElementById('revision-view-loader-text');

    if (iframe) {
      if (loader) {
        loader.classList.remove('opacity-0', 'pointer-events-none');
        if (loaderText) loaderText.textContent = `Loading ${info.chapter || 'Chapter'} PDF on website...`;
      }

      if (iframe.src !== previewUrl) {
        iframe.src = previewUrl;
      } else {
        setTimeout(() => this.handleRevisionViewIframeLoaded(), 300);
      }

      setTimeout(() => this.handleRevisionViewIframeLoaded(), 2500);
    }
  }

  handleRevisionViewIframeLoaded() {
    if (this.revisionFallbackTimer) {
      clearTimeout(this.revisionFallbackTimer);
      this.revisionFallbackTimer = null;
    }
    const fallbackContainer = document.getElementById('revision-fallback-container');
    if (fallbackContainer) fallbackContainer.classList.add('hidden');
    const loader = document.getElementById('revision-view-loader');
    if (loader) {
      loader.classList.add('opacity-0', 'pointer-events-none');
    }
  }

  prevRevisionChapter() {
    const list = this.getCurrentSubjectChapters();
    if (!list || list.length <= 1) return;
    const currIdx = list.findIndex(c => c.chapter === this.revision.activeChapter);
    if (currIdx > 0) {
      this.selectRevisionChapter(list[currIdx - 1].chapter);
    } else {
      this.selectRevisionChapter(list[list.length - 1].chapter);
    }
  }

  nextRevisionChapter() {
    const list = this.getCurrentSubjectChapters();
    if (!list || list.length <= 1) return;
    const currIdx = list.findIndex(c => c.chapter === this.revision.activeChapter);
    if (currIdx >= 0 && currIdx < list.length - 1) {
      this.selectRevisionChapter(list[currIdx + 1].chapter);
    } else {
      this.selectRevisionChapter(list[0].chapter);
    }
  }

  setRevisionSidebarOpen(open) {
    this.revision.sidebarOpen = !!open;
    const sidebar = document.getElementById('revision-sidebar');
    const backdrop = document.getElementById('revision-sidebar-backdrop');
    const toggleBtn = document.getElementById('rev-toggle-sidebar-btn');

    if (!sidebar) return;

    if (this.revision.sidebarOpen) {
      sidebar.classList.remove('hidden');
      sidebar.classList.add('flex');
      if (backdrop) backdrop.classList.remove('hidden');
      if (toggleBtn) {
        toggleBtn.classList.add('btn-primary', 'text-white');
        toggleBtn.classList.remove('bg-zinc-50', 'text-zinc-800', 'border-zinc-200');
      }
      const searchInput = document.getElementById('revision-search-input');
      if (searchInput) {
        setTimeout(() => searchInput.focus(), 60);
      }
    } else {
      sidebar.classList.add('hidden');
      sidebar.classList.remove('flex');
      if (backdrop) backdrop.classList.add('hidden');
      if (toggleBtn) {
        toggleBtn.classList.remove('btn-primary', 'text-white');
        toggleBtn.classList.add('border-zinc-200', 'bg-zinc-50', 'text-zinc-800');
      }
    }
  }

  toggleRevisionSidebar() {
    this.setRevisionSidebarOpen(!this.revision.sidebarOpen);
  }

  toggleRevisionFullscreen(enable) {
    const reader = document.getElementById('revision-reader-container');
    if (!reader) return;

    if (enable === undefined) {
      enable = !this.revision.isFullscreen;
    }

    this.revision.isFullscreen = enable;

    const fsBtn = document.getElementById('rev-fullscreen-btn');

    if (enable) {
      reader.classList.add('revision-fullscreen-active');
      document.body.classList.add('overflow-hidden');

      if (fsBtn) {
        fsBtn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-500 transition flex items-center gap-1.5 shadow-2xs select-none';
        fsBtn.innerHTML = `
          <span>&times;</span>
          <span>Exit Fullscreen</span>
        `;
        fsBtn.setAttribute('title', 'Exit Fullscreen (Esc)');
        fsBtn.onclick = () => this.toggleRevisionFullscreen(false);
      }

      // Request browser fullscreen on the reader container
      if (reader.requestFullscreen && !document.fullscreenElement) {
        reader.requestFullscreen().catch(() => {});
      } else if (reader.webkitRequestFullscreen && !document.webkitFullscreenElement) {
        reader.webkitRequestFullscreen().catch(() => {});
      }
    } else {
      reader.classList.remove('revision-fullscreen-active');
      document.body.classList.remove('overflow-hidden');

      if (fsBtn) {
        fsBtn.className = 'reader-ctrl-btn px-2.5 py-1 text-xs font-semibold rounded-md btn-primary text-white transition flex items-center gap-1.5 shadow-2xs select-none';
        fsBtn.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
          <span class="hidden sm:inline">Full Screen</span>
        `;
        fsBtn.setAttribute('title', 'Full Screen (F)');
        fsBtn.onclick = () => this.toggleRevisionFullscreen(true);
      }

      // Exit browser fullscreen if active
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen().catch(() => {});
      }
    }
  }
}

// Global app instance
const app = new AptiPrepApp();
