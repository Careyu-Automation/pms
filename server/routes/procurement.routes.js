const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const requests = require('../controllers/procurement.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', requests.home);
router.post('/', requests.create);
router.patch('/:id', requests.update);
router.post('/:id/status', requests.status);
router.delete('/:id', requests.remove);

module.exports = router;
