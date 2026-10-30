const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Data Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const questionsPath = path.join(rootDir, 'public', 'data', 'questions.json');

  test('questions.json exists in public/data/ as single source of truth', () => {
    assert.ok(fs.existsSync(questionsPath), 'public/data/questions.json should exist');
  });

  test('questions file contains 2891 questions with unique IDs', () => {
    const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

    assert.equal(questions.length, 2891, 'Questions file should contain 2891 questions');

    const questionIds = new Set(questions.map(q => q.id));
    assert.equal(questionIds.size, 2891, 'All question IDs must be unique');
  });

  test('every question adheres strictly to CBT schema', () => {
    const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
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

  test('subject distribution: 1342 Aptitude and 1549 Science across 52 chapters', () => {
    const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    const apti = questions.filter(q => q.subject === 'Quantitative Aptitude');
    const science = questions.filter(q => q.subject === 'General Science');

    assert.equal(apti.length, 1342, 'Quantitative Aptitude must have 1342 questions');
    assert.equal(science.length, 1549, 'General Science must have 1549 questions');

    const chapters = new Set(questions.map(q => q.chapter));
    assert.equal(chapters.size, 52, 'Total unique chapters must be 52');

    const aptiChapters = new Set(apti.map(q => q.chapter));
    const sciChapters = new Set(science.map(q => q.chapter));
    assert.equal(aptiChapters.size, 17, 'Aptitude must have 17 chapters');
    assert.equal(sciChapters.size, 35, 'General Science must have 35 chapters');
  });

  test('diagrams are attached to questions and valid png data uris', () => {
    const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    const withDiagram = questions.filter(q => q.diagram && q.diagram.trim().length > 0);

    assert.ok(withDiagram.length >= 20, `Should have at least 20 questions with diagrams (found ${withDiagram.length})`);
    withDiagram.forEach(q => {
      assert.ok(q.diagram.startsWith('data:image/png;base64,'), `Diagram for ${q.id} must be a valid PNG Data URI`);
    });
  });
});
