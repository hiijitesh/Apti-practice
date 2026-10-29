const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadQuestions, generateMockQuestions } = require('../server.js');

describe('Mock Test Generation Unit Tests', () => {
  const allQuestions = loadQuestions();

  test('generateMockQuestions generates exactly 30 questions for "all" subjects', () => {
    const mock = generateMockQuestions(allQuestions, 'all', 30);
    assert.equal(mock.length, 30);
  });

  test('generateMockQuestions does NOT leak correctAnswer or explanation to client', () => {
    const mock = generateMockQuestions(allQuestions, 'all', 30);
    mock.forEach(q => {
      assert.equal(q.correctAnswer, undefined, 'Mock question must never include correctAnswer');
      assert.equal(q.explanation, undefined, 'Mock question must never include explanation');
      assert.ok(q.id, 'Must contain question id');
      assert.ok(q.question, 'Must contain question text');
      assert.equal(q.options.length, 4, 'Must contain 4 options');
    });
  });

  test('generateMockQuestions with "aptitude" filter generates 30 Aptitude questions', () => {
    const mock = generateMockQuestions(allQuestions, 'aptitude', 30);
    assert.equal(mock.length, 30);
    mock.forEach(q => {
      assert.ok((q.subject || '').includes('Aptitude'), `Expected Aptitude question, got ${q.subject}`);
    });
  });

  test('generateMockQuestions with "science" filter generates 30 Science questions', () => {
    const mock = generateMockQuestions(allQuestions, 'science', 30);
    assert.equal(mock.length, 30);
    mock.forEach(q => {
      assert.ok((q.subject || '').includes('Science'), `Expected Science question, got ${q.subject}`);
    });
  });

  test('generateMockQuestions with discipline filter ("biology", "chemistry", "physics")', () => {
    ['biology', 'chemistry', 'physics'].forEach(discipline => {
      const mock = generateMockQuestions(allQuestions, discipline, 20);
      assert.ok(mock.length > 0, `Should generate questions for ${discipline}`);
      mock.forEach(q => {
        assert.equal((q.subSubject || '').toLowerCase(), discipline);
      });
    });
  });

  test('questions are distributed uniformly across multiple chapters', () => {
    const mock = generateMockQuestions(allQuestions, 'all', 30);
    const chapters = new Set(mock.map(q => q.chapter));
    // 30 questions from 51 chapters should cover at least 15 unique chapters
    assert.ok(chapters.size >= 15, `Expected >= 15 chapters represented, got ${chapters.size}`);
  });
});
