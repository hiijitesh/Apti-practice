const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Chemistry Reverification & Slide Page Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const questionsPath = path.join(rootDir, 'public', 'data', 'questions.json');
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const chemistryQuestions = questions.filter(
    q => q.subSubject === 'Chemistry' && q.chapter !== 'Top 300 Questions'
  );

  test('Chemistry chapter counts match reverified totals (465 total across 8 chapters)', () => {
    const expectedCounts = {
      'Acids, Bases and Salt': 55,
      'Atom and Molecule': 18,
      'Carbon and its Compounds': 112,
      'Chemical Reactions and Equations': 47,
      'Classification of Matter': 43,
      'Matter': 46,
      'Metals and Non-Metals': 61,
      'Structure of Atom': 83
    };

    assert.equal(chemistryQuestions.length, 465, 'Total Chemistry questions must be 465');

    const actualCounts = {};
    chemistryQuestions.forEach(q => {
      actualCounts[q.chapter] = (actualCounts[q.chapter] || 0) + 1;
    });

    Object.entries(expectedCounts).forEach(([chapter, count]) => {
      assert.equal(actualCounts[chapter], count, `Chapter ${chapter} must have ${count} questions`);
    });
  });

  test('Every Chemistry question contains a valid slidePage attribute', () => {
    chemistryQuestions.forEach((q, idx) => {
      assert.ok(
        Number.isInteger(q.slidePage),
        `Chemistry question ${q.id} (#${idx}) must have an integer slidePage`
      );
      assert.ok(
        q.slidePage >= 1,
        `Chemistry question ${q.id} (#${idx}) slidePage must be >= 1 (found ${q.slidePage})`
      );
      assert.ok(
        q.explanation.includes(`Slide: Page ${q.slidePage}`),
        `Explanation for ${q.id} must include 'Slide: Page ${q.slidePage}'`
      );
    });
  });

  test('Zero Devanagari/Hindi characters across all Chemistry questions, options, and explanations', () => {
    const hindiRegex = /[\u0900-\u097F]/;
    chemistryQuestions.forEach(q => {
      const combined = `${q.question} ${q.options.join(' ')} ${q.explanation}`;
      assert.equal(
        hindiRegex.test(combined),
        false,
        `Question ${q.id} contains prohibited Devanagari/Hindi characters: ${combined.slice(0, 100)}`
      );
    });
  });

  test('All Chemistry questions have 4 non-empty options and valid correctAnswer index', () => {
    chemistryQuestions.forEach(q => {
      assert.equal(q.options.length, 4, `Question ${q.id} must have 4 options`);
      q.options.forEach((opt, optIdx) => {
        assert.ok(
          typeof opt === 'string' && opt.trim().length > 0,
          `Question ${q.id} option #${optIdx} is empty`
        );
      });
      assert.ok(
        q.correctAnswer >= 0 && q.correctAnswer <= 3,
        `Question ${q.id} invalid correctAnswer ${q.correctAnswer}`
      );
    });
  });

  test('Diagram questions have existing PNG files if present', () => {
    const withDiagram = chemistryQuestions.filter(q => q.diagram && q.diagram.trim().length > 0);
    withDiagram.forEach(q => {
      assert.ok(
        /^data\/diagrams\/[\w.-]+\.png$/.test(q.diagram) && require('fs').existsSync(require('path').join(__dirname, '..', 'public', q.diagram)),
        `Diagram for ${q.id} must point to an existing PNG in public/data/diagrams`
      );
    });
  });

  test('Zero duplicate question stems across all 8 Chemistry chapters', () => {
    const chapters = [...new Set(chemistryQuestions.map(q => q.chapter))];
    chapters.forEach(ch => {
      const chQuestions = chemistryQuestions.filter(q => q.chapter === ch);
      const stemCounts = {};
      chQuestions.forEach(q => {
        const cleanStem = q.question.toLowerCase().replace(/[^a-z0-9]/g, '');
        stemCounts[cleanStem] = (stemCounts[cleanStem] || 0) + 1;
      });
      const duplicates = Object.entries(stemCounts).filter(([_, count]) => count > 1);
      assert.equal(
        duplicates.length,
        0,
        `Chemistry chapter "${ch}" has duplicate questions: ${JSON.stringify(duplicates)}`
      );
    });
  });
});

