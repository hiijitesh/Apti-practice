const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('RK Ranjan Math Integrity & Zero Discrepancy Tests', () => {
  const filePath = path.join(__dirname, '../public/data/rk_ranjan_questions.json');
  let questions = [];

  test('rk_ranjan_questions.json exists and loads successfully', () => {
    assert.ok(fs.existsSync(filePath), 'File must exist');
    const raw = fs.readFileSync(filePath, 'utf8');
    questions = JSON.parse(raw);
    assert.ok(Array.isArray(questions), 'Questions must be an array');
    assert.ok(questions.length >= 5300, `Expected at least 5,300 questions, got ${questions.length}`);
  });

  test('Zero Devanagari / Hindi characters across all RK Ranjan questions', () => {
    const hindiRegex = /[\u0900-\u097F]/;
    const failures = [];
    questions.forEach(q => {
      const fullText = (q.question || '') + ' ' + (q.options || []).join(' ') + ' ' + (q.explanation || '');
      if (hindiRegex.test(fullText)) {
        failures.push(q.id);
      }
    });
    assert.strictEqual(failures.length, 0, `Found Hindi characters in ${failures.length} questions: ${failures.slice(0, 5)}`);
  });

  test('Zero Private Use Area (PUA) symbol glyphs across all RK Ranjan questions', () => {
    const puaRegex = /[\uE000-\uF8FF]/;
    const failures = [];
    questions.forEach(q => {
      const fullText = (q.question || '') + ' ' + (q.options || []).join(' ') + ' ' + (q.explanation || '');
      if (puaRegex.test(fullText)) {
        failures.push(q.id);
      }
    });
    assert.strictEqual(failures.length, 0, `Found PUA characters in ${failures.length} questions: ${failures.slice(0, 5)}`);
  });

  test('Every question strictly adheres to CBT schema', () => {
    questions.forEach((q, idx) => {
      assert.ok(q.id && typeof q.id === 'string', `Q at index ${idx} must have string id`);
      assert.strictEqual(q.subject, 'Quantitative Aptitude');
      assert.strictEqual(q.subSubject, 'RK Ranjan Math');
      assert.strictEqual(q.faculty, 'RK Ranjan');
      assert.ok(q.chapter && typeof q.chapter === 'string', `Q ${q.id} must have chapter`);
      assert.ok(q.question && q.question.trim().length >= 5, `Q ${q.id} must have non-empty stem`);
      assert.ok(Array.isArray(q.options) && q.options.length === 4, `Q ${q.id} must have exactly 4 options`);
      q.options.forEach((opt, oIdx) => {
        assert.ok(opt && typeof opt === 'string' && opt.trim().length > 0, `Q ${q.id} opt ${oIdx} must be non-empty`);
      });
      assert.ok(typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer <= 3, `Q ${q.id} correctAnswer must be 0..3`);
      assert.ok(q.explanation && q.explanation.trim().length > 0, `Q ${q.id} must have explanation`);
    });
  });

  test('All questions have exactly 4 distinct options (zero duplicates, zero Option A..D fallback)', () => {
    const dummySet = new Set(['option a', 'option b', 'option c', 'option d']);
    questions.forEach(q => {
      const optSet = new Set(q.options.map(o => o.trim().toLowerCase()));
      assert.strictEqual(optSet.size, 4, `Q ${q.id} must have 4 distinct options, got: ${JSON.stringify(q.options)}`);
      assert.strictEqual(
        q.options.every(o => dummySet.has(o.trim().toLowerCase())),
        false,
        `Q ${q.id} has dummy fallback options`
      );
    });
  });

  test('Covers all 33 math chapters with rich question pools', () => {
    const chapterMap = new Map();
    questions.forEach(q => {
      chapterMap.set(q.chapter, (chapterMap.get(q.chapter) || 0) + 1);
    });
    assert.strictEqual(chapterMap.size, 33, `Expected 33 chapters, found ${chapterMap.size}`);
    chapterMap.forEach((count, chap) => {
      assert.ok(count >= 40, `Chapter ${chap} must have at least 40 questions, got ${count}`);
    });
  });

  test('UI elements exist in public/index.html for RK Ranjan toggle and modal', () => {
    const htmlPath = path.join(__dirname, '../public/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('id="filter-btn-rk-ranjan"'), 'Dashboard filter button must exist');
    assert.ok(html.includes('id="badge-count-rk-ranjan"'), 'Badge count element must exist');
    assert.ok(html.includes('id="modal-tab-rk-ranjan"'), 'Modal tab button must exist');
    assert.ok(html.includes('value="rk_ranjan"'), 'Dropdown option must exist');
  });

  test('Frontend app.js supports RK Ranjan loading and chapter routing', () => {
    const appPath = path.join(__dirname, '../public/app.js');
    const appJs = fs.readFileSync(appPath, 'utf8');
    assert.ok(appJs.includes('loadRkRanjanData'), 'app.js must define loadRkRanjanData');
    assert.ok(appJs.includes('rk_ranjan_questions.json'), 'app.js must fetch rk_ranjan_questions.json');
    assert.ok(appJs.includes('rkChapters'), 'app.js must handle rkChapters');
    assert.ok(appJs.includes('setSubjectFilter'), 'app.js must handle setSubjectFilter');
  });

  test('Backend API routes /api/rk-chapters and /api/rk-questions return valid data', async () => {
    const QuestionRepository = require('../src/repositories/question.repository');
    QuestionRepository.reload();
    const rkChapters = QuestionRepository.getRkChapters();
    assert.strictEqual(rkChapters.length, 33, 'Repository must return 33 RK chapters');
    const rkQuestions = QuestionRepository.getRkQuestions();
    assert.strictEqual(rkQuestions.length, 5327, 'Repository must return 5,327 RK questions');
    const pctQuestions = QuestionRepository.getByChapter('Percentage', 'rk_ranjan');
    assert.ok(pctQuestions.length >= 200, `Percentage should have 200+ questions, got ${pctQuestions.length}`);
  });
});
