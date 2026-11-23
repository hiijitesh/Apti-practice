const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Dixit Sir vs RK Ranjan Practice Routing Tests', () => {
  const appJsPath = path.join(__dirname, '../public/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  test('app.js startPractice prioritizes core Dixit Sir questions over RK Ranjan when preferredSubjectFilter is aptitude or core', () => {
    // Verify the routing logic in startPractice
    assert.match(appJsContent, /const isCoreChapter = \(this\.chapters \|\| \[\]\)\.some/);
    assert.match(appJsContent, /const isCoreFilter = \['aptitude', 'science'/);
    assert.match(appJsContent, /const isRk = \(preferredSubjectFilter === 'rk_ranjan'\)/);
  });

  test('renderChaptersGrid passes aptitude filter for Dixit Sir chapters', () => {
    assert.match(
      appJsContent,
      /app\.startPractice\('\$\{ch\.name\.replace\(\/'\/g, "\\\\'"\)\}', 'aptitude'\)/,
      'Dashboard cards for Dixit Sir must explicitly pass "aptitude" filter'
    );
  });

  test('renderModalChapters passes this.modalSubject to startPracticeFromModal', () => {
    assert.match(
      appJsContent,
      /app\.startPracticeFromModal\('\$\{ch\.name\.replace\(\/'\/g, "\\\\'"\)\}', '\$\{this\.modalSubject\}'\)/,
      'Modal chapter click must pass modalSubject'
    );
  });

  test('Functional simulation: startPractice with Dixit Sir chapter loads Dixit questions, NOT RK Ranjan questions', async () => {
    const dixitQuestions = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/questions.json'), 'utf8'));
    const rkQuestions = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/rk_ranjan_questions.json'), 'utf8'));

    // Create a mock app state
    let capturedState = null;
    const mockApp = {
      currentUserEmail: 'test@local',
      isStaticMode: true,
      allQuestions: dixitQuestions,
      rkQuestions: rkQuestions,
      chapters: [
        { name: 'Ages', subject: 'Quantitative Aptitude', subSubject: 'Quantitative Aptitude', count: 47 },
        { name: 'Percentage', subject: 'Quantitative Aptitude', subSubject: 'Quantitative Aptitude', count: 75 }
      ],
      rkChapters: [
        { name: 'Ages', subject: 'Quantitative Aptitude', subSubject: 'RK Ranjan Math', count: 180 },
        { name: 'Percentage', subject: 'Quantitative Aptitude', subSubject: 'RK Ranjan Math', count: 240 },
        { name: 'Trigonometry', subject: 'Quantitative Aptitude', subSubject: 'RK Ranjan Math', count: 150 }
      ],
      practice: {
        modeType: 'study',
        chapter: '',
        questions: [],
        currentIndex: 0
      },
      initPracticeState: function(chapterName, questions, preferredSubjectFilter) {
        capturedState = { chapterName, questions, preferredSubjectFilter };
      },
      switchView: () => {},
      enterFullscreen: async () => {},
      loadRkRanjanData: async () => {},
      loadAllQuestionsStatic: async () => {}
    };

    // Extract startPractice function body from app.js
    const match = appJsContent.match(/async startPractice\(chapterName, preferredSubjectFilter = null\)\s*\{([\s\S]*?)\n  \}\n\n  setPracticeChapterTitle/);
    assert.ok(match, 'startPractice method must be extractable');
    const fnBody = match[1];

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const startPracticeFn = new AsyncFunction('chapterName', 'preferredSubjectFilter', fnBody);

    // 1. Test clicking "Ages" with "aptitude" filter (Dixit Sir)
    await startPracticeFn.call(mockApp, 'Ages', 'aptitude');
    assert.ok(capturedState, 'initPracticeState must be called');
    assert.strictEqual(capturedState.chapterName, 'Ages');
    assert.strictEqual(capturedState.preferredSubjectFilter, 'aptitude');
    assert.strictEqual(capturedState.questions.length, 28, 'Must load exactly 28 Dixit Sir questions for Ages');
    assert.strictEqual(capturedState.questions[0].subSubject, 'Quantitative Aptitude', 'Must be Dixit Sir aptitude questions');
    assert.notStrictEqual(capturedState.questions[0].faculty, 'RK Ranjan', 'Must NOT be RK Ranjan questions');

    // 2. Test clicking "Percentage" without filter (defaults to core Dixit Sir)
    capturedState = null;
    await startPracticeFn.call(mockApp, 'Percentage', null);
    assert.ok(capturedState, 'initPracticeState must be called');
    assert.strictEqual(capturedState.chapterName, 'Percentage');
    assert.strictEqual(capturedState.preferredSubjectFilter, 'aptitude');
    assert.notStrictEqual(capturedState.questions[0].faculty, 'RK Ranjan', 'Must NOT be RK Ranjan questions');

    // 3. Test clicking "Percentage" with "rk_ranjan" filter (RK Ranjan)
    capturedState = null;
    await startPracticeFn.call(mockApp, 'Percentage', 'rk_ranjan');
    assert.ok(capturedState, 'initPracticeState must be called');
    assert.strictEqual(capturedState.chapterName, 'Percentage');
    assert.strictEqual(capturedState.preferredSubjectFilter, 'rk_ranjan');
    assert.strictEqual(capturedState.questions[0].faculty, 'RK Ranjan', 'Must be RK Ranjan questions');

    // 4. Test clicking RK-only chapter "Trigonometry" without filter (auto-routes to RK)
    capturedState = null;
    await startPracticeFn.call(mockApp, 'Trigonometry', null);
    assert.ok(capturedState, 'initPracticeState must be called');
    assert.strictEqual(capturedState.chapterName, 'Trigonometry');
    assert.strictEqual(capturedState.preferredSubjectFilter, 'rk_ranjan');
    assert.strictEqual(capturedState.questions[0].faculty, 'RK Ranjan', 'Must be RK Ranjan questions');
  });
});
