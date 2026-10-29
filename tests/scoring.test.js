const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadQuestions, calculateScore } = require('../server.js');

describe('Scoring & Evaluation Unit Tests', () => {
  const allQuestions = loadQuestions();
  const sample = allQuestions.slice(0, 10);

  test('100% score when all questions are answered correctly', () => {
    const answers = sample.map(q => ({
      questionId: q.id,
      userAnswer: q.correctAnswer
    }));

    const { attemptRecord, fullAttempt } = calculateScore(allQuestions, {
      mode: 'mock',
      chapter: null,
      timeTakenSeconds: 120,
      answers,
      userEmail: 'student@example.com'
    });

    assert.equal(attemptRecord.totalQuestions, 10);
    assert.equal(attemptRecord.correctCount, 10);
    assert.equal(attemptRecord.incorrectCount, 0);
    assert.equal(attemptRecord.unattemptedCount, 0);
    assert.equal(attemptRecord.scorePercentage, 100);
    assert.equal(attemptRecord.userEmail, 'student@example.com');
    assert.equal(fullAttempt.detailedAnswers.length, 10);
  });

  test('0% score when all questions are incorrect', () => {
    const answers = sample.map(q => ({
      questionId: q.id,
      userAnswer: (q.correctAnswer + 1) % 4
    }));

    const { attemptRecord } = calculateScore(allQuestions, {
      mode: 'chapter_test',
      chapter: sample[0].chapter,
      timeTakenSeconds: 85,
      answers,
      userEmail: 'student@example.com'
    });

    assert.equal(attemptRecord.correctCount, 0);
    assert.equal(attemptRecord.incorrectCount, 10);
    assert.equal(attemptRecord.unattemptedCount, 0);
    assert.equal(attemptRecord.scorePercentage, 0);
  });

  test('Unattempted questions handled properly without counting as incorrect', () => {
    const answers = sample.map((q, idx) => ({
      questionId: q.id,
      userAnswer: idx < 4 ? q.correctAnswer : null
    }));

    const { attemptRecord } = calculateScore(allQuestions, {
      mode: 'chapter_test',
      chapter: sample[0].chapter,
      timeTakenSeconds: 60,
      answers,
      userEmail: 'student@example.com'
    });

    assert.equal(attemptRecord.correctCount, 4);
    assert.equal(attemptRecord.incorrectCount, 0);
    assert.equal(attemptRecord.unattemptedCount, 6);
    assert.equal(attemptRecord.scorePercentage, 40);
  });

  test('Chapter breakdown accurately aggregates statistics', () => {
    const answers = sample.map(q => ({
      questionId: q.id,
      userAnswer: q.correctAnswer
    }));

    const { fullAttempt } = calculateScore(allQuestions, {
      mode: 'mock',
      answers,
      userEmail: 'breakdown@example.com'
    });

    assert.ok(fullAttempt.chapterBreakdown);
    let aggregatedTotal = 0;
    Object.values(fullAttempt.chapterBreakdown).forEach(stat => {
      aggregatedTotal += stat.total;
      assert.equal(stat.correct + stat.incorrect + stat.unattempted, stat.total);
    });
    assert.equal(aggregatedTotal, 10);
  });
});
