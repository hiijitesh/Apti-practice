// public/app.js - AptiPrep CBT Engine Frontend Logic (Minimal, Distraction-Free & Email Session Ready)

class AptiPrepApp {
  constructor() {
    this.chapters = [];
    this.attempts = [];
    this.allQuestions = [];
    this.currentMode = 'dashboard';
    this.zenMode = false;
    this.isStaticMode = false;

    // Email Session
    this.currentUserEmail = (localStorage.getItem('apti_user_email') || '').trim().toLowerCase();

    // Google Sheet Backend URL
    this.googleSheetUrl = localStorage.getItem('apti_google_sheet_url') ||
                          (window.APTIPREP_CONFIG && window.APTIPREP_CONFIG.GOOGLE_SHEET_URL) || '';

    // Practice / Chapter Test State
    this.practice = {
      chapter: '',
      questions: [],
      currentIndex: 0,
      userAnswers: {}, // { [qIndex]: number (selected option index) }
      modeType: 'test', // 'test' (show answers at end) or 'study' (instant feedback)
      drawerOpen: true,
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
    this.currentSubjectFilter = 'all'; // 'all' | 'aptitude' | 'science'
    this.currentSubSubjectFilter = 'all'; // 'all' | 'Biology' | 'Chemistry' | 'Physics'

    // Fullscreen & Auto-Pause State
    this.isTestPaused = false;
    this.pauseStartTime = null;
    this.totalPausedDuration = 0; // ms
    this.isSubmitting = false;

    // Modal Chapter Select State
    this.modalSubject = 'aptitude';
    this.modalScienceSub = 'all';

    this.init();
    this.bindKeyboardShortcuts();
  }

  async init() {
    this.initFontScale();
    this.setupFullscreenListeners();
    this.updateSheetStatusUI();
    this.updateUserSessionUI();
    await this.loadChapters();

    if (!this.currentUserEmail) {
      // First time user: ask for email before proceeding to dashboard
      this.switchView('login');
      setTimeout(() => {
        const inp = document.getElementById('login-email-input');
        if (inp) inp.focus();
      }, 100);
    } else {
      await this.loadAttempts();
      this.renderDashboard();
      this.switchView('dashboard');
    }
  }

  // ==========================================
  // USER SESSION & EMAIL GATEWAY
  // ==========================================

  updateUserSessionUI() {
    const widget = document.getElementById('user-header-widget');
    const label = document.getElementById('header-user-email');
    if (!widget || !label) return;

    if (this.currentUserEmail) {
      widget.classList.remove('hidden');
      widget.classList.add('flex');
      label.textContent = this.currentUserEmail;
    } else {
      widget.classList.add('hidden');
      widget.classList.remove('flex');
    }
  }

  handleEmailSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('login-email-input');
    const err = document.getElementById('login-error-msg');
    const val = (input ? input.value : '').trim().toLowerCase();

    if (!val || !val.includes('@') || !val.includes('.')) {
      if (err) {
        err.textContent = 'Please enter a valid email address.';
        err.classList.remove('hidden');
      }
      return;
    }

    if (err) err.classList.add('hidden');
    this.currentUserEmail = val;
    localStorage.setItem('apti_user_email', val);
    this.updateUserSessionUI();
    this.loadAttempts();
    this.showDashboard();
  }

  loginAsGuest() {
    this.currentUserEmail = 'guest@local';
    localStorage.setItem('apti_user_email', 'guest@local');
    this.updateUserSessionUI();
    this.loadAttempts();
    this.showDashboard();
  }

  promptSwitchUser() {
    this.switchView('login');
    const input = document.getElementById('login-email-input');
    if (input) {
      input.value = (this.currentUserEmail === 'guest@local') ? '' : this.currentUserEmail;
      input.focus();
    }
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
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen();
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
    if (titleEl && testTitle) titleEl.textContent = testTitle;
    if (studyBtn) {
      if (canSwitchToStudy) {
        studyBtn.classList.remove('hidden');
      } else {
        studyBtn.classList.add('hidden');
      }
    }
    if (modal) modal.classList.remove('hidden');
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

  // Keyboard Navigation for Distraction-Free Test Taking
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing into input or select
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      const key = e.key.toLowerCase();

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
    });
  }

  toggleZenMode() {
    this.zenMode = !this.zenMode;
    document.body.classList.toggle('zen-mode', this.zenMode);
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
    this.currentMode = viewName;
    const views = ['login', 'dashboard', 'practice', 'mock', 'results'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== viewName);
    });

    const btnHome = document.getElementById('nav-btn-home');
    const btnPractice = document.getElementById('nav-btn-practice');

    if (btnHome) btnHome.classList.toggle('bg-zinc-100', viewName === 'dashboard');
    if (btnPractice) btnPractice.classList.toggle('bg-zinc-100', viewName === 'practice');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showDashboard() {
    this.isSubmitting = false;
    this.hideTestPausedModal();

    if (!this.currentUserEmail) {
      this.switchView('login');
      return;
    }

    if (this.mock.timerInterval) {
      if (!confirm('You have an ongoing mock test. Leaving will abandon the current test. Continue?')) {
        return;
      }
      this.clearMockTimer();
    }
    this.exitFullscreen();
    this.loadAttempts();
    this.switchView('dashboard');
  }

  showChapterSelect() {
    this.openChapterSelectModal();
  }

  // ==========================================
  // CHAPTER TEST SELECTION MODAL
  // ==========================================

  openChapterSelectModal(defaultSubj = 'aptitude') {
    if (!this.currentUserEmail) {
      this.switchView('login');
      return;
    }

    this.modalSubject = defaultSubj;
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

  setModalSubjectTab(subj) {
    this.modalSubject = subj;
    this.modalScienceSub = 'all';
    this.updateModalTabsUI();
    this.renderModalChapters();
  }

  setModalScienceSubTab(sub) {
    this.modalScienceSub = sub;
    this.updateModalTabsUI();
    this.renderModalChapters();
  }

  updateModalTabsUI() {
    const tabApti = document.getElementById('modal-tab-aptitude');
    const tabSci = document.getElementById('modal-tab-science');
    const sciBar = document.getElementById('modal-science-subfilter-bar');

    const activeTab = 'flex-1 py-1.5 rounded-md font-semibold transition bg-white text-zinc-900 shadow-xs text-center';
    const inactiveTab = 'flex-1 py-1.5 rounded-md font-medium text-zinc-600 hover:text-zinc-900 transition text-center';

    if (tabApti) tabApti.className = (this.modalSubject === 'aptitude' ? activeTab : inactiveTab);
    if (tabSci) tabSci.className = (this.modalSubject === 'science' ? activeTab : inactiveTab);

    if (sciBar) {
      sciBar.classList.toggle('hidden', this.modalSubject !== 'science');
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
            btn.className = 'px-2 py-0.5 rounded font-semibold bg-zinc-900 text-white transition';
          } else {
            btn.className = 'px-2 py-0.5 rounded font-medium text-zinc-600 hover:text-zinc-900 transition';
          }
        }
      });
    }
  }

  renderModalChapters() {
    const list = document.getElementById('modal-chapters-list');
    if (!list) return;

    let filtered = this.chapters;
    if (this.modalSubject === 'aptitude') {
      filtered = filtered.filter(c => (c.subject || '').includes('Aptitude'));
    } else if (this.modalSubject === 'science') {
      filtered = filtered.filter(c => (c.subject || '').includes('Science'));
      if (this.modalScienceSub !== 'all') {
        filtered = filtered.filter(c => (c.subSubject || '').toLowerCase() === this.modalScienceSub.toLowerCase());
      }
    }

    if (filtered.length === 0) {
      list.innerHTML = `<p class="col-span-full py-8 text-center text-xs text-zinc-400">No chapters found.</p>`;
      return;
    }

    list.innerHTML = filtered.map(ch => {
      let badge = '';
      if ((ch.subject || '').includes('Aptitude')) {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200/60">Apti</span>';
      } else if (ch.subSubject === 'Biology') {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">Bio</span>';
      } else if (ch.subSubject === 'Chemistry') {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200/60">Chem</span>';
      } else if (ch.subSubject === 'Physics') {
        badge = '<span class="text-[9px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200/60">Phys</span>';
      }

      return `
        <div onclick="app.startPracticeFromModal('${ch.name.replace(/'/g, "\\'")}')"
             class="p-2.5 rounded-lg border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 cursor-pointer transition flex items-center justify-between group">
          <div class="overflow-hidden pr-2">
            <div class="flex items-center gap-1.5 mb-0.5">
              ${badge}
              <span class="text-[10px] text-zinc-400 font-mono">${ch.count} Qs</span>
            </div>
            <h4 class="text-xs font-semibold text-zinc-900 group-hover:text-zinc-700 truncate">${ch.name}</h4>
          </div>
          <span class="text-xs text-zinc-300 group-hover:text-zinc-800 transition font-bold">&rarr;</span>
        </div>
      `;
    }).join('');
  }

  startPracticeFromModal(chapterName) {
    this.closeChapterSelectModal();
    let filter = this.modalSubject;
    if (this.modalSubject === 'science' && this.modalScienceSub !== 'all') {
      filter = this.modalScienceSub.toLowerCase();
    }
    this.startPractice(chapterName, filter);
  }

  // ==========================================
  // DATA FETCHING (DUAL MODE: API & STATIC)
  // ==========================================

  async loadChapters() {
    // 1. Try local Express API first
    try {
      const res = await fetch('/api/chapters');
      if (res.ok) {
        const data = await res.json();
        if (data.chapters && data.chapters.length > 0) {
          this.chapters = data.chapters;
          this.updateDashboardBadges(data.totalQuestions, data.totalChapters);
          this.renderChaptersGrid();
          this.populateChapterDropdown();
          return;
        }
      }
    } catch (e) {}

    // 2. Fallback to direct static data loading
    this.isStaticMode = true;
    await this.loadAllQuestionsStatic();
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

      this.chapters = Object.values(chapterMap).sort((a, b) => {
        if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
        return a.name.localeCompare(b.name);
      });

      this.updateDashboardBadges(this.allQuestions.length, this.chapters.length);
      this.renderChaptersGrid();
      this.populateChapterDropdown();
    } catch (err) {
      console.error('Failed to load static questions.json:', err);
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
  }

  // ==========================================
  // SUBJECT FILTERING
  // ==========================================

  setSubjectFilter(filter) {
    this.currentSubjectFilter = filter;
    this.currentSubSubjectFilter = 'all';

    const btnAll = document.getElementById('filter-btn-all');
    const btnApti = document.getElementById('filter-btn-aptitude');
    const btnSci = document.getElementById('filter-btn-science');
    const subBar = document.getElementById('subsubject-filter-bar');

    const activeClass = 'px-2.5 py-1 rounded-md text-xs font-medium transition bg-zinc-900 text-white shadow-xs';
    const inactiveClass = 'px-2.5 py-1 rounded-md text-xs font-medium transition bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300';

    if (btnAll) btnAll.className = (filter === 'all' ? activeClass : inactiveClass);
    if (btnApti) btnApti.className = (filter === 'aptitude' ? activeClass : inactiveClass);
    if (btnSci) btnSci.className = (filter === 'science' ? activeClass : inactiveClass);

    if (subBar) {
      if (filter === 'science') {
        subBar.classList.remove('hidden');
      } else {
        subBar.classList.add('hidden');
      }
    }

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
    return this.chapters.filter(ch => {
      const subj = (ch.subject || '').toLowerCase();
      const subSubj = (ch.subSubject || '').toLowerCase();

      if (this.currentSubjectFilter === 'aptitude') {
        if (!subj.includes('aptitude')) return false;
      } else if (this.currentSubjectFilter === 'science') {
        if (!subj.includes('science')) return false;
        if (this.currentSubSubjectFilter !== 'all') {
          if (subSubj !== this.currentSubSubjectFilter.toLowerCase()) return false;
        }
      }
      return true;
    });
  }

  // ==========================================
  // DASHBOARD RENDERING
  // ==========================================

  renderDashboard() {
    this.renderChaptersGrid();
    this.renderAttemptsHistory();
  }

  renderChaptersGrid() {
    const grid = document.getElementById('chapters-grid');
    if (!grid) return;

    const filtered = this.getFilteredChapters();

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="text-zinc-400 text-xs col-span-full py-8 text-center">No chapters found for selected filter.</p>';
      return;
    }

    grid.innerHTML = filtered.map(ch => {
      const isSci = (ch.subject === 'General Science');
      let badgeHtml = '';
      if (isSci) {
        if (ch.subSubject === 'Biology') {
          badgeHtml = '<span class="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">Bio</span>';
        } else if (ch.subSubject === 'Chemistry') {
          badgeHtml = '<span class="text-[9px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200/60">Chem</span>';
        } else if (ch.subSubject === 'Physics') {
          badgeHtml = '<span class="text-[9px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200/60">Phys</span>';
        } else {
          badgeHtml = '<span class="text-[9px] font-bold uppercase tracking-wider text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded">Sci</span>';
        }
      } else {
        badgeHtml = '<span class="text-[9px] font-bold uppercase tracking-wider text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200/60">Apti</span>';
      }

      return `
        <div onclick="app.startPractice('${ch.name.replace(/'/g, "\\'")}')"
             class="bg-white hover:border-zinc-400 border border-zinc-200 rounded-lg p-3 cursor-pointer transition flex items-center justify-between group">
          <div class="space-y-1 overflow-hidden pr-2">
            <div class="flex items-center gap-1.5">
              ${badgeHtml}
              <span class="text-[11px] text-zinc-400 font-mono">${ch.count} Qs</span>
            </div>
            <h4 class="font-medium text-zinc-900 group-hover:text-zinc-700 text-xs truncate" title="${ch.name}">${ch.name}</h4>
          </div>
          <span class="text-xs text-zinc-300 group-hover:text-zinc-600 transition shrink-0">&rarr;</span>
        </div>
      `;
    }).join('');
  }

  populateChapterDropdown(filterSubject = 'all') {
    const dd = document.getElementById('practice-chapter-dropdown');
    if (!dd) return;

    let chapsToDisplay = [...this.chapters];
    const s = (filterSubject || 'all').toLowerCase();

    if (s === 'aptitude') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subject || '').includes('Aptitude'));
    } else if (s === 'science') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subject || '').includes('Science'));
    } else if (s === 'biology') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subSubject || '').toLowerCase() === 'biology');
    } else if (s === 'chemistry') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subSubject || '').toLowerCase() === 'chemistry');
    } else if (s === 'physics') {
      chapsToDisplay = chapsToDisplay.filter(c => (c.subSubject || '').toLowerCase() === 'physics');
    }

    if (s === 'all') {
      const groups = {
        'Quantitative Aptitude': [],
        'General Science — Biology': [],
        'General Science — Chemistry': [],
        'General Science — Physics': []
      };

      chapsToDisplay.forEach(ch => {
        if ((ch.subject || '').includes('Aptitude')) {
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

  filterPracticeChaptersBySubject(subjectValue) {
    this.practiceSubjectFilter = subjectValue;
    this.populateChapterDropdown(subjectValue);

    const dd = document.getElementById('practice-chapter-dropdown');
    if (!dd) return;

    let hasCurrent = false;
    for (let i = 0; i < dd.options.length; i++) {
      if (dd.options[i].value === this.practice.chapter) {
        hasCurrent = true;
        dd.value = this.practice.chapter;
        break;
      }
    }

    if (!hasCurrent && dd.options.length > 0) {
      this.startPractice(dd.options[0].value, subjectValue);
    }
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

      let modeBadge = '<span class="text-[11px] font-medium text-zinc-700">Mock</span>';
      if (att.mode === 'chapter_test') {
        modeBadge = '<span class="text-[11px] font-medium text-zinc-700">Chapter Test</span>';
      } else if (att.mode === 'practice') {
        modeBadge = '<span class="text-[11px] font-medium text-zinc-500">Practice</span>';
      }

      const accuracy = att.scorePercentage || 0;
      let accBadge = 'text-zinc-700';
      if (accuracy >= 75) accBadge = 'text-emerald-700 font-semibold';
      else if (accuracy >= 50) accBadge = 'text-amber-700 font-semibold';
      else accBadge = 'text-rose-600 font-semibold';

      const mins = Math.floor((att.timeTakenSeconds || 0) / 60);
      const secs = (att.timeTakenSeconds || 0) % 60;
      const timeTakenStr = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;

      return `
        <tr class="hover:bg-zinc-50 transition">
          <td class="py-2.5 px-4 font-normal text-zinc-600 whitespace-nowrap">
            <span>${dateStr}</span> <span class="text-zinc-400 text-[10px] ml-1">${timeStr}</span>
          </td>
          <td class="py-2.5 px-4 whitespace-nowrap">${modeBadge}</td>
          <td class="py-2.5 px-4 font-medium text-zinc-800 whitespace-nowrap">${att.chapter || 'All Chapters'}</td>
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
    if (!this.currentUserEmail) {
      this.switchView('login');
      return;
    }

    if (!chapterName && this.chapters.length > 0) {
      chapterName = this.chapters[0].name;
    }

    // Reset pause trackers
    this.isTestPaused = false;
    this.pauseStartTime = null;
    this.totalPausedDuration = 0;

    // When test starts, enter full screen mode (only in test mode, not study mode!)
    if (this.practice.modeType === 'test') {
      await this.enterFullscreen();
    }

    if (this.isStaticMode || this.allQuestions.length > 0) {
      if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
      const filtered = this.allQuestions.filter(q => q.chapter.toLowerCase() === chapterName.toLowerCase());
      this.initPracticeState(chapterName, filtered, preferredSubjectFilter);
      return;
    }

    try {
      const res = await fetch(`/api/questions?chapter=${encodeURIComponent(chapterName)}`);
      if (res.ok) {
        const data = await res.json();
        this.initPracticeState(chapterName, data.questions || [], preferredSubjectFilter);
        return;
      }
    } catch (err) {}

    this.isStaticMode = true;
    if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
    const filtered = this.allQuestions.filter(q => q.chapter.toLowerCase() === chapterName.toLowerCase());
    this.initPracticeState(chapterName, filtered, preferredSubjectFilter);
  }

  initPracticeState(chapterName, questions, preferredSubjectFilter = null) {
    this.practice.chapter = chapterName;
    this.practice.questions = questions;
    this.practice.currentIndex = 0;
    this.practice.userAnswers = {};
    this.practice.startTime = Date.now();

    const titleEl = document.getElementById('practice-chapter-title');
    if (titleEl) titleEl.textContent = chapterName;

    // Sync the subject dropdown in Chapter Test
    const chInfo = this.chapters.find(c => c.name.toLowerCase() === chapterName.toLowerCase());
    const subjSelect = document.getElementById('practice-subject-dropdown');

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

    const dd = document.getElementById('practice-chapter-dropdown');
    if (dd) dd.value = chapterName;

    this.setPracticeModeType(this.practice.modeType);
    this.switchView('practice');
    this.renderPracticeQuestion();
    this.renderPracticePalette();
  }

  async setPracticeModeType(type) {
    this.practice.modeType = type;

    const btnTest = document.getElementById('toggle-btn-test');
    const btnStudy = document.getElementById('toggle-btn-study');
    const badge = document.getElementById('practice-mode-badge');
    const subtitle = document.getElementById('practice-mode-subtitle');

    if (type === 'test') {
      if (btnTest) btnTest.className = 'px-2.5 py-1 rounded-md bg-white font-medium text-zinc-900 shadow-xs transition';
      if (btnStudy) btnStudy.className = 'px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-900 transition';
      if (badge) badge.textContent = 'Chapter Test';
      if (subtitle) subtitle.textContent = 'Answers revealed on submission (Full Screen)';
      // Enter full screen when switching to test mode
      if (this.currentMode === 'practice') {
        await this.enterFullscreen();
      }
    } else {
      if (btnStudy) btnStudy.className = 'px-2.5 py-1 rounded-md bg-white font-medium text-zinc-900 shadow-xs transition';
      if (btnTest) btnTest.className = 'px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-900 transition';
      if (badge) badge.textContent = 'Study Mode';
      if (subtitle) subtitle.textContent = 'Instant answers & explanation';

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
    if (this.practice.modeType === 'test' && Object.keys(this.practice.userAnswers).length > 0) {
      const ok = confirm('Switching chapters will discard your current chapter test progress. Continue?');
      if (!ok) {
        const dd = document.getElementById('practice-chapter-dropdown');
        if (dd) dd.value = this.practice.chapter;
        return;
      }
    }
    const curFilter = this.practiceSubjectFilter || document.getElementById('practice-subject-dropdown')?.value || 'all';
    this.startPractice(newChap, curFilter);
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
    document.getElementById('practice-progress-text').textContent = `Question ${current} of ${total}`;

    const fillPercent = (current / total) * 100;
    document.getElementById('practice-progress-fill').style.width = `${fillPercent}%`;

    document.getElementById('practice-q-text').textContent = q.question;

    const optContainer = document.getElementById('practice-options-container');
    const selected = this.practice.userAnswers[this.practice.currentIndex];
    const letters = ['A', 'B', 'C', 'D'];

    optContainer.innerHTML = (q.options || []).map((opt, idx) => {
      let cardStyle = 'border-zinc-200 hover:border-zinc-400 bg-white text-zinc-900 shadow-xs';
      let icon = letters[idx];
      let iconStyle = 'border border-zinc-200 text-zinc-600 bg-zinc-50';

      if (isTestMode) {
        if (selected === idx) {
          cardStyle = 'border-zinc-900 bg-zinc-50/80 text-zinc-900 font-medium ring-2 ring-zinc-900 shadow-sm';
          iconStyle = 'bg-zinc-900 text-white border-zinc-900 font-bold';
        }
      } else {
        if (selected !== undefined && selected !== null) {
          if (idx === q.correctAnswer) {
            cardStyle = 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-medium ring-2 ring-emerald-500';
            iconStyle = 'bg-emerald-600 text-white border-emerald-600 font-bold';
            icon = '✓';
          } else if (idx === selected) {
            cardStyle = 'border-rose-400 bg-rose-50/80 text-rose-950 font-medium ring-2 ring-rose-400';
            iconStyle = 'bg-rose-600 text-white border-rose-600 font-bold';
            icon = '✕';
          } else {
            cardStyle = 'border-zinc-200 bg-zinc-50/40 text-zinc-400 opacity-60';
          }
        }
      }

      return `
        <div onclick="app.selectPracticeOption(${idx})"
             class="option-label p-3.5 sm:p-4 rounded-xl border ${cardStyle} cursor-pointer flex items-center gap-3.5 transition">
          <span class="option-badge ${iconStyle}">${icon}</span>
          <span class="option-text flex-1">${opt}</span>
        </div>
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
    if (btnPrev) btnPrev.disabled = (this.practice.currentIndex === 0);
    if (btnNext) {
      if (this.practice.currentIndex === total - 1) {
        btnNext.textContent = 'Submit Test';
      } else {
        btnNext.innerHTML = `<span>Save & Next</span> <span>&rarr;</span>`;
      }
    }

    this.updatePracticeScoreboard();
    this.renderPracticePalette();
  }

  selectPracticeOption(idx) {
    this.practice.userAnswers[this.practice.currentIndex] = idx;
    this.renderPracticeQuestion();
  }

  clearPracticeResponse() {
    delete this.practice.userAnswers[this.practice.currentIndex];
    this.renderPracticeQuestion();
  }

  prevPracticeQuestion() {
    if (this.practice.currentIndex > 0) {
      this.practice.currentIndex--;
      this.renderPracticeQuestion();
    }
  }

  nextPracticeQuestion() {
    const total = this.practice.questions.length;
    if (this.practice.currentIndex < total - 1) {
      this.practice.currentIndex++;
      this.renderPracticeQuestion();
    } else {
      this.promptSubmitChapterTest();
    }
  }

  jumpPracticeQuestion(idx) {
    this.practice.currentIndex = idx;
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
    }
  }

  updatePracticeScoreboard() {
    const total = this.practice.questions.length;
    const answeredCount = Object.keys(this.practice.userAnswers).length;

    const statsEl = document.getElementById('practice-score-stats');
    if (statsEl) {
      statsEl.textContent = `${answeredCount} / ${total} answered`;
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
      const isCurrent = (idx === this.practice.currentIndex);

      let btnClass = 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border-zinc-200';

      if (isAnswered) {
        if (isTestMode) {
          btnClass = 'bg-zinc-900 text-white font-medium border-zinc-900';
        } else {
          btnClass = (selected === q.correctAnswer)
            ? 'bg-emerald-600 text-white font-medium border-emerald-600'
            : 'bg-rose-600 text-white font-medium border-rose-600';
        }
      }

      const ringClass = isCurrent ? 'ring-2 ring-zinc-800 ring-offset-1' : '';

      return `
        <button onclick="app.jumpPracticeQuestion(${idx})"
                class="w-full py-1.5 rounded text-xs border ${btnClass} ${ringClass} transition">
          ${idx + 1}
        </button>
      `;
    }).join('');
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
    this.hideTestPausedModal();
    this.exitFullscreen();
    const elapsedMs = (Date.now() - (this.practice.startTime || Date.now())) - this.totalPausedDuration;
    const timeTakenSeconds = Math.max(1, Math.round(elapsedMs / 1000));

    const answersPayload = this.practice.questions.map((q, idx) => ({
      questionId: q.id,
      userAnswer: this.practice.userAnswers[idx] !== undefined ? this.practice.userAnswers[idx] : null
    }));

    if (this.isStaticMode || this.allQuestions.length > 0) {
      const attempt = this.calculateAttemptLocally({
        mode: 'chapter_test',
        chapter: this.practice.chapter,
        timeTakenSeconds,
        answers: answersPayload
      });

      this.saveAttempt(attempt);
      this.syncToGoogleSheet(attempt);
      this.renderResults(attempt);
      return;
    }

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

      const data = await res.json();
      if (data.success && data.attempt) {
        this.saveAttempt(data.attempt);
        this.syncToGoogleSheet(data.attempt);
        this.renderResults(data.attempt);
      } else {
        alert('Failed to submit chapter test.');
      }
    } catch (err) {
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

  async startMockTest(subject = 'all') {
    this.isTestPaused = false;
    this.pauseStartTime = null;
    this.totalPausedDuration = 0;

    // When test start enter full screen mode!
    await this.enterFullscreen();

    if (this.isStaticMode || this.allQuestions.length > 0) {
      if (this.allQuestions.length === 0) await this.loadAllQuestionsStatic();
      const mockQuestions = this.generateMockQuestionsStatic(30, subject);
      this.initMockState(mockQuestions, subject);
      return;
    }

    try {
      const url = (subject && subject !== 'all') ? `/api/mock?subject=${encodeURIComponent(subject)}` : '/api/mock';
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
    let pool = [...this.allQuestions];
    if (subject === 'aptitude') {
      pool = pool.filter(q => (q.subject || '').toLowerCase().includes('aptitude'));
    } else if (subject === 'science') {
      pool = pool.filter(q => (q.subject || '').toLowerCase().includes('science'));
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
    this.mock.timeLeftSeconds = 1800; // 30 minutes
    this.mock.startTime = Date.now();

    this.switchView('mock');
    this.renderMockQuestion();
    this.updateMockPalette();
    this.startMockTimer();
  }

  startMockTimer() {
    this.clearMockTimer();
    const timerDisplay = document.getElementById('mock-timer-display');
    const timerContainer = document.getElementById('mock-timer-container');

    const updateTimerUI = () => {
      const mins = Math.floor(this.mock.timeLeftSeconds / 60);
      const secs = this.mock.timeLeftSeconds % 60;
      const str = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      if (timerDisplay) timerDisplay.textContent = str;

      if (timerContainer) {
        if (this.mock.timeLeftSeconds <= 60) {
          timerContainer.className = 'flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 text-rose-700 font-mono font-bold';
        } else if (this.mock.timeLeftSeconds <= 300) {
          timerContainer.className = 'flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 text-amber-700 font-mono font-bold';
        } else {
          timerContainer.className = 'flex items-center gap-1.5 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200 text-zinc-800 font-mono font-medium';
        }
      }
    };

    updateTimerUI();

    this.mock.timerInterval = setInterval(() => {
      this.mock.timeLeftSeconds--;
      updateTimerUI();

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

    const total = this.mock.questions.length;
    const current = this.mock.currentIndex + 1;

    const chapDisplay = q.subSubject && q.subSubject !== q.chapter ? `${q.subSubject} • ${q.chapter}` : q.chapter;

    document.getElementById('mock-q-number').textContent = `Question ${current} of ${total}`;
    document.getElementById('mock-q-chapter').textContent = chapDisplay;

    const isMarked = !!this.mock.reviewFlags[q.id];
    const reviewBtn = document.getElementById('mock-btn-review-toggle');
    const reviewLabel = document.getElementById('mock-review-toggle-label');
    if (reviewBtn && reviewLabel) {
      if (isMarked) {
        reviewBtn.className = 'px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-medium transition';
        reviewLabel.textContent = '★ Marked for Review';
      } else {
        reviewBtn.className = 'px-2.5 py-1 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-[11px] font-medium transition';
        reviewLabel.textContent = '☆ Mark for Review';
      }
    }

    const mobileReviewBtn = document.getElementById('mock-mobile-btn-review');
    if (mobileReviewBtn) {
      if (isMarked) {
        mobileReviewBtn.className = 'px-3 py-2.5 rounded-lg bg-amber-400 text-zinc-950 font-bold text-xs text-center shadow-xs transition';
        mobileReviewBtn.textContent = '★ Review';
      } else {
        mobileReviewBtn.className = 'px-3 py-2.5 rounded-lg border border-zinc-200 text-zinc-600 text-xs text-center active:bg-zinc-100 transition';
        mobileReviewBtn.textContent = 'Review';
      }
    }

    document.getElementById('mock-q-text').textContent = q.question;

    const optContainer = document.getElementById('mock-options-container');
    const selectedOption = this.mock.userAnswers[q.id];
    const letters = ['A', 'B', 'C', 'D'];

    optContainer.innerHTML = (q.options || []).map((opt, idx) => {
      const isSelected = (selectedOption === idx);
      const cardStyle = isSelected
        ? 'border-zinc-900 bg-zinc-50/80 text-zinc-900 font-medium ring-2 ring-zinc-900 shadow-sm'
        : 'border-zinc-200 hover:border-zinc-400 bg-white text-zinc-900 shadow-xs';

      const iconStyle = isSelected
        ? 'bg-zinc-900 text-white border-zinc-900 font-bold'
        : 'border border-zinc-200 text-zinc-600 bg-zinc-50';

      return `
        <label onclick="app.selectMockOption(${idx})"
               class="option-label p-3.5 sm:p-4 rounded-xl border ${cardStyle} cursor-pointer flex items-center gap-3.5 transition">
          <input type="radio" name="mock_option" value="${idx}" ${isSelected ? 'checked' : ''} class="hidden">
          <span class="option-badge ${iconStyle}">${letters[idx]}</span>
          <span class="option-text flex-1">${opt}</span>
        </label>
      `;
    }).join('');

    const btnPrev = document.getElementById('mock-btn-prev');
    const btnNext = document.getElementById('mock-btn-next');
    if (btnPrev) btnPrev.disabled = (this.mock.currentIndex === 0);
    if (btnNext) {
      btnNext.innerHTML = (this.mock.currentIndex === total - 1) ? 'Review & Submit' : `<span>Save & Next</span> <span>&rarr;</span>`;
    }

    this.updateMockPalette();
  }

  selectMockOption(idx) {
    const q = this.mock.questions[this.mock.currentIndex];
    if (!q) return;
    this.mock.userAnswers[q.id] = idx;
    this.renderMockQuestion();
  }

  clearMockResponse() {
    const q = this.mock.questions[this.mock.currentIndex];
    if (!q) return;
    delete this.mock.userAnswers[q.id];
    this.renderMockQuestion();
  }

  toggleMockReview() {
    const q = this.mock.questions[this.mock.currentIndex];
    if (!q) return;
    this.mock.reviewFlags[q.id] = !this.mock.reviewFlags[q.id];
    this.renderMockQuestion();
  }

  prevMockQuestion() {
    if (this.mock.currentIndex > 0) {
      this.mock.currentIndex--;
      this.renderMockQuestion();
    }
  }

  nextMockQuestion() {
    const total = this.mock.questions.length;
    if (this.mock.currentIndex < total - 1) {
      this.mock.currentIndex++;
      this.renderMockQuestion();
    } else {
      this.promptSubmitMock();
    }
  }

  jumpMockQuestion(idx) {
    this.mock.currentIndex = idx;
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
    }
  }

  updateMockPalette() {
    const grid = document.getElementById('mock-palette-grid');
    if (!grid) return;

    let answeredCount = 0;
    let reviewCount = 0;
    let unansweredCount = 0;

    grid.innerHTML = this.mock.questions.map((q, idx) => {
      const isAnswered = (this.mock.userAnswers[q.id] !== undefined && this.mock.userAnswers[q.id] !== null);
      const isReview = !!this.mock.reviewFlags[q.id];
      const isCurrent = (idx === this.mock.currentIndex);

      if (isReview) reviewCount++;
      if (isAnswered) answeredCount++;
      else unansweredCount++;

      let btnClass = 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border-zinc-200';
      if (isReview) {
        btnClass = 'bg-amber-400 text-zinc-950 font-medium border-amber-500';
      } else if (isAnswered) {
        btnClass = 'bg-zinc-900 text-white font-medium border-zinc-900';
      }

      const ringClass = isCurrent ? 'ring-2 ring-zinc-800 ring-offset-1' : '';

      return `
        <button onclick="app.jumpMockQuestion(${idx})"
                class="w-full py-1.5 rounded text-xs border ${btnClass} ${ringClass} transition">
          ${idx + 1}
        </button>
      `;
    }).join('');

    const legAns = document.getElementById('legend-answered');
    const legUnans = document.getElementById('legend-unanswered');
    const legRev = document.getElementById('legend-review');
    if (legAns) legAns.textContent = answeredCount;
    if (legUnans) legUnans.textContent = unansweredCount;
    if (legRev) legRev.textContent = reviewCount;

    const mobPalText = document.getElementById('mock-mobile-palette-btn-text');
    if (mobPalText) mobPalText.textContent = `Palette (${answeredCount}/30)`;
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
    this.hideTestPausedModal();
    this.exitFullscreen();
    const timeTakenSeconds = 1800 - Math.max(0, this.mock.timeLeftSeconds);

    const answersPayload = this.mock.questions.map(q => ({
      questionId: q.id,
      userAnswer: this.mock.userAnswers[q.id] !== undefined ? this.mock.userAnswers[q.id] : null
    }));

    if (this.isStaticMode || this.allQuestions.length > 0) {
      const attempt = this.calculateAttemptLocally({
        mode: 'mock',
        chapter: null,
        timeTakenSeconds,
        answers: answersPayload
      });

      this.saveAttempt(attempt);
      this.syncToGoogleSheet(attempt);
      this.renderResults(attempt);
      return;
    }

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

      const data = await res.json();
      if (data.success && data.attempt) {
        this.saveAttempt(data.attempt);
        this.syncToGoogleSheet(data.attempt);
        this.renderResults(data.attempt);
      } else {
        alert('Failed to submit test. Please check server status.');
      }
    } catch (err) {
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
  }

  // ==========================================
  // LOCAL ATTEMPT CALCULATION & STORAGE
  // ==========================================

  calculateAttemptLocally({ mode, chapter, timeTakenSeconds, answers }) {
    const detailedAnswers = answers.map(ans => {
      const q = this.allQuestions.find(item => item.id === ans.questionId);
      const isCorrect = (ans.userAnswer !== null && ans.userAnswer !== undefined && q && ans.userAnswer === q.correctAnswer);
      return {
        questionId: ans.questionId,
        chapter: q ? q.chapter : (chapter || 'General'),
        subject: q ? q.subject : undefined,
        subSubject: q ? q.subSubject : undefined,
        question: q ? q.question : '',
        options: q ? q.options : [],
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
      this.attempts.unshift(attempt);
      
      // Save to global attempts array in localStorage
      let all = [];
      try {
        const stored = localStorage.getItem('apti_attempts');
        if (stored) all = JSON.parse(stored);
      } catch (e) {}
      
      all.unshift(attempt);
      localStorage.setItem('apti_attempts', JSON.stringify(all));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
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
      const res = await fetch(`/api/attempts/${attemptId}`);
      const data = await res.json();
      if (data.attemptId) {
        this.renderResults(data);
      } else {
        alert('Attempt record not found.');
      }
    } catch (err) {
      console.error('Failed to load past attempt:', err);
    }
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
      titleEl.textContent = `Score: ${attempt.correctCount} / ${attempt.totalQuestions} (${attempt.scorePercentage}%)`;
    }

    const feedbackEl = document.getElementById('result-feedback-message');
    if (feedbackEl) {
      const pct = attempt.scorePercentage || 0;
      if (pct >= 85) feedbackEl.textContent = 'Outstanding accuracy. Concepts are well-cemented.';
      else if (pct >= 70) feedbackEl.textContent = 'Strong performance. Review occasional misses below.';
      else if (pct >= 50) feedbackEl.textContent = 'Satisfactory. Read through the step-by-step solutions below.';
      else feedbackEl.textContent = 'Focus on reviewing the missed questions and their formulas below.';
    }

    document.getElementById('res-correct').textContent = attempt.correctCount;
    document.getElementById('res-incorrect').textContent = attempt.incorrectCount;
    document.getElementById('res-unattempted').textContent = attempt.unattemptedCount;

    const mins = Math.floor((attempt.timeTakenSeconds || 0) / 60);
    const secs = (attempt.timeTakenSeconds || 0) % 60;
    document.getElementById('res-time-taken').textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    this.renderChapterBreakdown(attempt.chapterBreakdown || {});

    const detailed = attempt.detailedAnswers || [];
    document.getElementById('filter-count-all').textContent = detailed.length;
    document.getElementById('filter-count-correct').textContent = detailed.filter(a => a.isCorrect).length;
    document.getElementById('filter-count-incorrect').textContent = detailed.filter(a => a.userAnswer !== null && !a.isCorrect).length;
    document.getElementById('filter-count-unattempted').textContent = detailed.filter(a => a.userAnswer === null).length;

    this.renderReviewQuestionsList();
    this.switchView('results');
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
      let barColor = 'bg-zinc-900';
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
            <span class="option-text flex-1 font-normal">${opt}</span>
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
              <span class="text-zinc-500">${item.chapter}</span>
            </div>
            ${statusTag}
          </div>

          <div class="text-zinc-950 font-medium text-[15px] sm:text-[16px] question-content leading-relaxed">
            ${item.question}
          </div>

          <div class="space-y-1.5 pt-1">
            ${optionsHtml}
          </div>

          <div class="bg-zinc-50 border border-zinc-100 rounded-lg p-3 text-xs text-zinc-600 space-y-1">
            <span class="font-medium text-zinc-900 block text-[11px] uppercase tracking-wider">Solution:</span>
            <p class="leading-relaxed">${item.explanation || 'Option ' + letters[item.correctAnswer]}</p>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Global app instance
const app = new AptiPrepApp();
