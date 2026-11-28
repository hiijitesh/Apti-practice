const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Biology Reverification & Slide Page Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const questionsPath = path.join(rootDir, 'public', 'data', 'questions.json');
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const biologyQuestions = questions.filter(
    q => q.subSubject === 'Biology' && q.chapter !== 'Top 300 Questions'
  );

  test('Biology chapter counts match reverified totals (616 total across 16 chapters)', () => {
    const expectedCounts = {
      'Blood': 22,
      'Botany': 20,
      'Cell': 62,
      'Circulatory System': 34,
      'Classification of Organisms': 37,
      'Digestive System': 34,
      'Endocrine System': 29,
      'Environment': 45,
      'Excretory System': 37,
      'Heredity': 29,
      'Improvement in Food Resources': 28,
      'Nervous System': 24,
      'Nutrition': 53,
      'Reproduction in Organisms': 71,
      'Respiratory System': 27,
      'Tissue': 64
    };

    assert.equal(biologyQuestions.length, 616, 'Total Biology questions must be 616');

    const actualCounts = {};
    biologyQuestions.forEach(q => {
      actualCounts[q.chapter] = (actualCounts[q.chapter] || 0) + 1;
    });

    Object.entries(expectedCounts).forEach(([chapter, count]) => {
      assert.equal(actualCounts[chapter], count, `Chapter ${chapter} must have ${count} questions`);
    });
  });

  test('Every Biology question contains a valid slidePage attribute and explanation reference', () => {
    biologyQuestions.forEach((q, idx) => {
      assert.ok(
        Number.isInteger(q.slidePage),
        `Biology question ${q.id} (#${idx}) must have an integer slidePage`
      );
      assert.ok(
        q.slidePage >= 1,
        `Biology question ${q.id} (#${idx}) slidePage must be >= 1 (found ${q.slidePage})`
      );
      assert.ok(
        q.explanation.includes(`Slide: Page ${q.slidePage}`),
        `Explanation for ${q.id} must include 'Slide: Page ${q.slidePage}'`
      );
    });
  });

  test('Zero Devanagari/Hindi characters across all Biology questions, options, and explanations', () => {
    const hindiRegex = /[\u0900-\u097F]/;
    biologyQuestions.forEach(q => {
      const combined = `${q.question} ${q.options.join(' ')} ${q.explanation}`;
      assert.equal(
        hindiRegex.test(combined),
        false,
        `Question ${q.id} contains prohibited Devanagari/Hindi characters: ${combined.slice(0, 100)}`
      );
    });
  });

  test('All Biology questions have 4 non-empty options and valid correctAnswer index', () => {
    biologyQuestions.forEach(q => {
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
    const withDiagram = biologyQuestions.filter(q => q.diagram && q.diagram.trim().length > 0);
    withDiagram.forEach(q => {
      assert.ok(
        /^data\/diagrams\/[\w.-]+\.png$/.test(q.diagram) && require('fs').existsSync(require('path').join(__dirname, '..', 'public', q.diagram)),
        `Diagram for ${q.id} must point to an existing PNG in public/data/diagrams`
      );
    });
  });

  test('Zero duplicate question stems across all 16 Biology chapters', () => {
    const chapters = [...new Set(biologyQuestions.map(q => q.chapter))];
    chapters.forEach(ch => {
      const chQuestions = biologyQuestions.filter(q => q.chapter === ch);
      const stemCounts = {};
      chQuestions.forEach(q => {
        const cleanStem = q.question.toLowerCase().replace(/[^a-z0-9]/g, '');
        stemCounts[cleanStem] = (stemCounts[cleanStem] || 0) + 1;
      });
      const duplicates = Object.entries(stemCounts).filter(([_, count]) => count > 1);
      assert.equal(
        duplicates.length,
        0,
        `Biology chapter "${ch}" has duplicate questions: ${JSON.stringify(duplicates)}`
      );
    });
  });
});

