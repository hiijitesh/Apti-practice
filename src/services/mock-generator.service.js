class MockGeneratorService {
  /**
   * Filter question pool based on subject / topic query.
   * Open for extension via custom predicate rules.
   * @param {Array} allQuestions
   * @param {string} subjectQuery
   * @returns {Array} Filtered questions pool
   */
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

  /**
   * Generate sanitized mock exam questions distributed across chapters.
   * @param {Array} allQuestions Source questions
   * @param {string} subjectQuery 'all' | 'aptitude' | 'science' | discipline | 'top300'
   * @param {number} targetCount Total questions requested (default 30)
   * @returns {Array} Sanitized questions without answers or explanations
   */
  static generate(allQuestions, subjectQuery = 'all', targetCount = 30) {
    const pool = this.filterPool(allQuestions, subjectQuery);
    if (pool.length === 0) return [];

    // Group by chapter
    const byChapter = {};
    for (const q of pool) {
      if (!byChapter[q.chapter]) byChapter[q.chapter] = [];
      byChapter[q.chapter].push(q);
    }

    const chapterNames = Object.keys(byChapter);
    const totalTarget = Math.min(targetCount, pool.length);
    const numChapters = chapterNames.length;

    const baseCount = Math.floor(totalTarget / numChapters);
    const remainder = totalTarget % numChapters;

    const shuffledChapters = [...chapterNames].sort(() => 0.5 - Math.random());
    const selectedQuestions = [];

    shuffledChapters.forEach((chap, idx) => {
      const targetForThisChap = baseCount + (idx < remainder ? 1 : 0);
      const cPool = [...byChapter[chap]].sort(() => 0.5 - Math.random());
      const picked = cPool.slice(0, targetForThisChap);
      selectedQuestions.push(...picked);
    });

    if (selectedQuestions.length < totalTarget) {
      const pickedIds = new Set(selectedQuestions.map(q => q.id));
      const leftovers = pool.filter(q => !pickedIds.has(q.id)).sort(() => 0.5 - Math.random());
      const extra = leftovers.slice(0, totalTarget - selectedQuestions.length);
      selectedQuestions.push(...extra);
    }

    const finalQuestions = selectedQuestions.sort(() => 0.5 - Math.random()).slice(0, totalTarget);

    // SANITIZE: remove correctAnswer and explanation so client cannot inspect/cheat!
    return finalQuestions.map(q => ({
      id: q.id,
      subject: q.subject,
      subSubject: q.subSubject,
      chapter: q.chapter,
      question: q.question,
      options: q.options,
      diagram: q.diagram || undefined
    }));
  }
}

module.exports = MockGeneratorService;
