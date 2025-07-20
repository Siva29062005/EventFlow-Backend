// backend/services/emailService.js
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// Create a Nodemailer transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT == 465, 

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },

    tls: {
        rejectUnauthorized: false
    }
});

const sendEmail = async (to, subject, htmlContent) => {
    try {
        const mailOptions = {
            from: 'noreply@event.com', 
            to: to,
            subject: subject,
            html: htmlContent,
        };

        const info = await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        if (error.response) {
            console.error('SMTP response:', error.response);
        }
        return false;
    }
};

module.exports = {
    sendEmail
};