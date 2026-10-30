const fs = require('fs');
const { QUESTIONS_FILE } = require('../config');

class QuestionRepository {
  constructor(filePath = QUESTIONS_FILE) {
    this.filePath = filePath;
    this._questionsCache = null;
    this._chaptersCache = null;
    this._questionsMap = null;
  }

  /**
   * Returns all questions from memory cache, reading from disk if not yet loaded.
   * @returns {Array} List of questions
   */
  getAll() {
    if (!this._questionsCache) {
      this.reload();
    }
    return this._questionsCache;
  }

  /**
   * Returns a Map of questionId -> question object for O(1) lookups.
   * @returns {Map<string, Object>}
   */
  getMap() {
    if (!this._questionsMap) {
      this.getAll();
    }
    return this._questionsMap;
  }

  /**
   * Get a question by its unique ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getById(id) {
    const map = this.getMap();
    return map.get(id) || null;
  }

  /**
   * Reloads questions from disk into in-memory cache and builds indexes.
   */
  reload() {
    if (!fs.existsSync(this.filePath)) {
      this._questionsCache = [];
      this._chaptersCache = [];
      this._questionsMap = new Map();
      return;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this._questionsCache = Array.isArray(parsed) ? parsed : [];

      // Build O(1) lookup map
      const map = new Map();
      for (const q of this._questionsCache) {
        if (q && q.id) {
          map.set(q.id, q);
        }
      }
      this._questionsMap = map;

      // Build and sort chapter summaries
      this._chaptersCache = this._buildChapterSummaries(this._questionsCache);
    } catch (err) {
      console.error('QuestionRepository: Error reading questions file:', err);
      this._questionsCache = [];
      this._chaptersCache = [];
      this._questionsMap = new Map();
    }
  }

  /**
   * Get precomputed chapter summaries.
   * @returns {Array}
   */
  getChapters() {
    if (!this._chaptersCache) {
      this.getAll();
    }
    return this._chaptersCache;
  }

  /**
   * Filter questions by chapter name (case-insensitive).
   * @param {string} chapterName
   * @returns {Array}
   */
  getByChapter(chapterName) {
    if (!chapterName) return this.getAll();
    const query = chapterName.trim().toLowerCase();
    return this.getAll().filter(
      q => q.chapter && q.chapter.toLowerCase() === query
    );
  }

  _buildChapterSummaries(questions) {
    const chaptersMap = {};

    for (const q of questions) {
      const chap = q.chapter || 'General';
      if (!chaptersMap[chap]) {
        chaptersMap[chap] = {
          name: chap,
          subject: q.subject || 'Quantitative Aptitude',
          subSubject: q.subSubject || (q.subject === 'General Science' ? 'General Science' : 'Aptitude'),
          count: 0
        };
      }
      chaptersMap[chap].count += 1;
    }

    return Object.values(chaptersMap).sort((a, b) => {
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
      return a.name.localeCompare(b.name);
    });
  }
}

// Export singleton instance as default, class as named
const defaultQuestionRepository = new QuestionRepository();
module.exports = defaultQuestionRepository;
module.exports.QuestionRepository = QuestionRepository;
