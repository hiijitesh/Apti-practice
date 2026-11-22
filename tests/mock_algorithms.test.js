// tests/mock_algorithms.test.js - Unit tests for Full CBT Mock Test Algorithm Suite
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MockGeneratorService = require('../src/services/mock-generator.service');
const ScoringService = require('../src/services/scoring.service');
const { loadQuestions } = require('../server');

describe('Full CBT Mock Test Algorithm Suite Tests', () => {
  const allQuestions = loadQuestions();

  describe('1. Blueprint Stratification Algorithm', () => {
    test('Combined mock produces exact 15 Aptitude + 5 Physics + 5 Chemistry + 5 Biology split', () => {
      const mock = MockGeneratorService.generate(allQuestions, 'all', 30);
      assert.equal(mock.length, 30);

      const apti = mock.filter(q => (q.subject || '').toLowerCase().includes('aptitude'));
      const phys = mock.filter(q => (q.subSubject || '').toLowerCase() === 'physics');
      const chem = mock.filter(q => (q.subSubject || '').toLowerCase() === 'chemistry');
      const bio = mock.filter(q => (q.subSubject || '').toLowerCase() === 'biology');

      assert.equal(apti.length, 15, `Expected exactly 15 Aptitude questions, got ${apti.length}`);
      assert.equal(phys.length, 5, `Expected exactly 5 Physics questions, got ${phys.length}`);
      assert.equal(chem.length, 5, `Expected exactly 5 Chemistry questions, got ${chem.length}`);
      assert.equal(bio.length, 5, `Expected exactly 5 Biology questions, got ${bio.length}`);
    });

    test('General Science mock produces exact 10 Physics + 10 Chemistry + 10 Biology split', () => {
      const mock = MockGeneratorService.generate(allQuestions, 'science', 30);
      assert.equal(mock.length, 30);

      const phys = mock.filter(q => (q.subSubject || '').toLowerCase() === 'physics');
      const chem = mock.filter(q => (q.subSubject || '').toLowerCase() === 'chemistry');
      const bio = mock.filter(q => (q.subSubject || '').toLowerCase() === 'biology');

      assert.equal(phys.length, 10, `Expected exactly 10 Physics questions, got ${phys.length}`);
      assert.equal(chem.length, 10, `Expected exactly 10 Chemistry questions, got ${chem.length}`);
      assert.equal(bio.length, 10, `Expected exactly 10 Biology questions, got ${bio.length}`);
    });

    test('Quantitative Aptitude mock selects strictly 30 Aptitude questions with wide chapter spread', () => {
      const mock = MockGeneratorService.generate(allQuestions, 'aptitude', 30);
      assert.equal(mock.length, 30);
      mock.forEach(q => {
        assert.ok((q.subject || '').toLowerCase().includes('aptitude'));
      });
      const uniqueChaps = new Set(mock.map(q => q.chapter));
      assert.ok(uniqueChaps.size >= 14, `Expected at least 14 chapters represented, got ${uniqueChaps.size}`);
    });
  });

  describe('2. Difficulty Curve Algorithm (40% Easy / 40% Medium / 20% Hard)', () => {
    test('Classifies questions into easy, medium, and hard tiers', () => {
      const shortQ = { question: 'What is 2+2?', options: ['1', '2', '3', '4'] };
      const longQ = {
        question: 'A large train traveling at a velocity of 120 km/h with constant acceleration crosses another train of length 450 meters moving in the opposite direction. Calculate the total kinetic energy transferred in Joules.',
        options: ['Option A with lengthy text and multiple terms', 'Option B with complex calculations', 'Option C', 'Option D']
      };

      assert.equal(MockGeneratorService.classifyDifficulty(shortQ), 'easy');
      assert.equal(MockGeneratorService.classifyDifficulty(longQ), 'hard');
    });

    test('Mock generation tags every question with valid difficulty tier', () => {
      const mock = MockGeneratorService.generate(allQuestions, 'all', 30);
      mock.forEach(q => {
        assert.ok(['easy', 'medium', 'hard'].includes(q.difficulty), `Invalid difficulty: ${q.difficulty}`);
      });

      const easyCount = mock.filter(q => q.difficulty === 'easy').length;
      const mediumCount = mock.filter(q => q.difficulty === 'medium').length;
      const hardCount = mock.filter(q => q.difficulty === 'hard').length;

      // Ensure all tiers are represented in the calibrated curve
      assert.ok(easyCount > 0, 'Should have easy questions');
      assert.ok(mediumCount > 0, 'Should have medium questions');
      assert.ok(hardCount > 0, 'Should have hard questions');
    });
  });

  describe('3. Weakness-Targeted Sampling Algorithm', () => {
    test('Prioritizes weak chapters when specified in options', () => {
      const weakChapters = ['Time & Work', 'Reflection of Light'];
      const mock = MockGeneratorService.generate(allQuestions, 'all', 30, { weakChapters });

      const weakMatches = mock.filter(q => weakChapters.includes(q.chapter));
      assert.ok(weakMatches.length >= 2, `Expected at least 2 questions from weak chapters, got ${weakMatches.length}`);
    });
  });

  describe('4. CBT Scoring & Negative Marking (-0.33) Algorithm', () => {
    test('Calculates exact negative penalty (-0.33 per wrong answer) and Net Marks', () => {
      const sample = allQuestions.slice(0, 30);
      // 20 correct, 6 incorrect, 4 unattempted
      const answers = sample.map((q, idx) => {
        if (idx < 20) return { questionId: q.id, userAnswer: q.correctAnswer };
        if (idx < 26) return { questionId: q.id, userAnswer: (q.correctAnswer + 1) % 4 };
        return { questionId: q.id, userAnswer: null };
      });

      const { attemptRecord, fullAttempt } = ScoringService.calculate(allQuestions, {
        mode: 'mock',
        timeTakenSeconds: 1200,
        answers,
        userEmail: 'cbt@example.com'
      });

      assert.equal(attemptRecord.totalQuestions, 30);
      assert.equal(attemptRecord.correctCount, 20);
      assert.equal(attemptRecord.incorrectCount, 6);
      assert.equal(attemptRecord.unattemptedCount, 4);

      // Gross marks = 20 * 1 = 20.00
      assert.equal(attemptRecord.grossMarks, 20.00);
      // Penalty lost = 6 * (1/3) = 2.00
      assert.equal(attemptRecord.negativeMarksLost, 2.00);
      // Net marks = 20.00 - 2.00 = 18.00
      assert.equal(attemptRecord.netMarks, 18.00);
      // Net percentage = (18 / 30) * 100 = 60.0%
      assert.equal(attemptRecord.netPercentage, 60.0);
      // Accuracy = 20 / 26 = 76.9%
      assert.equal(attemptRecord.accuracyPercentage, 76.9);
      // Performance band
      assert.ok(attemptRecord.performanceBand.includes('Strong') || attemptRecord.performanceBand.includes('Cutoff'));
      // Estimated Percentile
      assert.ok(attemptRecord.estimatedPercentile > 50, `Expected percentile > 50, got ${attemptRecord.estimatedPercentile}`);

      // Sectional Breakdown exists
      assert.ok(fullAttempt.sectionBreakdown);
      assert.ok(fullAttempt.sectionBreakdown['Quantitative Aptitude']);
      assert.ok(fullAttempt.sectionBreakdown['Physics']);
    });

    test('Pacing Analytics computes average seconds per question and speed category', () => {
      const sample = allQuestions.slice(0, 10);
      const answers = sample.map((q, idx) => ({
        questionId: q.id,
        userAnswer: q.correctAnswer,
        timeSpentSeconds: idx < 5 ? 20 : 50
      }));

      const { fullAttempt } = ScoringService.calculate(allQuestions, {
        mode: 'mock',
        timeTakenSeconds: 350,
        answers,
        userEmail: 'pacing@example.com'
      });

      assert.ok(fullAttempt.pacingAnalytics);
      assert.equal(fullAttempt.pacingAnalytics.avgSecondsPerQuestion, 35);
      assert.equal(fullAttempt.pacingAnalytics.rapidCount, 5);
      assert.equal(fullAttempt.pacingAnalytics.balancedCount, 5);
      assert.equal(fullAttempt.pacingAnalytics.rapidAccuracy, 100);
    });
  });
});
