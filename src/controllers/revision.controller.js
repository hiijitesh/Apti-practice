const revisionRepository = require('../repositories/revision.repository');

class RevisionController {
  static getRevisionMaterials(req, res, next) {
    try {
      const materials = revisionRepository.getMaterials();
      if (materials) {
        return res.json(materials);
      }
      res.status(404).json({ error: 'Revision materials not found' });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = RevisionController;
