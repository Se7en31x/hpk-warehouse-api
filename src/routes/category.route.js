const express = require('express')
const router = express.Router()

const categoryController = require('../controllers/category.controller')
// const { auth, authWarehouse } = require('../middleware/auth');

router.get('/', categoryController.getCategories)
router.get('/option', categoryController.getCategoryOption)
router.get('/:id', categoryController.getCategoryById)
router.post('/', categoryController.createCategory)
router.patch('/:id', categoryController.updateCategory)
router.delete('/:id', categoryController.softDeletedCategory)

module.exports = router;