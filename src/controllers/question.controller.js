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
    } catch (err) {
      next(err);
    }
  }
}

module.exports = QuestionController;
