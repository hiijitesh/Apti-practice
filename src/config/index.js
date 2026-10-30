const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');

module.exports = {
  PORT: process.env.PORT || 3001,
  ROOT_DIR,
  PUBLIC_DIR,
  DATA_DIR,
  QUESTIONS_FILE: path.join(DATA_DIR, 'questions.json'),
  ATTEMPTS_FILE: path.join(DATA_DIR, 'attempts.json'),
  REVISION_FILE: path.join(DATA_DIR, 'revision_materials.json')
};
