const questionRepository = require('../repositories/question.repository');
const MockGeneratorService = require('../services/mock-generator.service');

class MockController {
  static getMockQuestions(req, res, next) {
    try {
      const allQuestions = questionRepository.getAll();
      if (allQuestions.length === 0) {
        return res.status(500).json({ error: 'No questions loaded. Please run extraction first.' });
      }

      const subjectQuery = (req.query.subject || '').trim().toLowerCase();
      const sanitized = MockGeneratorService.generate(allQuestions, subjectQuery, 30);

      if (sanitized.length === 0) {
        return res.status(404).json({ error: `No questions found matching subject '${subjectQuery}'` });
      }

      res.json({
        totalQuestions: sanitized.length,
        durationMinutes: 30,
        questions: sanitized
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = MockController;
