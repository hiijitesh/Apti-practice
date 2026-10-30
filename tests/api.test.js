const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { app, loadQuestions } = require('../server.js');

describe('API Integration Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('GET /api/chapters returns all 52 chapters and 2891 total questions', async () => {
    const res = await fetch(`${baseUrl}/api/chapters`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.totalQuestions, 2891);
    assert.equal(data.totalChapters, 52);
    assert.equal(data.chapters.length, 52);

    const aptiCount = data.chapters.filter(c => (c.subject || '').includes('Aptitude')).length;
    const sciCount = data.chapters.filter(c => (c.subject || '').includes('Science')).length;
    assert.equal(aptiCount, 17);
    assert.equal(sciCount, 35);
  });

  test('GET /api/questions?chapter=Ages returns filtered questions for chapter', async () => {
    const res = await fetch(`${baseUrl}/api/questions?chapter=Ages`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(data.total > 0);
    assert.equal(data.chapter, 'Ages');
    data.questions.forEach(q => {
      assert.equal(q.chapter, 'Ages');
    });
  });

  test('GET /api/mock returns 30 questions without answers', async () => {
    const res = await fetch(`${baseUrl}/api/mock`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.totalQuestions, 30);
    assert.equal(data.durationMinutes, 30);
    assert.equal(data.questions.length, 30);

    data.questions.forEach(q => {
      assert.equal(q.correctAnswer, undefined);
      assert.equal(q.explanation, undefined);
    });
  });

  test('POST /api/submit-attempt scores attempt and returns detailed results', async () => {
    const allQuestions = loadQuestions();
    const q1 = allQuestions[0];
    const q2 = allQuestions[1];

    const payload = {
      mode: 'mock',
      userEmail: 'unit_test@apti.com',
      timeTakenSeconds: 45,
      answers: [
        { questionId: q1.id, userAnswer: q1.correctAnswer },
        { questionId: q2.id, userAnswer: (q2.correctAnswer + 1) % 4 }
      ]
    };

    const res = await fetch(`${baseUrl}/api/submit-attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(data.attempt);
    assert.equal(data.attempt.totalQuestions, 2);
    assert.equal(data.attempt.correctCount, 1);
    assert.equal(data.attempt.incorrectCount, 1);
    assert.equal(data.attempt.scorePercentage, 50);
  });

  test('GET /api/attempts returns attempt history', async () => {
    const res = await fetch(`${baseUrl}/api/attempts?email=unit_test@apti.com`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.attempts));
    assert.ok(data.attempts.length > 0);
    assert.equal(data.attempts[0].userEmail, 'unit_test@apti.com');
  });

  test('GET /api/revision-materials returns Google Drive folder and chapter PDFs', async () => {
    const res = await fetch(`${baseUrl}/api/revision-materials`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(data.folderUrl.includes('drive.google.com'));
    assert.ok(Array.isArray(data.pdfs));
    assert.equal(data.pdfs.length, 4);

    const pdfIds = data.pdfs.map(p => p.id);
    assert.ok(pdfIds.includes('bio'));
    assert.ok(pdfIds.includes('chem'));
    assert.ok(pdfIds.includes('physics'));
    assert.ok(pdfIds.includes('top300'));

    data.pdfs.forEach(pdf => {
      assert.ok(pdf.fileId && pdf.fileId.length > 20);
      assert.ok(pdf.previewUrl.includes('/preview'));
      assert.ok(pdf.viewUrl.includes('/view'));
    });
  });
});
