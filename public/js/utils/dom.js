// public/js/utils/dom.js - Safe DOM utilities & string helpers
(function(window) {
  'use strict';

  window.AptiPrep = window.AptiPrep || {};

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  window.AptiPrep.DOM = {
    escapeHtml,
    getEl
  };
})(window);
