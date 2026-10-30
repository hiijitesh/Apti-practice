// public/js/services/session.service.js - User Authentication & Session Management
(function(window) {
  'use strict';

  window.AptiPrep = window.AptiPrep || {};

  class SessionService {
    constructor() {
      this.STORAGE_KEY = 'apti_user_email';
      this.currentUserEmail = this.getStoredEmail();
    }

    getStoredEmail() {
      try {
        return (localStorage.getItem(this.STORAGE_KEY) || '').trim().toLowerCase();
      } catch (e) {
        return '';
      }
    }

    isValidEmail(email) {
      if (!email || typeof email !== 'string') return false;
      const trimmed = email.trim().toLowerCase();
      return !!trimmed && trimmed.includes('@') && trimmed.includes('.');
    }

    login(rawEmail) {
      if (!rawEmail) return { success: false, error: 'Email cannot be blank' };
      const normalized = rawEmail.trim().toLowerCase();
      if (!this.isValidEmail(normalized)) {
        return { success: false, error: 'Please enter a valid email address (e.g. user@example.com)' };
      }

      this.currentUserEmail = normalized;
      try {
        localStorage.setItem(this.STORAGE_KEY, normalized);
      } catch (e) {}

      return { success: true, email: normalized };
    }

    loginAsGuest() {
      const guestEmail = 'guest@local';
      this.currentUserEmail = guestEmail;
      try {
        localStorage.setItem(this.STORAGE_KEY, guestEmail);
      } catch (e) {}
      return { success: true, email: guestEmail };
    }

    logout() {
      this.currentUserEmail = '';
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (e) {}
    }

    isLoggedIn() {
      return !!this.currentUserEmail;
    }

    isGuest() {
      return this.currentUserEmail === 'guest@local';
    }

    getUserDisplayName() {
      if (!this.currentUserEmail || this.isGuest()) return 'Jitesh';

      const prefix = this.currentUserEmail.split('@')[0] || 'User';
      if (!prefix || prefix.toLowerCase() === 'guest') return 'Jitesh';
      const clean = prefix.replace(/[._\-+]/g, ' ').trim();
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    getUserInitial() {
      const name = this.getUserDisplayName();
      return (name.charAt(0) || 'U').toUpperCase();
    }
  }

  window.AptiPrep.SessionService = SessionService;
})(window);
