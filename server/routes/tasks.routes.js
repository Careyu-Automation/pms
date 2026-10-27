const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const planning = require('../controllers/planning.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', planning.listTasks);
router.post('/', planning.createNamedTask);
router.get('/:taskId', planning.getTask);
router.patch('/:taskId', planning.updateListedTask);
router.delete('/:taskId', planning.removeListedTask);

module.exports = router;
