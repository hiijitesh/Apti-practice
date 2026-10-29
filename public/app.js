// public/app.js - AptiPrep CBT Engine Frontend Logic

class AptiPrepApp {
  constructor() {
    this.chapters = [];
    this.attempts = [];
    this.currentMode = 'dashboard';

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

    this.init();
  }

  async init() {
    await this.loadChapters();
    await this.loadAttempts();
    this.renderDashboard();
  }

  // View Switching
  switchView(viewName) {
    this.currentMode = viewName;
    const views = ['dashboard', 'practice', 'mock', 'results'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== viewName);
    });

    const btnHome = document.getElementById('nav-btn-home');
    const btnPractice = document.getElementById('nav-btn-practice');

    if (btnHome) btnHome.classList.toggle('bg-slate-100', viewName === 'dashboard');
    if (btnPractice) btnPractice.classList.toggle('bg-slate-100', viewName === 'practice');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showDashboard() {
    if (this.mock.timerInterval) {
      if (!confirm('You have an ongoing mock test. Leaving will abandon the current test. Continue?')) {
        return;
      }
      this.clearMockTimer();
    }
    this.loadAttempts();
    this.switchView('dashboard');
  }

  showChapterSelect() {
    this.showDashboard();
    setTimeout(() => {
      const grid = document.getElementById('chapters-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  // ==========================================
  // DATA FETCHING
  // ==========================================

  async loadChapters() {
    try {
      const res = await fetch('/api/chapters');
      const data = await res.json();
      this.chapters = data.chapters || [];
      const badge = document.getElementById('total-questions-badge');
      if (badge) {
        badge.textContent = `${data.totalQuestions.toLocaleString()} Total Questions`;
      }
      this.renderChaptersGrid();
      this.populateChapterDropdown();
    } catch (err) {
      console.error('Failed to load chapters:', err);
    }
  }

  async loadAttempts() {
    try {
      const res = await fetch('/api/attempts');
      const data = await res.json();
      this.attempts = data.attempts || [];
      this.renderAttemptsHistory();
    } catch (err) {
      console.error('Failed to load attempts:', err);
    }
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

    if (this.chapters.length === 0) {
      grid.innerHTML = '<p class="text-slate-400 col-span-full">No chapters found.</p>';
      return;
    }

    grid.innerHTML = this.chapters.map(ch => `
      <div onclick="app.startPractice('${ch.name.replace(/'/g, "\\'")}')"
           class="group bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-xl p-3.5 cursor-pointer transition flex flex-col justify-between">
        <div>
          <h4 class="font-bold text-slate-800 group-hover:text-indigo-700 text-sm line-clamp-1">${ch.name}</h4>
          <span class="text-xs text-slate-500 mt-0.5 block">${ch.count} questions</span>
        </div>
        <div class="mt-3 flex items-center justify-between text-xs font-semibold text-indigo-600 opacity-80 group-hover:opacity-100">
          <span>Start Test</span>
          <svg class="w-3.5 h-3.5 transform group-hover:translate-x-1 transition" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path></svg>
        </div>
      </div>
    `).join('');
  }

  populateChapterDropdown() {
    const dd = document.getElementById('practice-chapter-dropdown');
    if (!dd) return;
    dd.innerHTML = this.chapters.map(ch => `
      <option value="${ch.name}">${ch.name} (${ch.count} Qs)</option>
    `).join('');
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
        <span class="bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded-md">Tests Taken: ${totalTests}</span>
        <span class="bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-md">Avg Score: ${avgScore}%</span>
        <span class="bg-amber-50 text-amber-700 font-semibold px-2.5 py-1 rounded-md">Best: ${bestScore}%</span>
      `;
    }

    tbody.innerHTML = this.attempts.map(att => {
      const date = new Date(att.timestamp);
      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

      let modeBadge = '<span class="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase">Mock Test</span>';
      if (att.mode === 'chapter_test') {
        modeBadge = '<span class="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase">Chapter Test</span>';
      } else if (att.mode === 'practice') {
        modeBadge = '<span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase">Practice</span>';
      }

      const accuracy = att.scorePercentage || 0;
      let accBadge = 'bg-slate-100 text-slate-700';
      if (accuracy >= 75) accBadge = 'bg-emerald-100 text-emerald-800 font-bold';
      else if (accuracy >= 50) accBadge = 'bg-amber-100 text-amber-800 font-bold';
      else accBadge = 'bg-rose-100 text-rose-800 font-bold';

      const mins = Math.floor((att.timeTakenSeconds || 0) / 60);
      const secs = (att.timeTakenSeconds || 0) % 60;
      const timeTakenStr = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;

      return `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
            <div>${dateStr}</div>
            <div class="text-xs text-slate-400 font-normal">${timeStr}</div>
          </td>
          <td class="py-3.5 px-4 whitespace-nowrap">${modeBadge}</td>
          <td class="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">${att.chapter || 'All Chapters'}</td>
          <td class="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
            ${att.correctCount} / ${att.totalQuestions}
          </td>
          <td class="py-3.5 px-4 whitespace-nowrap">
            <span class="text-xs px-2 py-0.5 rounded-full ${accBadge}">${accuracy}%</span>
          </td>
          <td class="py-3.5 px-4 text-slate-600 font-mono text-xs whitespace-nowrap">${timeTakenStr}</td>
          <td class="py-3.5 px-4 text-right whitespace-nowrap">
            <button onclick="app.viewPastAttempt('${att.attemptId}')" class="px-3 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-semibold text-xs rounded-lg transition">
              Review
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ==========================================
  // MODE 1: CHAPTER TEST / PRACTICE
  // ==========================================

  async startPractice(chapterName) {
    if (!chapterName && this.chapters.length > 0) {
      chapterName = this.chapters[0].name;
    }

    try {
      const res = await fetch(`/api/questions?chapter=${encodeURIComponent(chapterName)}`);
      const data = await res.json();

      this.practice.chapter = chapterName;
      this.practice.questions = data.questions || [];
      this.practice.currentIndex = 0;
      this.practice.userAnswers = {};
      this.practice.startTime = Date.now();

      const titleEl = document.getElementById('practice-chapter-title');
      if (titleEl) titleEl.textContent = chapterName;

      const dd = document.getElementById('practice-chapter-dropdown');
      if (dd) dd.value = chapterName;

      this.setPracticeModeType(this.practice.modeType);
      this.switchView('practice');
      this.renderPracticeQuestion();
      this.renderPracticePalette();
    } catch (err) {
      console.error('Failed to load chapter questions:', err);
      alert('Error loading questions for ' + chapterName);
    }
  }

  setPracticeModeType(type) {
    this.practice.modeType = type;

    const btnTest = document.getElementById('toggle-btn-test');
    const btnStudy = document.getElementById('toggle-btn-study');
    const badge = document.getElementById('practice-mode-badge');
    const subtitle = document.getElementById('practice-mode-subtitle');

    if (type === 'test') {
      if (btnTest) btnTest.className = 'px-3 py-1.5 rounded-lg bg-white text-indigo-700 shadow-xs font-bold transition';
      if (btnStudy) btnStudy.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition font-medium';
      if (badge) {
        badge.className = 'text-xs bg-indigo-100 text-indigo-800 font-bold px-2.5 py-0.5 rounded-full uppercase';
        badge.textContent = 'Chapter Test';
      }
      if (subtitle) subtitle.textContent = 'Answers & solutions shown upon submission';
    } else {
      if (btnStudy) btnStudy.className = 'px-3 py-1.5 rounded-lg bg-white text-emerald-700 shadow-xs font-bold transition';
      if (btnTest) btnTest.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition font-medium';
      if (badge) {
        badge.className = 'text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full uppercase';
        badge.textContent = 'Study Mode';
      }
      if (subtitle) subtitle.textContent = 'Instant answers & step-by-step explanations';
    }

    this.renderPracticeQuestion();
    this.renderPracticePalette();
  }

  switchPracticeChapter(newChap) {
    this.startPractice(newChap);
  }

  renderPracticeQuestion() {
    const q = this.practice.questions[this.practice.currentIndex];
    if (!q) return;

    const total = this.practice.questions.length;
    const current = this.practice.currentIndex + 1;
    const isTestMode = (this.practice.modeType === 'test');

    // Header info
    document.getElementById('practice-q-number').textContent = `Question ${current} of ${total}`;
    document.getElementById('practice-q-chapter').textContent = q.chapter;
    document.getElementById('practice-progress-text').textContent = `Question ${current} of ${total}`;

    // Progress bar fill
    const fillPercent = (current / total) * 100;
    document.getElementById('practice-progress-fill').style.width = `${fillPercent}%`;

    // Question text (clean English, no Hindi)
    document.getElementById('practice-q-text').textContent = q.question;

    // Options Container
    const optContainer = document.getElementById('practice-options-container');
    const selected = this.practice.userAnswers[this.practice.currentIndex];
    const letters = ['A', 'B', 'C', 'D'];

    optContainer.innerHTML = (q.options || []).map((opt, idx) => {
      let cardStyle = 'border-slate-200 hover:border-slate-300 bg-white text-slate-800';
      let icon = letters[idx];
      let iconStyle = 'bg-slate-100 text-slate-600';

      if (isTestMode) {
        // IN TEST MODE: Only show that this option is selected. DO NOT show correct or wrong!
        if (selected === idx) {
          cardStyle = 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-semibold ring-1 ring-indigo-600';
          iconStyle = 'bg-indigo-600 text-white';
        }
      } else {
        // IN STUDY MODE: Show instant feedback
        if (selected !== undefined && selected !== null) {
          if (idx === q.correctAnswer) {
            cardStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold ring-1 ring-emerald-500';
            iconStyle = 'bg-emerald-600 text-white';
            icon = '✓';
          } else if (idx === selected) {
            cardStyle = 'border-rose-500 bg-rose-50 text-rose-900 font-semibold ring-1 ring-rose-500';
            iconStyle = 'bg-rose-600 text-white';
            icon = '✕';
          } else {
            cardStyle = 'border-slate-200 bg-slate-50/50 text-slate-400 opacity-60';
          }
        }
      }

      return `
        <div onclick="app.selectPracticeOption(${idx})"
             class="option-label p-4 rounded-xl border ${cardStyle} cursor-pointer flex items-center gap-3">
          <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${iconStyle}">${icon}</span>
          <span class="text-sm font-medium leading-normal">${opt}</span>
        </div>
      `;
    }).join('');

    // Explanation Box (Only shown in Study Mode after an answer is chosen)
    const expBox = document.getElementById('practice-explanation-box');
    if (!isTestMode && selected !== undefined && selected !== null) {
      expBox.classList.remove('hidden');
      const isCorrect = (selected === q.correctAnswer);
      const badge = document.getElementById('practice-eval-badge');
      const correctLabel = document.getElementById('practice-eval-correct-label');
      const expText = document.getElementById('practice-explanation-text');

      if (isCorrect) {
        expBox.className = 'mt-6 p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900';
        badge.className = 'text-xs font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-600 text-white';
        badge.textContent = 'Correct';
      } else {
        expBox.className = 'mt-6 p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900';
        badge.className = 'text-xs font-bold px-2 py-0.5 rounded-full uppercase bg-rose-600 text-white';
        badge.textContent = 'Incorrect';
      }

      correctLabel.textContent = `Correct Answer: Option ${letters[q.correctAnswer] || 'A'}`;
      expText.textContent = q.explanation || 'No detailed explanation provided.';
    } else {
      expBox.classList.add('hidden');
    }

    // Previous / Next button states
    const btnPrev = document.getElementById('practice-btn-prev');
    const btnNext = document.getElementById('practice-btn-next');
    if (btnPrev) btnPrev.disabled = (this.practice.currentIndex === 0);
    if (btnNext) {
      if (this.practice.currentIndex === total - 1) {
        btnNext.innerHTML = `<span>Submit Chapter Test</span>`;
      } else {
        btnNext.innerHTML = `<span>Save & Next</span><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path></svg>`;
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
      // Last question reached - prompt to submit chapter test!
      this.promptSubmitChapterTest();
    }
  }

  jumpPracticeQuestion(idx) {
    this.practice.currentIndex = idx;
    this.renderPracticeQuestion();
  }

  togglePracticeDrawer() {
    const panel = document.getElementById('practice-drawer-panel');
    if (panel) {
      this.practice.drawerOpen = !this.practice.drawerOpen;
      panel.classList.toggle('hidden', !this.practice.drawerOpen);
    }
  }

  updatePracticeScoreboard() {
    const total = this.practice.questions.length;
    const answeredCount = Object.keys(this.practice.userAnswers).length;

    const statsEl = document.getElementById('practice-score-stats');
    if (statsEl) {
      statsEl.textContent = `Answered: ${answeredCount} / ${total}`;
    }

    const summaryEl = document.getElementById('practice-palette-summary');
    if (summaryEl) summaryEl.textContent = `${answeredCount} of ${total} Answered`;
  }

  renderPracticePalette() {
    const grid = document.getElementById('practice-palette-grid');
    if (!grid) return;

    const isTestMode = (this.practice.modeType === 'test');

    grid.innerHTML = this.practice.questions.map((q, idx) => {
      const selected = this.practice.userAnswers[idx];
      const isAnswered = (selected !== undefined && selected !== null);
      const isCurrent = (idx === this.practice.currentIndex);

      let btnClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200';

      if (isAnswered) {
        if (isTestMode) {
          // In test mode, all answered buttons are cleanly marked in indigo
          btnClass = 'bg-indigo-600 text-white font-bold border-indigo-700';
        } else {
          // In study mode, show green/red
          btnClass = (selected === q.correctAnswer)
            ? 'bg-emerald-500 text-white font-bold border-emerald-600'
            : 'bg-rose-500 text-white font-bold border-rose-600';
        }
      }

      const ringClass = isCurrent ? 'ring-2 ring-indigo-500 ring-offset-2' : '';

      return `
        <button onclick="app.jumpPracticeQuestion(${idx})"
                class="palette-btn w-full py-2 rounded-lg text-xs font-semibold border ${btnClass} ${ringClass} transition">
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
      `Submit Chapter Test for "${this.practice.chapter}"?\n\n• Answered: ${answered}\n• Unanswered: ${unanswered}\n• Total Questions: ${total}\n\nUpon submission, your full score, correct answers, and step-by-step solutions will be shown.`
    );

    if (confirmed) {
      this.executeChapterTestSubmission();
    }
  }

  async executeChapterTestSubmission() {
    const timeTakenSeconds = Math.round((Date.now() - (this.practice.startTime || Date.now())) / 1000);

    const answersPayload = this.practice.questions.map((q, idx) => ({
      questionId: q.id,
      userAnswer: this.practice.userAnswers[idx] !== undefined ? this.practice.userAnswers[idx] : null
    }));

    try {
      const res = await fetch('/api/submit-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chapter_test',
          chapter: this.practice.chapter,
          timeTakenSeconds,
          answers: answersPayload
        })
      });

      const data = await res.json();
      if (data.success && data.attempt) {
        // Display full results & review screen with correct answers!
        this.renderResults(data.attempt);
      } else {
        alert('Failed to submit chapter test.');
      }
    } catch (err) {
      console.error('Error submitting chapter test:', err);
      alert('Error submitting chapter test answers.');
    }
  }

  // ==========================================
  // MODE 2: FULL MOCK TEST (CBT EXAM PORTAL)
  // ==========================================

  startMockTestPrompt() {
    const confirmed = confirm(
      "Ready to start the Full Mock Test?\n\n• 30 Questions uniformly distributed across all chapters\n• 30 Minutes countdown timer (1 min per question)\n• Auto-submits when time expires\n\nClick OK to begin."
    );
    if (confirmed) {
      this.startMockTest();
    }
  }

  async startMockTest() {
    try {
      const res = await fetch('/api/mock');
      const data = await res.json();

      if (!data.questions || data.questions.length === 0) {
        alert('No questions available to generate mock test.');
        return;
      }

      this.mock.questions = data.questions;
      this.mock.currentIndex = 0;
      this.mock.userAnswers = {};
      this.mock.reviewFlags = {};
      this.mock.timeLeftSeconds = 1800; // 30 minutes
      this.mock.startTime = Date.now();

      this.switchView('mock');
      this.renderMockQuestion();
      this.updateMockPalette();
      this.startMockTimer();
    } catch (err) {
      console.error('Failed to start mock test:', err);
      alert('Error starting mock test. Please ensure questions are extracted.');
    }
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
          timerContainer.className = 'flex items-center gap-2 bg-rose-600 px-4 py-2 rounded-xl border border-rose-500 shadow-inner timer-critical';
        } else if (this.mock.timeLeftSeconds <= 300) {
          timerContainer.className = 'flex items-center gap-2 bg-amber-600 px-4 py-2 rounded-xl border border-amber-500 shadow-inner';
        } else {
          timerContainer.className = 'flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 shadow-inner';
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

    // Header info
    document.getElementById('mock-q-number').textContent = `Question ${current} of ${total}`;
    document.getElementById('mock-q-chapter').textContent = q.chapter;

    // Review Toggle Button
    const isMarked = !!this.mock.reviewFlags[q.id];
    const reviewBtn = document.getElementById('mock-btn-review-toggle');
    const reviewLabel = document.getElementById('mock-review-toggle-label');
    if (reviewBtn && reviewLabel) {
      if (isMarked) {
        reviewBtn.className = 'px-3 py-1.5 rounded-lg bg-purple-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition';
        reviewLabel.textContent = 'Marked for Review';
      } else {
        reviewBtn.className = 'px-3 py-1.5 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-semibold flex items-center gap-1.5 transition';
        reviewLabel.textContent = 'Mark for Review';
      }
    }

    // Question Text (clean English)
    document.getElementById('mock-q-text').textContent = q.question;

    // Options Container
    const optContainer = document.getElementById('mock-options-container');
    const selectedOption = this.mock.userAnswers[q.id];
    const letters = ['A', 'B', 'C', 'D'];

    optContainer.innerHTML = (q.options || []).map((opt, idx) => {
      const isSelected = (selectedOption === idx);
      const cardStyle = isSelected
        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-semibold ring-1 ring-indigo-600'
        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800';

      return `
        <label onclick="app.selectMockOption(${idx})"
               class="option-label p-4 rounded-xl border ${cardStyle} cursor-pointer flex items-center gap-3">
          <input type="radio" name="mock_option" value="${idx}" ${isSelected ? 'checked' : ''} class="hidden">
          <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
            isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
          }">${letters[idx]}</span>
          <span class="text-sm font-medium leading-normal">${opt}</span>
        </label>
      `;
    }).join('');

    // Previous / Next button states
    const btnPrev = document.getElementById('mock-btn-prev');
    const btnNext = document.getElementById('mock-btn-next');
    if (btnPrev) btnPrev.disabled = (this.mock.currentIndex === 0);
    if (btnNext) {
      btnNext.textContent = (this.mock.currentIndex === total - 1) ? 'Review & Submit' : 'Save & Next';
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

      let btnClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200';
      if (isReview) {
        btnClass = 'bg-purple-600 text-white font-bold border-purple-700';
      } else if (isAnswered) {
        btnClass = 'bg-emerald-500 text-white font-bold border-emerald-600';
      }

      const ringClass = isCurrent ? 'ring-2 ring-indigo-500 ring-offset-2' : '';

      return `
        <button onclick="app.jumpMockQuestion(${idx})"
                class="palette-btn w-full py-2.5 rounded-lg text-xs font-semibold border ${btnClass} ${ringClass} transition">
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
    this.closeSubmitModal();
    this.clearMockTimer();
    this.executeMockSubmission();
  }

  autoSubmitMock() {
    this.closeSubmitModal();
    this.clearMockTimer();
    this.executeMockSubmission();
  }

  async executeMockSubmission() {
    const timeTakenSeconds = 1800 - Math.max(0, this.mock.timeLeftSeconds);

    const answersPayload = this.mock.questions.map(q => ({
      questionId: q.id,
      userAnswer: this.mock.userAnswers[q.id] !== undefined ? this.mock.userAnswers[q.id] : null
    }));

    try {
      const res = await fetch('/api/submit-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'mock',
          chapter: null,
          timeTakenSeconds,
          answers: answersPayload
        })
      });

      const data = await res.json();
      if (data.success && data.attempt) {
        this.renderResults(data.attempt);
      } else {
        alert('Failed to submit test. Please check server status.');
      }
    } catch (err) {
      console.error('Submission error:', err);
      alert('Error submitting test answers.');
    }
  }

  // ==========================================
  // VIEW 4: RESULTS & REVIEW SCREEN
  // ==========================================

  async viewPastAttempt(attemptId) {
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
    this.results.attempt = attempt;
    this.results.currentFilter = 'all';

    // Banner details
    const modeTag = document.getElementById('result-mode-tag');
    if (modeTag) {
      if (attempt.mode === 'mock') {
        modeTag.textContent = 'Full Mock Test';
        modeTag.className = 'text-xs bg-indigo-100 text-indigo-800 font-bold px-2.5 py-0.5 rounded-full uppercase';
      } else if (attempt.mode === 'chapter_test') {
        modeTag.textContent = `Chapter Test: ${attempt.chapter}`;
        modeTag.className = 'text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full uppercase';
      } else {
        modeTag.textContent = `Practice: ${attempt.chapter || 'Chapter'}`;
        modeTag.className = 'text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full uppercase';
      }
    }

    const timeEl = document.getElementById('result-timestamp');
    if (timeEl) {
      const d = new Date(attempt.timestamp);
      timeEl.textContent = d.toLocaleString();
    }

    const titleEl = document.getElementById('result-score-title');
    if (titleEl) {
      titleEl.textContent = `Score: ${attempt.correctCount} / ${attempt.totalQuestions} (${attempt.scorePercentage}%)`;
    }

    const feedbackEl = document.getElementById('result-feedback-message');
    if (feedbackEl) {
      const pct = attempt.scorePercentage || 0;
      if (pct >= 85) feedbackEl.textContent = 'Outstanding result! You demonstrated mastery of these concepts.';
      else if (pct >= 70) feedbackEl.textContent = 'Great score! Solid grasp of concepts, keep refining tricky questions.';
      else if (pct >= 50) feedbackEl.textContent = 'Decent effort. Check the detailed explanations below to learn the solutions.';
      else feedbackEl.textContent = 'Needs revision. Review each solution carefully and re-test yourself.';
    }

    // Stats Pills
    document.getElementById('res-correct').textContent = attempt.correctCount;
    document.getElementById('res-incorrect').textContent = attempt.incorrectCount;
    document.getElementById('res-unattempted').textContent = attempt.unattemptedCount;

    const mins = Math.floor((attempt.timeTakenSeconds || 0) / 60);
    const secs = (attempt.timeTakenSeconds || 0) % 60;
    document.getElementById('res-time-taken').textContent = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;

    // Chapter Breakdown
    this.renderChapterBreakdown(attempt.chapterBreakdown || {});

    // Filter counts
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
      container.innerHTML = '<p class="text-xs text-slate-400 col-span-full">No chapter breakdown available.</p>';
      return;
    }

    container.innerHTML = chapters.map(chap => {
      const stats = breakdown[chap];
      const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      let barColor = 'bg-emerald-500';
      if (acc < 50) barColor = 'bg-rose-500';
      else if (acc < 75) barColor = 'bg-amber-500';

      return `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div class="flex justify-between items-center text-xs">
            <span class="font-bold text-slate-800 line-clamp-1">${chap}</span>
            <span class="font-extrabold text-slate-700">${acc}%</span>
          </div>
          <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div class="${barColor} h-full rounded-full" style="width: ${acc}%"></div>
          </div>
          <div class="flex justify-between text-[11px] text-slate-500 font-medium">
            <span>Correct: ${stats.correct}/${stats.total}</span>
            <span>Incorrect: ${stats.incorrect}</span>
            <span>Unattempted: ${stats.unattempted}</span>
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
          btn.className = 'px-3 py-1.5 rounded-lg bg-white text-slate-900 font-bold shadow-xs';
        } else {
          btn.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-medium';
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
      list.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm">No questions match filter: ${filter}</div>`;
      return;
    }

    const letters = ['A', 'B', 'C', 'D'];

    list.innerHTML = filtered.map((item, idx) => {
      let statusTag = '';
      let borderTag = 'border-slate-200';

      if (item.isCorrect) {
        statusTag = '<span class="bg-emerald-100 text-emerald-800 font-bold text-xs px-2.5 py-0.5 rounded-full uppercase">Correct (+1)</span>';
        borderTag = 'border-emerald-200';
      } else if (item.userAnswer === null) {
        statusTag = '<span class="bg-slate-100 text-slate-600 font-bold text-xs px-2.5 py-0.5 rounded-full uppercase">Unattempted (0)</span>';
        borderTag = 'border-slate-200';
      } else {
        statusTag = '<span class="bg-rose-100 text-rose-800 font-bold text-xs px-2.5 py-0.5 rounded-full uppercase">Incorrect (0)</span>';
        borderTag = 'border-rose-200';
      }

      const optionsHtml = (item.options || []).map((opt, optIdx) => {
        let optStyle = 'border-slate-100 bg-slate-50/50 text-slate-700';
        let badgeStyle = 'bg-slate-200 text-slate-700';
        let badgeText = letters[optIdx];

        if (optIdx === item.correctAnswer) {
          optStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold ring-1 ring-emerald-400';
          badgeStyle = 'bg-emerald-600 text-white';
          badgeText = '✓';
        } else if (optIdx === item.userAnswer && !item.isCorrect) {
          optStyle = 'border-rose-400 bg-rose-50 text-rose-900 font-semibold ring-1 ring-rose-400';
          badgeStyle = 'bg-rose-600 text-white';
          badgeText = '✕';
        }

        return `
          <div class="p-3 rounded-xl border ${optStyle} flex items-center gap-3 text-sm">
            <span class="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${badgeStyle}">${badgeText}</span>
            <span>${opt}</span>
            ${optIdx === item.userAnswer ? '<span class="ml-auto text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">Your Answer</span>' : ''}
          </div>
        `;
      }).join('');

      return `
        <div class="bg-white rounded-2xl p-6 border ${borderTag} shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div class="flex items-center gap-3">
              <span class="font-bold text-slate-800 text-sm">Q${idx + 1}</span>
              <span class="text-xs bg-slate-100 text-slate-700 font-semibold px-2.5 py-0.5 rounded">${item.chapter}</span>
            </div>
            ${statusTag}
          </div>

          <div class="text-slate-900 font-medium text-sm leading-relaxed question-content">
            ${item.question}
          </div>

          <div class="space-y-2 pt-1">
            ${optionsHtml}
          </div>

          <div class="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 text-xs text-slate-700 space-y-1">
            <span class="font-bold text-indigo-900 block">Explanation & Solution:</span>
            <p class="leading-relaxed">${item.explanation || 'Option ' + letters[item.correctAnswer]}</p>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Global app instance
const app = new AptiPrepApp();
