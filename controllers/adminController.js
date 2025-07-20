const userModel = require('../models/userModel');
const bookingModel = require('../models/bookingModel');
const pool = require('../config/db'); 

const getDashboardAnalytics = async (req, res) => {
    try {
         const [totalUsersResult] = await pool.execute('SELECT COUNT(*) as total FROM users');
        const totalUsers = totalUsersResult[0].total;
        const totalBookings = await bookingModel.getTotalBookingsCount();
        const topEvents = await bookingModel.getTopEventsByBookings(5);

        res.status(200).json({
            totalUsers,
            totalBookings,
            topEvents
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ message: 'Internal server error fetching admin analytics.' });
    }
};

// Admin can manage users (e.g., change roles, delete users)
const getAllUsersAdmin = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        const { users, total } = await userModel.getAllUsers(limit, offset);
        res.status(200).json({
            users,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalUsers: total
        });
    } catch (error) {
        console.error('Get all users (admin) error:', error);
        res.status(500).json({ message: 'Internal server error fetching users.' });
    }
};

const updateUserRoleAdmin = async (req, res) => {
    const { id } = req.params; // User ID to update
    const { role } = req.body; // New role

    if (!['user', 'organizer', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role provided.' });
    }

    // Prevent admin from changing their own role via this endpoint (optional, but good practice)
    if (parseInt(id) === req.user.id && role !== req.user.role) {
         return res.status(403).json({ message: 'You cannot change your own role via this endpoint.' });
    }

    try {
        const success = await userModel.updateUserRole(id, role);
        if (!success) {
            return res.status(404).json({ message: 'User not found or role update failed.' });
        }
        res.status(200).json({ message: `User role updated to ${role}.` });
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ message: 'Internal server error updating user role.' });
    }
};

const deleteUserAdmin = async (req, res) => {
    const { id } = req.params; // User ID to delete

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
        return res.status(403).json({ message: 'You cannot delete your own account via this endpoint.' });
    }

    try {
        const success = await userModel.deleteUser(id);
        if (!success) {
            return res.status(404).json({ message: 'User not found or deletion failed.' });
        }
        res.status(200).json({ message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Internal server error deleting user.' });
    }
};

module.exports = {
    getDashboardAnalytics,
    getAllUsersAdmin,
    updateUserRoleAdmin,
    deleteUserAdmin
};