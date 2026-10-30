// server.js - Application entrypoint & backwards-compatible test interface
const app = require('./src/app');
const config = require('./src/config');
const questionRepository = require('./src/repositories/question.repository');
const attemptRepository = require('./src/repositories/attempt.repository');
const MockGeneratorService = require('./src/services/mock-generator.service');
const ScoringService = require('./src/services/scoring.service');

const PORT = config.PORT;

// Backward-compatible delegators for unit and integration test harnesses
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
