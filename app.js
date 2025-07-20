const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Ensure dotenv is loaded at the very top

// Import Cloudinary and Multer
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// --- Cloudinary Configuration ---
// IMPORTANT: These credentials MUST be set as environment variables
// in your Render dashboard and in your local .env file.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); 


const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes')(upload); 
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Route Middlewares
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes); // eventRoutes now receives 'upload'
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

// Optional: Basic user profile route (if needed, otherwise user management is via admin)
// app.use('/api/users', authenticateToken, userRoutes); // Example: if a user can view/update their own profile

// Basic route for testing
app.get('/api/health', (req, res) => {
    res.status(200).json({ message: 'Backend is healthy!' });
});

// Global error handler (should be last middleware)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!', error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});