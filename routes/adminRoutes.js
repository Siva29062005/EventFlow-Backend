const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

router.use(authenticateToken);
router.use(authorizeRoles(['admin']));

router.get('/dashboard', adminController.getDashboardAnalytics);
router.get('/users', adminController.getAllUsersAdmin);
router.put('/users/:id/role', adminController.updateUserRoleAdmin);
router.delete('/users/:id', adminController.deleteUserAdmin);

module.exports = router;