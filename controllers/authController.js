
const { hashPassword, comparePassword } = require('../config/hasher'); // <--- ADD THIS LINE (Adjust path if hasher.js is not in 'utils')
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { sendEmail } = require('../config/emailService');

// For environment variables
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret'; // Use a strong secret in .env!

exports.register = async (req, res) => {
    const { email, password, role } = req.body;

    try {
        // Basic validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Check if user already exists
        const existingUser = await userModel.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: 'User with this email already exists' });
        }

        // Hash password using your hasher.js utility
        const hashedPassword = await hashPassword(password); // <--- CHANGE IS HERE

        // Create user
        const newUser = await userModel.create(email, hashedPassword, role);

        // ... Send Welcome Email (as configured previously) ...
        const emailSubject = 'Welcome to the Event Booking Platform!';
        const emailHtml = `
            <h1>Hello, ${email}!</h1>
            <p>Welcome to our Event Booking Platform. We're excited to have you on board!</p>
            <p>You can now browse and book amazing events.</p>
            <p>Best regards,</p>
            <p>The Event Team</p>
        `;
        const emailSent = await sendEmail(email, emailSubject, emailHtml);
        if (emailSent) {
            console.log(`Welcome email sent to ${email}`);
        } else {
            console.error(`Failed to send welcome email to ${email}`);
        }

        // Generate JWT token
        const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '1h' });

        res.status(201).json({ message: 'User registered successfully', token, user: { id: newUser.id, email: newUser.email, role: newUser.role } });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await userModel.findByEmail(email);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Compare password using your hasher.js utility
        const isMatch = await comparePassword(password, user.password); // <--- CHANGE IS HERE
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ message: 'Logged in successfully', token, user: { id: user.id, email: user.email, role: user.role } });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};