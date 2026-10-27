const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const products = require('../controllers/product.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', products.list);
router.post('/', products.create);
router.get('/:id', products.get);
router.post('/:id/tasks', products.createTask);
router.put('/:id', products.update);
router.delete('/:id', products.remove);

module.exports = router;
