const fs = require('fs');
const { QUESTIONS_FILE, RK_RANJAN_FILE } = require('../config');

class QuestionRepository {
  constructor(filePath = QUESTIONS_FILE, rkFilePath = RK_RANJAN_FILE) {
    this.filePath = filePath;
    this.rkFilePath = rkFilePath;
    this._questionsCache = null;
    this._chaptersCache = null;
    this._questionsMap = null;
    this._rkQuestionsCache = null;
    this._rkChaptersCache = null;
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
   * @param {string} source
   * @returns {Array}
   */
  getByChapter(chapterName, source = null) {
    if (source === 'rk_ranjan') {
      const rkAll = this.getRkQuestions();
      if (!chapterName) return rkAll;
      const q = chapterName.trim().toLowerCase();
      return rkAll.filter(item => item.chapter && item.chapter.toLowerCase() === q);
    }

    if (!chapterName) return this.getAll();
    const query = chapterName.trim().toLowerCase();
    const coreMatches = this.getAll().filter(
      q => q.chapter && q.chapter.toLowerCase() === query
    );
    if (coreMatches.length > 0) return coreMatches;

    // Fallback to RK Ranjan questions if chapter is an RK chapter
    const rkMatches = this.getRkQuestions().filter(
      q => q.chapter && q.chapter.toLowerCase() === query
    );
    return rkMatches.length > 0 ? rkMatches : coreMatches;
  }

  /**
   * Returns all purified RK Ranjan questions.
   * @returns {Array}
   */
  getRkQuestions() {
    if (this._rkQuestionsCache) return this._rkQuestionsCache;
    if (!fs.existsSync(this.rkFilePath)) {
      this._rkQuestionsCache = [];
      return [];
    }
    try {
      const raw = fs.readFileSync(this.rkFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      this._rkQuestionsCache = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('QuestionRepository: Error loading RK questions:', e);
      this._rkQuestionsCache = [];
    }
    return this._rkQuestionsCache;
  }

  /**
   * Returns precomputed RK Ranjan chapter summaries.
   * @returns {Array}
   */
  getRkChapters() {
    if (this._rkChaptersCache) return this._rkChaptersCache;
    const rkQs = this.getRkQuestions();
    this._rkChaptersCache = this._buildChapterSummaries(rkQs);
    return this._rkChaptersCache;
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
