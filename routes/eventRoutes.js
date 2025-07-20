// routes/eventRoutes.js

const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

module.exports = (upload) => {

    router.post(
        '/',
        authenticateToken,
        authorizeRoles(['organizer', 'admin']),
        // --- DEBUGGING LOG 1: BEFORE MULTER ---
        (req, res, next) => {
            console.log('--- Before Multer (POST /api/events) ---');
            console.log('Request Headers (Content-Type):', req.headers['content-type']); // Specifically check content-type
            console.log('Initial req.body (before multer):', req.body); // Should be {}
            console.log('Initial req.file (before multer):', req.file); // Should be undefined
            console.log('-----------------------------------');
            next(); // Pass control to the next middleware (multer)
        },
        upload.single('image'), // <--- MULTER MIDDLEWARE RUNS HERE
        // --- DEBUGGING LOG 2: AFTER MULTER ---
        (req, res, next) => {
            console.log('--- After Multer (POST /api/events) ---');
            console.log('req.body (after multer):', req.body); // <<<--- THIS IS THE KEY LOG FOR TEXT FIELDS
            console.log('req.file (after multer):', req.file); // <<<--- THIS IS THE KEY LOG FOR THE FILE
            console.log('-----------------------------------');
            next(); // Pass control to the controller
        },
        eventController.createEvent
    );

    router.get('/', eventController.getEvents);
    router.get('/:id', eventController.getEventById);

    router.put(
        '/:id',
        authenticateToken,
        authorizeRoles(['organizer', 'admin']),
        // --- DEBUGGING LOG 3: BEFORE MULTER (for Update) ---
        (req, res, next) => {
            console.log('--- Before Multer (PUT /api/events/:id) ---');
            console.log('Request Headers (Content-Type):', req.headers['content-type']);
            console.log('Initial req.body (before multer):', req.body);
            console.log('Initial req.file (before multer):', req.file);
            console.log('-----------------------------------');
            next();
        },
        upload.single('image'), // <--- MULTER MIDDLEWARE RUNS HERE (for Update)
        // --- DEBUGGING LOG 4: AFTER MULTER (for Update) ---
        (req, res, next) => {
            console.log('--- After Multer (PUT /api/events/:id) ---');
            console.log('req.body (after multer - update):', req.body); // KEY LOG for update
            console.log('req.file (after multer - update):', req.file); // KEY LOG for update
            console.log('-----------------------------------');
            next();
        },
        eventController.updateEvent
    );

    router.delete(
        '/:id',
        authenticateToken,
        authorizeRoles(['organizer', 'admin']),
        eventController.deleteEvent
    );

    return router;
};