// src/services/scoring.service.js - CBT Negative Marking (-0.33), Percentile, & Pacing Engine
'use strict';

const crypto = require('crypto');

class ScoringService {
  /**
   * Approximate cumulative normal distribution function Phi(Z).
   * Abramowitz & Stegun formula 7.1.26 (error < 1.5e-7).
   * @param {number} x Score percentage
   * @param {number} mean National baseline mean (default 45%)
   * @param {number} stdDev National standard deviation (default 18%)
   * @returns {number} Estimated percentile (1.0 to 99.9)
   */
  static normalCdf(x, mean = 45, stdDev = 18) {
    const z = (x - mean) / stdDev;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    if (z > 0) p = 1 - p;
    return Math.min(99.9, Math.max(1.0, Number((p * 100).toFixed(1))));
  }

  /**
   * Pure scoring calculation with CBT Negative Marking (-0.33),
   * Sectional Mastery, Percentile Estimation, and Pacing Analytics.
   * @param {Array} allQuestions Complete questions dataset
   * @param {Object} options Calculation options
   * @returns {{ attemptRecord: Object, fullAttempt: Object }}
   */
  static calculate(allQuestions, {
    mode = 'mock',
    chapter = null,
    timeTakenSeconds = 0,
    answers = [],
    userEmail = null,
    marksPerCorrect = 1.0,
    negativeMarkingRate = 1 / 3
  } = {}) {
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
    const sectionBreakdown = {
      'Quantitative Aptitude': { total: 0, correct: 0, incorrect: 0, unattempted: 0, netMarks: 0, accuracyPercentage: 0 },
      'Physics': { total: 0, correct: 0, incorrect: 0, unattempted: 0, netMarks: 0, accuracyPercentage: 0 },
      'Chemistry': { total: 0, correct: 0, incorrect: 0, unattempted: 0, netMarks: 0, accuracyPercentage: 0 },
      'Biology': { total: 0, correct: 0, incorrect: 0, unattempted: 0, netMarks: 0, accuracyPercentage: 0 }
    };
    const difficultyBreakdown = {
      easy: { total: 0, correct: 0, incorrect: 0, unattempted: 0 },
      medium: { total: 0, correct: 0, incorrect: 0, unattempted: 0 },
      hard: { total: 0, correct: 0, incorrect: 0, unattempted: 0 }
    };

    let rapidCount = 0;
    let balancedCount = 0;
    let overtimeCount = 0;
    let rapidCorrect = 0;

    for (const item of answers) {
      const q = qMap.get(item.questionId);
      const chap = q ? q.chapter : 'General';
      const sub = q ? (q.subSubject || q.subject || 'General') : 'General';

      // Section categorization
      let sectionKey = 'Quantitative Aptitude';
      if (/physics/i.test(sub)) sectionKey = 'Physics';
      else if (/chemistry/i.test(sub)) sectionKey = 'Chemistry';
      else if (/biology/i.test(sub)) sectionKey = 'Biology';
      else if (/aptitude|math/i.test(sub)) sectionKey = 'Quantitative Aptitude';
      else if (/science/i.test(sub)) sectionKey = 'Physics';

      if (!chapterBreakdown[chap]) {
        chapterBreakdown[chap] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
      }
      chapterBreakdown[chap].total += 1;
      if (sectionBreakdown[sectionKey]) {
        sectionBreakdown[sectionKey].total += 1;
      }

      // Difficulty categorization
      const diff = (q && q.difficulty) ? q.difficulty : 'medium';
      if (difficultyBreakdown[diff]) {
        difficultyBreakdown[diff].total += 1;
      }

      const userAnswer = (item.userAnswer !== undefined && item.userAnswer !== null && item.userAnswer !== -1)
        ? Number(item.userAnswer)
        : null;

      let isCorrect = false;
      if (userAnswer === null) {
        unattemptedCount += 1;
        chapterBreakdown[chap].unattempted += 1;
        if (sectionBreakdown[sectionKey]) sectionBreakdown[sectionKey].unattempted += 1;
        if (difficultyBreakdown[diff]) difficultyBreakdown[diff].unattempted += 1;
      } else if (q && userAnswer === q.correctAnswer) {
        isCorrect = true;
        correctCount += 1;
        chapterBreakdown[chap].correct += 1;
        if (sectionBreakdown[sectionKey]) sectionBreakdown[sectionKey].correct += 1;
        if (difficultyBreakdown[diff]) difficultyBreakdown[diff].correct += 1;
      } else {
        incorrectCount += 1;
        chapterBreakdown[chap].incorrect += 1;
        if (sectionBreakdown[sectionKey]) sectionBreakdown[sectionKey].incorrect += 1;
        if (difficultyBreakdown[diff]) difficultyBreakdown[diff].incorrect += 1;
      }

      // Pacing analysis if per-question time is supplied
      const qTime = item.timeSpentSeconds !== undefined ? Number(item.timeSpentSeconds) : null;
      let pacingTag = 'balanced';
      if (qTime !== null) {
        if (qTime < 25) {
          rapidCount += 1;
          pacingTag = 'rapid';
          if (isCorrect) rapidCorrect += 1;
        } else if (qTime > 75) {
          overtimeCount += 1;
          pacingTag = 'overtime';
        } else {
          balancedCount += 1;
        }
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
        subSubject: q ? q.subSubject : undefined,
        difficulty: diff,
        timeSpentSeconds: qTime,
        pacingTag
      });
    }

    // Compute Sectional Net Marks & Accuracy
    for (const [secKey, secStats] of Object.entries(sectionBreakdown)) {
      secStats.netMarks = Number((secStats.correct * marksPerCorrect - secStats.incorrect * negativeMarkingRate).toFixed(2));
      secStats.accuracyPercentage = (secStats.correct + secStats.incorrect > 0)
        ? Number(((secStats.correct / (secStats.correct + secStats.incorrect)) * 100).toFixed(1))
        : 0;
    }

    const totalQuestions = answers.length;
    const attemptedCount = correctCount + incorrectCount;

    // CBT Scoring Metrics
    const grossMarks = Number((correctCount * marksPerCorrect).toFixed(2));
    const negativeMarksLost = Number((incorrectCount * negativeMarkingRate).toFixed(2));
    const netMarks = Number((grossMarks - negativeMarksLost).toFixed(2));
    const maxPossibleMarks = totalQuestions * marksPerCorrect;

    // Backward compatibility: scorePercentage remains (correctCount / totalQuestions) * 100
    const scorePercentage = totalQuestions > 0
      ? Number(((correctCount / totalQuestions) * 100).toFixed(1))
      : 0;

    const netPercentage = maxPossibleMarks > 0
      ? Math.max(0, Number(((netMarks / maxPossibleMarks) * 100).toFixed(1)))
      : 0;

    const accuracyPercentage = attemptedCount > 0
      ? Number(((correctCount / attemptedCount) * 100).toFixed(1))
      : 0;

    // Percentile & Performance Band Estimation
    const estimatedPercentile = this.normalCdf(netPercentage, 45, 18);
    let performanceBand = 'Below Cutoff (Focus on Weak Chapters & Negative Penalty Control)';
    if (netPercentage >= 75) {
      performanceBand = 'Exceptional (Top 5% Tier - Clear Selection Zone)';
    } else if (netPercentage >= 60) {
      performanceBand = 'Strong (Competitive Cutoff Zone)';
    } else if (netPercentage >= 45) {
      performanceBand = 'Borderline (Needs Accuracy & Speed Boost)';
    }

    // Pacing Analytics
    const avgSecondsPerQuestion = totalQuestions > 0 ? Math.round(timeTakenSeconds / totalQuestions) : 0;
    let paceCategory = 'Optimal Exam Pace (40-60s/Q)';
    if (avgSecondsPerQuestion < 35) paceCategory = 'Rapid / Aggressive Pace (<35s/Q)';
    else if (avgSecondsPerQuestion > 65) paceCategory = 'Deliberate / Time-Intensive Pace (>65s/Q)';

    const pacingAnalytics = {
      avgSecondsPerQuestion,
      paceCategory,
      totalTimeSeconds: Math.round(timeTakenSeconds),
      rapidCount,
      balancedCount,
      overtimeCount,
      rapidAccuracy: rapidCount > 0 ? Number(((rapidCorrect / rapidCount) * 100).toFixed(1)) : 0
    };

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
      grossMarks,
      negativeMarksLost,
      netMarks,
      netPercentage,
      accuracyPercentage,
      estimatedPercentile,
      performanceBand,
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
        sectionBreakdown,
        difficultyBreakdown,
        pacingAnalytics,
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
        diagram: (q && q.diagram) ? q.diagram : undefined,
        chapter: q ? q.chapter : 'General',
        subject: q ? q.subject : undefined,
        subSubject: q ? q.subSubject : undefined,
        difficulty: q ? q.difficulty : undefined
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
