const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/user.controller');

router.get('/',         ctrl.getAll);
router.get('/option',   ctrl.getOptions);
router.get('/:id',      ctrl.getById);

module.exports = router;
