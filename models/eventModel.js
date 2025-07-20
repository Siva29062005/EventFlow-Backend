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

// --- IMPORTANT: Removed 'organizerUsername' parameter ---
const create = async (organizerId, title, description, venue, eventDate, capacity, imageUrl) => {
    const formattedEventDate = formatMySQLDatetime(eventDate);
    if (!formattedEventDate) {
        throw new Error("Invalid event date provided for creation.");
    }
    const [result] = await pool.execute(
        // Removed 'organizerUsername' from INSERT query
        'INSERT INTO events (organizer_id, title, description, venue, event_date, capacity, available_seats, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [organizerId, title, description, venue, formattedEventDate, capacity, capacity, imageUrl]
    );
    return {
        id: result.insertId,
        organizer_id: organizerId,
        // Removed organizerUsername from returned object as it's not stored here
        title,
        description,
        venue,
        event_date: formattedEventDate,
        capacity,
        available_seats: capacity,
        imageUrl
    };
};

// Modified findAll function to JOIN users table for organizerUsername
const findAll = async (limit, offset, date, location, search) => {
    // JOIN users table to get the username of the event creator
    let query = `
        SELECT
            e.id, e.title, e.description, e.venue, e.event_date, e.capacity, e.available_seats,
            e.organizer_id AS creator, u.username AS creatorUsername, e.imageUrl, e.created_at
        FROM
            events e
        JOIN
            users u ON e.organizer_id = u.id
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM events';
    const params = []; // Parameters for WHERE clauses only
    let whereClauses = [];

    // Always include event_date >= current_timestamp.
    const hasOtherFilters = date || location || search;

    if (!hasOtherFilters) {
        whereClauses.push('e.event_date >= CURRENT_TIMESTAMP()'); // Use alias 'e'
    } else {
        whereClauses.push('e.event_date >= ?'); // Use alias 'e'
        const formattedCurrentDate = formatMySQLDatetime(new Date());
        if (!formattedCurrentDate) {
            throw new Error("Failed to format current date for query.");
        }
        params.push(formattedCurrentDate);
    }

    if (date) {
        whereClauses.push('DATE(e.event_date) = ?'); // Use alias 'e'
        params.push(date);
    }
    if (location) {
        whereClauses.push('e.venue LIKE ?'); // Use alias 'e'
        params.push(`%${location}%`);
    }
    if (search) {
        whereClauses.push('(e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ?)'); // Use alias 'e', added venue to search
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
        countQuery += ' WHERE ' + whereClauses.join(' AND '); // Apply same WHERE clauses to count
    }

    query += ' ORDER BY e.event_date ASC'; // Use alias 'e'
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    console.log('SQL Query (main):', query);
    console.log('SQL Params (main):', params);

    const [rows] = await pool.execute(query, params);

    // For count query, params are the same as main query's WHERE clause params
    const [totalRows] = await pool.execute(countQuery, params.slice(0, params.length - 2)); // Remove limit/offset from count params

    return { events: rows, total: totalRows[0].total };
};

// Modified findById function to JOIN users table for organizerUsername
const findById = async (id) => {
    // JOIN users table to get the username of the event creator
    const [rows] = await pool.execute(`
        SELECT
            e.id, e.title, e.description, e.venue, e.event_date, e.capacity, e.available_seats,
            e.organizer_id AS creator, u.username AS creatorUsername, e.imageUrl, e.created_at
        FROM
            events e
        JOIN
            users u ON e.organizer_id = u.id
        WHERE
            e.id = ?
    `, [id]);
    return rows[0];
};

// --- IMPORTANT: Removed 'imageUrl' parameter from model's update function ---
// The controller will now fetch the existing imageUrl and pass it back if no new image is uploaded.
const update = async (id, organizerId, title, description, venue, eventDate, capacity, imageUrl) => {
    const formattedEventDate = formatMySQLDatetime(eventDate);
    if (!formattedEventDate) {
        throw new Error("Invalid event date provided for update.");
    }
    const [result] = await pool.execute(
        // Added imageUrl to the UPDATE SET clause
        'UPDATE events SET title = ?, description = ?, venue = ?, event_date = ?, capacity = ?, available_seats = LEAST(?, available_seats), imageUrl = ? WHERE id = ? AND organizer_id = ?',
        [title, description, venue, formattedEventDate, capacity, capacity, imageUrl, id, organizerId] // Pass imageUrl here
    );
    return result.affectedRows > 0;
};

const remove = async (id, organizerId) => {
    // Note: The controller handles fetching imageUrl for Cloudinary deletion BEFORE calling this.
    const [result] = await pool.execute('DELETE FROM events WHERE id = ? AND organizer_id = ?', [id, organizerId]);
    return result.affectedRows > 0;
};

// For concurrency control in booking
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