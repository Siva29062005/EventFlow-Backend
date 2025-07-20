// controllers/eventController.js

const eventModel = require('../models/eventModel');
const cloudinary = require('cloudinary').v2; // Import Cloudinary SDK

// Helper function to extract Cloudinary public_id from a URL
// This is crucial if you want to delete old images from Cloudinary
// when an event is updated with a new image or when an event is deleted.
function extractPublicIdFromCloudinaryUrl(url) {
    if (!url) return null;
    // Cloudinary URLs typically look like:
    // https://res.cloudinary.com/your_cloud_name/image/upload/v1234567890/folder/subfolder/public_id.jpg
    // We need to get 'folder/subfolder/public_id'
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1 || uploadIndex + 1 >= parts.length) {
        return null; // 'upload' segment not found or URL is malformed
    }

    // Find the index where the actual public_id path starts (after 'upload/')
    // This handles cases with or without transformations.
    let publicIdStartIndex = uploadIndex + 1;
    while (publicIdStartIndex < parts.length && parts[publicIdStartIndex].match(/^v\d+$/)) {
        // Skip version numbers like 'v1234567890'
        publicIdStartIndex++;
    }

    const publicIdParts = parts.slice(publicIdStartIndex);
    const filenameWithExtension = publicIdParts[publicIdParts.length - 1];
    const filename = filenameWithExtension.split('.')[0]; // Remove extension

    // Reconstruct the public ID path, including folders if present
    publicIdParts[publicIdParts.length - 1] = filename; // Replace filename with just its name
    return publicIdParts.join('/');
}


const createEvent = async (req, res) => {
    const { title, description, venue, event_date, capacity } = req.body;
    const organizerId = req.user.id; // From authenticated user token
    const organizerUsername = req.user.username; // Assuming username is available on req.user

    let imageUrl = null; // Initialize imageUrl to null

    if (!title || !venue || !event_date || !capacity) {
        return res.status(400).json({ message: 'Missing required event fields: title, venue, event_date, capacity.' });
    }

    // Input validation for event_date and capacity
    const parsedEventDate = new Date(event_date);
    if (isNaN(parsedEventDate.getTime())) { // Check if date parsing was successful
        return res.status(400).json({ message: 'Invalid event date format.' });
    }
    if (parsedEventDate < new Date()) {
        return res.status(400).json({ message: 'Event date cannot be in the past.' });
    }

    const parsedCapacity = parseInt(capacity, 10);
    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
        return res.status(400).json({ message: 'Capacity must be a positive number.' });
    }

    try {
        if (req.file) { // Check if an image file was uploaded via multer
            // Upload image to Cloudinary
            const result = await cloudinary.uploader.upload(req.file.buffer.toString('base64'), {
                folder: 'event_images', // Optional: organize images in a specific folder in Cloudinary
                resource_type: 'auto'  // Cloudinary will auto-detect file type (image, video, raw)
            });
            imageUrl = result.secure_url; // Get the secure URL of the uploaded image
        }

        // Pass the parsed (Date object) event_date, capacity (number), and imageUrl
        const newEvent = await eventModel.create(
            organizerId,
            organizerUsername, // Pass username to model for storing
            title,
            description,
            venue,
            parsedEventDate,
            parsedCapacity,
            imageUrl // Pass the image URL
        );
        res.status(201).json({ message: 'Event created successfully', event: newEvent });
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ message: 'Internal server error creating event.' });
    }
};

const getEvents = async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    // Robust check for pagination parameters
    if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1 || isNaN(offset) || offset < 0) {
        return res.status(400).json({ message: 'Invalid pagination parameters. Page and limit must be positive integers.' });
    }

    const { date, location, search } = req.query;

    try {
        // Ensure eventModel.findAll fetches imageUrl
        const { events, total } = await eventModel.findAll(limit, offset, date, location, search);
        res.status(200).json({
            events,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalEvents: total
        });
    } catch (error) {
        console.error('Get events error:', error);
        console.error('Error details:', error); // Log the full error to understand stack trace
        res.status(500).json({ message: 'Internal server error fetching events.' });
    }
};

const getEventById = async (req, res) => {
    const { id } = req.params;
    try {
        // Ensure eventModel.findById fetches imageUrl
        const event = await eventModel.findById(id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        res.status(200).json(event);
    } catch (error) {
        console.error('Get event by ID error:', error);
        res.status(500).json({ message: 'Internal server error fetching event.' });
    }
};

const updateEvent = async (req, res) => {
    const { id } = req.params;
    const { title, description, venue, event_date, capacity } = req.body;
    const organizerId = req.user.id; // From authenticated user token
    const userRole = req.user.role; // From authenticated user token

    if (!title || !venue || !event_date || !capacity) {
        return res.status(400).json({ message: 'Missing required event fields for update.' });
    }

    const parsedEventDate = new Date(event_date);
    if (isNaN(parsedEventDate.getTime())) {
        return res.status(400).json({ message: 'Invalid event date format for update.' });
    }
    // Note: You might want to allow updating past events if it's just for data correction
    // if (parsedEventDate < new Date()) {
    //     return res.status(400).json({ message: 'Event date cannot be in the past.' });
    // }

    const parsedCapacity = parseInt(capacity, 10);
    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
        return res.status(400).json({ message: 'Capacity must be a positive number for update.' });
    }

    try {
        // First, get the existing event to check authorization and current imageUrl
        const existingEvent = await eventModel.findById(id);
        if (!existingEvent) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        // Authorization check: Only creator or admin can update
        if (existingEvent.creator !== organizerId && userRole !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to update this event.' });
        }

        let imageUrlToSave = existingEvent.imageUrl; // Default to existing image URL

        if (req.file) { // If a new image file was uploaded
            // Optional: Delete the old image from Cloudinary to save storage space
            // Only attempt if there was an existing image URL
            if (existingEvent.imageUrl) {
                const publicId = extractPublicIdFromCloudinaryUrl(existingEvent.imageUrl);
                if (publicId) {
                    try {
                        await cloudinary.uploader.destroy(publicId);
                        console.log(`Old image ${publicId} deleted from Cloudinary.`);
                    } catch (deleteError) {
                        console.warn(`Failed to delete old image ${publicId} from Cloudinary:`, deleteError.message);
                        // Don't block the update if old image deletion fails
                    }
                }
            }

            // Upload the new image to Cloudinary
            const result = await cloudinary.uploader.upload(req.file.buffer.toString('base64'), {
                folder: 'event_images',
                resource_type: 'auto'
            });
            imageUrlToSave = result.secure_url; // Use the new image URL
        }
        // If req.file is null/undefined, imageUrlToSave remains the existing one.
        // If you want a way to explicitly remove an image without replacing it,
        // you'd need a separate flag in the request body (e.g., `removeImage: true`).

        // Pass the updated image URL to the model
        const success = await eventModel.update(
            id,
            organizerId, // Still pass organizerId for authorization within model if needed
            title,
            description,
            venue,
            parsedEventDate,
            parsedCapacity,
            imageUrlToSave // Pass the (potentially new) image URL
        );

        if (!success) {
            // This case should ideally be caught by the authorization check above,
            // but keeping it as a fallback for model-level failures.
            return res.status(404).json({ message: 'Event not found or an unexpected error occurred during update.' });
        }
        res.status(200).json({ message: 'Event updated successfully.' });
    } catch (error) {
        console.error('Update event error:', error);
        res.status(500).json({ message: 'Internal server error updating event.' });
    }
};

const deleteEvent = async (req, res) => {
    const { id } = req.params;
    const organizerId = req.user.id; // From authenticated user token
    const userRole = req.user.role; // From authenticated user token

    try {
        // First, get the existing event to check authorization and current imageUrl
        const existingEvent = await eventModel.findById(id);
        if (!existingEvent) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        // Authorization check: Only creator or admin can delete
        if (existingEvent.creator !== organizerId && userRole !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete this event.' });
        }

        // Optional: Delete image from Cloudinary when event is deleted
        if (existingEvent.imageUrl) {
            const publicId = extractPublicIdFromCloudinaryUrl(existingEvent.imageUrl);
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    console.log(`Image ${publicId} deleted from Cloudinary.`);
                } catch (deleteError) {
                    console.warn(`Failed to delete image ${publicId} from Cloudinary during event deletion:`, deleteError.message);
                    // Don't block event deletion if image deletion fails
                }
            }
        }

        const success = await eventModel.remove(id, organizerId); // Model still handles final check/deletion
        if (!success) {
            // This case should ideally be caught by the authorization check above,
            // but keeping it as a fallback for model-level failures.
            return res.status(404).json({ message: 'Event not found or an unexpected error occurred during deletion.' });
        }
        res.status(200).json({ message: 'Event deleted successfully.' });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ message: 'Internal server error deleting event.' });
    }
};

module.exports = {
    createEvent,
    getEvents,
    getEventById,
    updateEvent,
    deleteEvent
};