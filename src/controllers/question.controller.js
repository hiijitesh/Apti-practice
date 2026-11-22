const questionRepository = require('../repositories/question.repository');

class QuestionController {
  static getChapters(req, res, next) {
    try {
      const chapters = questionRepository.getChapters();
      const allQuestions = questionRepository.getAll();

      res.json({
        totalChapters: chapters.length,
        totalQuestions: allQuestions.length,
        chapters
      });
    } catch (err) {
      next(err);
    }
  }

  static getQuestions(req, res, next) {
    try {
      const chapterQuery = req.query.chapter;
      const sourceQuery = req.query.source;

      if (chapterQuery) {
        const filtered = questionRepository.getByChapter(chapterQuery, sourceQuery);
        return res.json({
          chapter: chapterQuery,
          total: filtered.length,
          questions: filtered
        });
      }

      if (sourceQuery === 'rk_ranjan') {
        const rkAll = questionRepository.getRkQuestions();
        return res.json({
          total: rkAll.length,
          questions: rkAll
        });
      }

      const all = questionRepository.getAll();
      res.json({
        total: all.length,
        questions: all
      });
    } catch (err) {
      next(err);
    }
  }

  static getRkChapters(req, res, next) {
    try {
      const chapters = questionRepository.getRkChapters();
      const all = questionRepository.getRkQuestions();
      res.json({
        totalChapters: chapters.length,
        totalQuestions: all.length,
        chapters
      });
    } catch (err) {
      next(err);
    }
  }

  static getRkQuestions(req, res, next) {
    try {
      const chapterQuery = req.query.chapter;
      if (chapterQuery) {
        const filtered = questionRepository.getByChapter(chapterQuery, 'rk_ranjan');
        return res.json({
          chapter: chapterQuery,
          total: filtered.length,
          questions: filtered
        });
      }
      const all = questionRepository.getRkQuestions();
      res.json({
        total: all.length,
        questions: all
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = QuestionController;
