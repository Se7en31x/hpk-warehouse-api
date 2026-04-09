const express = require('express')
const router = express.Router()
const itemController = require('../controllers/item.controller')
const { upload } = require('../middleware/upload')
// const { auth, authWarehouse, authUser, } = require('../middleware/auth');
// Authorization All Role
router.get('/', itemController.getItems)
router.get('/option', itemController.getItemOption)
router.get('/:id', itemController.getItemById)

// Authorization warehouse
router.post('/', upload.single('image'), itemController.createItem)
router.patch('/:id', itemController.updateItem)
router.delete('/:id', itemController.softDeletedItem)

module.exports = router