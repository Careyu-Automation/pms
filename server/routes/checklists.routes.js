const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const checklists = require('../controllers/checklist.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/users', checklists.users);
router.get('/', checklists.list);
router.post('/', checklists.create);
router.get('/:id', checklists.get);
router.put('/:id', checklists.update);
router.delete('/:id', checklists.remove);
router.put('/:id/visibility', checklists.setVisibility);
router.post('/:id/items', checklists.addItem);
router.put('/:id/items/:itemId', checklists.updateItem);
router.delete('/:id/items/:itemId', checklists.removeItem);
router.patch('/:id/items/:itemId/toggle', checklists.toggleItem);

module.exports = router;
