const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth.middleware');
const { feasibilityDir } = require('../utils/uploads');
const feasibility = require('../controllers/feasibility.controller');

const ALLOWED = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.csv', '.txt', '.jpg', '.jpeg', '.png', '.webp', '.dwg', '.dxf',
]);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    try {
      callback(null, feasibilityDir(req.params.id));
    } catch (error) {
      callback(error);
    }
  },
  filename(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${ALLOWED.has(ext) ? ext : ''}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 8 },
  fileFilter(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      callback(new ApiError(400, 'Upload a PDF, Office, drawing (DWG/DXF), spreadsheet, presentation, image, CSV, or text file.'));
      return;
    }
    callback(null, true);
  },
});

function uploadFiles(req, res, next) {
  upload.array('documents', 8)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof ApiError) return next(error);
    if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'Each document must be 12 MB or smaller.'));
    if (error.code === 'LIMIT_UNEXPECTED_FILE') return next(new ApiError(400, 'Use the documents field to upload files.'));
    return next(new ApiError(400, error.message || 'The documents could not be uploaded.'));
  });
}

const router = express.Router();

router.use(requireAuth);
router.get('/', feasibility.list);
router.post('/ensure', feasibility.ensure);
router.get('/:id', feasibility.get);
router.put('/:id', feasibility.save);
router.post('/:id/start', feasibility.start);
router.post('/:id/submit', feasibility.submit);
router.post('/:id/review', feasibility.review);
router.post('/:id/proceed', feasibility.proceed);
router.post('/:id/documents', uploadFiles, feasibility.upload);
router.get('/:id/documents/:documentId', feasibility.download);
router.delete('/:id/documents/:documentId', feasibility.removeDocument);

module.exports = router;
