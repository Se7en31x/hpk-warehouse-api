const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notification.controller');

router.get('/', ctrl.getNotifications);
router.get('/unread-count', ctrl.getUnreadCount);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', ctrl.markRead);
router.post('/', ctrl.createNotification);
router.post('/run-jobs', ctrl.runNotificationJobs);

module.exports = router;
