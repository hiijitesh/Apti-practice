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

  test('generateMockQuestions with "top300" filter generates 30 Top 300 questions', () => {
    const mock = generateMockQuestions(allQuestions, 'top300', 30);
    assert.equal(mock.length, 30);
    mock.forEach(q => {
      assert.equal(q.chapter, 'Top 300 Questions');
      assert.ok(q.id.startsWith('sci_top300_'));
    });
  });

  test('questions are distributed uniformly across multiple chapters', () => {
    const mock = generateMockQuestions(allQuestions, 'all', 30);
    const chapters = new Set(mock.map(q => q.chapter));
    // 30 questions from 51 chapters should cover at least 15 unique chapters
    assert.ok(chapters.size >= 15, `Expected >= 15 chapters represented, got ${chapters.size}`);
  });

  test('Mock UI in public/index.html and public/app.js contains zero static "testbook" or "NTPC" references', () => {
    const fs = require('fs');
    const path = require('path');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
    const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf-8');

    assert.ok(!indexHtml.toLowerCase().includes('testbook'), 'index.html must not contain testbook branding');
    assert.ok(!indexHtml.includes('RRB NTPC'), 'index.html mock header must not contain hardcoded RRB NTPC text');
    assert.ok(!appJs.includes('RRB NTPC Graduate Level'), 'app.js must not contain hardcoded NTPC mock titles');

    assert.ok(indexHtml.includes('AptiPrep'), 'index.html must use AptiPrep CBT branding');
    assert.ok(appJs.includes('Full Mock Test: Quantitative Aptitude'), 'app.js must use dynamic mock titles');
  });
});
