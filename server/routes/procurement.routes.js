const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth.middleware');
const requests = require('../controllers/procurement.controller');

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.jpg', '.jpeg', '.png', '.webp']);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const dir = path.join(__dirname, '..', 'uploads', 'procurement', req.params.id);
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
    return next(new ApiError(400, 'The files could not be uploaded.'));
  });
}

const router = express.Router();

router.use(requireAuth);
router.get('/', requests.home);
router.post('/', requests.create);
router.patch('/:id', requests.update);
router.post('/:id/status', requests.status);
router.delete('/:id', requests.remove);
router.post('/:id/documents', uploadFiles, requests.uploadDocuments);
router.get('/:id/documents/:documentId', requests.downloadDocument);
router.delete('/:id/documents/:documentId', requests.deleteDocument);

module.exports = router;
