const pool = require('../config/db'); // Import the connection pool for transactions
const bookingModel = require('../models/bookingModel');
const eventModel = require('../models/eventModel');
const emailService = require('../config/emailService'); // For optional email notification

const bookEvent = async (req, res) => {
    const { eventId } = req.body;
    const userId = req.user.id;

    if (!eventId) {
        return res.status(400).json({ message: 'Event ID is required.' });
    }

    let connection;
    try {
        connection = await pool.getConnection(); // Get a connection from the pool
        await connection.beginTransaction(); // Start transaction

        // 1. Check if user already booked this event
        const existingBooking = await bookingModel.findByUserIdAndEventId(userId, eventId);
        if (existingBooking) {
            await connection.rollback(); // Rollback if already booked
            return res.status(409).json({ message: 'You have already booked this event.' });
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
        if (event.available_seats <= 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'No available seats for this event.' });
        }
        if (new Date(event.event_date) < new Date()) {
            await connection.rollback();
            return res.status(400).json({ message: 'Cannot book past events.' });
        }

        // 3. Decrement available seats
        const decremented = await eventModel.decrementAvailableSeats(eventId, connection);
        if (!decremented) {
            await connection.rollback();
            return res.status(500).json({ message: 'Failed to decrement seats. Concurrency issue?' });
        }

        // 4. Create booking
        const newBooking = await bookingModel.create(userId, eventId, connection);

        await connection.commit(); // Commit the transaction

        // Optional: Send email notification
        emailService.sendBookingConfirmation(req.user.email, event.title, event.event_date);

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
    try {
        const bookings = await bookingModel.findByUserId(userId);
        res.status(200).json(bookings);
    } catch (error) {
        console.error('Get my bookings error:', error);
        res.status(500).json({ message: 'Internal server error fetching your bookings.' });
    }
};

const cancelBooking = async (req, res) => {
    const { id } = req.params; // Booking ID
    const userId = req.user.id;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const booking = await bookingModel.findById(id);
        if (!booking || booking.user_id !== userId) {
            await connection.rollback();
            return res.status(404).json({ message: 'Booking not found or you are not authorized to cancel this booking.' });
        }

        const event = await eventModel.findById(booking.event_id);
        if (event && new Date(event.event_date) < new Date()) {
            await connection.rollback();
            return res.status(400).json({ message: 'Cannot cancel booking for a past event.' });
        }

        const deleted = await bookingModel.remove(id, userId);
        if (!deleted) {
            await connection.rollback();
            return res.status(500).json({ message: 'Failed to cancel booking.' });
        }

        // Increment available seats after cancellation
        await eventModel.incrementAvailableSeats(booking.event_id, connection);

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