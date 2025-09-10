import { Router } from 'express';
import { centralBookingController } from '../controllers/centralBooking';
import { authenticateUser } from '../middleware/auth';

const router = Router();

/**
 * @route POST /api/v1/bookings/create
 * @desc Create a new booking from departure station to destination station
 * @access Private (Requires authentication)
 * @body {
 *   departureStationId: string,
 *   destinationStationId: string,
 *   numberOfSeats: number
 * }
 */
router.post('/create', authenticateUser, centralBookingController.createBooking.bind(centralBookingController));

/**
 * @route POST /api/v1/central-bookings/overnight
 * @desc Create an overnight booking
 * @access Private (Requires authentication)
 * @body {
 *   departureStationId: string,
 *   destinationId: string,
 *   numberOfSeats: number
 * }
 */
router.post('/overnight', authenticateUser, centralBookingController.createOvernightBooking.bind(centralBookingController));

/**
 * @route GET /api/v1/bookings/user/:userId
 * @desc Get all bookings for a specific user
 * @access Private (Requires authentication, user can only view own bookings)
 * @param {string} userId - The user ID
 */
router.get('/user/:userId', authenticateUser, centralBookingController.getUserBookings.bind(centralBookingController));

/**
 * @route POST /api/v1/central-bookings/test-payment/:paymentRef
 * @desc Test payment completion (development only)
 * @access Private (Requires authentication)
 * @param {string} paymentRef - The payment reference to mark as completed
 */
router.post('/test-payment/:paymentRef', authenticateUser, centralBookingController.testPaymentCompletion.bind(centralBookingController));

/**
 * @route GET /api/v1/central-bookings/payment/:paymentRef
 * @desc Get payment status by payment reference
 * @access Private (Requires authentication)
 * @param {string} paymentRef - The payment reference
 */
router.get('/payment/:paymentRef', authenticateUser, centralBookingController.getPaymentStatus.bind(centralBookingController));

/**
 * @route GET /api/v1/central-bookings/debug/payment/:paymentRef
 * @desc Debug payment status without authentication (development only)
 * @access Public (for debugging)
 * @param {string} paymentRef - The payment reference
 */
router.get('/debug/payment/:paymentRef', centralBookingController.debugPaymentStatus.bind(centralBookingController));

/**
 * @route GET /api/v1/central-bookings/booking-details/:paymentRef
 * @desc Get complete booking details including vehicle and station information
 * @access Public (for booking confirmation page)
 * @param {string} paymentRef - The payment reference
 */
router.get('/booking-details/:paymentRef', centralBookingController.getBookingDetails.bind(centralBookingController));

/**
 * @route GET /api/v1/central-bookings/latest-paid-ticket
 * @desc Get the latest paid ticket for the authenticated user
 * @access Private (Requires authentication)
 */
router.get('/latest-paid-ticket', authenticateUser, centralBookingController.getLatestPaidTicket.bind(centralBookingController));

/**
 * @route GET /api/v1/central-bookings/webhook/payment
 * @desc Handle payment webhook from Konnect
 * @access Public (webhook from payment gateway)
 * @query {string} payment_ref - The payment reference from Konnect
 */
router.get('/webhook/payment', centralBookingController.handlePaymentWebhook.bind(centralBookingController));


/**
 * @route POST /api/v1/central-bookings/expire-ticket/:bookingId
 * @desc Expire a ticket when countdown and bonus time run out
 * @access Private (Requires authentication)
 * @param {string} bookingId - The booking ID to expire
 */
router.post('/expire-ticket/:bookingId', authenticateUser, centralBookingController.expireTicket.bind(centralBookingController));

/**
 * @route GET /api/v1/central-bookings/webhook/verify/:paymentId
 * @desc Verify payment webhook from Konnect
 * @access Public (for webhook verification)
 * @query {string} paymentId - The payment ID to verify
 */
//router.get('/webhook/verify/:paymentId', centralBookingController.verifyPaymentWebhook.bind(centralBookingController));
/**
 * Health check for central booking service
 * GET /api/v1/central-bookings/health
 */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Central Booking service is healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      create_booking: 'POST /api/v1/central-bookings/create',
      user_bookings: 'GET /api/v1/central-bookings/user/:userId',
      payment_status: 'GET /api/v1/central-bookings/payment/:paymentRef',
      payment_webhook: 'GET /api/v1/central-bookings/webhook/payment'
    },
    features: {
      authentication: 'Required for all endpoints except webhook',
      payment_integration: 'Konnect payment gateway',
      real_time_updates: 'WebSocket broadcasting',
      seat_management: 'Multi-vehicle seat allocation'
    },
    requirements: {
      authentication: 'JWT token required for most endpoints',
      authorization: 'Users can only access their own bookings',
      payment: 'Konnect payment gateway integration'
    }
  });
});

export default router;
