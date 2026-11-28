// server.js - Application entrypoint & backwards-compatible test interface
const os = require('os');
const app = require('./src/app');
const config = require('./src/config');
const questionRepository = require('./src/repositories/question.repository');
const attemptRepository = require('./src/repositories/attempt.repository');
const MockGeneratorService = require('./src/services/mock-generator.service');
const ScoringService = require('./src/services/scoring.service');

const PORT = config.PORT;

function getLocalIpAddress() {
  const ifaces = os.networkInterfaces();
  for (const dev in ifaces) {
    for (const details of ifaces[dev]) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return 'localhost';
}

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
function listen(port, triesLeft = 10) {
  const localIp = getLocalIpAddress();
  serverInstance = app.listen(port, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(` Aptitude Test Application running on:`);
    console.log(` - Local (Mac):   http://localhost:${port}`);
    console.log(` - Mobile (Wi-Fi): http://${localIp}:${port}`);
    console.log(`===============================================`);
  });
  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`Port ${port} in use, trying port ${port + 1}...`);
      listen(port + 1, triesLeft - 1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  listen(Number(PORT));
}

module.exports = {
  app,
  loadQuestions,
  loadAttempts,
  generateMockQuestions,
  calculateScore
};
