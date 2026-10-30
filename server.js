const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./src/config');
const questionRepository = require('./src/repositories/question.repository');
const attemptRepository = require('./src/repositories/attempt.repository');
const revisionRepository = require('./src/repositories/revision.repository');
const MockGeneratorService = require('./src/services/mock-generator.service');
const ScoringService = require('./src/services/scoring.service');

const app = express();
const PORT = config.PORT;

app.use(cors());
app.use(express.json());
app.use(express.static(config.PUBLIC_DIR));

// Backward-compatible delegators for tests and external consumers
function loadQuestions() {
  return questionRepository.getAll();
}

function loadAttempts() {
  return attemptRepository.getAll();
}

function saveAttempts(attempts) {
  return attemptRepository.saveAll(attempts);
}

function generateMockQuestions(allQuestions, subjectQuery = 'all', targetCount = 30) {
  return MockGeneratorService.generate(allQuestions, subjectQuery, targetCount);
}

function calculateScore(allQuestions, options) {
  return ScoringService.calculate(allQuestions, options);
}

// 1. GET /api/chapters - List of chapters with question counts, subjects, and subSubjects
app.get('/api/chapters', (req, res) => {
  const chapters = questionRepository.getChapters();
  const allQuestions = questionRepository.getAll();

  res.json({
    totalChapters: chapters.length,
    totalQuestions: allQuestions.length,
    chapters
  });
});

// 2. GET /api/questions?chapter=:name - Questions for practice (includes answers & explanations)
app.get('/api/questions', (req, res) => {
  const chapterQuery = req.query.chapter;

  if (chapterQuery) {
    const filtered = questionRepository.getByChapter(chapterQuery);
    return res.json({
      chapter: chapterQuery,
      total: filtered.length,
      questions: filtered
    });
  }

  const all = questionRepository.getAll();
  res.json({
    total: all.length,
    questions: all
  });
});

// 3. GET /api/mock - 30 randomized questions uniformly distributed across chapters (WITHOUT leaking answers)
app.get('/api/mock', (req, res) => {
  const allQuestions = questionRepository.getAll();
  if (allQuestions.length === 0) {
    return res.status(500).json({ error: 'No questions loaded. Please run extraction first.' });
  }

  const subjectQuery = (req.query.subject || '').trim().toLowerCase();
  const sanitized = MockGeneratorService.generate(allQuestions, subjectQuery, 30);

  if (sanitized.length === 0) {
    return res.status(404).json({ error: `No questions found matching subject '${subjectQuery}'` });
  }

  res.json({
    totalQuestions: sanitized.length,
    durationMinutes: 30,
    questions: sanitized
  });
});

// 4. POST /api/submit-attempt - Submit test answers, score on backend, persist to attempts.json
app.post('/api/submit-attempt', (req, res) => {
  const { mode = 'mock', chapter = null, timeTakenSeconds = 0, answers = [], userEmail = null } = req.body;

  const allQuestions = questionRepository.getAll();
  const { attemptRecord, fullAttempt } = ScoringService.calculate(allQuestions, {
    mode,
    chapter,
    timeTakenSeconds,
    answers,
    userEmail
  });

  // Persist attempt via repository
  attemptRepository.create(attemptRecord);

  res.json({
    success: true,
    attempt: fullAttempt
  });
});

// 5. GET /api/attempts - All past attempts (optional ?email=... filter)
app.get('/api/attempts', (req, res) => {
  const email = (req.query.email || req.query.userEmail || '').trim().toLowerCase();
  const attempts = attemptRepository.getAll(email || null);

  res.json({
    totalAttempts: attempts.length,
    attempts
  });
});

// 6. GET /api/attempts/:id - Single attempt with question review data
app.get('/api/attempts/:id', (req, res) => {
  const attempt = attemptRepository.getById(req.params.id);
  if (!attempt) {
    return res.status(404).json({ error: 'Attempt not found' });
  }

  const enriched = ScoringService.enrichAttemptReview(attempt, questionRepository.getMap());
  res.json(enriched);
});

// 7. GET /api/revision-materials - Revision PDFs, Drive URLs and chapter mappings
app.get('/api/revision-materials', (req, res) => {
  const materials = revisionRepository.getMaterials();
  if (materials) {
    return res.json(materials);
  }
  res.status(404).json({ error: 'Revision materials not found' });
});

// Fallback to index.html for SPA navigation
app.use((req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
});

let serverInstance = null;
if (require.main === module) {
  serverInstance = app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` Aptitude Test Application running on:`);
    console.log(` http://localhost:${PORT}`);
    console.log(`===============================================`);
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = Number(PORT) + 1;
      console.log(`Port ${PORT} in use, trying http://localhost:${nextPort}...`);
      serverInstance = app.listen(nextPort, () => {
        console.log(`===============================================`);
        console.log(` Aptitude Test Application running on:`);
        console.log(` http://localhost:${nextPort}`);
        console.log(`===============================================`);
      });
    } else {
      console.error('Server error:', err);
    }
  });
}

module.exports = {
  app,
  loadQuestions,
  loadAttempts,
  generateMockQuestions,
  calculateScore
};
