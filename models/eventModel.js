// models/eventModel.js
const pool = require('../config/db');

// Helper function to format JavaScript Date object for MySQL DATETIME
function formatMySQLDatetime(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        console.error("Invalid date object passed to formatMySQLDatetime:", date);
        return null;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// create function - no change needed here as it doesn't interact with username column
const create = async (organizerId, title, description, venue, eventDate, capacity, imageUrl) => {
    const formattedEventDate = formatMySQLDatetime(eventDate);
    if (!formattedEventDate) {
        throw new Error("Invalid event date provided for creation.");
    }
    const [result] = await pool.execute(
        'INSERT INTO events (organizer_id, title, description, venue, event_date, capacity, available_seats, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [organizerId, title, description, venue, formattedEventDate, capacity, capacity, imageUrl]
    );
    return {
        id: result.insertId,
        organizer_id: organizerId,
        title,
        description,
        venue,
        event_date: formattedEventDate,
        capacity,
        available_seats: capacity,
        imageUrl
    };
};

// Modified findAll function to JOIN users table and use u.email as creatorUsername
const findAll = async (limit, offset, date, location, search) => {
    let query = `
        SELECT
            e.id, e.title, e.description, e.venue, e.event_date, e.capacity, e.available_seats,
            e.organizer_id AS creator, u.email AS creatorUsername, e.imageUrl, e.created_at
        FROM
            events e
        JOIN
            users u ON e.organizer_id = u.id
    `;
    // --- CHANGE THIS LINE ---
    // OLD: let countQuery = 'SELECT COUNT(*) as total FROM events';
    // NEW:
    let countQuery = 'SELECT COUNT(*) as total FROM events e'; // Count query doesn't need JOIN for total count
    const params = []; // Parameters for WHERE clauses only
    let whereClauses = [];

    const hasOtherFilters = date || location || search;

    if (!hasOtherFilters) {
        whereClauses.push('e.event_date >= CURRENT_TIMESTAMP()');
    } else {
        whereClauses.push('e.event_date >= ?');
        const formattedCurrentDate = formatMySQLDatetime(new Date());
        if (!formattedCurrentDate) {
            throw new Error("Failed to format current date for query.");
        }
        params.push(formattedCurrentDate);
    }

    if (date) {
        whereClauses.push('DATE(e.event_date) = ?');
        params.push(date);
    }
    if (location) {
        whereClauses.push('e.venue LIKE ?');
        params.push(`%${location}%`);
    }
    if (search) {
        whereClauses.push('(e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
        countQuery += ' WHERE ' + whereClauses.join(' AND '); // Apply same WHERE clauses to count
    }

    query += ' ORDER BY e.event_date ASC';
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    console.log('SQL Query (main):', query);
    console.log('SQL Params (main):', params);

    const [rows] = await pool.execute(query, params);

    // For count query, params are the same as main query's WHERE clause params
    // Remove limit/offset from count params as they are not for count query
    const [totalRows] = await pool.execute(countQuery, params.slice(0, params.length - 2));

    return { events: rows, total: totalRows[0].total };
};

// Modified findById function to JOIN users table and use u.email as creatorUsername
const findById = async (id) => {
    const [rows] = await pool.execute(`
        SELECT
            e.id, e.title, e.description, e.venue, e.event_date, e.capacity, e.available_seats,
            e.organizer_id AS creator, u.email AS creatorUsername, e.imageUrl, e.created_at
        FROM
            events e
        JOIN
            users u ON e.organizer_id = u.id
        WHERE
            e.id = ?
    `, [id]);
    return rows[0];
};

// update function - no change needed here as it doesn't interact with username column
const update = async (id, organizerId, title, description, venue, eventDate, capacity, imageUrl) => {
    const formattedEventDate = formatMySQLDatetime(eventDate);
    if (!formattedEventDate) {
        throw new Error("Invalid event date provided for update.");
    }
    const [result] = await pool.execute(
        'UPDATE events SET title = ?, description = ?, venue = ?, event_date = ?, capacity = ?, available_seats = LEAST(?, available_seats), imageUrl = ? WHERE id = ? AND organizer_id = ?',
        [title, description, venue, formattedEventDate, capacity, capacity, imageUrl, id, organizerId]
    );
    return result.affectedRows > 0;
};

// remove function - no change needed here
const remove = async (id, organizerId) => {
    const [result] = await pool.execute('DELETE FROM events WHERE id = ? AND organizer_id = ?', [id, organizerId]);
    return result.affectedRows > 0;
};

// For concurrency control in booking - no change needed
const decrementAvailableSeats = async (eventId, connection) => {
    const query = 'UPDATE events SET available_seats = available_seats - 1 WHERE id = ? AND available_seats > 0';
    const [result] = await (connection || pool).execute(query, [eventId]);
    return result.affectedRows > 0;
};

const incrementAvailableSeats = async (eventId, connection) => {
    const query = 'UPDATE events SET available_seats = available_seats + 1 WHERE id = ?';
    const [result] = await (connection || pool).execute(query, [eventId]);
    return result.affectedRows > 0;
};

module.exports = {
    create,
    findAll,
    findById,
    update,
    remove,
    decrementAvailableSeats,
    incrementAvailableSeats
};