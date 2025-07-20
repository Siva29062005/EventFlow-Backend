// controllers/bookingController.js

const pool = require('../config/db'); // Import the connection pool for transactions
const bookingModel = require('../models/bookingModel');
const eventModel = require('../models/eventModel');
const emailService = require('../services/emailService'); // Corrected import path

const bookEvent = async (req, res) => {
    const { eventId, numberOfTickets } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

    if (!eventId || !numberOfTickets) {
        return res.status(400).json({ message: 'Event ID and number of tickets are required.' });
    }

    const parsedNumberOfTickets = parseInt(numberOfTickets, 10);
    if (isNaN(parsedNumberOfTickets) || parsedNumberOfTickets <= 0) {
        return res.status(400).json({ message: 'Number of tickets must be a positive integer.' });
    }

    let connection;
    try {
        // --- ADDED DEBUGGING LOGS HERE ---
        console.log('DEBUG: In bookEvent - Before getting connection from pool');
        console.log('DEBUG: Pool object in bookEvent:', pool); // Check the pool object here
        connection = await pool.getConnection();
        console.log('DEBUG: In bookEvent - After getting connection from pool. Connection object:', connection);
        // --- END DEBUGGING LOGS ---

        await connection.beginTransaction();

        const existingBooking = await bookingModel.findByUserIdAndEventId(userId, eventId, 'confirmed', connection);
        if (existingBooking) {
            await connection.rollback();
            return res.status(409).json({ message: 'You already have an active booking for this event.' });
        }

        const [eventRows] = await connection.execute(
            'SELECT * FROM events WHERE id = ? FOR UPDATE',
            [eventId]
        );
        const event = eventRows[0];

        if (!event) {
            await connection.rollback();
            return res.status(404).json({ message: 'Event not found.' });
        }
        if (event.available_seats < parsedNumberOfTickets) {
            await connection.rollback();
            return res.status(400).json({ message: `Not enough available seats. Only ${event.available_seats} seats remaining.` });
        }
        if (new Date(event.event_date) < new Date()) {
            await connection.rollback();
            return res.status(400).json({ message: 'Cannot book past events.' });
        }

        const decremented = await eventModel.decrementAvailableSeats(eventId, parsedNumberOfTickets, connection);
        if (!decremented) {
            await connection.rollback();
            return res.status(500).json({ message: 'Failed to decrement seats. Concurrency issue or insufficient seats.' });
        }

        const newBooking = await bookingModel.create(userId, eventId, parsedNumberOfTickets, connection);

        await connection.commit();

        const emailSubject = `Event Booking Confirmation: ${event.title}`;
        const emailHtml = `
            <p>Dear ${userEmail},</p>
            <p>Your booking for the event <strong>${event.title}</strong> has been confirmed!</p>
            <p><strong>Event Date:</strong> ${new Date(event.event_date).toLocaleString()}</p>
            <p><strong>Venue:</strong> ${event.venue}</p>
            <p><strong>Tickets Booked:</strong> ${parsedNumberOfTickets}</p>
            <p>Thank you for your booking!</p>
            <p>Best regards,</p>
            <p>The EventFlow Team</p>
        `;
        emailService.sendEmail(userEmail, emailSubject, emailHtml)
            .then(success => {
                if (success) {
                    console.log(`Booking confirmation email sent to ${userEmail}`);
                } else {
                    console.error(`Failed to send booking confirmation email to ${userEmail}`);
                }
            })
            .catch(err => {
                console.error(`Error sending booking confirmation email to ${userEmail}:`, err);
            });

        res.status(201).json({ message: 'Event booked successfully', booking: newBooking });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Booking error:', error);
        res.status(500).json({ message: 'Internal server error during booking.' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const getMyBookings = async (req, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1 || isNaN(offset) || offset < 0) {
        return res.status(400).json({ message: 'Invalid pagination parameters. Page and limit must be positive integers.' });
    }

    try {
        const { bookings, total } = await bookingModel.findByUserId(userId, limit, offset);
        res.status(200).json({
            bookings,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalBookings: total
        });
    } catch (error) {
        console.error('Get my bookings error:', error);
        res.status(500).json({ message: 'Internal server error fetching your bookings.' });
    }
};

const cancelBooking = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    let connection;
    try {
        // --- ADDED DEBUGGING LOGS HERE ---
        console.log('DEBUG: In cancelBooking - Before getting connection from pool');
        console.log('DEBUG: Pool object in cancelBooking:', pool);
        connection = await pool.getConnection();
        console.log('DEBUG: In cancelBooking - After getting connection from pool. Connection object:', connection);
        // --- END DEBUGGING LOGS ---

        await connection.beginTransaction();

        const booking = await bookingModel.findById(id, connection);
        if (!booking) {
            await connection.rollback();
            return res.status(404).json({ message: 'Booking not found.' });
        }

        if (booking.user_id !== userId && userRole !== 'admin') {
            await connection.rollback();
            return res.status(403).json({ message: 'Not authorized to cancel this booking.' });
        }

        if (booking.status === 'cancelled') {
            await connection.rollback();
            return res.status(400).json({ message: 'This booking is already cancelled.' });
        }

        const event = await eventModel.findById(booking.event_id, connection);
        if (!event) {
            await connection.rollback();
            return res.status(404).json({ message: 'Associated event not found.' });
        }

        if (new Date(event.event_date) < new Date()) {
            await connection.rollback();
            return res.status(400).json({ message: 'Cannot cancel booking for a past event.' });
        }

        const updated = await bookingModel.updateStatus(id, 'cancelled', connection);
        if (!updated) {
            await connection.rollback();
            return res.status(500).json({ message: 'Failed to update booking status to cancelled.' });
        }

        await eventModel.incrementAvailableSeats(booking.event_id, booking.number_of_tickets, connection);

        await connection.commit();
        res.status(200).json({ message: 'Booking cancelled successfully.' });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Cancel booking error:', error);
        res.status(500).json({ message: 'Internal server error during booking cancellation.' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

module.exports = {
    bookEvent,
    getMyBookings,
    cancelBooking
};