const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth.middleware');
const lead = require('../controllers/lead.controller');

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.txt', '.dwg', '.zip']);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const dir = path.join(__dirname, '..', 'uploads', 'leads', req.params.id);
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
      callback(new ApiError(400, 'Upload a PDF, Office, image, text, DWG, or ZIP file.'));
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
router.get('/', lead.list);
router.post('/', lead.create);
router.get('/:id', lead.get);
router.put('/:id', lead.update);
router.delete('/:id', lead.remove);
router.post('/:id/submit-to-pm', lead.submit);
router.post('/:id/review', lead.review);
router.post('/:id/documents', uploadFiles, lead.upload);
router.get('/:id/documents/:documentId', lead.download);

module.exports = router;
