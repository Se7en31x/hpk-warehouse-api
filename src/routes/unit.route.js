const express = require('express')
const router = express.Router()

const unitController = require('../controllers/unit.controller')
// const { auth, authWarehouse } = require('../middleware/auth');

router.get('/', unitController.getUnits)
router.get('/option', unitController.getUnitOption)
router.get('/:id' , unitController.getUnitById)
router.post('/' , unitController.createUnit)
router.patch('/:id' , unitController.updateUnit)
router.delete('/:id' , unitController.softDeletedUnit)

module.exports = router;