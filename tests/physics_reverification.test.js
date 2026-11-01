const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Physics Reverification & Slide Page Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const questionsPath = path.join(rootDir, 'public', 'data', 'questions.json');
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const physicsQuestions = questions.filter(
    q => q.subSubject === 'Physics' && q.chapter !== 'Top 300 Questions'
  );

  test('Physics chapter counts match reverified totals (399 total across 10 chapters)', () => {
    const expectedCounts = {
      'Electricity': 74,
      'Gravitation': 75,
      'Human Eye': 21,
      'Magnetic Effect of Current': 25,
      'Motion': 70,
      'Prism': 14,
      'Reflection of Light': 42,
      'Refraction': 29,
      'Sound': 19,
      'Work, Energy and Power': 30
    };

    assert.equal(physicsQuestions.length, 399, 'Total Physics questions must be 399');

    const actualCounts = {};
    physicsQuestions.forEach(q => {
      actualCounts[q.chapter] = (actualCounts[q.chapter] || 0) + 1;
    });

    Object.entries(expectedCounts).forEach(([chapter, count]) => {
      assert.equal(actualCounts[chapter], count, `Chapter ${chapter} must have ${count} questions`);
    });
  });

  test('Every Physics question contains a valid slidePage attribute', () => {
    physicsQuestions.forEach((q, idx) => {
      assert.ok(
        Number.isInteger(q.slidePage),
        `Physics question ${q.id} (#${idx}) must have an integer slidePage`
      );
      assert.ok(
        q.slidePage >= 1,
        `Physics question ${q.id} (#${idx}) slidePage must be >= 1 (found ${q.slidePage})`
      );
      assert.ok(
        q.explanation.includes(`Slide: Page ${q.slidePage}`),
        `Explanation for ${q.id} must include 'Slide: Page ${q.slidePage}'`
      );
    });
  });

  test('Zero Devanagari/Hindi characters across all Physics questions, options, and explanations', () => {
    const hindiRegex = /[\u0900-\u097F]/;
    physicsQuestions.forEach(q => {
      const combined = `${q.question} ${q.options.join(' ')} ${q.explanation}`;
      assert.equal(
        hindiRegex.test(combined),
        false,
        `Question ${q.id} contains prohibited Devanagari/Hindi characters: ${combined.slice(0, 100)}`
      );
    });
  });

  test('All Physics questions have 4 non-empty options and valid correctAnswer index', () => {
    physicsQuestions.forEach(q => {
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

  test('Diagram questions have valid PNG base64 data URIs', () => {
    const withDiagram = physicsQuestions.filter(q => q.diagram && q.diagram.trim().length > 0);
    assert.ok(withDiagram.length >= 10, `Expected at least 10 diagram questions in Physics, found ${withDiagram.length}`);
    withDiagram.forEach(q => {
      assert.ok(
        q.diagram.startsWith('data:image/png;base64,'),
        `Diagram for ${q.id} must be a valid PNG Data URI`
      );
    });
  });
});

