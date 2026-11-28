const fs = require('fs');
const path = require('path');
const questionRepository = require('../repositories/question.repository');
const crypto = require('crypto');
const { MANUAL_VERIFIED_FILE, ADMIN_EMAIL_SHA256 } = require('../config');

function readManualVerified() {
  try { return new Set(JSON.parse(fs.readFileSync(MANUAL_VERIFIED_FILE, 'utf8'))); } catch { return new Set(); }
}

class QuestionController {
  static getChapters(req, res, next) {
    try {
      const chapters = questionRepository.getChapters();
      const allQuestions = questionRepository.getAll();

      res.json({
        totalChapters: chapters.length,
        totalQuestions: allQuestions.length,
        chapters
      });
    } catch (err) {
      next(err);
    }
  }

  static getQuestions(req, res, next) {
    try {
      const chapterQuery = req.query.chapter;
      const sourceQuery = req.query.source;

      if (chapterQuery) {
        const filtered = questionRepository.getByChapter(chapterQuery, sourceQuery);
        return res.json({
          chapter: chapterQuery,
          total: filtered.length,
          questions: filtered
        });
      }

      if (sourceQuery === 'rk_ranjan') {
        const rkAll = questionRepository.getRkQuestions();
        return res.json({
          total: rkAll.length,
          questions: rkAll
        });
      }

      const all = questionRepository.getAll();
      res.json({
        total: all.length,
        questions: all
      });
    } catch (err) {
      next(err);
    }
  }

  static getRkChapters(req, res, next) {
    try {
      const chapters = questionRepository.getRkChapters();
      const all = questionRepository.getRkQuestions();
      res.json({
        totalChapters: chapters.length,
        totalQuestions: all.length,
        chapters
      });
    } catch (err) {
      next(err);
    }
  }

  static getRkQuestions(req, res, next) {
    try {
      const chapterQuery = req.query.chapter;
      if (chapterQuery) {
        const filtered = questionRepository.getByChapter(chapterQuery, 'rk_ranjan');
        return res.json({
          chapter: chapterQuery,
          total: filtered.length,
          questions: filtered
        });
      }
      const all = questionRepository.getRkQuestions();
      res.json({
        total: all.length,
        questions: all
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/questions/:id/verified  { email, verified: true|false } -> stores the id in manual_verified.json
  static setManualVerified(req, res, next) {
    try {
      const email = String((req.body && req.body.email) || '').trim().toLowerCase();
      if (crypto.createHash('sha256').update(email).digest('hex') !== ADMIN_EMAIL_SHA256) {
        return res.status(403).json({ error: 'Only the admin account can mark questions verified' });
      }
      const id = req.params.id;
      if (!questionRepository.getCombinedMap().has(id)) {
        return res.status(404).json({ error: `Unknown question id '${id}'` });
      }
      const verified = req.body && req.body.verified !== false;
      const ids = readManualVerified();
      if (verified) ids.add(id); else ids.delete(id);
      const tmp = `${MANUAL_VERIFIED_FILE}.tmp`;
      fs.mkdirSync(path.dirname(MANUAL_VERIFIED_FILE), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify([...ids].sort(), null, 2) + '\n');
      fs.renameSync(tmp, MANUAL_VERIFIED_FILE);   // atomic replace: a crash mid-write can't corrupt the list
      res.json({ id, verified, total: ids.size });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = QuestionController;
