const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth.middleware');
const solution = require('../controllers/solution.controller');

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.jpg', '.jpeg', '.png', '.webp']);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const dir = path.join(__dirname, '..', 'uploads', 'costing', req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${ALLOWED.has(ext) ? ext : ''}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
  fileFilter(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      callback(new ApiError(400, 'Upload a PDF, Office, spreadsheet, presentation, image, CSV, or text file.'));
      return;
    }
    callback(null, true);
  },
});

function uploadFiles(req, res, next) {
  upload.array('documents', 8)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof ApiError) return next(error);
    if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'Each document must be 8 MB or smaller.'));
    return next(new ApiError(400, 'The documents could not be uploaded.'));
  });
}

const router = express.Router();

router.use(requireAuth);
router.get('/', solution.list);
router.get('/sources', solution.sources);
router.post('/', solution.create);
router.get('/:id/bom-export', solution.exportBom);
router.post('/:id/bom-import', solution.importBom);
router.post('/:id/versions', solution.duplicate);
router.post('/:id/submit-review', solution.submitReview);
router.post('/:id/submit-approval', solution.submitApproval);
router.post('/:id/decision', solution.decide);
router.post('/:id/convert', solution.convert);
router.post('/:id/documents', uploadFiles, solution.upload);
router.get('/:id/documents/:documentId', solution.download);
router.delete('/:id/documents/:documentId', solution.removeDocument);
router.get('/:id', solution.get);
router.put('/:id', solution.save);
router.delete('/:id', solution.remove);

module.exports = router;
