const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const ATTEMPTS_FILE = path.join(DATA_DIR, 'attempts.json');

// Ensure data files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ATTEMPTS_FILE)) {
  fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify([], null, 2), 'utf8');
}

// Helper to load questions
function loadQuestions() {
  if (!fs.existsSync(QUESTIONS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(QUESTIONS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading questions.json:', err);
    return [];
  }
}

// Helper to load attempts
function loadAttempts() {
  if (!fs.existsSync(ATTEMPTS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(ATTEMPTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading attempts.json:', err);
    return [];
  }
}

// Helper to save attempts
function saveAttempts(attempts) {
  try {
    fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(attempts, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving attempts.json:', err);
    return false;
  }
}

// 1. GET /api/chapters - List of chapters with question counts
app.get('/api/chapters', (req, res) => {
  const questions = loadQuestions();
  const counts = {};

  questions.forEach(q => {
    const chap = q.chapter || 'General';
    counts[chap] = (counts[chap] || 0) + 1;
  });

  const chapters = Object.keys(counts).sort().map(name => ({
    name,
    count: counts[name]
  }));

  res.json({
    totalChapters: chapters.length,
    totalQuestions: questions.length,
    chapters
  });
});

// 2. GET /api/questions?chapter=:name - Questions for practice (includes answers & explanations)
app.get('/api/questions', (req, res) => {
  const questions = loadQuestions();
  const chapterQuery = req.query.chapter;

  if (chapterQuery) {
    const filtered = questions.filter(
      q => q.chapter.toLowerCase() === chapterQuery.trim().toLowerCase()
    );
    return res.json({
      chapter: chapterQuery,
      total: filtered.length,
      questions: filtered
    });
  }

  res.json({
    total: questions.length,
    questions
  });
});

// 3. GET /api/mock - 30 randomized questions uniformly distributed across chapters (WITHOUT leaking answers)
app.get('/api/mock', (req, res) => {
  const allQuestions = loadQuestions();
  if (allQuestions.length === 0) {
    return res.status(500).json({ error: 'No questions loaded. Please run extraction first.' });
  }

  // Group by chapter
  const byChapter = {};
  allQuestions.forEach(q => {
    if (!byChapter[q.chapter]) byChapter[q.chapter] = [];
    byChapter[q.chapter].push(q);
  });

  const chapterNames = Object.keys(byChapter);
  const totalTarget = 30;
  const numChapters = chapterNames.length;

  // Distribute 30 uniformly among available chapters
  const baseCount = Math.floor(totalTarget / numChapters);
  const remainder = totalTarget % numChapters;

  // Shuffle chapter order to distribute remainder randomly
  const shuffledChapters = [...chapterNames].sort(() => 0.5 - Math.random());
  const selectedQuestions = [];

  shuffledChapters.forEach((chap, idx) => {
    const targetForThisChap = baseCount + (idx < remainder ? 1 : 0);
    const pool = [...byChapter[chap]].sort(() => 0.5 - Math.random());
    const picked = pool.slice(0, targetForThisChap);
    selectedQuestions.push(...picked);
  });

  // If there are still fewer than 30 (e.g. some chapter had very few questions), fill from remaining
  if (selectedQuestions.length < totalTarget) {
    const pickedIds = new Set(selectedQuestions.map(q => q.id));
    const leftovers = allQuestions.filter(q => !pickedIds.has(q.id)).sort(() => 0.5 - Math.random());
    const extra = leftovers.slice(0, totalTarget - selectedQuestions.length);
    selectedQuestions.push(...extra);
  }

  // Shuffle the final 30 questions
  const finalQuestions = selectedQuestions.sort(() => 0.5 - Math.random()).slice(0, totalTarget);

  // SANITIZE: remove correctAnswer and explanation so client cannot inspect/cheat!
  const sanitized = finalQuestions.map(q => ({
    id: q.id,
    chapter: q.chapter,
    question: q.question,
    options: q.options
  }));

  res.json({
    totalQuestions: sanitized.length,
    durationMinutes: 30,
    questions: sanitized
  });
});

// 4. POST /api/submit-attempt - Submit test answers, score on backend, persist to attempts.json
app.post('/api/submit-attempt', (req, res) => {
  const { mode = 'mock', chapter = null, timeTakenSeconds = 0, answers = [] } = req.body;

  const allQuestions = loadQuestions();
  const qMap = new Map();
  allQuestions.forEach(q => qMap.set(q.id, q));

  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  // Detailed evaluated answers for review screen
  const evaluatedAnswers = [];
  // Chapter-wise breakdown
  const chapterBreakdown = {};

  answers.forEach(item => {
    const q = qMap.get(item.questionId);
    const chap = q ? q.chapter : 'General';
    if (!chapterBreakdown[chap]) {
      chapterBreakdown[chap] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
    }
    chapterBreakdown[chap].total += 1;

    const userAnswer = (item.userAnswer !== undefined && item.userAnswer !== null && item.userAnswer !== -1)
      ? Number(item.userAnswer)
      : null;

    let isCorrect = false;
    if (userAnswer === null) {
      unattemptedCount += 1;
      chapterBreakdown[chap].unattempted += 1;
    } else if (q && userAnswer === q.correctAnswer) {
      isCorrect = true;
      correctCount += 1;
      chapterBreakdown[chap].correct += 1;
    } else {
      incorrectCount += 1;
      chapterBreakdown[chap].incorrect += 1;
    }

    evaluatedAnswers.push({
      questionId: item.questionId,
      userAnswer,
      isCorrect,
      correctAnswer: q ? q.correctAnswer : null,
      explanation: q ? q.explanation : '',
      question: q ? q.question : '',
      options: q ? q.options : [],
      chapter: chap
    });
  });

  const totalQuestions = answers.length;
  const scorePercentage = totalQuestions > 0
    ? Number(((correctCount / totalQuestions) * 100).toFixed(1))
    : 0;

  // Stored attempt object matching required schema
  const attemptRecord = {
    attemptId: crypto.randomUUID ? crypto.randomUUID() : `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    mode,
    chapter: chapter || null,
    totalQuestions,
    correctCount,
    incorrectCount,
    unattemptedCount,
    scorePercentage,
    timeTakenSeconds: Math.round(timeTakenSeconds),
    // Only store answered questions, excluding unattempted/null answers
    answers: evaluatedAnswers
      .filter(a => a.userAnswer !== null && a.userAnswer !== undefined)
      .map(a => ({
        questionId: a.questionId,
        userAnswer: a.userAnswer,
        isCorrect: a.isCorrect
      }))
  };

  // Persist to attempts.json
  const attempts = loadAttempts();
  attempts.unshift(attemptRecord); // Prepend so latest is first
  saveAttempts(attempts);

  // Return full result including detailed review items
  res.json({
    success: true,
    attempt: {
      ...attemptRecord,
      chapterBreakdown,
      detailedAnswers: evaluatedAnswers
    }
  });
});

// 5. GET /api/attempts - All past attempts
app.get('/api/attempts', (req, res) => {
  const attempts = loadAttempts();
  res.json({
    totalAttempts: attempts.length,
    attempts
  });
});

// 6. GET /api/attempts/:id - Single attempt with question review data
app.get('/api/attempts/:id', (req, res) => {
  const attempts = loadAttempts();
  const attempt = attempts.find(a => a.attemptId === req.params.id);
  if (!attempt) {
    return res.status(404).json({ error: 'Attempt not found' });
  }

  // Enrich with question details for review
  const allQuestions = loadQuestions();
  const qMap = new Map();
  allQuestions.forEach(q => qMap.set(q.id, q));

  const detailedAnswers = (attempt.answers || []).map(ans => {
    const q = qMap.get(ans.questionId);
    return {
      questionId: ans.questionId,
      userAnswer: ans.userAnswer,
      isCorrect: ans.isCorrect,
      correctAnswer: q ? q.correctAnswer : null,
      explanation: q ? q.explanation : '',
      question: q ? q.question : '',
      options: q ? q.options : [],
      chapter: q ? q.chapter : 'General'
    };
  });

  // Calculate chapter breakdown
  const chapterBreakdown = {};
  detailedAnswers.forEach(ans => {
    const chap = ans.chapter;
    if (!chapterBreakdown[chap]) {
      chapterBreakdown[chap] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
    }
    chapterBreakdown[chap].total += 1;
    if (ans.userAnswer === null) {
      chapterBreakdown[chap].unattempted += 1;
    } else if (ans.isCorrect) {
      chapterBreakdown[chap].correct += 1;
    } else {
      chapterBreakdown[chap].incorrect += 1;
    }
  });

  res.json({
    ...attempt,
    chapterBreakdown,
    detailedAnswers
  });
});

// Fallback to index.html for SPA navigation
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` Aptitude Test Application running on:`);
  console.log(` http://localhost:${PORT}`);
  console.log(`===============================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(PORT) + 1;
    console.log(`Port ${PORT} in use, trying http://localhost:${nextPort}...`);
    app.listen(nextPort, () => {
      console.log(`===============================================`);
      console.log(` Aptitude Test Application running on:`);
      console.log(` http://localhost:${nextPort}`);
      console.log(`===============================================`);
    });
  } else {
    console.error('Server error:', err);
  }
});
