// public/js/services/storage.service.js - Pluggable Storage Adapter for Attempts & Results
(function(window) {
  'use strict';

  window.AptiPrep = window.AptiPrep || {};

  class StorageService {
    constructor(config = {}) {
      this.LOCAL_STORAGE_KEY = 'apti_attempts';
      this.SHEET_URL_KEY = 'apti_google_sheet_url';

      this.googleSheetUrl = localStorage.getItem(this.SHEET_URL_KEY) ||
                            (window.APTIPREP_CONFIG && window.APTIPREP_CONFIG.GOOGLE_SHEET_URL) || '';
      this.isStaticMode = !config.useLocalApi;
    }

    setGoogleSheetUrl(url) {
      this.googleSheetUrl = (url || '').trim();
      try {
        if (this.googleSheetUrl) {
          localStorage.setItem(this.SHEET_URL_KEY, this.googleSheetUrl);
        } else {
          localStorage.removeItem(this.SHEET_URL_KEY);
        }
      } catch (e) {}
    }

    getGoogleSheetUrl() {
      return this.googleSheetUrl;
    }

    /**
     * Deduplicates attempts array by attemptId, preserving original order.
     */
    dedupAttempts(attempts) {
      if (!Array.isArray(attempts)) return [];
      const seen = new Set();
      const result = [];
      for (const a of attempts) {
        if (a && a.attemptId && !seen.has(a.attemptId)) {
          seen.add(a.attemptId);
          result.push(a);
        }
      }
      return result;
    }

    getLocalAttempts() {
      try {
        const raw = localStorage.getItem(this.LOCAL_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    saveLocalAttempts(attempts) {
      try {
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(attempts));
      } catch (e) {}
    }

    /**
     * Fetch past attempts for a given user email.
     */
    async fetchAttempts(userEmail = '') {
      let attempts = [];

      // 1. Try local API if not static mode
      if (!this.isStaticMode) {
        try {
          const url = userEmail
            ? `/api/attempts?email=${encodeURIComponent(userEmail)}`
            : '/api/attempts';
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            attempts = data.attempts || [];
          }
        } catch (e) {
          console.warn('Failed to fetch attempts from local API, falling back to local storage:', e);
          this.isStaticMode = true;
        }
      }

      // 2. Fetch from Google Sheet if configured
      if (this.googleSheetUrl) {
        try {
          const sheetUrl = `${this.googleSheetUrl}?action=getAttempts&email=${encodeURIComponent(userEmail || '')}`;
          const sRes = await fetch(sheetUrl);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (Array.isArray(sData.attempts)) {
              attempts = [...attempts, ...sData.attempts];
            }
          }
        } catch (e) {
          console.warn('Failed to fetch attempts from Google Sheet:', e);
        }
      }

      // 3. Merge with localStorage offline records
      const localOffline = this.getLocalAttempts();
      const filteredLocal = userEmail
        ? localOffline.filter(a => (a.userEmail || '').toLowerCase() === userEmail.toLowerCase())
        : localOffline;

      const merged = this.dedupAttempts([...attempts, ...filteredLocal]);
      // Sort newest first
      return merged.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    }

    /**
     * Submit an attempt record and detailed results.
     */
    async submitAttempt(payload) {
      let serverAttempt = null;

      // 1. Try Local API first
      if (!this.isStaticMode) {
        try {
          const res = await fetch('/api/submit-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.attempt) {
              serverAttempt = data.attempt;
            }
          }
        } catch (e) {
          console.warn('API submit failed, falling back to offline/local storage:', e);
          this.isStaticMode = true;
        }
      }

      // 2. Save to Google Sheet if configured
      if (this.googleSheetUrl) {
        try {
          const recordToSync = serverAttempt || payload.attemptRecord || payload;
          await fetch(this.googleSheetUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              action: 'submitAttempt',
              ...recordToSync
            })
          });
        } catch (e) {
          console.warn('Failed to sync attempt to Google Sheet:', e);
        }
      }

      // 3. Always mirror to localStorage as backup
      const localRecord = serverAttempt || payload.attemptRecord || payload;
      const existing = this.getLocalAttempts();
      existing.unshift(localRecord);
      this.saveLocalAttempts(this.dedupAttempts(existing));

      return serverAttempt;
    }

    async testGoogleSheetConnection(testUrl) {
      const url = testUrl || this.googleSheetUrl;
      if (!url) return { success: false, error: 'No URL provided' };
      try {
        const pingUrl = `${url}?action=ping`;
        const res = await fetch(pingUrl);
        const data = await res.json();
        return { success: true, data };
      } catch (e) {
        return { success: false, error: e.message || 'Network error' };
      }
    }
  }

  window.AptiPrep.StorageService = StorageService;
})(window);
