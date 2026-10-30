const crypto = require('crypto');

class ScoringService {
  /**
   * Pure scoring calculation - does not touch files or databases
   * @param {Array} allQuestions Complete questions dataset
   * @param {Object} options Calculation options
   * @returns {{ attemptRecord: Object, fullAttempt: Object }}
   */
  static calculate(allQuestions, { mode = 'mock', chapter = null, timeTakenSeconds = 0, answers = [], userEmail = null } = {}) {
    const qMap = new Map();
    for (const q of allQuestions) {
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

    const attemptRecord = {
      attemptId: crypto.randomUUID ? crypto.randomUUID() : `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      userEmail: userEmail ? userEmail.trim().toLowerCase() : 'guest@local',
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

    return {
      attemptRecord,
      fullAttempt: {
        ...attemptRecord,
        chapterBreakdown,
        detailedAnswers: evaluatedAnswers
      }
    };
  }

  /**
   * Enrich an existing attempt with full question review data and chapter breakdowns.
   * @param {Object} attempt
   * @param {Array|Map} questions
   * @returns {Object} Enriched attempt
   */
  static enrichAttemptReview(attempt, questions) {
    const qMap = questions instanceof Map
      ? questions
      : new Map(questions.map(q => [q.id, q]));

    const detailedAnswers = (attempt.answers || []).map(ans => {
      const q = qMap.get(ans.questionId);
      return {
        questionId: ans.questionId,
        userAnswer: ans.userAnswer,
        isCorrect: ans.isCorrect,
        correctAnswer: q ? q.correctAnswer : null,
        explanation: q ? q.explanation : '',
        question: q ? q.question : '',
        options: q ? q.options : [],
        chapter: q ? q.chapter : 'General',
        subject: q ? q.subject : undefined,
        subSubject: q ? q.subSubject : undefined
      };
    });

    const chapterBreakdown = {};
    for (const ans of detailedAnswers) {
      const chap = ans.chapter;
      if (!chapterBreakdown[chap]) {
        chapterBreakdown[chap] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
      }
      chapterBreakdown[chap].total += 1;
      if (ans.userAnswer === null) {
        chapterBreakdown[chap].unattempted += 1;
      } else if (ans.isCorrect) {
        chapterBreakdown[chap].correct += 1;
      } else {
        chapterBreakdown[chap].incorrect += 1;
      }
    }

    return {
      ...attempt,
      chapterBreakdown,
      detailedAnswers
    };
  }
}

module.exports = ScoringService;
