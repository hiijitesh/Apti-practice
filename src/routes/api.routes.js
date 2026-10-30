const express = require('express');
const QuestionController = require('../controllers/question.controller');
const MockController = require('../controllers/mock.controller');
const AttemptController = require('../controllers/attempt.controller');
const RevisionController = require('../controllers/revision.controller');

const router = express.Router();

// Question & chapter routes
router.get('/chapters', QuestionController.getChapters);
router.get('/questions', QuestionController.getQuestions);

// Mock CBT test routes
router.get('/mock', MockController.getMockQuestions);

// Attempt persistence & history routes
router.post('/submit-attempt', AttemptController.submitAttempt);
router.get('/attempts', AttemptController.getAttempts);
router.get('/attempts/:id', AttemptController.getAttemptById);

// Revision materials routes
router.get('/revision-materials', RevisionController.getRevisionMaterials);

module.exports = router;
