import { prisma } from '../config/database';
import { BookingStatus } from '@prisma/client';
import { konnectService } from './konnect';
import { CentralWebSocketServer } from '../websocket/WebSocketServer';
import axios from 'axios';


interface CreateBookingRequest {
  userId: string;
  departureStationId: string;
  destinationStationId: string;
  seatsBooked: number;
  journeyDate: Date;
}

interface BookingResponse {
  id: string;
  userId: string;
  departureStationId: string;
  destinationStationId: string;
  seatsBooked: number;
  totalAmount: number;
  journeyDate: Date;
  verificationCode: string;
  status: BookingStatus;
  paymentReference?: string;
  createdAt: Date;
  updatedAt: Date;
  vehicleAllocations?: Array<{
    licensePlate: string;
    seatsBooked: number;
    queuePosition: number;
  }>;
}

interface CreateBookingResult {
  success: boolean;
  booking?: BookingResponse;
  paymentUrl?: string;
  clickToPayUrl?: string;
  vehicleAllocations?: Array<{
    licensePlate: string;
    seatsBooked: number;
    queuePosition: number;
  }>;
  error?: string;
}

interface BookingListResult {
  success: boolean;
  bookings?: BookingResponse[];
  error?: string;
}

class BookingService {
  private wsServer: CentralWebSocketServer | null = null;

  constructor() {
    // Get WebSocket server instance when available
    this.wsServer = CentralWebSocketServer.getInstance();
  }

  /**
   * Send real-time booking update to connected clients
   */
  private async sendBookingUpdate(
    stationId: string,
    bookingId: string,
    updateType: 'created' | 'payment_updated' | 'cancelled',
    bookingData: any
  ): Promise<void> {
    if (!this.wsServer) {
      console.log('📡 WebSocket server not available, skipping real-time update');
      return;
    }

    try {
      let messageType: 'booking_created' | 'booking_payment_updated' | 'booking_cancelled';
      
      if (updateType === 'created') {
        messageType = 'booking_created';
      } else if (updateType === 'payment_updated') {
        messageType = 'booking_payment_updated';
      } else {
        messageType = 'booking_cancelled';
      }

      const message = {
        type: messageType,
        payload: {
          bookingId,
          updateType,
          booking: bookingData,
          timestamp: new Date().toISOString()
        },
        timestamp: Date.now()
      };

      // Send to station's local node
      this.wsServer.sendToStation(stationId, message);
      
      // Send to mobile apps (optional - for user notifications)
      this.wsServer.broadcastToMobileApps(message);

      console.log(`📡 Real-time booking update sent: ${updateType} for booking ${bookingId}`);
    } catch (error) {
      console.error('❌ Error sending real-time booking update:', error);
    }
  }
  
  /**
   * Create a new booking with payment initialization
   */
  async createBooking(bookingData: CreateBookingRequest): Promise<CreateBookingResult> {
    try {
      console.log(`🎫 Creating booking for user ${bookingData.userId}`);

      // Validate stations exist and get route information
      const [departureStation, destinationStation] = await Promise.all([
        prisma.station.findUnique({
          where: { id: bookingData.departureStationId },
          include: { governorate: true, delegation: true }
        }),
        prisma.station.findUnique({
          where: { id: bookingData.destinationStationId },
          include: { governorate: true, delegation: true }
        })
      ]);

      if (!departureStation || !destinationStation) {
        return {
          success: false,
          error: 'Invalid departure or destination station'
        };
      }

      // Check if departure station is online
      if (!departureStation.isOnline) {
        return {
          success: false,
          error: 'Departure station is currently offline. Please try again later or contact station staff.'
        };
      }

      // Check if station has a local server IP
      if (!departureStation.localServerIp) {
        return {
          success: false,
          error: 'Station local server configuration is missing. Please contact support.'
        };
      }

      // Check seat availability and get vehicle allocation at the local station
      const vehicleAllocation = await this.getVehicleAllocation(
        departureStation.localServerIp,
        bookingData.destinationStationId,
        bookingData.seatsBooked
      );

      if (!vehicleAllocation.success) {
        return {
          success: false,
          error: vehicleAllocation.error || 'Not enough seats available for this route'
        };
      }

      // Get route pricing
      const route = await prisma.route.findFirst({
        where: {
          departureStationId: bookingData.departureStationId,
          destinationStationId: bookingData.destinationStationId,
          isActive: true
        }
      });

      if (!route) {
        return {
          success: false,
          error: 'No active route found between selected stations'
        };
      }

      // Get user information
      const user = await prisma.user.findUnique({
        where: { id: bookingData.userId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      if (!user.isVerified) {
        return {
          success: false,
          error: 'User phone number must be verified before booking'
        };
      }

      // Calculate total amount from vehicle allocation or use route pricing as fallback
      let totalAmount = 0;
      let pricePerSeat = 0;

      if (vehicleAllocation.totalAmount && vehicleAllocation.totalAmount > 0) {
        // Use pricing from vehicle allocation
        totalAmount = vehicleAllocation.totalAmount;
        pricePerSeat = totalAmount / bookingData.seatsBooked;
      } else {
        // Fall back to route pricing
        pricePerSeat = parseFloat(route.basePrice.toString());
        totalAmount = pricePerSeat * bookingData.seatsBooked;
      }

      // Generate verification code
      const verificationCode = this.generateVerificationCode();

      // Create booking in database
      const booking = await prisma.booking.create({
        data: {
          userId: bookingData.userId,
          departureStationId: bookingData.departureStationId,
          destinationStationId: bookingData.destinationStationId,
          seatsBooked: bookingData.seatsBooked,
          totalAmount: totalAmount,
          journeyDate: bookingData.journeyDate,
          verificationCode: verificationCode,
          status: BookingStatus.PENDING
        }
      });

      console.log(`✅ Booking created: ${booking.id}`);

      // Create corresponding booking on local node
      if (departureStation.localServerIp) {
        const localBookingResult = await this.createLocalNodeBooking(
          departureStation.localServerIp,
          bookingData.destinationStationId,
          bookingData.seatsBooked,
          user.phoneNumber,
          booking.id,
          vehicleAllocation.allocation || [],
          bookingData.userId, // Pass user ID for local node
          totalAmount // Pass total amount from route pricing
        );

        if (!localBookingResult.success) {
          // If local node booking fails, we should cancel the central booking
          await prisma.booking.update({
            where: { id: booking.id },
            data: { status: BookingStatus.FAILED }
          });

          return {
            success: false,
            error: `Failed to create booking on local station: ${localBookingResult.error}`
          };
        }
      }

      // Initialize payment with Konnect
      const paymentResult = await konnectService.initializePayment({
        amount: konnectService.convertToMillimes(totalAmount),
        description: `Louaj Trip: ${departureStation.name} → ${destinationStation.name} (${bookingData.seatsBooked} seats)`,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        email: user.email || `${user.phoneNumber}@louaj.tn`,
        orderId: booking.id,
        webhook: `${process.env.BASE_URL || 'http://localhost:5000'}/api/v1/bookings/webhook/payment`
      });

      if (!paymentResult.success) {
        // Update booking status to failed
        await prisma.booking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.FAILED }
        });

        return {
          success: false,
          error: `Payment initialization failed: ${paymentResult.error}`
        };
      }

      // Update booking with payment reference
      const updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentReference: paymentResult.paymentRef || null }
      });

      // Generate clicktopay link using payment reference
      const clickToPayUrl = konnectService.generateClickToPayLink(paymentResult.paymentRef!);

      // Format vehicle allocation for response
      const vehicleAllocations = vehicleAllocation.allocation?.map(alloc => ({
        licensePlate: alloc.licensePlate,
        seatsBooked: alloc.seatsToBook,
        queuePosition: alloc.queuePosition
      })) || [];

      console.log(`🎉 Booking created successfully: ${booking.id} with payment ${paymentResult.paymentRef}`);
      console.log(`🚐 Vehicle allocations:`, vehicleAllocations);

      // Send real-time update to station and mobile apps
      this.sendBookingUpdate(
        departureStation.id,
        booking.id,
        'created',
        this.formatBookingResponse(updatedBooking)
      );

      return {
        success: true,
        booking: this.formatBookingResponse(updatedBooking),
        paymentUrl: paymentResult.payUrl || '',
        clickToPayUrl: clickToPayUrl,
        vehicleAllocations: vehicleAllocations
      };

    } catch (error) {
      console.error('❌ Error creating booking:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get user bookings
   */
  async getUserBookings(userId: string): Promise<BookingListResult> {
    try {
      console.log(`📋 Getting bookings for user: ${userId}`);

      const bookings = await prisma.booking.findMany({
        where: { userId },
        include: {
          departureStation: {
            include: { governorate: true, delegation: true }
          },
          destinationStation: {
            include: { governorate: true, delegation: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        success: true,
        bookings: bookings.map(booking => ({
          ...this.formatBookingResponse(booking),
          departureStation: {
            id: booking.departureStation.id,
            name: booking.departureStation.name,
            governorate: booking.departureStation.governorate.name,
            delegation: booking.departureStation.delegation.name
          },
          destinationStation: {
            id: booking.destinationStation.id,
            name: booking.destinationStation.name,
            governorate: booking.destinationStation.governorate.name,
            delegation: booking.destinationStation.delegation.name
          }
        } as any))
      };

    } catch (error) {
      console.error('❌ Error getting user bookings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get booking by ID
   */
  async getBookingById(bookingId: string, userId?: string): Promise<{
    success: boolean;
    booking?: any;
    error?: string;
  }> {
    try {
      const whereClause: any = { id: bookingId };
      if (userId) {
        whereClause.userId = userId;
      }

      const booking = await prisma.booking.findUnique({
        where: whereClause,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              email: true
            }
          },
          departureStation: {
            include: { governorate: true, delegation: true }
          },
          destinationStation: {
            include: { governorate: true, delegation: true }
          }
        }
      });

      if (!booking) {
        return {
          success: false,
          error: 'Booking not found'
        };
      }

      return {
        success: true,
        booking: {
          ...this.formatBookingResponse(booking),
          user: booking.user,
          departureStation: {
            id: booking.departureStation.id,
            name: booking.departureStation.name,
            governorate: booking.departureStation.governorate.name,
            delegation: booking.departureStation.delegation.name
          },
          destinationStation: {
            id: booking.destinationStation.id,
            name: booking.destinationStation.name,
            governorate: booking.destinationStation.governorate.name,
            delegation: booking.destinationStation.delegation.name
          }
        }
      };

    } catch (error) {
      console.error('❌ Error getting booking:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle payment webhook from Konnect
   */
  async handlePaymentWebhook(paymentRef: string, status: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      console.log(`💰 Processing payment webhook: ${paymentRef} - ${status}`);

      const booking = await prisma.booking.findFirst({
        where: { paymentReference: paymentRef },
        include: {
          departureStation: true
        }
      });

      if (!booking) {
        console.error(`❌ Booking not found for payment reference: ${paymentRef}`);
        return {
          success: false,
          message: 'Booking not found'
        };
      }

      let newStatus: BookingStatus;
      let paymentProcessedAt: Date | null = null;

      switch (status.toLowerCase()) {
        case 'completed':
        case 'success':
        case 'paid':
          newStatus = BookingStatus.PAID;
          paymentProcessedAt = new Date();
          break;
        case 'failed':
        case 'error':
          newStatus = BookingStatus.FAILED;
          break;
        case 'cancelled':
          newStatus = BookingStatus.CANCELLED;
          break;
        default:
          newStatus = BookingStatus.PENDING;
      }

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: newStatus,
          paymentProcessedAt: paymentProcessedAt
        }
      });

      console.log(`✅ Booking ${booking.id} status updated to ${newStatus}`);

      // Update payment status on local node if applicable
      if (booking.departureStation?.localServerIp) {
        const localPaymentStatus = newStatus === BookingStatus.PAID ? 'PAID' : 
                                  newStatus === BookingStatus.FAILED ? 'FAILED' : 'CANCELLED';
        
        const localPaymentResult = await this.updateLocalNodePaymentStatus(
          booking.departureStation.localServerIp,
          booking.id,
          localPaymentStatus
        );

        if (!localPaymentResult.success) {
          console.error(`❌ Failed to update payment status on local node: ${localPaymentResult.error}`);
        }
      }

      // Send real-time update to station and mobile apps
      this.sendBookingUpdate(
        booking.departureStationId,
        booking.id,
        'payment_updated',
        {
          ...booking,
          status: newStatus,
          paymentProcessedAt: paymentProcessedAt
        }
      );

      return {
        success: true,
        message: 'Payment status updated successfully'
      };

    } catch (error) {
      console.error('❌ Error processing payment webhook:', error);
      return {
        success: false,
        message: 'Error processing payment webhook'
      };
    }
  }

  /**
   * Cancel booking (if payment is still pending)
   */
  async cancelBooking(bookingId: string, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          userId: userId
        }
      });

      if (!booking) {
        return {
          success: false,
          message: 'Booking not found'
        };
      }

      if (booking.status !== BookingStatus.PENDING) {
        return {
          success: false,
          message: 'Only pending bookings can be cancelled'
        };
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CANCELLED }
      });

      console.log(`🚫 Booking cancelled: ${bookingId}`);

      // Send real-time update to station and mobile apps
      this.sendBookingUpdate(
        booking.departureStationId,
        bookingId,
        'cancelled',
        {
          ...booking,
          status: BookingStatus.CANCELLED
        }
      );

      return {
        success: true,
        message: 'Booking cancelled successfully'
      };

    } catch (error) {
      console.error('❌ Error cancelling booking:', error);
      return {
        success: false,
        message: 'Error cancelling booking'
      };
    }
  }

  /**
   * Get vehicle allocation plan from local station
   */
  private async getVehicleAllocation(
    localServerIp: string,
    destinationStationId: string,
    seatsRequested: number
  ): Promise<{ 
    success: boolean; 
    allocation?: Array<{
      queueId: string;
      vehicleId: string;
      licensePlate: string;
      seatsToBook: number;
      pricePerSeat: number;
      queuePosition: number;
    }>; 
    totalAmount?: number;
    error?: string;
  }> {
    try {
      console.log(`🎯 Getting vehicle allocation for ${seatsRequested} seats`);

      // Get available vehicles from local station
      const localStationUrl = `http://${localServerIp}:3001/api/queue-booking/destinations/${destinationStationId}/seats`;

      const response = await axios.get(localStationUrl, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Central-Server': 'true'
        }
      });

      if (response.status !== 200) {
        return {
          success: false,
          error: 'Failed to get vehicle information from station'
        };
      }

      const responseData = response.data as any;
      
      if (!responseData.success || !responseData.data) {
        return {
          success: false,
          error: 'Invalid response from station'
        };
      }

      const vehicles = responseData.data.vehicles || [];
      
      // Check if we have enough total seats
      const totalAvailableSeats = vehicles.reduce((sum: number, v: any) => sum + v.availableSeats, 0);
      if (totalAvailableSeats < seatsRequested) {
        return {
          success: false,
          error: `Only ${totalAvailableSeats} seat(s) available at station, but ${seatsRequested} requested.`
        };
      }

      // Sort vehicles by queue position (first in queue gets filled first)
      const sortedVehicles = vehicles
        .filter((v: any) => v.availableSeats > 0)
        .sort((a: any, b: any) => a.queuePosition - b.queuePosition);

      // Allocate seats across vehicles
      const allocation = [];
      let remainingSeats = seatsRequested;
      let totalAmount = 0;

      for (const vehicle of sortedVehicles) {
        if (remainingSeats <= 0) break;

        const seatsToBook = Math.min(remainingSeats, vehicle.availableSeats);
        const vehicleAmount = seatsToBook * (vehicle.basePrice || 0);
        
        allocation.push({
          queueId: vehicle.queueId,
          vehicleId: vehicle.vehicleId,
          licensePlate: vehicle.licensePlate,
          seatsToBook: seatsToBook,
          pricePerSeat: vehicle.basePrice || 0,
          queuePosition: vehicle.queuePosition
        });

        remainingSeats -= seatsToBook;
        totalAmount += vehicleAmount;
        
        console.log(`📋 Allocated ${seatsToBook} seats to vehicle ${vehicle.licensePlate} (position ${vehicle.queuePosition})`);
      }

      if (remainingSeats > 0) {
        return {
          success: false,
          error: `Unable to allocate ${remainingSeats} remaining seats`
        };
      }

      console.log(`✅ Vehicle allocation completed: ${allocation.length} vehicles, Total: $${totalAmount}`);

      return {
        success: true,
        allocation: allocation,
        totalAmount: totalAmount
      };

    } catch (error: any) {
      console.error('❌ Error getting vehicle allocation:', error.message);
      
      // Handle different types of errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return {
          success: false,
          error: 'Station server is not responding. Please try again later.'
        };
      }
      
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'Station server response timeout. Please try again.'
        };
      }

      return {
        success: false,
        error: 'Unable to get vehicle allocation from station. Please try again.'
      };
    }
  }

  /**
   * Generate a 6-digit verification code
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Format booking response
   */
  private formatBookingResponse(booking: any): BookingResponse {
    return {
      id: booking.id,
      userId: booking.userId,
      departureStationId: booking.departureStationId,
      destinationStationId: booking.destinationStationId,
      seatsBooked: booking.seatsBooked,
      totalAmount: parseFloat(booking.totalAmount.toString()),
      journeyDate: booking.journeyDate,
      verificationCode: booking.verificationCode,
      status: booking.status,
      paymentReference: booking.paymentReference,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt
    };
  }

  /**
   * Create booking on local node
   */
  private async createLocalNodeBooking(
    localServerIp: string,
    destinationStationId: string,
    seatsRequested: number,
    customerPhone: string,
    onlineTicketId: string,
    vehicleAllocations: Array<{
      queueId: string;
      vehicleId: string;
      licensePlate: string;
      seatsToBook: number;
      pricePerSeat: number;
      queuePosition: number;
    }>,
    userId: string,
    totalAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🌐 Creating booking on local node: ${localServerIp}:3001`);

      const localStationUrl = `http://${localServerIp}:3001/api/queue-booking/online`;

      const requestData = {
        destinationId: destinationStationId,
        seatsRequested: seatsRequested,
        customerPhone: customerPhone,
        onlineTicketId: onlineTicketId,
        userId: userId, // Add user ID
        totalAmount: totalAmount, // Add total amount from route pricing
        vehicleAllocations: vehicleAllocations.map(alloc => ({
          queueId: alloc.queueId,
          seatsToBook: alloc.seatsToBook,
          licensePlate: alloc.licensePlate
        }))
      };

      const response = await axios.post(localStationUrl, requestData, {
        timeout: 15000, // 15 second timeout
        headers: {
          'Content-Type': 'application/json',
          'X-Central-Server': 'true'
        }
      });

      if (response.status !== 201) {
        return {
          success: false,
          error: 'Failed to create booking on local node'
        };
      }

      const responseData = response.data as any;
      
      if (!responseData.success) {
        return {
          success: false,
          error: responseData.error || 'Failed to create booking on local node'
        };
      }

      console.log(`✅ Local node booking created successfully`);
      
      return {
        success: true
      };

    } catch (error: any) {
      console.error('❌ Error creating local node booking:', error.message);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return {
          success: false,
          error: 'Local station server is not responding'
        };
      }
      
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'Local station server timeout'
        };
      }

      return {
        success: false,
        error: 'Failed to communicate with local station'
      };
    }
  }

  /**
   * Update local node booking payment status
   */
  private async updateLocalNodePaymentStatus(
    localServerIp: string,
    onlineTicketId: string,
    paymentStatus: 'PAID' | 'FAILED' | 'CANCELLED'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`💳 Updating local node payment status: ${onlineTicketId} to ${paymentStatus}`);

      const localStationUrl = `http://${localServerIp}:3001/api/queue-booking/online/${onlineTicketId}/payment`;

      const response = await axios.put(localStationUrl, {
        paymentStatus: paymentStatus
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Central-Server': 'true'
        }
      });

      if (response.status !== 200) {
        return {
          success: false,
          error: 'Failed to update payment status on local node'
        };
      }

      const responseData = response.data as any;
      
      if (!responseData.success) {
        return {
          success: false,
          error: responseData.error || 'Failed to update payment status on local node'
        };
      }

      console.log(`✅ Local node payment status updated successfully`);
      
      return {
        success: true
      };

    } catch (error: any) {
      console.error('❌ Error updating local node payment status:', error.message);
      
      return {
        success: false,
        error: 'Failed to update payment status on local node'
      };
    }
  }
}

// Export singleton instance
export const bookingService = new BookingService();
export { BookingService };
export type { 
  CreateBookingRequest, 
  BookingResponse, 
  CreateBookingResult, 
  BookingListResult 
};
