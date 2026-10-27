const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const controller = require('../controllers/organization.controller');

const router = express.Router();
router.use(requireAuth);
router.get('/', controller.home);
router.post('/employees', controller.create);
router.put('/employees/:id', controller.update);
router.patch('/employees/:id/status', controller.status);
router.get('/employees/:id/access', controller.access);
router.put('/employees/:id/access', controller.saveAccess);
router.post('/teams/:teamId/members', controller.addMember);
router.delete('/teams/:teamId/members/:userId', controller.removeMember);
router.patch('/teams/:teamId/leads/:userId', controller.lead);

module.exports = router;
