const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const teams = require('../controllers/team.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', teams.list);
router.get('/meetings', teams.allMeetings);
router.post('/', teams.create);
router.get('/:id/members', teams.members);
router.post('/:id/members', teams.addMember);
router.get('/:id/projects', teams.teamProjects);
router.get('/:id/tasks', teams.tasks);
router.get('/:id/meetings', teams.meetings);
router.post('/:id/meetings', teams.saveMeeting);
router.patch('/:id/meetings/:meetingId', teams.saveMeeting);
router.delete('/:id/meetings/:meetingId', teams.removeMeeting);
router.get('/:id/work-requests', teams.requests);
router.post('/:id/work-requests', teams.createRequest);
router.patch('/:id/work-requests/:requestId', teams.setRequest);
router.get('/:id/activity', teams.activity);
router.get('/:id', teams.get);
router.put('/:id', teams.update);
router.patch('/:id/status', teams.setStatus);
router.delete('/:id', teams.remove);
router.put('/:id/members/:memberId', teams.updateMember);
router.delete('/:id/members/:memberId', teams.removeMember);

module.exports = router;
