const express = require('express')
const router = express.Router()
const warehouseController = require('../controllers/warehouse.controller')

router.get('/',        warehouseController.getWarehouses)
router.get('/option',  warehouseController.getWarehouseOption)
router.get('/:id',     warehouseController.getWarehouseById)
router.post('/',       warehouseController.createWarehouse)
router.patch('/:id',   warehouseController.updateWarehouse)
router.delete('/:id',  warehouseController.softDeletedWarehouse)

module.exports = router;
