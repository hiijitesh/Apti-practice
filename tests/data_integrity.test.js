const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Data Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const serverQuestionsPath = path.join(rootDir, 'data', 'questions.json');
  const publicQuestionsPath = path.join(rootDir, 'public', 'data', 'questions.json');

  test('questions.json exists in both data/ and public/data/', () => {
    assert.ok(fs.existsSync(serverQuestionsPath), 'data/questions.json should exist');
    assert.ok(fs.existsSync(publicQuestionsPath), 'public/data/questions.json should exist');
  });

  test('both questions files have matching counts and identical question IDs', () => {
    const serverQuestions = JSON.parse(fs.readFileSync(serverQuestionsPath, 'utf8'));
    const publicQuestions = JSON.parse(fs.readFileSync(publicQuestionsPath, 'utf8'));

    assert.equal(serverQuestions.length, 2721, 'Master questions file should contain 2721 questions');
    assert.equal(publicQuestions.length, 2721, 'Public static questions file should contain 2721 questions');

    const serverIds = new Set(serverQuestions.map(q => q.id));
    const publicIds = new Set(publicQuestions.map(q => q.id));
    assert.equal(serverIds.size, 2721, 'All question IDs must be unique');
    assert.equal(publicIds.size, 2721, 'All public question IDs must be unique');
  });

  test('every question adheres strictly to CBT schema', () => {
    const questions = JSON.parse(fs.readFileSync(serverQuestionsPath, 'utf8'));
    const validSubjects = new Set(['Quantitative Aptitude', 'General Science']);
    const validSubSubjects = new Set(['Quantitative Aptitude', 'Biology', 'Chemistry', 'Physics']);

    questions.forEach((q, idx) => {
      assert.ok(typeof q.id === 'string' && q.id.length > 0, `Question #${idx} missing valid id`);
      assert.ok(typeof q.chapter === 'string' && q.chapter.trim().length > 0, `Question #${idx} missing chapter`);
      assert.ok(validSubjects.has(q.subject), `Question #${idx} invalid subject: ${q.subject}`);
      assert.ok(validSubSubjects.has(q.subSubject), `Question #${idx} invalid subSubject: ${q.subSubject}`);
      assert.ok(typeof q.question === 'string' && q.question.trim().length > 0, `Question #${idx} empty question text`);
      assert.ok(Array.isArray(q.options), `Question #${idx} options must be an array`);
      assert.equal(q.options.length, 4, `Question #${idx} must have exactly 4 options`);
      q.options.forEach((opt, optIdx) => {
        assert.ok(typeof opt === 'string' && opt.trim().length > 0, `Question #${idx} option #${optIdx} is empty`);
      });
      assert.ok(Number.isInteger(q.correctAnswer), `Question #${idx} correctAnswer must be an integer`);
      assert.ok(q.correctAnswer >= 0 && q.correctAnswer <= 3, `Question #${idx} correctAnswer out of range: ${q.correctAnswer}`);
      assert.ok(typeof q.explanation === 'string', `Question #${idx} explanation must be a string`);
    });
  });

  test('subject distribution: 1342 Aptitude and 1379 Science across 51 chapters', () => {
    const questions = JSON.parse(fs.readFileSync(serverQuestionsPath, 'utf8'));
    const apti = questions.filter(q => q.subject === 'Quantitative Aptitude');
    const science = questions.filter(q => q.subject === 'General Science');

    assert.equal(apti.length, 1342, 'Quantitative Aptitude must have 1342 questions');
    assert.equal(science.length, 1379, 'General Science must have 1379 questions');

    const chapters = new Set(questions.map(q => q.chapter));
    assert.equal(chapters.size, 51, 'Total unique chapters must be 51');

    const aptiChapters = new Set(apti.map(q => q.chapter));
    const sciChapters = new Set(science.map(q => q.chapter));
    assert.equal(aptiChapters.size, 17, 'Aptitude must have 17 chapters');
    assert.equal(sciChapters.size, 34, 'General Science must have 34 chapters');
  });
});
