const mysql = require('mysql2/promise');
const fs = require('fs'); 
const path = require('path'); 

const caCertPath = path.resolve( '.', 'ca.pem'); 

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:process.env.DB_PORT ,
    ssl: {
        ca: fs.readFileSync(caCertPath),
        rejectUnauthorized: true
    }
});

// Test the connection (optional, but good for debugging)
pool.getConnection()
    .then(connection => {
        console.log('Successfully connected to Aiven MySQL database!');
        connection.release();
    })
    .catch(err => {
        console.error('Failed to connect to Aiven MySQL database:', err);
    });

module.exports = pool;