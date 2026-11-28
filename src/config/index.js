const os = require('os');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');

// Attempt history contains user emails, so it must live OUTSIDE the static web root
// (public/ is served by Express and deployed to GitHub Pages). Test runs write to a
// throwaway temp file so they never pollute real history.
function resolveAttemptsFile() {
  if (process.env.APTI_ATTEMPTS_FILE) return path.resolve(process.env.APTI_ATTEMPTS_FILE);
  if (process.env.NODE_TEST_CONTEXT) {
    return path.join(os.tmpdir(), `apti-attempts-test-${process.pid}.json`);
  }
  return path.join(ROOT_DIR, 'data', 'attempts.json');
}

module.exports = {
  PORT: process.env.PORT || 3001,
  ROOT_DIR,
  PUBLIC_DIR,
  DATA_DIR,
  QUESTIONS_FILE: path.join(DATA_DIR, 'questions.json'),
  RK_RANJAN_FILE: path.join(DATA_DIR, 'rk_ranjan_questions.json'),
  ATTEMPTS_FILE: resolveAttemptsFile(),
  REVISION_FILE: path.join(DATA_DIR, 'revision_materials.json')
};
