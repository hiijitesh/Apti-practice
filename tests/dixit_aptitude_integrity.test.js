const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Dixit Sir Quantitative Aptitude Verification & Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const questionsPath = path.join(rootDir, 'public', 'data', 'questions.json');
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const aptiQuestions = questions.filter(
    q => q.subject === 'Quantitative Aptitude'
  );

  test('Aptitude chapter counts match verified totals (1,342 total across 17 chapters)', () => {
    const expectedCounts = {
      'Ages': 28,
      'Average': 94,
      'Boat & Stream': 52,
      'Compound Interest': 101,
      'Discount': 62,
      'Mixture & Alligation': 100,
      'Partnership': 43,
      'Percentage': 108,
      'Pipe & Cistern': 50,
      'Profit & Loss': 133,
      'Race': 45,
      'Ratio & Proportion': 122,
      'Simple Interest': 101,
      'Time & Work': 124,
      'Trains': 47,
      'Time, Speed & Distance': 118,
      'Work & Wages': 14
    };

    assert.equal(aptiQuestions.length, 1342, 'Total Aptitude questions must be 1,342');

    const actualCounts = {};
    aptiQuestions.forEach(q => {
      actualCounts[q.chapter] = (actualCounts[q.chapter] || 0) + 1;
    });

    Object.entries(expectedCounts).forEach(([chapter, count]) => {
      assert.equal(actualCounts[chapter], count, `Chapter ${chapter} must have ${count} questions`);
    });
  });

  test('Zero dummy fallback options in Aptitude questions', () => {
    const dummyOptions = aptiQuestions.filter(q =>
      q.options.some(opt => opt.startsWith('Option ') && opt.length <= 8)
    );
    assert.equal(
      dummyOptions.length,
      0,
      `Found dummy options in questions: ${dummyOptions.map(q => q.id).join(', ')}`
    );
  });

  test('Zero exam tags leaking into options', () => {
    const examKeywords = ['SSC', 'CHSL', 'CGL', 'MTS', 'CPO', 'Phase', 'Tier'];
    const examInOptions = aptiQuestions.filter(q =>
      q.options.some(opt => examKeywords.some(kw => opt.includes(kw)))
    );
    assert.equal(
      examInOptions.length,
      0,
      `Found exam tags in options for: ${examInOptions.map(q => q.id).join(', ')}`
    );
  });

  test('Zero question stems leaking into Option A', () => {
    const stemInA = aptiQuestions.filter(
      q => q.options[0].length > 80 || q.options[0].toLowerCase().includes('(a)')
    );
    assert.equal(
      stemInA.length,
      0,
      `Found stem leaking into Option A for: ${stemInA.map(q => q.id).join(', ')}`
    );
  });

  test('Zero Devanagari/Hindi characters across all Aptitude questions, options, and explanations', () => {
    const devanagariRegex = /[\u0900-\u097F]/;
    const hindiQuestions = aptiQuestions.filter(q => {
      const fullText = `${q.question} ${q.options.join(' ')} ${q.explanation || ''}`;
      return devanagariRegex.test(fullText);
    });

    assert.equal(
      hindiQuestions.length,
      0,
      `Found Hindi characters in Aptitude questions: ${hindiQuestions.map(q => q.id).join(', ')}`
    );
  });

  test('All Aptitude questions have exactly 4 non-empty options and valid correctAnswer index', () => {
    aptiQuestions.forEach(q => {
      assert.equal(q.options.length, 4, `Question ${q.id} must have exactly 4 options`);
      q.options.forEach((opt, optIdx) => {
        assert.ok(
          opt && opt.trim().length > 0,
          `Question ${q.id} option ${optIdx} must not be empty`
        );
      });
      assert.ok(
        Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer <= 3,
        `Question ${q.id} correctAnswer must be 0, 1, 2, or 3 (got ${q.correctAnswer})`
      );
    });
  });

  test('All Aptitude question explanations specify correct option', () => {
    aptiQuestions.forEach(q => {
      assert.ok(
        q.explanation && q.explanation.includes('Correct Answer: Option '),
        `Question ${q.id} explanation must indicate the correct option`
      );
    });
  });
});
