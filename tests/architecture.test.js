const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const questionRepository = require('../src/repositories/question.repository');
const attemptRepository = require('../src/repositories/attempt.repository');
const MockGeneratorService = require('../src/services/mock-generator.service');
const ScoringService = require('../src/services/scoring.service');

describe('Modular Architecture & Repositories Unit Tests', () => {
  test('QuestionRepository loads and caches questions in memory', () => {
    const questions1 = questionRepository.getAll();
    const questions2 = questionRepository.getAll();
    assert.equal(questions1, questions2, 'Subsequent calls must return cached reference without disk re-read');
    assert.ok(questions1.length > 2000, 'Questions repository must contain question bank');
  });

  test('QuestionRepository getChapters returns precomputed chapter summaries', () => {
    const chapters = questionRepository.getChapters();
    assert.ok(Array.isArray(chapters));
    assert.equal(chapters.length, 52);
    assert.ok(chapters[0].name);
    assert.ok(chapters[0].count > 0);
  });

  test('QuestionRepository getByChapter correctly filters questions', () => {
    const filtered = questionRepository.getByChapter('Ages');
    assert.ok(filtered.length > 0);
    filtered.forEach(q => {
      assert.equal(q.chapter, 'Ages');
    });
  });

  test('MockGeneratorService generates sanitized questions and respects filters', () => {
    const all = questionRepository.getAll();
    const mock = MockGeneratorService.generate(all, 'science', 15);
    assert.equal(mock.length, 15);
    mock.forEach(q => {
      assert.equal(q.correctAnswer, undefined, 'Must not leak correctAnswer');
      assert.equal(q.explanation, undefined, 'Must not leak explanation');
    });
  });

  test('ScoringService calculate is pure and returns attemptRecord and fullAttempt', () => {
    const all = questionRepository.getAll();
    const sample = all.slice(0, 5);
    const answers = [
      { questionId: sample[0].id, userAnswer: sample[0].correctAnswer },
      { questionId: sample[1].id, userAnswer: null },
      { questionId: sample[2].id, userAnswer: (sample[2].correctAnswer + 1) % 4 }
    ];

    const { attemptRecord, fullAttempt } = ScoringService.calculate(all, {
      answers,
      userEmail: 'modular@test.com',
      timeTakenSeconds: 60
    });

    assert.equal(attemptRecord.totalQuestions, 3);
    assert.equal(attemptRecord.correctCount, 1);
    assert.equal(attemptRecord.unattemptedCount, 1);
    assert.equal(attemptRecord.incorrectCount, 1);
    assert.ok(fullAttempt.chapterBreakdown);
    assert.equal(fullAttempt.detailedAnswers.length, 3);
  });
});
