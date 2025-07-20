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

// Modified create function to accept organizerUsername and imageUrl
const create = async (organizerId, organizerUsername, title, description, venue, eventDate, capacity, imageUrl) => {
    const formattedEventDate = formatMySQLDatetime(eventDate);
    if (!formattedEventDate) {
        throw new Error("Invalid event date provided for creation.");
    }
    const [result] = await pool.execute(
        // Added organizerUsername and imageUrl columns to INSERT query
        'INSERT INTO events (organizer_id, organizerUsername, title, description, venue, event_date, capacity, available_seats, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [organizerId, organizerUsername, title, description, venue, formattedEventDate, capacity, capacity, imageUrl] // Pass imageUrl here
    );
    return {
        id: result.insertId,
        organizer_id: organizerId,
        organizerUsername, // Include in returned object
        title,
        description,
        venue,
        event_date: formattedEventDate,
        capacity,
        available_seats: capacity,
        imageUrl // Include in returned object
    };
};

// Modified findAll function to select organizerUsername and imageUrl
const findAll = async (limit, offset, date, location, search) => {
    // Select all necessary columns including organizerUsername and imageUrl
    // Alias organizer_id as 'creator' to match frontend expectation
    let query = 'SELECT id, title, description, venue, event_date, capacity, available_seats, organizer_id AS creator, organizerUsername, imageUrl, created_at FROM events';
    let countQuery = 'SELECT COUNT(*) as total FROM events';
    const params = []; // Parameters for WHERE clauses only
    let whereClauses = [];

    // Always include event_date >= current_timestamp.
    const hasOtherFilters = date || location || search;

    if (!hasOtherFilters) {
        whereClauses.push('event_date >= CURRENT_TIMESTAMP()');
    } else {
        whereClauses.push('event_date >= ?');
        const formattedCurrentDate = formatMySQLDatetime(new Date());
        if (!formattedCurrentDate) {
            throw new Error("Failed to format current date for query.");
        }
        params.push(formattedCurrentDate);
    }

    if (date) {
        whereClauses.push('DATE(event_date) = ?');
        params.push(date);
    }
    if (location) {
        whereClauses.push('venue LIKE ?');
        params.push(`%${location}%`);
    }
    if (search) {
        whereClauses.push('(title LIKE ? OR description LIKE ? OR venue LIKE ?)'); // Added venue to search
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY event_date ASC';
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    console.log('SQL Query (main):', query);
    console.log('SQL Params (main):', params);

    const [rows] = await pool.execute(query, params);

    // --- Count query ---
    let countWhereClauses = []; // Reset for count query
    const countParams = [];     // Reset for count query

    if (!hasOtherFilters) {
        countWhereClauses.push('event_date >= CURRENT_TIMESTAMP()');
    } else {
        countWhereClauses.push('event_date >= ?');
        const formattedCurrentDate = formatMySQLDatetime(new Date());
        if (!formattedCurrentDate) {
            throw new Error("Failed to format current date for count query.");
        }
        countParams.push(formattedCurrentDate);
    }

    if (date) {
        countWhereClauses.push('DATE(event_date) = ?');
        countParams.push(date);
    }
    if (location) {
        countWhereClauses.push('venue LIKE ?');
        countParams.push(`%${location}%`);
    }
    if (search) {
        countWhereClauses.push('(title LIKE ? OR description LIKE ? OR venue LIKE ?)'); // Added venue to search
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (countWhereClauses.length > 0) {
        countQuery += ' WHERE ' + countWhereClauses.join(' AND ');
    }

    console.log('SQL Query (count):', countQuery);
    console.log('SQL Params (count):', countParams);

    const [totalRows] = await pool.execute(countQuery, countParams);

    return { events: rows, total: totalRows[0].total };
};

// Modified findById function to select organizerUsername and imageUrl
const findById = async (id) => {
    // Select all necessary columns including organizerUsername and imageUrl
    // Alias organizer_id as 'creator' to match frontend expectation
    const [rows] = await pool.execute('SELECT id, title, description, venue, event_date, capacity, available_seats, organizer_id AS creator, organizerUsername, imageUrl, created_at FROM events WHERE id = ?', [id]);
    return rows[0];
};

// Modified update function to accept imageUrl
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
