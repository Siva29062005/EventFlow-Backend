const pool = require('../config/db');

const create = async (email, hashedPassword, role = 'user') => {
    const [result] = await pool.execute(
        'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
        [email, hashedPassword, role]
    );
    return { id: result.insertId, email, role };
};

const findByEmail = async (email) => {
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0];
};

const findById = async (id) => {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
};

const getAllUsers = async (limit, offset) => {
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
        console.warn('Invalid limit provided for getAllUsers, defaulting to 10.');
        limit = 10;
    } else {
        limit = parsedLimit;
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
        console.warn('Invalid offset provided for getAllUsers, defaulting to 0.');
        offset = 0;
    } else {
        offset = parsedOffset;
    }
    const usersQuery = `SELECT id, email, role FROM users LIMIT ${limit} OFFSET ${offset}`;
    const usersParams = []; 
    const [rows] = await pool.execute(usersQuery, usersParams);
    const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM users');
    return { users: rows, total: totalRows[0].total };
};

const getTotalUsersCount = async () => {
    const [rows] = await pool.execute('SELECT COUNT(*) as total FROM users');
    return rows[0].total;
};


const updateUserRole = async (id, role) => {
    const [result] = await pool.execute(
        'UPDATE users SET role = ? WHERE id = ?',
        [role, id]
    );
    return result.affectedRows > 0;
};

const deleteUser = async (id) => {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
};

module.exports = {
    create,
    findByEmail,
    getTotalUsersCount,
    findById,
    getAllUsers,
    updateUserRole,
    deleteUser
};