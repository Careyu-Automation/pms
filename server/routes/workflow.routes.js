const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const workflow = require('../controllers/workflow.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/summary', workflow.summary);
router.get('/assignments', workflow.myAssignments);
router.post('/assignments/:id/respond', workflow.respondAssignment);
router.post('/leads/:id/assign', workflow.assignLead);
router.post('/leads/:id/quotations', workflow.quote);
router.post('/quotations/:id/send', workflow.sendQuote);
router.post('/quotations/:id/negotiate', workflow.negotiate);
router.post('/projects/:id/assign', workflow.assignProject);
router.post('/projects/:id/team-review', workflow.reviewProject);
router.post('/projects/:id/completion', workflow.completeProject);
router.post('/projects/:id/handover', workflow.handover);

module.exports = router;
