const express = require('express')
const router = express.Router()

const supplierController = require('../controllers/supplier.controller')

router.get('/', supplierController.getSuppliers)
router.get('/option', supplierController.getSupplierOption)
router.get('/:id', supplierController.getSupplierById)
router.post('/', supplierController.createSupplier)
router.patch('/:id', supplierController.updateSupplier)
router.delete('/:id', supplierController.softDeleteSupplier)

module.exports = router;