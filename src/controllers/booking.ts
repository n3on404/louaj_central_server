import { Request, Response } from 'express';
import { bookingService } from '../services/booking';

/**
 * Create a new booking
 * POST /api/v1/bookings
 */
export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { departureStationId, destinationStationId, seatsBooked, journeyDate } = req.body;
    const userId = req.user?.id;
    // Validate required fields
    if (!departureStationId || !destinationStationId || !seatsBooked || !journeyDate) {
      res.status(400).json({
        success: false,
        message: 'Departure station, destination station, seats booked, and journey date are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
      return;
    }

    // Validate user is authenticated
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    // Validate seat count
    if (seatsBooked < 1 || seatsBooked > 10) {
      res.status(400).json({
        success: false,
        message: 'Number of seats must be between 1 and 10',
        code: 'INVALID_SEAT_COUNT'
      });
      return;
    }

    // Validate journey date
    const journeyDateTime = new Date(journeyDate);
    const now = new Date();
    if (journeyDateTime < now) {
      res.status(400).json({
        success: false,
        message: 'Journey date cannot be in the past',
        code: 'INVALID_JOURNEY_DATE'
      });
      return;
    }

    const result = await bookingService.createBooking({
      userId,
      departureStationId,
      destinationStationId,
      seatsBooked: parseInt(seatsBooked),
      journeyDate: journeyDateTime
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Booking creation failed',
        code: 'BOOKING_CREATION_FAILED'
      });
      return;
    }

    console.log(`🎫 Booking created: ${result.booking?.id} for user ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking: result.booking,
        paymentUrl: result.paymentUrl,
        clickToPayUrl: result.clickToPayUrl
      }
    });

  } catch (error: any) {
    console.error('❌ Error creating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

/**
 * Get user's bookings
 * GET /api/v1/bookings
 */
export const getUserBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    const result = await bookingService.getUserBookings(userId);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to fetch bookings',
        code: 'FETCH_BOOKINGS_FAILED'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Bookings retrieved successfully',
      data: {
        bookings: result.bookings || []
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

/**
 * Get booking by ID
 * GET /api/v1/bookings/:id
 */
export const getBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Booking ID is required',
        code: 'MISSING_BOOKING_ID'
      });
      return;
    }

    const result = await bookingService.getBookingById(id, userId);

    if (!result.success) {
      res.status(404).json({
        success: false,
        message: result.error || 'Booking not found',
        code: 'BOOKING_NOT_FOUND'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Booking retrieved successfully',
      data: {
        booking: result.booking
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

/**
 * Cancel a booking
 * DELETE /api/v1/bookings/:id
 */
export const cancelBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Booking ID is required',
        code: 'MISSING_BOOKING_ID'
      });
      return;
    }

    const result = await bookingService.cancelBooking(id, userId);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message || 'Booking cancellation failed',
        code: 'BOOKING_CANCELLATION_FAILED'
      });
      return;
    }

    console.log(`🚫 Booking cancelled: ${id} by user ${userId}`);

    res.status(200).json({
      success: true,
      message: result.message || 'Booking cancelled successfully'
    });

  } catch (error: any) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

/**
 * Handle payment webhook from Konnect
 * POST /api/v1/bookings/webhook/payment
 * GET /api/v1/bookings/webhook/payment?payment_ref=xxx&status=xxx
 */
export const handlePaymentWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    // Support both GET and POST requests
    let payment_ref: string;
    let status: string;

    if (req.method === 'GET') {
      // GET request with query parameters
      payment_ref = req.query.payment_ref as string;
      status = req.query.status as string || 'completed'; // Default to completed for GET requests
    } else {
      // POST request with body
      payment_ref = req.body.payment_ref;
      status = req.body.status;
    }

    console.log(`📞 Payment webhook received (${req.method}):`, { payment_ref, status });

    if (!payment_ref) {
      res.status(400).json({
        success: false,
        message: 'Payment reference is required',
        code: 'MISSING_PAYMENT_REF'
      });
      return;
    }

    // If no status provided, default to completed
    if (!status) {
      status = 'completed';
    }

    const result = await bookingService.handlePaymentWebhook(payment_ref, status);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message || 'Webhook processing failed',
        code: 'WEBHOOK_PROCESSING_FAILED'
      });
      return;
    }

    console.log(`✅ Payment webhook processed: ${payment_ref}`);

    res.status(200).json({
      success: true,
      message: result.message || 'Webhook processed successfully'
    });

  } catch (error: any) {
    console.error('❌ Error processing payment webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};
