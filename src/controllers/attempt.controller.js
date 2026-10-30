const questionRepository = require('../repositories/question.repository');
const attemptRepository = require('../repositories/attempt.repository');
const ScoringService = require('../services/scoring.service');

class AttemptController {
  static submitAttempt(req, res, next) {
    try {
      const { mode = 'mock', chapter = null, timeTakenSeconds = 0, answers = [], userEmail = null } = req.body;

      const allQuestions = questionRepository.getAll();
      const { attemptRecord, fullAttempt } = ScoringService.calculate(allQuestions, {
        mode,
        chapter,
        timeTakenSeconds,
        answers,
        userEmail
      });

      // Persist attempt record
      attemptRepository.create(attemptRecord);

      res.json({
        success: true,
        attempt: fullAttempt
      });
    } catch (err) {
      next(err);
    }
  }

  static getAttempts(req, res, next) {
    try {
      const email = (req.query.email || req.query.userEmail || '').trim().toLowerCase();
      const attempts = attemptRepository.getAll(email || null);

      res.json({
        totalAttempts: attempts.length,
        attempts
      });
    } catch (err) {
      next(err);
    }
  }

  static getAttemptById(req, res, next) {
    try {
      const attempt = attemptRepository.getById(req.params.id);
      if (!attempt) {
        return res.status(404).json({ error: 'Attempt not found' });
      }

      const enriched = ScoringService.enrichAttemptReview(attempt, questionRepository.getMap());
      res.json(enriched);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AttemptController;
