// public/js/utils/pwa.js - Service worker registration & "Install App" button (Chrome/Edge/Android)
(function(window) {
  'use strict';

  var deferredPrompt = null;
  var BUTTON_IDS = ['btn-install-app', 'btn-install-app-mobile'];

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function setInstallButtonsVisible(visible) {
    BUTTON_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('hidden', !visible);
      el.classList.toggle('inline-flex', visible && id === 'btn-install-app');
      el.classList.toggle('flex', visible && id !== 'btn-install-app');
    });
  }

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandalone()) setInstallButtonsVisible(true);
  });

  window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    setInstallButtonsVisible(false);
  });

  window.AptiPrepPWA = {
    promptInstall: function() {
      if (!deferredPrompt) {
        alert('To install AptiPrep, open the browser menu and choose "Install AptiPrep" (or "Add to Home screen").');
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function() {
        deferredPrompt = null;
        setInstallButtonsVisible(false);
      });
    },
    isStandalone: isStandalone
  };

  if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js').catch(function(err) {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
})(window);
