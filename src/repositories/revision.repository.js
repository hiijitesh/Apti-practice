const fs = require('fs');
const { REVISION_FILE } = require('../config');

class RevisionRepository {
  constructor(filePath = REVISION_FILE) {
    this.filePath = filePath;
    this._cache = null;
  }

  getMaterials() {
    if (this._cache) {
      return this._cache;
    }

    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this._cache = JSON.parse(raw);
      return this._cache;
    } catch (err) {
      console.error('RevisionRepository: Error reading revision file:', err);
      return null;
    }
  }

  reload() {
    this._cache = null;
    return this.getMaterials();
  }
}

const defaultRevisionRepository = new RevisionRepository();
module.exports = defaultRevisionRepository;
module.exports.RevisionRepository = RevisionRepository;
