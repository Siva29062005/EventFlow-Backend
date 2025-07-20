const pool = require('../config/db');

const create = async (userId, eventId, connection) => {
    const [result] = await (connection || pool).execute(
        'INSERT INTO bookings (user_id, event_id) VALUES (?, ?)',
        [userId, eventId]
    );
    return { id: result.insertId, user_id: userId, event_id: eventId };
};

const findByUserId = async (userId) => {
    const [rows] = await pool.execute(
        `SELECT b.id as booking_id, b.booking_date, e.title, e.description, e.venue, e.event_date
         FROM bookings b
         JOIN events e ON b.event_id = e.id
         WHERE b.user_id = ?
         ORDER BY e.event_date ASC`,
        [userId]
    );
    return rows;
};

const findById = async (bookingId) => {
    const [rows] = await pool.execute('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    return rows[0];
};

const findByUserIdAndEventId = async (userId, eventId) => {
    const [rows] = await pool.execute('SELECT * FROM bookings WHERE user_id = ? AND event_id = ?', [userId, eventId]);
    return rows[0];
};

const remove = async (bookingId, userId) => {
    const [result] = await pool.execute(`DELETE FROM bookings WHERE id = ? AND user_id = ?`, [bookingId, userId]);
    return result.affectedRows > 0;
};

const getTopEventsByBookings = async (limit) => {
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
        console.warn('Invalid limit provided for getTopEventsByBookings, defaulting to 5.');
        limit = 5; 
    } else {
        limit = parsedLimit; // Use the parsed (numeric) value
    }

    // --- CRITICAL CHANGE: Using a literal limit value ---
    const sqlQuery = `SELECT e.id, e.title, COUNT(b.id) as booking_count
                      FROM events e
                      JOIN bookings b ON e.id = b.event_id
                      GROUP BY e.id, e.title
                      ORDER BY booking_count DESC
                      LIMIT ${limit}`; 
    const paramsArray = []; // <-- No parameters needed for this specific query now


    try {
        const [rows] = await pool.execute(sqlQuery, paramsArray); // Pass empty array if no params
        return rows;
    } catch (error) {
        console.error('ERROR during getTopEventsByBookings query (Workaround applied):', error);
        throw error; // Re-throw to propagate the original error
    }
};

const getTotalBookingsCount = async () => {
    const [rows] = await pool.execute('SELECT COUNT(*) as total FROM bookings');
    return rows[0].total;
};

module.exports = {
    create,
    findByUserId,
    findById,
    findByUserIdAndEventId,
    remove,
    getTotalBookingsCount,
    getTopEventsByBookings
};