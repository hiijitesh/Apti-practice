// public/js/services/scoring.service.js - Pure scoring engine for client-side evaluation
(function(window) {
  'use strict';

  window.AptiPrep = window.AptiPrep || {};

  class ScoringClientService {
    /**
     * Evaluates answers against question bank with full chapter breakdown and detailed question stats.
     */
    static calculate({ questions = [], answers = [], mode = 'mock', chapter = null, timeTakenSeconds = 0, userEmail = 'guest@local' }) {
      const qMap = new Map();
      for (const q of questions) {
        if (q && q.id) {
          qMap.set(q.id, q);
        }
      }

      let correctCount = 0;
      let incorrectCount = 0;
      let unattemptedCount = 0;

      const evaluatedAnswers = [];
      const chapterBreakdown = {};

      for (const item of answers) {
        const q = qMap.get(item.questionId);
        const chap = q ? q.chapter : 'General';
        if (!chapterBreakdown[chap]) {
          chapterBreakdown[chap] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
        }
        chapterBreakdown[chap].total += 1;

        const userAnswer = (item.userAnswer !== undefined && item.userAnswer !== null && item.userAnswer !== -1)
          ? Number(item.userAnswer)
          : null;

        let isCorrect = false;
        if (userAnswer === null) {
          unattemptedCount += 1;
          chapterBreakdown[chap].unattempted += 1;
        } else if (q && userAnswer === q.correctAnswer) {
          isCorrect = true;
          correctCount += 1;
          chapterBreakdown[chap].correct += 1;
        } else {
          incorrectCount += 1;
          chapterBreakdown[chap].incorrect += 1;
        }

        evaluatedAnswers.push({
          questionId: item.questionId,
          userAnswer,
          isCorrect,
          correctAnswer: q ? q.correctAnswer : null,
          explanation: q ? q.explanation : '',
          question: q ? q.question : '',
          options: q ? q.options : [],
          diagram: (q && q.diagram) ? q.diagram : undefined,
          chapter: chap,
          subject: q ? q.subject : undefined,
          subSubject: q ? q.subSubject : undefined
        });
      }

      const totalQuestions = answers.length;
      const scorePercentage = totalQuestions > 0
        ? Number(((correctCount / totalQuestions) * 100).toFixed(1))
        : 0;

      const attemptId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const attemptRecord = {
        attemptId,
        timestamp: new Date().toISOString(),
        userEmail: (userEmail || 'guest@local').trim().toLowerCase(),
        mode,
        chapter: chapter || null,
        totalQuestions,
        correctCount,
        incorrectCount,
        unattemptedCount,
        scorePercentage,
        timeTakenSeconds: Math.round(timeTakenSeconds),
        answers: evaluatedAnswers.map(a => ({
          questionId: a.questionId,
          userAnswer: a.userAnswer,
          isCorrect: a.isCorrect
        }))
      };

      const fullAttempt = {
        ...attemptRecord,
        chapterBreakdown,
        detailedAnswers: evaluatedAnswers
      };

      return {
        attemptRecord,
        fullAttempt
      };
    }
  }

  window.AptiPrep.ScoringService = ScoringClientService;
})(window);
