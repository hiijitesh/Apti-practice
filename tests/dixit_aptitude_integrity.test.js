const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Dixit Sir Quantitative Aptitude Verification & Integrity Tests', () => {
  const rootDir = path.resolve(__dirname, '..');
  const questionsPath = path.join(rootDir, 'public', 'data', 'questions.json');
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

  const aptiQuestions = questions.filter(
    q => q.subject === 'Quantitative Aptitude'
  );

  test('Aptitude chapter counts match verified totals (1,344 total across 17 chapters)', () => {
    const expectedCounts = {
      'Ages': 28,
      'Average': 94,
      'Boat & Stream': 52,
      'Compound Interest': 101,
      'Discount': 64,
      'Mixture & Alligation': 100,
      'Partnership': 43,
      'Percentage': 108,
      'Pipe & Cistern': 50,
      'Profit & Loss': 133,
      'Race': 45,
      'Ratio & Proportion': 122,
      'Simple Interest': 101,
      'Time & Work': 124,
      'Trains': 47,
      'Time, Speed & Distance': 118,
      'Work & Wages': 14
    };

    assert.equal(aptiQuestions.length, 1344, 'Total Aptitude questions must be 1,344');

    const actualCounts = {};
    aptiQuestions.forEach(q => {
      actualCounts[q.chapter] = (actualCounts[q.chapter] || 0) + 1;
    });

    Object.entries(expectedCounts).forEach(([chapter, count]) => {
      assert.equal(actualCounts[chapter], count, `Chapter ${chapter} must have ${count} questions`);
    });
  });

  test('Zero dummy fallback options in Aptitude questions', () => {
    const dummyOptions = aptiQuestions.filter(q =>
      q.options.some(opt => opt.startsWith('Option ') && opt.length <= 8)
    );
    assert.equal(
      dummyOptions.length,
      0,
      `Found dummy options in questions: ${dummyOptions.map(q => q.id).join(', ')}`
    );
  });

  test('Zero exam tags leaking into options', () => {
    const examKeywords = ['SSC', 'CHSL', 'CGL', 'MTS', 'CPO', 'Phase', 'Tier'];
    const examInOptions = aptiQuestions.filter(q =>
      q.options.some(opt => examKeywords.some(kw => opt.includes(kw)))
    );
    assert.equal(
      examInOptions.length,
      0,
      `Found exam tags in options for: ${examInOptions.map(q => q.id).join(', ')}`
    );
  });

  test('Zero question stems leaking into any option', () => {
    const stemInOpt = aptiQuestions.filter(q =>
      q.options.some(opt => opt.length > 80 || opt.toLowerCase().includes('(a)'))
    );
    assert.equal(
      stemInOpt.length,
      0,
      `Found stem leaking into options for: ${stemInOpt.map(q => q.id).join(', ')}`
    );
  });

  test('Zero Devanagari/Hindi characters across all Aptitude questions, options, and explanations', () => {
    const devanagariRegex = /[\u0900-\u097F]/;
    const hindiQuestions = aptiQuestions.filter(q => {
      const fullText = `${q.question} ${q.options.join(' ')} ${q.explanation || ''}`;
      return devanagariRegex.test(fullText);
    });

    assert.equal(
      hindiQuestions.length,
      0,
      `Found Hindi characters in Aptitude questions: ${hindiQuestions.map(q => q.id).join(', ')}`
    );
  });

  test('All Aptitude questions have exactly 4 non-empty options and valid correctAnswer index', () => {
    aptiQuestions.forEach(q => {
      assert.equal(q.options.length, 4, `Question ${q.id} must have exactly 4 options`);
      q.options.forEach((opt, optIdx) => {
        assert.ok(
          opt && opt.trim().length > 0,
          `Question ${q.id} option ${optIdx} must not be empty`
        );
      });
      assert.ok(
        Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer <= 3,
        `Question ${q.id} correctAnswer must be 0, 1, 2, or 3 (got ${q.correctAnswer})`
      );
    });
  });

  test('All Aptitude question explanations specify correct option', () => {
    aptiQuestions.forEach(q => {
      assert.ok(
        q.explanation && q.explanation.includes('Correct Answer: Option '),
        `Question ${q.id} explanation must indicate the correct option`
      );
    });
  });

  test('Ratio & Proportion has 122 authentic questions with zero accidental duplicates', () => {
    const ratioQuestions = aptiQuestions.filter(q => q.chapter === 'Ratio & Proportion');
    assert.equal(ratioQuestions.length, 122, 'Must have exactly 122 Ratio & Proportion questions');

    // 1. Q1 stem appears only ONCE across all questions
    const q1StemMatches = ratioQuestions.filter(q =>
      q.question.includes('Two numbers are in the ratio of 6:7. If the difference between these numbers is 16')
    );
    assert.equal(q1StemMatches.length, 1, 'Q1 stem must only appear once, never repeated in Q5, Q7, Q10, Q102, etc.');
    assert.equal(q1StemMatches[0].id, 'ratio_q001');

    // 2. Q102 must have its authentic Componendo & Dividendo stem and correct answer D
    const q102 = ratioQuestions.find(q => q.id === 'ratio_q102');
    assert.ok(q102, 'ratio_q102 must exist');
    assert.match(q102.question, /20%\s*of\s*\(P\+Q\)/);
    assert.equal(q102.correctAnswer, 3, 'Q102 correct answer index must be 3 (Option D)');
    assert.equal(q102.options[3].trim(), '7 : 3');

    // 3. Q103 must have its authentic stem and correct answer D
    const q103 = ratioQuestions.find(q => q.id === 'ratio_q103');
    assert.ok(q103, 'ratio_q103 must exist');
    assert.match(q103.question, /40%\s*of\s*\(A\s*\+\s*B\)/);
    assert.equal(q103.correctAnswer, 3, 'Q103 correct answer index must be 3 (Option D)');

    // 4. Q5 must have fractions A:B = (1/3):(1/5)...
    const q5 = ratioQuestions.find(q => q.id === 'ratio_q005');
    assert.ok(q5, 'ratio_q005 must exist');
    assert.match(q5.question, /1\/3/);

    // 5. All 122 questions must have valid slidePage attribute (12 to 137)
    ratioQuestions.forEach(q => {
      assert.ok(
        Number.isInteger(q.slidePage) && q.slidePage >= 12 && q.slidePage <= 137,
        `Question ${q.id} must have slidePage between 12 and 137 (got ${q.slidePage})`
      );
    });
  });

  test('Zero duplicate question stems across all 17 Quantitative Aptitude chapters', () => {
    const chapters = [...new Set(aptiQuestions.map(q => q.chapter))];
    chapters.forEach(ch => {
      const chQuestions = aptiQuestions.filter(q => q.chapter === ch);
      const stemCounts = {};
      chQuestions.forEach(q => {
        const cleanStem = q.question.toLowerCase().replace(/[^a-z0-9]/g, '');
        stemCounts[cleanStem] = (stemCounts[cleanStem] || 0) + 1;
      });
      const duplicates = Object.entries(stemCounts).filter(([_, count]) => count > 1);
      assert.equal(
        duplicates.length,
        0,
        `Chapter "${ch}" has duplicate questions: ${JSON.stringify(duplicates)}`
      );
    });
  });

  test('Dixit Sir chapters are ordered in exact syllabus sequence across backend, static helper, and frontend', () => {
    const vm = require('vm');
    const QuestionRepository = require('../src/repositories/question.repository');
    const ChapterOrder = require('../public/js/utils/chapter-order');

    const expectedDixitOrder = [
      'Percentage',
      'Ratio & Proportion',
      'Ages',
      'Mixture & Alligation',
      'Average',
      'Simple Interest',
      'Compound Interest',
      'Profit & Loss',
      'Discount',
      'Time & Work',
      'Work & Wages',
      'Pipe & Cistern',
      'Partnership',
      'Time, Speed & Distance',
      'Trains',
      'Boat & Stream',
      'Race'
    ];

    // 1. Backend repository ordering
    QuestionRepository.reload();
    const repoChapters = QuestionRepository.getChapters();
    const repoDixitNames = repoChapters
      .filter(c => c.subject === 'Quantitative Aptitude')
      .map(c => c.name);
    assert.deepEqual(repoDixitNames, expectedDixitOrder);

    // General Science remains alphabetical
    const repoScienceNames = repoChapters
      .filter(c => c.subject === 'General Science')
      .map(c => c.name);
    assert.deepEqual(
      repoScienceNames,
      [...repoScienceNames].sort((a, b) => a.localeCompare(b))
    );

    // 2. Browser UMD global initialization without CommonJS module
    const orderScript = fs.readFileSync(
      path.join(rootDir, 'public', 'js', 'utils', 'chapter-order.js'),
      'utf8'
    );
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(orderScript, sandbox);
    assert.ok(sandbox.window.AptiPrep && sandbox.window.AptiPrep.ChapterOrder);

    // Test both comma and non-comma variants of Time Speed & Distance
    assert.equal(ChapterOrder.getDixitOrderIndex('Time Speed & Distance'), 13);
    assert.equal(ChapterOrder.getDixitOrderIndex('Time, Speed & Distance'), 13);

    const shuffledStatic = [...repoChapters].reverse();
    const sortedStatic = sandbox.window.AptiPrep.ChapterOrder.sortChapters(shuffledStatic);
    assert.deepEqual(
      Array.from(sortedStatic.filter(c => c.subject === 'Quantitative Aptitude').map(c => c.name)),
      expectedDixitOrder
    );

    // 3. index.html includes chapter-order.js before app.js, and app.js calls sortChapters
    const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(rootDir, 'public', 'app.js'), 'utf8');
    const orderScriptIdx = indexHtml.indexOf('js/utils/chapter-order.js');
    const appScriptIdx = indexHtml.indexOf('src="app.js');
    assert.ok(orderScriptIdx !== -1 && appScriptIdx !== -1 && orderScriptIdx < appScriptIdx);
    assert.match(appJs, /this\.chapters = this\.sortChapters\(data\.chapters\)/);
    assert.match(appJs, /this\.chapters = this\.sortChapters\(Object\.values\(chapterMap\)\)/);
  });

  test('Verified PDF regressions across Percentage, Mixture, Interest, PnL, Discount, Time & Work, Pipe, Partnership, TSD, Trains, Boat, Race stay fixed', () => {
    const byId = Object.fromEntries(aptiQuestions.map(q => [q.id, q]));

    // Percentage
    assert.deepEqual(byId.pct_q005.options, ['Mathematics', 'English', 'Science', 'Computer Science']);
    assert.equal(byId.pct_q005.correctAnswer, 0);
    assert.equal(byId.pct_q006.correctAnswer, 1);
    assert.equal(byId.pct_q054.correctAnswer, 1);

    // Mixture & Simple Interest
    assert.equal(byId.mix_q047.options[3], '15/7');
    assert.equal(byId.mix_q047.correctAnswer, 3);
    assert.equal(byId.mix_q077.correctAnswer, 0);
    assert.equal(byId.mix_q078.correctAnswer, 1);
    assert.equal(byId.si_q075.options[byId.si_q075.correctAnswer], 'Rs.30,000');

    // Compound Interest & Profit & Loss
    assert.match(byId.ci_q071.question, /third year at 8% p\.a\./);
    assert.equal(byId.ci_q101.options[2], 'S(1+r/50)³');
    assert.equal(byId.ci_q101.correctAnswer, 2);
    assert.deepEqual(byId.pnl_q048.options, ['20% Loss', '25% Loss', '25% Profit', '20% Profit']);
    assert.equal(byId.pnl_q051.correctAnswer, 3);
    assert.equal(byId.pnl_q103.options[byId.pnl_q103.correctAnswer], 'Loss 4%');
    assert.deepEqual(byId.pnl_q107.options, ['7.7% Profit', '8.3% Loss', '7.7% Loss', '8.2% Loss']);

    // Discount (all 64 restored)
    assert.equal(aptiQuestions.filter(q => q.chapter === 'Discount').length, 64);
    assert.equal(byId.disc_q024.options[byId.disc_q024.correctAnswer], '₹400');
    assert.equal(byId.disc_q040.options[byId.disc_q040.correctAnswer], 'Rs. 20,000');
    assert.equal(byId.disc_q058.correctAnswer, 0);
    assert.equal(byId.disc_q063.options[byId.disc_q063.correctAnswer], '50%');
    assert.equal(byId.disc_q064.options[byId.disc_q064.correctAnswer], '100%');

    // Time & Work, Pipe, Partnership, TSD, Trains, Boat, Race
    assert.match(byId.tnw_q038.question, /A and B can do a piece of work in 15 days/);
    assert.equal(byId.tnw_q038.correctAnswer, 3);
    assert.match(byId.tnw_q039.question, /D1 and D2/);
    assert.equal(byId.tnw_q039.options[1], '40/3 days');
    assert.deepEqual(byId.pipe_q020.options, ['40', '50', '60', '45']);
    assert.match(byId.part_q019.question, /claims 1\/7 of the profit/);
    assert.match(byId.tsd_q006.question, /\(x³ \+ 1\) km/);
    assert.match(byId.tsd_q024.question, /first 100 km at a speed of 50 km\/h/);
    assert.equal(byId.tsd_q025.correctAnswer, 2);
    assert.equal(byId.tsd_q102.options[3], '3V1V2 / (V1+2V2)');
    assert.equal(byId.train_q020.correctAnswer, 2);
    assert.equal(byId.boat_q036.options[byId.boat_q036.correctAnswer], '20/27 m/sec');
    assert.equal(byId.race_q039.options[byId.race_q039.correctAnswer], '03:00 p.m.');
  });
});
