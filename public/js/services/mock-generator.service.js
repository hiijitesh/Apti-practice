// public/js/services/mock-generator.service.js - Client-side mock test question generator
(function(window) {
  'use strict';

  window.AptiPrep = window.AptiPrep || {};

  class MockGeneratorClientService {
    static filterPool(allQuestions, subjectQuery = 'all') {
      let pool = [...allQuestions];
      const sq = (subjectQuery || '').trim().toLowerCase();

      if (sq === 'aptitude' || sq === 'quantitative aptitude') {
        pool = pool.filter(q => (q.subject || '').toLowerCase().includes('aptitude'));
      } else if (sq === 'science' || sq === 'general science') {
        pool = pool.filter(q => (q.subject || '').toLowerCase().includes('science'));
      } else if (sq === 'biology' || sq === 'chemistry' || sq === 'physics') {
        pool = pool.filter(q => (q.subSubject || '').toLowerCase() === sq);
      } else if (sq === 'top300' || sq === 'top 300' || sq === 'top_300') {
        pool = pool.filter(q => q.chapter === 'Top 300 Questions');
      }

      return pool;
    }

    static generate(allQuestions, count = 30, subject = 'all') {
      const pool = this.filterPool(allQuestions, subject);
      if (pool.length === 0) return [];

      const byChapter = {};
      for (const q of pool) {
        if (!byChapter[q.chapter]) byChapter[q.chapter] = [];
        byChapter[q.chapter].push(q);
      }

      const chapterNames = Object.keys(byChapter);
      const totalTarget = Math.min(count, pool.length);
      const numChapters = chapterNames.length;

      const baseCount = Math.floor(totalTarget / numChapters);
      const remainder = totalTarget % numChapters;

      const shuffledChapters = [...chapterNames].sort(() => 0.5 - Math.random());
      const selected = [];

      shuffledChapters.forEach((chap, idx) => {
        const target = baseCount + (idx < remainder ? 1 : 0);
        const cPool = [...byChapter[chap]].sort(() => 0.5 - Math.random());
        selected.push(...cPool.slice(0, target));
      });

      if (selected.length < totalTarget) {
        const pickedIds = new Set(selected.map(q => q.id));
        const leftovers = pool.filter(q => !pickedIds.has(q.id)).sort(() => 0.5 - Math.random());
        selected.push(...leftovers.slice(0, totalTarget - selected.length));
      }

      return selected.sort(() => 0.5 - Math.random()).slice(0, totalTarget);
    }
  }

  window.AptiPrep.MockGenerator = MockGeneratorClientService;
})(window);
