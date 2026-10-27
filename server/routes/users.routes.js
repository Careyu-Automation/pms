const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const controller = require('../controllers/directory.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.get);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);
router.post('/:id/reset-password', controller.resetPassword);
router.post('/:id/reset-initial-password', controller.resetInitialPassword);
router.delete('/:id', controller.remove);

module.exports = router;
