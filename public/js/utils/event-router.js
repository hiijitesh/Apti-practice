// public/js/utils/event-router.js - Declarative Event Delegation Router
(function(window) {
  'use strict';

  window.AptiPrep = window.AptiPrep || {};

  class EventRouter {
    constructor(appInstance) {
      this.app = appInstance;
      this.init();
    }

    init() {
      document.addEventListener('click', (e) => this.handleClick(e));
    }

    handleClick(e) {
      const target = e.target.closest('[data-action]');
      if (!target || !this.app) return;

      const action = target.dataset.action;
      switch (action) {
        case 'nav-dashboard':
          this.app.showDashboard();
          break;
        case 'nav-chapters':
          this.app.openChapterSelectModal();
          break;
        case 'nav-mock':
          this.app.startMockTestPrompt();
          break;
        case 'nav-revision':
          this.app.showRevisionView();
          break;
        case 'toggle-zen':
          this.app.toggleZenMode();
          break;
        case 'switch-user':
          this.app.promptSwitchUser();
          break;
        case 'toggle-mobile-nav':
          this.app.toggleMobileNav();
          break;
        default:
          break;
      }
    }
  }

  window.AptiPrep.EventRouter = EventRouter;
})(window);
