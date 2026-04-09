const express = require('express');
const router = express.Router();
const { getMovements, getMovementById } = require('../controllers/stockmovement.controller');

router.get('/', getMovements);
router.get('/:id', getMovementById);

module.exports = router;
