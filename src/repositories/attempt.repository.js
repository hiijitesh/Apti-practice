const fs = require('fs');
const { ATTEMPTS_FILE, DATA_DIR } = require('../config');

class AttemptRepository {
  constructor(filePath = ATTEMPTS_FILE) {
    this.filePath = filePath;
    this._ensureFileExists();
  }

  _ensureFileExists() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf8');
    }
  }

  /**
   * Load all attempts from disk.
   * @param {string|null} filterEmail Optional email filter
   * @returns {Array}
   */
  getAll(filterEmail = null) {
    let attempts = [];
    if (!fs.existsSync(this.filePath)) {
      return attempts;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      attempts = JSON.parse(raw);
      if (!Array.isArray(attempts)) attempts = [];
    } catch (err) {
      console.error('AttemptRepository: Error reading attempts file:', err);
      return [];
    }

    if (filterEmail) {
      const normalized = filterEmail.trim().toLowerCase();
      return attempts.filter(a => (a.userEmail || '').toLowerCase() === normalized);
    }

    return attempts;
  }

  /**
   * Find an attempt by its attemptId.
   * @param {string} id
   * @returns {Object|null}
   */
  getById(id) {
    const attempts = this.getAll();
    return attempts.find(a => a.attemptId === id) || null;
  }

  /**
   * Prepend a new attempt record and persist to disk.
   * @param {Object} attemptRecord
   * @returns {boolean}
   */
  create(attemptRecord) {
    const attempts = this.getAll();
    attempts.unshift(attemptRecord);
    return this.saveAll(attempts);
  }

  /**
   * Save the full attempts array to disk.
   * @param {Array} attempts
   * @returns {boolean}
   */
  saveAll(attempts) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(attempts, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('AttemptRepository: Error saving attempts file:', err);
      return false;
    }
  }
}

const defaultAttemptRepository = new AttemptRepository();
module.exports = defaultAttemptRepository;
module.exports.AttemptRepository = AttemptRepository;
