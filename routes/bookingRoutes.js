const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

router.post(
    '/',
    authenticateToken,
    authorizeRoles(['user', 'admin']), // Only users and admins can book
    bookingController.bookEvent
);
router.get(
    '/my',
    authenticateToken,
    authorizeRoles(['user', 'admin']), // Users can see their own bookings
    bookingController.getMyBookings
);
router.delete(
    '/:id',
    authenticateToken,
    authorizeRoles(['user', 'admin']), // Users can cancel their own bookings
    bookingController.cancelBooking
);

module.exports = router;