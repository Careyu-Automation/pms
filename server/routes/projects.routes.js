const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth.middleware');
const solution = require('../controllers/solution.controller');
const planning = require('../controllers/planning.controller');
const teams = require('../controllers/team.controller');

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.dwg', '.zip', '.jpg', '.jpeg', '.png', '.webp', '.gif']);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const dir = path.join(__dirname, '..', 'uploads', 'projects', req.params.id);
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
  limits: { fileSize: 20 * 1024 * 1024, files: 8 },
  fileFilter(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      callback(new ApiError(400, 'Upload a PDF, Office file, DWG, image, or ZIP.'));
      return;
    }
    callback(null, true);
  },
});

function uploadFiles(req, res, next) {
  upload.array('documents', 8)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof ApiError) return next(error);
    if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'Each file must be 20 MB or smaller.'));
    return next(new ApiError(400, 'The files could not be uploaded.'));
  });
}

const router = express.Router();

router.use(requireAuth);
router.get('/', solution.listProjects);
router.get('/hub', solution.projectHub);
router.get('/eligible', solution.eligibleProjects);
router.get('/:id/plan', planning.getPlan);
router.post('/:id/phases', planning.createPhase);
router.patch('/:id/phases/:phaseId', planning.updatePhase);
router.delete('/:id/phases/:phaseId', planning.removePhase);
router.post('/:id/tasks', planning.createTask);
router.patch('/:id/tasks/:taskId', planning.updateTask);
router.delete('/:id/tasks/:taskId', planning.removeTask);
router.post('/:id/dependencies', planning.createDependency);
router.delete('/:id/dependencies/:dependencyId', planning.removeDependency);
router.post('/:id/milestones', planning.createMilestone);
router.patch('/:id/milestones/:milestoneId', planning.updateMilestone);
router.delete('/:id/milestones/:milestoneId', planning.removeMilestone);
router.post('/:id/baseline', planning.setBaseline);
router.post('/:id/time', planning.logTime);
router.delete('/:id/time/:entryId', planning.removeTime);
router.post('/:id/documents', uploadFiles, planning.uploadDocuments);
router.get('/:id/documents/:documentId', planning.downloadDocument);
router.delete('/:id/documents/:documentId', planning.removeDocument);
router.get('/:id/teams', teams.projectTeams);
router.post('/:id/teams', teams.assignProjectTeam);
router.put('/:id/teams/:teamId', teams.updateProjectTeam);
router.delete('/:id/teams/:teamId', teams.removeProjectTeam);
router.get('/:id', solution.getProject);
router.patch('/:id', solution.updateProject);
router.delete('/:id', solution.deleteProject);
router.post('/:id/status', solution.updateProjectStatus);

module.exports = router;
