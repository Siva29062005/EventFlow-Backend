// models/bookingModel.js
const pool = require('../config/db');

// Create a new booking
// Now accepts numberOfTickets and stores default status 'confirmed'
const create = async (userId, eventId, numberOfTickets, connection) => {
    const [result] = await (connection || pool).execute(
        'INSERT INTO bookings (user_id, event_id, number_of_tickets, booking_date, status) VALUES (?, ?, ?, NOW(), ?)',
        [userId, eventId, numberOfTickets, 'confirmed']
    );
    return {
        id: result.insertId,
        user_id: userId,
        event_id: eventId,
        number_of_tickets: numberOfTickets, // Include in returned object
        booking_date: new Date(),
        status: 'confirmed' // Include in returned object
    };
};

// Find all bookings for a specific user, with pagination and event details
// Now includes number_of_tickets and status, and pagination
const findByUserId = async (userId, limit, offset) => {
    const query = `
        SELECT
            b.id, b.user_id, b.event_id, b.number_of_tickets, b.booking_date, b.status, b.created_at, b.updated_at,
            e.title AS eventTitle, e.event_date AS eventDate, e.venue AS eventVenue, e.imageUrl AS eventImageUrl
        FROM
            bookings b
        JOIN
            events e ON b.event_id = e.id
        WHERE
            b.user_id = ?
        ORDER BY
            b.booking_date DESC
        LIMIT ? OFFSET ?
    `;
    const [bookings] = await pool.execute(query, [userId, limit, offset]);

    const countQuery = 'SELECT COUNT(*) as total FROM bookings WHERE user_id = ?';
    const [totalRows] = await pool.execute(countQuery, [userId]);

    return { bookings, total: totalRows[0].total };
};

// Find a booking by its ID
// Now includes number_of_tickets and status
const findById = async (bookingId, connection = null) => { // Added connection parameter
    const [rows] = await (connection || pool).execute('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    return rows[0];
};

// Find an existing booking by user and event ID, optionally by status
// Now accepts a status parameter
const findByUserIdAndEventId = async (userId, eventId, status = null, connection = null) => { // Added status and connection parameters
    let query = 'SELECT * FROM bookings WHERE user_id = ? AND event_id = ?';
    const params = [userId, eventId];

    if (status) { // Only add status to query if provided
        query += ' AND status = ?';
        params.push(status);
    }

    const [rows] = await (connection || pool).execute(query, params);
    return rows[0];
};

// NEW: Update a booking's status (used for cancellation)
const updateStatus = async (bookingId, status, connection) => {
    const [result] = await (connection || pool).execute(
        'UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, bookingId]
    );
    return result.affectedRows > 0;
};

// Removed the old 'remove' function as updateStatus will handle logical deletion (cancellation)
// If you need physical deletion for admin purposes, you can re-add a 'deleteById' function.
// const remove = async (bookingId, userId) => {
//     const [result] = await pool.execute(`DELETE FROM bookings WHERE id = ? AND user_id = ?`, [bookingId, userId]);
//     return result.affectedRows > 0;
// };

// getTopEventsByBookings - No changes needed for new columns, but ensure it uses parameters correctly
const getTopEventsByBookings = async (limit) => {
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
        console.warn('Invalid limit provided for getTopEventsByBookings, defaulting to 5.');
        limit = 5;
    } else {
        limit = parsedLimit;
    }

    // Use a parameterized query for LIMIT to prevent SQL injection and ensure proper parsing
    const sqlQuery = `
        SELECT
            e.id, e.title, COUNT(b.id) as booking_count
        FROM
            events e
        JOIN
            bookings b ON e.id = b.event_id
        GROUP BY
            e.id, e.title
        ORDER BY
            booking_count DESC
        LIMIT ?`; // Use '?' for parameter
    const paramsArray = [limit]; // Pass limit as a parameter

    try {
        const [rows] = await pool.execute(sqlQuery, paramsArray);
        return rows;
    } catch (error) {
        console.error('ERROR during getTopEventsByBookings query:', error);
        throw error;
    }
};

const getTotalBookingsCount = async () => {
    const [rows] = await pool.execute('SELECT COUNT(*) as total FROM bookings');
    return rows[0].total;
};

// NEW: Admin function to get all bookings with filters and pagination
const findAll = async (limit, offset, userIdFilter = null, eventIdFilter = null, statusFilter = null) => {
    let query = `
        SELECT
            b.id, b.user_id, b.event_id, b.number_of_tickets, b.booking_date, b.status, b.created_at, b.updated_at,
            u.email AS userEmail, u.role AS userRole,
            e.title AS eventTitle, e.event_date AS eventDate, e.venue AS eventVenue, e.imageUrl AS eventImageUrl
        FROM
            bookings b
        JOIN
            users u ON b.user_id = u.id
        JOIN
            events e ON b.event_id = e.id
    `;
    const params = [];
    const whereClauses = [];

    if (userIdFilter) {
        whereClauses.push('b.user_id = ?');
        params.push(userIdFilter);
    }
    if (eventIdFilter) {
        whereClauses.push('b.event_id = ?');
        params.push(eventIdFilter);
    }
    if (statusFilter) {
        whereClauses.push('b.status = ?');
        params.push(statusFilter);
    }

    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY b.booking_date DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [bookings] = await pool.execute(query, params);

    let countQuery = 'SELECT COUNT(*) as total FROM bookings b';
    const countParams = [];
    if (whereClauses.length > 0) {
        countQuery += ' WHERE ' + whereClauses.join(' AND ');
        countParams.push(...params.slice(0, params.length - 2)); // Exclude limit/offset
    }
    const [totalRows] = await pool.execute(countQuery, countParams);

    return { bookings, total: totalRows[0].total };
};


module.exports = {
    create,
    findByUserId,
    findById,
    findByUserIdAndEventId,
    updateStatus, // Export the new updateStatus function
    getTotalBookingsCount,
    getTopEventsByBookings,
    findAll // Export the new admin findAll function
};