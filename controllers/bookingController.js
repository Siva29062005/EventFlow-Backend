// controllers/bookingController.js

const pool = require('../config/db'); // Import the connection pool for transactions
const bookingModel = require('../models/bookingModel');
const eventModel = require('../models/eventModel');
const emailService = require('../config/emailService'); // CORRECTED IMPORT PATH

const bookEvent = async (req, res) => {
    const { eventId, numberOfTickets } = req.body; // Destructure numberOfTickets
    const userId = req.user.id;
    const userEmail = req.user.email; // Get user email for sending confirmation

    if (!eventId || !numberOfTickets) {
        return res.status(400).json({ message: 'Event ID and number of tickets are required.' });
    }

    const parsedNumberOfTickets = parseInt(numberOfTickets, 10);
    if (isNaN(parsedNumberOfTickets) || parsedNumberOfTickets <= 0) {
        return res.status(400).json({ message: 'Number of tickets must be a positive integer.' });
    }

    let connection;
    try {
        connection = await pool.getConnection(); // Get a connection from the pool
        await connection.beginTransaction(); // Start transaction

        // 1. Check if user already has an ACTIVE booking for this event
        // Assuming bookingModel.findByUserIdAndEventId now takes a status parameter
        const existingBooking = await bookingModel.findByUserIdAndEventId(userId, eventId, 'confirmed', connection);
        if (existingBooking) {
            await connection.rollback(); // Rollback if already booked
            return res.status(409).json({ message: 'You already have an active booking for this event.' });
        }

        // 2. Get event details and lock the row to prevent race conditions
        const [eventRows] = await connection.execute(
            'SELECT * FROM events WHERE id = ? FOR UPDATE',
            [eventId]
        );
        const event = eventRows[0];

        if (!event) {
            await connection.rollback();
            return res.status(404).json({ message: 'Event not found.' });
        }
        if (event.available_seats < parsedNumberOfTickets) { // Check against requested tickets
            await connection.rollback();
            return res.status(400).json({ message: `Not enough available seats. Only ${event.available_seats} seats remaining.` });
        }
        if (new Date(event.event_date) < new Date()) {
            await connection.rollback();
            return res.status(400).json({ message: 'Cannot book past events.' });
        }

        // 3. Decrement available seats by the requested number of tickets
        // eventModel.decrementAvailableSeats needs to accept numberOfTickets
        const decremented = await eventModel.decrementAvailableSeats(eventId, parsedNumberOfTickets, connection);
        if (!decremented) {
            await connection.rollback();
            return res.status(500).json({ message: 'Failed to decrement seats. Concurrency issue or insufficient seats.' });
        }

        // 4. Create booking with number of tickets
        // bookingModel.create needs to accept numberOfTickets
        const newBooking = await bookingModel.create(userId, eventId, parsedNumberOfTickets, connection);

        await connection.commit(); // Commit the transaction

        // Optional: Send email notification
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
        // Send email asynchronously, don't block response
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
            await connection.rollback(); // Rollback on any error
        }
        console.error('Booking error:', error);
        res.status(500).json({ message: 'Internal server error during booking.' });
    } finally {
        if (connection) {
            connection.release(); // Release the connection back to the pool
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
        // bookingModel.findByUserId needs to accept limit and offset for pagination
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
    const { id } = req.params; // Booking ID
    const userId = req.user.id;
    const userRole = req.user.role; // For admin override

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const booking = await bookingModel.findById(id, connection); // Pass connection for transaction
        if (!booking) {
            await connection.rollback();
            return res.status(404).json({ message: 'Booking not found.' });
        }

        // Authorization check: Only booking owner or admin can cancel
        if (booking.user_id !== userId && userRole !== 'admin') {
            await connection.rollback();
            return res.status(403).json({ message: 'Not authorized to cancel this booking.' });
        }

        if (booking.status === 'cancelled') {
            await connection.rollback();
            return res.status(400).json({ message: 'This booking is already cancelled.' });
        }

        const event = await eventModel.findById(booking.event_id, connection); // Pass connection for transaction
        if (!event) { // Event might have been deleted
            await connection.rollback();
            return res.status(404).json({ message: 'Associated event not found.' });
        }

        if (new Date(event.event_date) < new Date()) {
            await connection.rollback();
            return res.status(400).json({ message: 'Cannot cancel booking for a past event.' });
        }

        // Update booking status to 'cancelled' instead of deleting
        // bookingModel.updateStatus needs to be created
        const updated = await bookingModel.updateStatus(id, 'cancelled', connection);
        if (!updated) {
            await connection.rollback();
            return res.status(500).json({ message: 'Failed to update booking status to cancelled.' });
        }

        // Increment available seats by the number of tickets from the cancelled booking
        // eventModel.incrementAvailableSeats needs to accept numberOfTickets
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