import { Router } from 'express';
import { 
  createBooking, 
  getUserBookings, 
  getBookingById, 
  cancelBooking, 
  handlePaymentWebhook 
} from '../controllers/booking';
import { authenticateUser } from '../middleware/auth';

const router = Router();

/**
 * @route POST /api/v1/bookings
 * @desc Create a new booking with payment initialization
 * @body { departureStationId: string, destinationStationId: string, seatsBooked: number, journeyDate: string }
 * @response { booking: Booking, paymentUrl: string, clickToPayUrl: string }
 * @access Private (requires authentication)
 */
router.post('/', createBooking);

/**
 * @route GET /api/v1/bookings
 * @desc Get user's bookings
 * @response { bookings: Booking[] }
 * @access Private (requires authentication)
 */
router.get('/', authenticateUser, getUserBookings);

/**
 * @route GET /api/v1/bookings/:id
 * @desc Get booking by ID
 * @params { id: string }
 * @response { booking: Booking }
 * @access Private (requires authentication)
 */
router.get('/:id', authenticateUser, getBookingById);

/**
 * @route DELETE /api/v1/bookings/:id
 * @desc Cancel a booking (only if payment is still pending)
 * @params { id: string }
 * @response { message: string }
 * @access Private (requires authentication)
 */
router.delete('/:id', authenticateUser, cancelBooking);

/**
 * @route POST /api/v1/bookings/webhook/payment
 * @route GET /api/v1/bookings/webhook/payment
 * @desc Handle payment webhook from Konnect
 * @body { payment_ref: string, status: string } (POST)
 * @query { payment_ref: string, status?: string } (GET)
 * @response { message: string }
 * @access Public (webhook from payment gateway)
 */
router.post('/webhook/payment', handlePaymentWebhook);
router.get('/webhook/payment', handlePaymentWebhook);

export default router;
