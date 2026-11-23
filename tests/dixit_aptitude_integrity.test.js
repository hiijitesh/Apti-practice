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

  test('Ratio & Proportion has 122 authentic questions with zero accidental duplicates', () => {
    const ratioQuestions = aptiQuestions.filter(q => q.chapter === 'Ratio & Proportion');
    assert.equal(ratioQuestions.length, 122, 'Must have exactly 122 Ratio & Proportion questions');

    // 1. Q1 stem appears only ONCE across all questions
    const q1StemMatches = ratioQuestions.filter(q =>
      q.question.includes('Two numbers are in the ratio of 6:7. If the difference between these numbers is 16')
    );
    assert.equal(q1StemMatches.length, 1, 'Q1 stem must only appear once, never repeated in Q5, Q7, Q10, Q102, etc.');
    assert.equal(q1StemMatches[0].id, 'ratio_q001');

    // 2. Q102 must have its authentic Componendo & Dividendo stem and correct answer D
    const q102 = ratioQuestions.find(q => q.id === 'ratio_q102');
    assert.ok(q102, 'ratio_q102 must exist');
    assert.match(q102.question, /20%\s*of\s*\(P\+Q\)/);
    assert.equal(q102.correctAnswer, 3, 'Q102 correct answer index must be 3 (Option D)');
    assert.equal(q102.options[3].trim(), '7 : 3');

    // 3. Q103 must have its authentic stem and correct answer D
    const q103 = ratioQuestions.find(q => q.id === 'ratio_q103');
    assert.ok(q103, 'ratio_q103 must exist');
    assert.match(q103.question, /40%\s*of\s*\(A\s*\+\s*B\)/);
    assert.equal(q103.correctAnswer, 3, 'Q103 correct answer index must be 3 (Option D)');

    // 4. Q5 must have fractions A:B = (1/3):(1/5)...
    const q5 = ratioQuestions.find(q => q.id === 'ratio_q005');
    assert.ok(q5, 'ratio_q005 must exist');
    assert.match(q5.question, /1\/3/);

    // 5. All 122 questions must have valid slidePage attribute (12 to 137)
    ratioQuestions.forEach(q => {
      assert.ok(
        Number.isInteger(q.slidePage) && q.slidePage >= 12 && q.slidePage <= 137,
        `Question ${q.id} must have slidePage between 12 and 137 (got ${q.slidePage})`
      );
    });
  });
});
