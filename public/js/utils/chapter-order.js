// public/js/utils/chapter-order.js - Canonical chapter ordering for Dixit Sir & RK Ranjan Aptitude
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.AptiPrep = root.AptiPrep || {};
    root.AptiPrep.ChapterOrder = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  const DIXIT_CHAPTER_ORDER = [
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

  const RK_NAME_ALIASES = {
    'Trains': 'Train',
    'Race': 'Race & Circular Motion'
  };

  const RK_EXTRA_CHAPTER_ORDER = [
    'Number System',
    'HCF & LCM',
    'Simplification',
    'Surds & Indices',
    'AP & GP',
    'Algebra',
    'Quadratic Equation',
    'Maxima & Minima',
    'Geometry',
    'Co-ordinate Geometry',
    'Mensuration 2D',
    'Mensuration 3D',
    'Trigonometry',
    'Height & Distance',
    'Statistics',
    'Probability'
  ];

  const RK_CHAPTER_ORDER = [
    ...DIXIT_CHAPTER_ORDER.map(name => RK_NAME_ALIASES[name] || name),
    ...RK_EXTRA_CHAPTER_ORDER
  ];

  function normalizeChapterKey(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/,/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildOrderMap(chapters) {
    return new Map(chapters.map((name, idx) => [normalizeChapterKey(name), idx]));
  }

  const DIXIT_ORDER_MAP = buildOrderMap(DIXIT_CHAPTER_ORDER);
  const RK_ORDER_MAP = buildOrderMap(RK_CHAPTER_ORDER);

  function getOrderIndex(orderMap, name) {
    const idx = orderMap.get(normalizeChapterKey(name));
    return idx !== undefined ? idx : -1;
  }

  function getDixitOrderIndex(name) {
    return getOrderIndex(DIXIT_ORDER_MAP, name);
  }

  function getRkOrderIndex(name) {
    return getOrderIndex(RK_ORDER_MAP, name);
  }

  function isRkChapter(chapter) {
    if (!chapter) return false;
    const subSubj = (chapter.subSubject || '').toLowerCase();
    return subSubj === 'rk ranjan math' || chapter.faculty === 'RK Ranjan';
  }

  function isDixitChapter(chapter) {
    if (!chapter) return false;
    const subj = (chapter.subject || '').toLowerCase();
    return subj.includes('aptitude') && !isRkChapter(chapter);
  }

  function compareWithOrderMap(orderMap, a, b) {
    const idxA = getOrderIndex(orderMap, a.name);
    const idxB = getOrderIndex(orderMap, b.name);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return (a.name || '').localeCompare(b.name || '');
  }

  function compareChapters(a, b) {
    const subjA = a.subject || '';
    const subjB = b.subject || '';
    if (subjA !== subjB) return subjA.localeCompare(subjB);

    if (isDixitChapter(a) && isDixitChapter(b)) {
      return compareWithOrderMap(DIXIT_ORDER_MAP, a, b);
    }

    if (isRkChapter(a) && isRkChapter(b)) {
      return compareWithOrderMap(RK_ORDER_MAP, a, b);
    }

    return (a.name || '').localeCompare(b.name || '');
  }

  function sortChapters(chapters) {
    return [...(chapters || [])].sort(compareChapters);
  }

  return {
    DIXIT_CHAPTER_ORDER,
    RK_CHAPTER_ORDER,
    normalizeChapterKey,
    getDixitOrderIndex,
    getRkOrderIndex,
    isDixitChapter,
    isRkChapter,
    compareChapters,
    sortChapters
  };
});
