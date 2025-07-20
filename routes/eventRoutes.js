// routes/eventRoutes.js

const express = require('express');
const router = express.Router();
// No need to import multer or cloudinary directly here,
// as the 'upload' instance will be passed from app.js
// and cloudinary operations will be in the controller.

const eventController = require('../controllers/eventController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// This module now exports a function that accepts the 'upload' instance.
// This allows you to use upload.single('image') directly on the route.
module.exports = (upload) => { // <--- Router is now a function that takes 'upload'

    router.post(
        '/',
        authenticateToken,
        authorizeRoles(['organizer', 'admin']),
        upload.single('image'), // <--- Add multer middleware here
        eventController.createEvent // This controller will now receive req.file
    );

    router.get('/', eventController.getEvents); // Publicly viewable
    router.get('/:id', eventController.getEventById);

    router.put(
        '/:id',
        authenticateToken,
        authorizeRoles(['organizer', 'admin']),
        upload.single('image'), // <--- Add multer middleware here
        eventController.updateEvent // This controller will also receive req.file
    );

    router.delete(
        '/:id',
        authenticateToken,
        authorizeRoles(['organizer', 'admin']),
        eventController.deleteEvent
    );

    return router; // Return the configured router
};