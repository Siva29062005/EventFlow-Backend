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
    let countQuery = 'SELECT COUNT(*) as total FROM events e';
    const params = [];
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
        countQuery += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY e.event_date ASC';
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await pool.execute(query, params);
    const [totalRows] = await pool.execute(countQuery, params.slice(0, params.length - 2));

    return { events: rows, total: totalRows[0].total };
};

const findById = async (id, connection = null) => { // Added connection parameter for transactional reads
    const [rows] = await (connection || pool).execute(`
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

const remove = async (id, organizerId) => {
    const [result] = await pool.execute('DELETE FROM events WHERE id = ? AND organizer_id = ?', [id, organizerId]);
    return result.affectedRows > 0;
};

// --- CORRECTED: Now accepts numberOfTickets and includes debugging logs ---
const decrementAvailableSeats = async (eventId, numberOfTickets, connection) => {
    console.log('DEBUG: Inside eventModel.decrementAvailableSeats');
    console.log('DEBUG: Type of "connection" parameter:', typeof connection);
    console.log('DEBUG: Value of "connection" parameter:', connection); // Inspect the actual object
    console.log('DEBUG: Type of "pool" (imported):', typeof pool);
    console.log('DEBUG: Value of "pool" (imported):', pool); // Inspect the actual pool object

    const query = 'UPDATE events SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ?';
    const [result] = await (connection || pool).execute(query, [numberOfTickets, eventId, numberOfTickets]);
    return result.affectedRows > 0;
};

// --- CORRECTED: Now accepts numberOfTickets and includes debugging logs ---
const incrementAvailableSeats = async (eventId, numberOfTickets, connection) => {
    console.log('DEBUG: Inside eventModel.incrementAvailableSeats');
    console.log('DEBUG: Type of "connection" parameter:', typeof connection);
    console.log('DEBUG: Value of "connection" parameter:', connection);
    console.log('DEBUG: Type of "pool" (imported):', typeof pool);
    console.log('DEBUG: Value of "pool" (imported):', pool);

    const query = 'UPDATE events SET available_seats = available_seats + ? WHERE id = ?';
    const [result] = await (connection || pool).execute(query, [numberOfTickets, eventId]);
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