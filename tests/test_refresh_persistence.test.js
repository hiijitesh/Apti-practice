const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Test Refresh Persistence & Default Study Mode Tests', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const jsPath = path.join(__dirname, '../public/app.js');

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  test('Default mode is Study mode not Test mode in app.js state and HTML', () => {
    // 1. In app.js constructor, modeType defaults to 'study'
    assert.match(jsContent, /modeType:\s*'study'/);

    // 2. In index.html, toggle-btn-study has active classes and toggle-btn-test has inactive classes
    assert.match(htmlContent, /id="toggle-btn-study"[^>]*class="[^"]*bg-white text-zinc-900/);
    assert.match(htmlContent, /id="toggle-btn-test"[^>]*class="[^"]*text-zinc-500/);

    // 3. In index.html, practice-mode-badge says 'Study Mode'
    assert.match(htmlContent, /id="practice-mode-badge"[^>]*>\s*Study Mode\s*</);

    // 4. In index.html, practice-mode-subtitle says 'Instant answers & explanation'
    assert.match(htmlContent, /id="practice-mode-subtitle"[^>]*>\s*Instant answers & explanation\s*</);

    // 5. In app.js initPracticeState, modeType defaults to 'study'
    assert.match(jsContent, /this\.practice\.modeType\s*=\s*this\.practice\.modeType\s*\|\|\s*'study'/);
  });

  test('Active mock session persistence methods exist and handle state properly', () => {
    // 1. saveActiveMockSession saves all mock state to apti_active_mock
    assert.match(jsContent, /saveActiveMockSession\(\)\s*\{/);
    assert.match(jsContent, /localStorage\.setItem\('apti_active_mock'/);

    // 2. clearActiveMockSession removes apti_active_mock
    assert.match(jsContent, /clearActiveMockSession\(\)\s*\{/);
    assert.match(jsContent, /localStorage\.removeItem\('apti_active_mock'\)/);

    // 3. restoreActiveMockSession restores questions, answers, and recalculates timeLeftSeconds
    assert.match(jsContent, /restoreActiveMockSession\(saved\)\s*\{/);
    assert.match(jsContent, /const elapsedSeconds = Math\.max\(0, Math\.floor\(\(Date\.now\(\) - \(saved\.savedAt/);
    assert.match(jsContent, /this\.mock\.timeLeftSeconds = remainingSeconds/);

    // 4. Periodic mock timer saves state to localStorage every 5 seconds
    assert.match(jsContent, /this\.mock\.timeLeftSeconds\s*%\s*5\s*===\s*0[\s\S]*?this\.saveActiveMockSession\(\)/);
  });

  test('Active practice session persistence methods exist and handle state properly', () => {
    // 1. saveActivePracticeSession saves practice state to apti_active_practice
    assert.match(jsContent, /saveActivePracticeSession\(\)\s*\{/);
    assert.match(jsContent, /localStorage\.setItem\('apti_active_practice'/);

    // 2. clearActivePracticeSession removes apti_active_practice
    assert.match(jsContent, /clearActivePracticeSession\(\)\s*\{/);
    assert.match(jsContent, /localStorage\.removeItem\('apti_active_practice'\)/);

    // 3. restoreActivePracticeSession restores chapter, questions, userAnswers, and modeType
    assert.match(jsContent, /restoreActivePracticeSession\(saved\)\s*\{/);
    assert.match(jsContent, /this\.practice\.chapter = saved\.chapter/);
    assert.match(jsContent, /this\.practice\.modeType = saved\.modeType \|\| 'study'/);
  });

  test('Page initialization checks and restores active mock or practice tests on refresh', () => {
    // 1. init() checks for apti_active_mock and apti_active_practice
    assert.match(jsContent, /localStorage\.getItem\('apti_active_mock'\)/);
    assert.match(jsContent, /localStorage\.getItem\('apti_active_practice'\)/);
    assert.match(jsContent, /this\.restoreActiveMockSession\(activeMock\)/);
    assert.match(jsContent, /this\.restoreActivePracticeSession\(activePractice\)/);

    // 2. init() wires up setupRefreshGuard
    assert.match(jsContent, /this\.setupRefreshGuard\(\)/);
  });

  test('Refreshing guards and submission clearing are properly configured', () => {
    // 1. setupRefreshGuard wires beforeunload and visibilitychange
    assert.match(jsContent, /setupRefreshGuard\(\)\s*\{[\s\S]*?window\.addEventListener\('beforeunload'/);
    assert.match(jsContent, /document\.addEventListener\('visibilitychange'/);

    // 2. executeMockSubmission and executeChapterTestSubmission clear active test sessions
    assert.match(jsContent, /executeMockSubmission\(\)\s*\{[\s\S]*?this\.clearActiveMockSession\(\)/);
    assert.match(jsContent, /executeChapterTestSubmission\(\)\s*\{[\s\S]*?this\.clearActivePracticeSession\(\)/);

    // 3. showDashboard clears active sessions
    assert.match(jsContent, /showDashboard\(\)\s*\{[\s\S]*?this\.clearActivePracticeSession\(\)[\s\S]*?this\.clearActiveMockSession\(\)/);
  });

  test('Anti-flicker script in index.html prevents layout jump on test refresh', () => {
    assert.match(htmlContent, /localStorage\.getItem\('apti_active_mock'\)/);
    assert.match(htmlContent, /localStorage\.getItem\('apti_active_practice'\)/);
    assert.match(htmlContent, /viewMock\.classList\.remove\('hidden'\)/);
    assert.match(htmlContent, /viewPractice\.classList\.remove\('hidden'\)/);
  });

  test('Chapter Study Progress methods exist and preserve answers across chapter navigation', () => {
    // 1. Storage key generator scopes by user email and chapter
    assert.match(jsContent, /getChapterStudyStorageKey\(chapterName\)\s*\{/);
    assert.match(jsContent, /apti_study_\$\{email\}_\$\{chap\}/);

    // 2. saveChapterStudyProgress saves userAnswers, reviewFlags, currentIndex
    assert.match(jsContent, /saveChapterStudyProgress\(\)\s*\{/);
    assert.match(jsContent, /if\s*\(!this\.practice\s*\|\|\s*!this\.practice\.chapter\s*\|\|\s*this\.practice\.modeType\s*!==\s*'study'\)\s*return;/);

    // 3. loadChapterStudyProgress and clearChapterStudyProgress exist
    assert.match(jsContent, /loadChapterStudyProgress\(chapterName\)\s*\{/);
    assert.match(jsContent, /clearChapterStudyProgress\(chapterName\)\s*\{/);

    // 4. resetPracticeProgress allows clearing saved chapter answers with confirmation
    assert.match(jsContent, /resetPracticeProgress\(\)\s*\{/);

    // 5. initPracticeState restores saved study progress for chapters in study mode
    assert.match(jsContent, /const savedProgress = this\.loadChapterStudyProgress\(chapterName\);/);
    assert.match(jsContent, /this\.practice\.userAnswers = savedProgress\.userAnswers;/);

    // 6. showDashboard preserves study mode sessions in localStorage
    assert.match(jsContent, /if\s*\(this\.currentMode\s*!==\s*'practice'\s*\|\|\s*this\.practice\.modeType\s*!==\s*'study'\)\s*\{[\s\S]*?this\.clearActivePracticeSession\(\);/);
  });
});
