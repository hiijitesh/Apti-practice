// public/js/services/mock-generator.service.js - Client-side mock test question generator with Blueprint Stratification
(function(window) {
  'use strict';

  window.AptiPrep = window.AptiPrep || {};

  class MockGeneratorClientService {
    static classifyDifficulty(q) {
      if (!q) return 'medium';
      if (q.difficulty === 'easy' || q.difficulty === 'medium' || q.difficulty === 'hard') {
        return q.difficulty;
      }

      if (q.type) {
        const typeMatch = q.type.match(/type\s*0?(\d+)/i);
        if (typeMatch) {
          const typeNum = parseInt(typeMatch[1], 10);
          if (typeNum <= 3) return 'easy';
          if (typeNum <= 7) return 'medium';
          return 'hard';
        }
        if (/pro\s*level|mains|advance|hard|test/i.test(q.type)) return 'hard';
      }

      const qLen = (q.question || '').length;
      const optLen = (q.options || []).join(' ').length;
      const hasMathSymbols = /[√∑∫π%^/\\=]/.test(q.question || '');

      if (qLen < 85 && optLen < 70 && !hasMathSymbols) return 'easy';
      if (qLen > 220 || optLen > 180 || (qLen > 150 && hasMathSymbols)) return 'hard';
      return 'medium';
    }

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

    static sampleSlice(pool, targetCount, options = {}) {
      if (!pool || pool.length === 0 || targetCount <= 0) return [];
      if (pool.length <= targetCount) return [...pool].sort(() => 0.5 - Math.random());

      const weakChaptersSet = new Set(
        (options.weakChapters || []).map(ch => (ch || '').trim().toLowerCase())
      );

      const byChapter = {};
      for (const q of pool) {
        const ch = q.chapter || 'General';
        if (!byChapter[ch]) byChapter[ch] = [];
        byChapter[ch].push(q);
      }

      const chapterList = Object.keys(byChapter);
      const weightedChapters = [...chapterList].sort((a, b) => {
        const aWeak = weakChaptersSet.has(a.toLowerCase()) ? 1 : 0;
        const bWeak = weakChaptersSet.has(b.toLowerCase()) ? 1 : 0;
        if (aWeak !== bWeak) return bWeak - aWeak;
        return 0.5 - Math.random();
      });

      const easyTarget = Math.round(targetCount * 0.4);
      const mediumTarget = Math.round(targetCount * 0.4);
      const hardTarget = Math.max(0, targetCount - easyTarget - mediumTarget);
      const diffTargets = { easy: easyTarget, medium: mediumTarget, hard: hardTarget };

      const selected = [];
      const pickedIds = new Set();
      const diffCounts = { easy: 0, medium: 0, hard: 0 };

      // Pass 1: Questions per chapter, prioritizing weak chapters (up to 2 for weak chapters)
      for (const ch of weightedChapters) {
        if (selected.length >= targetCount) break;

        const candidates = byChapter[ch].filter(q => !pickedIds.has(q.id));
        if (candidates.length === 0) continue;

        const isWeak = weakChaptersSet.has(ch.toLowerCase());
        const quota = isWeak ? Math.min(2, targetCount - selected.length) : 1;

        for (let i = 0; i < quota; i++) {
          const remainingCandidates = byChapter[ch].filter(q => !pickedIds.has(q.id));
          if (remainingCandidates.length === 0) break;

          let bestQ = null;
          const neededDiffs = ['easy', 'medium', 'hard']
            .filter(d => diffCounts[d] < diffTargets[d])
            .sort((a, b) => (diffTargets[b] - diffCounts[b]) - (diffTargets[a] - diffCounts[a]));

          for (const d of neededDiffs) {
            bestQ = remainingCandidates.find(q => this.classifyDifficulty(q) === d);
            if (bestQ) break;
          }

          if (!bestQ) {
            bestQ = remainingCandidates[Math.floor(Math.random() * remainingCandidates.length)];
          }

          const qDiff = this.classifyDifficulty(bestQ);
          diffCounts[qDiff] = (diffCounts[qDiff] || 0) + 1;
          pickedIds.add(bestQ.id);
          selected.push(bestQ);
        }
      }

      if (selected.length < targetCount) {
        const remainingPool = pool
          .filter(q => !pickedIds.has(q.id))
          .sort(() => 0.5 - Math.random());

        for (const q of remainingPool) {
          if (selected.length >= targetCount) break;
          const qDiff = this.classifyDifficulty(q);
          diffCounts[qDiff] = (diffCounts[qDiff] || 0) + 1;
          pickedIds.add(q.id);
          selected.push(q);
        }
      }

      return selected;
    }

    static generate(allQuestions, count = 30, subject = 'all', options = {}) {
      if (!allQuestions || allQuestions.length === 0) return [];
      const sq = (subject || 'all').trim().toLowerCase();

      let selectedQuestions = [];

      if (sq === 'all' || sq === 'combined') {
        const aptiPool = allQuestions.filter(q => (q.subject || '').toLowerCase().includes('aptitude'));
        const physPool = allQuestions.filter(q => (q.subSubject || '').toLowerCase() === 'physics');
        const chemPool = allQuestions.filter(q => (q.subSubject || '').toLowerCase() === 'chemistry');
        const bioPool = allQuestions.filter(q => (q.subSubject || '').toLowerCase() === 'biology');

        const aptiTarget = Math.floor(count / 2);
        const sciTotal = count - aptiTarget;
        const physTarget = Math.floor(sciTotal / 3);
        const chemTarget = Math.floor(sciTotal / 3);
        const bioTarget = sciTotal - physTarget - chemTarget;

        const pickedApti = this.sampleSlice(aptiPool, aptiTarget, options);
        const pickedPhys = this.sampleSlice(physPool, physTarget, options);
        const pickedChem = this.sampleSlice(chemPool, chemTarget, options);
        const pickedBio = this.sampleSlice(bioPool, bioTarget, options);

        selectedQuestions = [...pickedApti, ...pickedPhys, ...pickedChem, ...pickedBio];
      } else if (sq === 'science' || sq === 'general science') {
        const physPool = allQuestions.filter(q => (q.subSubject || '').toLowerCase() === 'physics');
        const chemPool = allQuestions.filter(q => (q.subSubject || '').toLowerCase() === 'chemistry');
        const bioPool = allQuestions.filter(q => (q.subSubject || '').toLowerCase() === 'biology');

        const targetPerDiscipline = Math.floor(count / 3);
        const remainder = count % 3;

        const pickedPhys = this.sampleSlice(physPool, targetPerDiscipline + (remainder > 0 ? 1 : 0), options);
        const pickedChem = this.sampleSlice(chemPool, targetPerDiscipline + (remainder > 1 ? 1 : 0), options);
        const pickedBio = this.sampleSlice(bioPool, targetPerDiscipline, options);

        selectedQuestions = [...pickedPhys, ...pickedChem, ...pickedBio];
      } else if (sq === 'aptitude' || sq === 'quantitative aptitude') {
        const aptiPool = allQuestions.filter(q => (q.subject || '').toLowerCase().includes('aptitude'));
        selectedQuestions = this.sampleSlice(aptiPool, count, options);
      } else {
        const pool = this.filterPool(allQuestions, sq);
        selectedQuestions = this.sampleSlice(pool, count, options);
      }

      if (selectedQuestions.length < count) {
        const pool = this.filterPool(allQuestions, sq);
        const pickedIds = new Set(selectedQuestions.map(q => q.id));
        const leftovers = pool.filter(q => !pickedIds.has(q.id)).sort(() => 0.5 - Math.random());
        selectedQuestions.push(...leftovers.slice(0, count - selectedQuestions.length));
      }

      return selectedQuestions.sort(() => 0.5 - Math.random()).slice(0, count);
    }
  }

  window.AptiPrep.MockGenerator = MockGeneratorClientService;
})(window);
