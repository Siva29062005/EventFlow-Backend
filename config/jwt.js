require('dotenv').config();

module.exports = {
    secret: process.env.JWT_SECRET || 'a_super_secret_jwt_key_please_change_this',
    expiresIn: '1h' 
};