import { Request, Response } from 'express';
import { prisma } from '../config/database';
import axios from 'axios';
import { CentralWebSocketServer } from '../websocket/WebSocketServer';
import { konnectService } from '../services/konnect';
import { BookingStatus } from '@prisma/client';

// Define interfaces for type safety
interface LocalNodeResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface BookingRequest {
  departureStationId: string;
  destinationStationId: string;
  numberOfSeats: number;
}

interface VehicleQueueInfo {
  queueId: string;
  vehicleId: string;
  licensePlate: string;
  driverName: string;
  availableSeats: number;
  totalSeats: number;
  queuePosition: number;
  pricePerSeat: number;
}

/**
 * Broadcast booking updates to mobile apps
 */
function broadcastBookingUpdate(type: string, data: any) {
  const wsServer = CentralWebSocketServer.getInstance();
  if (wsServer) {
    wsServer.broadcastToMobileApps({
      type: 'booking_update',
      payload: {
        updateType: type,
        data,
        timestamp: new Date().toISOString()
      },
      timestamp: Date.now()
    });
    
    console.log(`📡 Broadcasted booking ${type} update to mobile apps`);
  }
}

/**
 * Central Server Booking Controller
 * Handles seat booking requests from mobile apps
 */
export class CentralBookingController {

  /**
   * POST /api/v1/bookings/create
   * Create a new booking from departure station to destination station
   */
  async createBooking(req: Request, res: Response): Promise<void> {
    try {
      // Check if user is authenticated
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be logged in to create a booking'
        });
        return;
      }

      const { departureStationId, destinationStationId, numberOfSeats, webhookUrl }: BookingRequest & { webhookUrl?: string } = req.body;

      // Validate input
      if (!departureStationId || !destinationStationId || !numberOfSeats) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'Departure station, destination station, and number of seats are required'
        });
        return;
      }

      if (numberOfSeats < 1 || numberOfSeats > 10) {
        res.status(400).json({
          success: false,
          error: 'Invalid number of seats',
          message: 'Number of seats must be between 1 and 10'
        });
        return;
      }

      console.log(`🎫 Creating booking: ${departureStationId} → ${destinationStationId} (${numberOfSeats} seats) for user ${userId}`);

      // Get departure station info
      const departureStation = await prisma.station.findUnique({
        where: { id: departureStationId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          localServerIp: true,
          isActive: true,
          isOnline: true,
          governorate: { select: { name: true, nameAr: true } },
          delegation: { select: { name: true, nameAr: true } }
        }
      });

      if (!departureStation) {
        res.status(404).json({
          success: false,
          error: 'Departure station not found'
        });
        return;
      }

      if (!departureStation.isActive) {
        res.status(400).json({
          success: false,
          error: 'Departure station is not active'
        });
        return;
      }

      if (!departureStation.isOnline || !departureStation.localServerIp) {
        res.status(503).json({
          success: false,
          error: 'Departure station is offline',
          message: 'The departure station is currently not available'
        });
        return;
      }

      // Get destination station info
      const destinationStation = await prisma.station.findUnique({
        where: { id: destinationStationId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          governorate: { select: { name: true, nameAr: true } },
          delegation: { select: { name: true, nameAr: true } }
        }
      });

      if (!destinationStation) {
        res.status(404).json({
          success: false,
          error: 'Destination station not found'
        });
        return;
      }

      // Get user info for booking
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
        }
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }
      
        const journeyDate = new Date();

        // Calculate ETA for regular booking (current time + 10 minutes)
        const calculateETA = (): Date => {
          const now = new Date();
          const eta = new Date(now.getTime() + 10 * 60 * 1000); // Add 10 minutes
          return eta;
        };

        const estimatedDepartureTime = calculateETA();
        console.log(`⏱️ ETA calculated for regular booking: ${estimatedDepartureTime.toISOString()} (10 minutes from booking time)`);

        // Check vehicle queue at departure station for the destination
      const localNodeUrl = `http://${departureStation.localServerIp}:3001/api/public/queue/${destinationStationId}`;

      try {
        const queueResponse = await axios.get(localNodeUrl, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Louaj-Central-Server/1.0'
          }
        });

        const queueData = queueResponse.data as LocalNodeResponse;
        if (!queueData.success) {
          res.status(400).json({
            success: false,
            error: 'No vehicles available',
            message: 'No vehicles are currently queued for this destination'
          });
          return;
        }

        const vehicles: VehicleQueueInfo[] = queueData.data.vehicles || [];

        if (vehicles.length === 0) {
          res.status(400).json({
            success: false,
            error: 'No vehicles available',
            message: 'No vehicles are currently queued for this destination'
          });
          return;
        }

        // Extract ETA information from the local node response
        const destinationETD = queueData.data.destinationETD;

        // Find suitable vehicles with enough seats
        let remainingSeats = numberOfSeats;
        const selectedVehicles: Array<{vehicle: VehicleQueueInfo, seatsToBook: number}> = [];

        for (const vehicle of vehicles.sort((a, b) => a.queuePosition - b.queuePosition)) {
          if (remainingSeats <= 0) break;
          
          if (vehicle.availableSeats > 0) {
            const seatsToBook = Math.min(remainingSeats, vehicle.availableSeats);
            selectedVehicles.push({ vehicle, seatsToBook });
            remainingSeats -= seatsToBook;
          }
        }

        if (remainingSeats > 0) {
          res.status(400).json({
            success: false,
            error: 'Insufficient seats available',
            message: `Only ${numberOfSeats - remainingSeats} seats are available, but you requested ${numberOfSeats} seats`
          });
          return;
        }

        // Create booking in local node
        const bookingPayload = {
          userId: user.id,
          userFullName: `${user.firstName} ${user.lastName}`,
          userPhoneNumber: user.phoneNumber,
          userEmail: user.email || '',
          departureStationId,
          destinationStationId,
          numberOfSeats,
          selectedVehicles: selectedVehicles.map(sv => ({
            vehicleQueueId: sv.vehicle.queueId,
            licensePlate: sv.vehicle.licensePlate,
            seatsToBook: sv.seatsToBook,
            pricePerSeat: sv.vehicle.pricePerSeat
          }))
        };

        const bookingUrl = `http://${departureStation.localServerIp}:3001/api/bookings/create`;
        const bookingResponse = await axios.post(bookingUrl, bookingPayload, {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Louaj-Central-Server/1.0'
          }
        });

        const bookingResult = bookingResponse.data as LocalNodeResponse;
        if (!bookingResult.success) {
          res.status(400).json({
            success: false,
            error: 'Booking failed at station',
            message: bookingResult.error || 'Failed to create booking at the departure station'
          });
          return;
        }

        // Successful booking response
        const booking = bookingResult.data;
        
        // Calculate total amount for payment
        const totalAmount = booking.totalAmount;

        // Use the webhook URL provided by the frontend, or fall back to Central Server's own webhook
        const finalWebhookUrl = webhookUrl || `${process.env.BASE_URL || 'http://localhost:5000'}/api/v1/central-bookings/webhook/payment`;

        console.log(`💳 Initializing Konnect payment for booking ${booking.verificationCode}: ${totalAmount} TND`);
        console.log(`🪝 Using webhook URL: ${finalWebhookUrl}`);

        const paymentResult = await konnectService.initializePayment({
          amount: konnectService.convertToMillimes(totalAmount),
          description: `LOUAJ Transport Booking - ${departureStation.name} to ${destinationStation.name} (${numberOfSeats} seats)`,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          email: user.email || `${user.phoneNumber}@louaj.tn`,
          orderId: booking.verificationCode,
          webhook: finalWebhookUrl
        });

        if (!paymentResult.success) {
          console.error('❌ Konnect payment initialization failed:', paymentResult.error);
          res.status(500).json({
            success: false,
            error: 'Payment initialization failed',
            message: paymentResult.error || 'Unable to initialize payment gateway'
          });
          return;
        }

        console.log(`✅ Konnect payment initialized: ${paymentResult.paymentRef}`);

        // Store payment reference in a temporary booking record for tracking
        try {
          await prisma.booking.create({
            data: {
              userId: user.id,
              departureStationId,
              destinationStationId,
              seatsBooked: numberOfSeats,
              totalAmount,
              journeyDate: journeyDate, // Use calculated journey date based on station opening time
              estimatedDepartureTime: estimatedDepartureTime,
              status: BookingStatus.PENDING,
              paymentReference: paymentResult.paymentRef!, // We know it's not undefined here
              verificationCode: booking.verificationCode
            }
          });
          console.log(`📝 Central booking record created with payment ref: ${paymentResult.paymentRef}`);
        } catch (dbError) {
          console.warn('⚠️ Could not store booking in central database:', dbError);
          // Continue anyway as the local booking is already created
        }

        res.json({
          success: true,
          data: {
            booking: {
              id: booking.id,
              verificationCode: booking.verificationCode,
              totalAmount: booking.totalAmount,
              numberOfSeats: booking.numberOfSeats,
              status: BookingStatus.PENDING,
              journeyDate: journeyDate.toISOString(),
              estimatedDepartureTime: estimatedDepartureTime.toISOString(),
              createdAt: booking.createdAt
            },
            // Include AI-powered ETA predictions from local node
            etaPrediction: destinationETD ? {
                        estimatedDepartureTime: destinationETD.estimatedDepartureTime,
          etdHours: destinationETD.etdHours,
              confidenceLevel: destinationETD.confidenceLevel,
              modelUsed: destinationETD.modelUsed,
              queueVehicles: destinationETD.queueVehicles,
              ...(destinationETD.overnightInfo && {
                overnightInfo: destinationETD.overnightInfo
              })
            } : null,
            payment: {
              paymentUrl: paymentResult.payUrl,
              paymentRef: paymentResult.paymentRef,
              amount: totalAmount,
              amountInMillimes: konnectService.convertToMillimes(totalAmount),
              currency: 'TND',
              expiresIn: '60 minutes'
            },
            route: {
              departureStation: {
                id: departureStation.id,
                name: departureStation.name,
                nameAr: departureStation.nameAr,
                governorate: departureStation.governorate.name,
                delegation: departureStation.delegation.name
              },
              destinationStation: {
                id: destinationStation.id,
                name: destinationStation.name,
                nameAr: destinationStation.nameAr,
                governorate: destinationStation.governorate.name,
                delegation: destinationStation.delegation.name
              }
            },
            vehicles: booking.vehicles || selectedVehicles.map(sv => ({
              licensePlate: sv.vehicle.licensePlate,
              driverName: sv.vehicle.driverName,
              seatsBooked: sv.seatsToBook,
              pricePerSeat: sv.vehicle.pricePerSeat,
              queuePosition: sv.vehicle.queuePosition
            })),
            instructions: {
              nextStep: "Complete payment using the provided payment URL",
              paymentMethods: ["bank_card"],
              redirectInfo: "You will be redirected to Konnect payment gateway"
            },
            meta: {
              bookingTime: new Date().toISOString(),
              source: 'central_server',
              paymentProvider: 'konnect'
            }
          }
        });

        // Broadcast booking update to mobile apps
        broadcastBookingUpdate('booking_created', {
          bookingId: booking.id,
          ticketNumber: booking.ticketNumber,
          userId: user.id,
          departureStationName: departureStation.name,
          destinationStationName: destinationStation.name,
          numberOfSeats: booking.numberOfSeats,
          totalAmount: booking.totalAmount,
          status: booking.status
        });

        console.log(`✅ Booking created successfully: ${booking.ticketNumber}`);

      } catch (localNodeError) {
        console.error(`❌ Error communicating with local node ${departureStation.localServerIp}:`, localNodeError);
        
        res.status(503).json({
          success: false,
          error: 'Station server unavailable',
          message: 'The departure station server is currently not responding'
        });
      }

    } catch (error) {
      console.error('❌ Error creating booking:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create booking',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/v1/central-bookings/overnight
   * Create an overnight booking
   */
  
  async createOvernightBooking(req: Request, res: Response): Promise<void> {
    try {
      // Check if user is authenticated
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be logged in to create a booking'
        });
        return;
      }

      const { departureStationId, destinationStationId, numberOfSeats, webhookUrl }: BookingRequest & { webhookUrl?: string } = req.body;

      // Validate input
      if (!departureStationId || !destinationStationId || !numberOfSeats) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'Departure station, destination station, and number of seats are required'
        });
        return;
      }

      if (numberOfSeats < 1 || numberOfSeats > 10) {
        res.status(400).json({
          success: false,
          error: 'Invalid number of seats',
          message: 'Number of seats must be between 1 and 10'
        });
        return;
      }

      console.log(`🎫 Creating booking: ${departureStationId} → ${destinationStationId} (${numberOfSeats} seats) for user ${userId}`);

      // Get departure station info
      const departureStation = await prisma.station.findUnique({
        where: { id: departureStationId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          localServerIp: true,
          isActive: true,
          isOnline: true,
          governorate: { select: { name: true, nameAr: true } },
          delegation: { select: { name: true, nameAr: true } }
        }
      });

      if (!departureStation) {
        res.status(404).json({
          success: false,
          error: 'Departure station not found'
        });
        return;
      }

      if (!departureStation.isActive) {
        res.status(400).json({
          success: false,
          error: 'Departure station is not active'
        });
        return;
      }

      if (!departureStation.isOnline || !departureStation.localServerIp) {
        res.status(503).json({
          success: false,
          error: 'Departure station is offline',
          message: 'The departure station is currently not available'
        });
        return;
      }

      // Get destination station info
      const destinationStation = await prisma.station.findUnique({
        where: { id: destinationStationId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          governorate: { select: { name: true, nameAr: true } },
          delegation: { select: { name: true, nameAr: true } }
        }
      });

      if (!destinationStation) {
        res.status(404).json({
          success: false,
          error: 'Destination station not found'
        });
        return;
      }

      // Get user info for booking
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
        }
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Check vehicle queue at departure station for the destination
      const localNodeUrl = `http://${departureStation.localServerIp}:3001/api/public/overnight/${destinationStationId}`;
      
      try {
        const queueResponse = await axios.get(localNodeUrl, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Louaj-Central-Server/1.0'
          }
        });

        const queueData = queueResponse.data as LocalNodeResponse;
        if (!queueData.success) {
          res.status(400).json({
            success: false,
            error: 'No vehicles available in overnight queue',
            message: 'No vehicles are currently queued for this destination in overnight queue'
          });
          return;
        }

        const vehicles: VehicleQueueInfo[] = queueData.data.vehicles || [];

        if (vehicles.length === 0) {
          res.status(400).json({
            success: false,
            error: 'No vehicles available in overnight queue',
            message: 'No vehicles are currently queued for this destination in overnight queue'
          });
          return;
        }

        // Extract ETA information from the overnight queue response
        const destinationETD = queueData.data.destinationETD;

        // Find suitable vehicles with enough seats
        let remainingSeats = numberOfSeats;
        const selectedVehicles: Array<{vehicle: VehicleQueueInfo, seatsToBook: number}> = [];

        for (const vehicle of vehicles.sort((a, b) => a.queuePosition - b.queuePosition)) {
          if (remainingSeats <= 0) break;
          
          if (vehicle.availableSeats > 0) {
            const seatsToBook = Math.min(remainingSeats, vehicle.availableSeats);
            selectedVehicles.push({ vehicle, seatsToBook });
            remainingSeats -= seatsToBook;
          }
        }

        if (remainingSeats > 0) {
          res.status(400).json({
            success: false,
            error: 'Insufficient seats available',
            message: `Only ${numberOfSeats - remainingSeats} seats are available, but you requested ${numberOfSeats} seats`
          });
          return;
        }

        // Create booking in local node
        const bookingPayload = {
          userId: user.id,
          userFullName: `${user.firstName} ${user.lastName}`,
          userPhoneNumber: user.phoneNumber,
          userEmail: user.email || '',
          departureStationId,
          destinationStationId,
          numberOfSeats,
          selectedVehicles: selectedVehicles.map(sv => ({
            vehicleQueueId: sv.vehicle.queueId,
            licensePlate: sv.vehicle.licensePlate,
            seatsToBook: sv.seatsToBook,
            pricePerSeat: sv.vehicle.pricePerSeat
          }))
        };

        const bookingUrl = `http://${departureStation.localServerIp}:3001/api/bookings/create`;
        const bookingResponse = await axios.post(bookingUrl, bookingPayload, {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Louaj-Central-Server/1.0'
          }
        });

        const bookingResult = bookingResponse.data as LocalNodeResponse;
        if (!bookingResult.success) {
          res.status(400).json({
            success: false,
            error: 'Booking failed at station',
            message: bookingResult.error || 'Failed to create booking at the departure station'
          });
          return;
        }

        // Successful booking response
        const booking = bookingResult.data;
        
        // Calculate total amount for payment
        const totalAmount = booking.totalAmount;
        
        // Use the webhook URL provided by the frontend, or fall back to Central Server's own webhook
        const finalWebhookUrl = webhookUrl || `${process.env.BASE_URL || 'http://localhost:5000'}/api/v1/central-bookings/webhook/payment`;
        
        console.log(`💳 Initializing Konnect payment for booking ${booking.verificationCode}: ${totalAmount} TND`);
        console.log(`🪝 Using webhook URL: ${finalWebhookUrl}`);
        
        const paymentResult = await konnectService.initializePayment({
          amount: konnectService.convertToMillimes(totalAmount),
          description: `LOUAJ Transport Booking - ${departureStation.name} to ${destinationStation.name} (${numberOfSeats} seats)`,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          email: user.email || `${user.phoneNumber}@louaj.tn`,
          orderId: booking.verificationCode,
          webhook: finalWebhookUrl
        });

        if (!paymentResult.success) {
          console.error('❌ Konnect payment initialization failed:', paymentResult.error);
          res.status(500).json({
            success: false,
            error: 'Payment initialization failed',
            message: paymentResult.error || 'Unable to initialize payment gateway'
          });
          return;
        }

        console.log(`✅ Konnect payment initialized: ${paymentResult.paymentRef}`);

        // Get station configuration to determine journey date
        const station_config_url = `http://${departureStation.localServerIp}:3001/api/public/config`;
        const station_config_response = await axios.get(station_config_url, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Louaj-Central-Server/1.0'
          }
        });
        const station_config = station_config_response.data as LocalNodeResponse;
        if (!station_config.success) {
          res.status(400).json({
            success: false,
            error: 'Failed to get station config',
            message: station_config.error || 'Failed to get station config'
          });
          return;
        }

        const openingTime = station_config.data.openingTime;

        // Calculate the correct journey date based on current time and station opening time
        const calculateJourneyDate = (openingTimeStr: string): Date => {
          const now = new Date();
          const [openHour, openMinute] = openingTimeStr.split(':').map(Number);

          // Create today's opening time
          const todayOpeningTime = new Date(now);
          todayOpeningTime.setHours(openHour, openMinute, 0, 0);

          // If current time is before today's opening time, journey is today
          // If current time is after today's opening time, journey is tomorrow
          if (now < todayOpeningTime) {
            // Booking before opening time - journey is today
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
          } else {
            // Booking after opening time - journey is tomorrow
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
          }
        };

        const journeyDate = calculateJourneyDate(openingTime);
        console.log(`🕒 Journey date calculated: ${journeyDate.toISOString()} (Station opens at ${openingTime}, Current time: ${new Date().toISOString()})`);

        // Calculate ETA for overnight booking (station opening time + 15 minutes)
        const calculateOvernightETA = (journeyDate: Date, openingTimeStr: string): Date => {
          const [openHour, openMinute] = openingTimeStr.split(':').map(Number);

          // Set ETA to journey date at opening time + 15 minutes
          const eta = new Date(journeyDate);
          eta.setHours(openHour, openMinute, 0, 0);
          eta.setTime(eta.getTime() + 15 * 60 * 1000); // Add 15 minutes

          return eta;
        };

        const estimatedDepartureTime = calculateOvernightETA(journeyDate, openingTime);
        console.log(`⏱️ ETA calculated for overnight booking: ${estimatedDepartureTime.toISOString()} (15 minutes after station opens)`);

        // Store payment reference in a temporary booking record for tracking
        try {
          await prisma.booking.create({
            data: {
              userId: user.id,
              departureStationId,
              destinationStationId,
              seatsBooked: numberOfSeats,
              totalAmount,
              journeyDate: journeyDate, // Use calculated journey date
              estimatedDepartureTime: estimatedDepartureTime, 
              status: BookingStatus.PENDING,
              paymentReference: paymentResult.paymentRef!, // We know it's not undefined here
              verificationCode: booking.verificationCode
            }
          });
          console.log(`📝 Central booking record created with payment ref: ${paymentResult.paymentRef}`);
        } catch (dbError) {
          console.warn('⚠️ Could not store booking in central database:', dbError);
          // Continue anyway as the local booking is already created
        }
        
        res.json({
          success: true,
          data: {
            booking: {
              id: booking.id,
              verificationCode: booking.verificationCode,
              totalAmount: booking.totalAmount,
              numberOfSeats: booking.numberOfSeats,
              status: BookingStatus.PENDING,
              journeyDate: journeyDate.toISOString(),
              estimatedDepartureTime: estimatedDepartureTime.toISOString(),
              createdAt: booking.createdAt
            },
            // Include AI-powered ETA predictions from local node for overnight booking
            etaPrediction: destinationETD ? {
                        estimatedDepartureTime: destinationETD.estimatedDepartureTime,
          etdHours: destinationETD.etdHours,
              confidenceLevel: destinationETD.confidenceLevel,
              modelUsed: destinationETD.modelUsed,
              queueVehicles: destinationETD.queueVehicles,
              ...(destinationETD.overnightInfo && {
                overnightInfo: destinationETD.overnightInfo
              })
            } : null,
            payment: {
              paymentUrl: paymentResult.payUrl,
              paymentRef: paymentResult.paymentRef,
              amount: totalAmount,
              amountInMillimes: konnectService.convertToMillimes(totalAmount),
              currency: 'TND',
              expiresIn: '60 minutes'
            },
            route: {
              departureStation: {
                id: departureStation.id,
                name: departureStation.name,
                nameAr: departureStation.nameAr,
                governorate: departureStation.governorate.name,
                delegation: departureStation.delegation.name
              },
              destinationStation: {
                id: destinationStation.id,
                name: destinationStation.name,
                nameAr: destinationStation.nameAr,
                governorate: destinationStation.governorate.name,
                delegation: destinationStation.delegation.name
              }
            },
            vehicles: booking.vehicles || selectedVehicles.map(sv => ({
              licensePlate: sv.vehicle.licensePlate,
              driverName: sv.vehicle.driverName,
              seatsBooked: sv.seatsToBook,
              pricePerSeat: sv.vehicle.pricePerSeat,
              queuePosition: sv.vehicle.queuePosition
            })),
            instructions: {
              nextStep: "Complete payment using the provided payment URL",
              paymentMethods: ["bank_card"],
              redirectInfo: "You will be redirected to Konnect payment gateway"
            },
            meta: {
              bookingTime: new Date().toISOString(),
              source: 'central_server',
              paymentProvider: 'konnect'
            }
          }
        });

        // Broadcast booking update to mobile apps
        broadcastBookingUpdate('booking_created', {
          bookingId: booking.id,
          ticketNumber: booking.ticketNumber,
          userId: user.id,
          departureStationName: departureStation.name,
          destinationStationName: destinationStation.name,
          numberOfSeats: booking.numberOfSeats,
          totalAmount: booking.totalAmount,
          status: booking.status
        });

        console.log(`✅ Booking created successfully: ${booking.ticketNumber}`);

      } catch (localNodeError) {
        console.error(`❌ Error communicating with local node ${departureStation.localServerIp}:`, localNodeError);
        
        res.status(503).json({
          success: false,
          error: 'Station server unavailable',
          message: 'The departure station server is currently not responding'
        });
      }

    } catch (error) {
      console.error('❌ Error creating booking:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create booking',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  /**
   * POST /api/v1/central-bookings/test-payment/:paymentRef
   * Test payment completion (development only)
   */
  async testPaymentCompletion(req: Request, res: Response): Promise<void> {
    try {
      const { paymentRef } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      console.log(`🧪 Testing payment completion for: ${paymentRef}`);

      // Find the booking by payment reference and user
      const booking = await prisma.booking.findFirst({
        where: { 
          paymentReference: paymentRef,
          userId: userId
        }
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
        return;
      }

      // Simulate payment completion by updating status directly
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.PAID,
          paymentProcessedAt: new Date()
        }
      });

      console.log(`✅ Test: Booking ${booking.verificationCode} marked as PAID`);

      // Notify local node about successful payment
      try {
        const departureStation = await prisma.station.findUnique({
          where: { id: booking.departureStationId },
          select: { localServerIp: true }
        });

        if (departureStation?.localServerIp) {
          await axios.post(`http://${departureStation.localServerIp}:3001/api/bookings/confirm-payment`, {
            verificationCode: booking.verificationCode,
            paymentReference: paymentRef,
            status: 'PAID'
          });
          console.log(`📡 Test: Payment confirmation sent to local node: ${booking.verificationCode}`);
        }
      } catch (localNodeError) {
        console.warn('⚠️ Could not notify local node about test payment:', localNodeError);
      }

      // Broadcast payment success to mobile apps
      broadcastBookingUpdate('payment_completed', {
        bookingId: booking.id,
        verificationCode: booking.verificationCode,
        userId: booking.userId,
        status: 'PAID',
        totalAmount: booking.totalAmount,
        paymentReference: paymentRef,
        testMode: true
      });

      res.json({
        success: true,
        message: 'Test payment completion processed',
        data: {
          paymentRef: paymentRef,
          bookingId: booking.id,
          verificationCode: booking.verificationCode,
          status: 'PAID',
          note: 'This was a test payment completion'
        }
      });

    } catch (error) {
      console.error('❌ Error testing payment completion:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test payment completion',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/central-bookings/payment/:paymentRef
   * Get payment status by payment reference
   */
  async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentRef } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      // Find the booking by payment reference and user
      const booking = await prisma.booking.findFirst({
        where: { 
          paymentReference: paymentRef,
          userId: userId
        }
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
        return;
      }

      // Get payment details from Konnect
      try {
        const response = await axios.get(`${process.env.KONNECT_BASE_URL || 'https://api.sandbox.konnect.network/api/v2'}/payments/${paymentRef}`, {
          headers: {
            'x-api-key': process.env.KONNECT_API_KEY || '67476b489d4bb7dc8cdb57e7:w7GBMmJ25ALBHrdvMEaHDndw'
          }
        });

        const paymentData = (response.data as any).payment;

        res.json({
          success: true,
          data: {
            booking: {
              id: booking.id,
              verificationCode: booking.verificationCode,
              status: booking.status,
              totalAmount: booking.totalAmount,
              createdAt: booking.createdAt
            },
            payment: {
              paymentRef: paymentRef,
              status: paymentData.status,
              amount: paymentData.amount,
              reachedAmount: paymentData.reachedAmount,
              currency: paymentData.token,
              expirationDate: paymentData.expirationDate,
              link: paymentData.link
            }
          }
        });

      } catch (konnectError) {
        console.error('❌ Error fetching payment from Konnect:', konnectError);
        
        // Return booking info even if Konnect API fails
        res.json({
          success: true,
          data: {
            booking: {
              id: booking.id,
              verificationCode: booking.verificationCode,
              status: booking.status,
              totalAmount: booking.totalAmount,
              createdAt: booking.createdAt
            },
            payment: {
              paymentRef: paymentRef,
              status: 'unknown',
              note: 'Unable to fetch payment details from Konnect'
            }
          }
        });
      }

    } catch (error) {
      console.error('❌ Error getting payment status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payment status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/central-bookings/debug/payment/:paymentRef
   * Debug payment status without authentication (development only)
   */
  async debugPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentRef } = req.params;
      
      console.log(`🔍 Debug payment status for: ${paymentRef}`);

      // Find the booking by payment reference (without user restriction)
      const booking = await prisma.booking.findFirst({
        where: { paymentReference: paymentRef },
        include: {
          user: {
            select: { id: true, phoneNumber: true, firstName: true, lastName: true }
          }
        }
      });

      // Get payment details from Konnect
      let paymentData = null;
      let konnectError = null;
      
      try {
        const response = await axios.get(`${process.env.KONNECT_BASE_URL || 'https://api.sandbox.konnect.network/api/v2'}/payments/${paymentRef}`, {
          headers: {
            'x-api-key': process.env.KONNECT_API_KEY || '67476b489d4bb7dc8cdb57e7:w7GBMmJ25ALBHrdvMEaHDndw'
          }
        });
        paymentData = (response.data as any).payment;
      } catch (error) {
        konnectError = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`⚠️ Could not fetch payment from Konnect: ${konnectError}`);
      }

      res.json({
        success: true,
        debug: true,
        timestamp: new Date().toISOString(),
        data: {
          paymentRef,
          booking: booking ? {
            id: booking.id,
            verificationCode: booking.verificationCode,
            status: booking.status,
            totalAmount: booking.totalAmount,
            userId: booking.userId,
            user: booking.user,
            departureStationId: booking.departureStationId,
            destinationStationId: booking.destinationStationId,
            seatsBooked: booking.seatsBooked,
            createdAt: booking.createdAt,
            paymentProcessedAt: booking.paymentProcessedAt
          } : null,
          payment: paymentData ? {
            status: paymentData.status,
            amount: paymentData.amount,
            reachedAmount: paymentData.reachedAmount,
            currency: paymentData.token,
            expirationDate: paymentData.expirationDate,
            link: paymentData.link,
            createdDate: paymentData.createdDate
          } : null,
          errors: {
            konnectError: konnectError
          }
        }
      });

    } catch (error) {
      console.error('❌ Error in debug payment status:', error);
      res.status(500).json({
        success: false,
        debug: true,
        error: 'Failed to debug payment status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/central-bookings/webhook/verify/:paymentId
   * Verify payment webhook from Konnect
   */
  async verifyPaymentWebhook(req: Request, res: Response): Promise<void> {

    const {paymentId} = req.query;

    if(!paymentId){
      res.status(400).json({
        success: false,
        error: 'Payment ID is required'
      });
      return;
    }
    try {
      const paymentResult = await konnectService.verifyPayment(paymentId as string);

      if (!paymentResult.success) {
        res.status(400).json({
          success: false,
          error: paymentResult.error || 'Payment verification failed',
          status: paymentResult.status
        });
        return;
      }

      res.json({
        success: true,
        data: paymentResult
      });

    } catch (error) {
      console.error('❌ Error verifying payment webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify payment webhook',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }

  }

  /**
   * GET /api/v1/central-bookings/webhook/payment?payment_ref=xxx
   * Handle payment webhook from Konnect
   */
  async handlePaymentWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { payment_ref } = req.query;

      console.log(`📞 Payment webhook received for: ${payment_ref}`);

      if (!payment_ref) {
        res.status(400).json({
          success: false,
          error: 'Payment reference is required'
        });
        return;
      }
     

      // Find the booking by payment reference
      const booking = await prisma.booking.findUnique({
        where: { paymentReference: payment_ref as string }
      });

      if (!booking) {
        console.warn(`⚠️ No booking found for payment reference: ${payment_ref}`);
        res.status(404).json({
          success: false,
          error: 'Booking not found'
        });
        return;
      }
      let newStatus: BookingStatus = BookingStatus.PAID;

      const paymentResult = await konnectService.verifyPayment(payment_ref as string);

      if (!paymentResult.success) {
        newStatus = BookingStatus.FAILED;
      }


      console.log(`� Webhook received for ${payment_ref} - updating booking to PAID`);

      // Update the booking status to PAID
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: newStatus,
          paymentProcessedAt: new Date()
        }
      });

      console.log(`✅ Booking ${booking.verificationCode} status updated to: ${newStatus}`);

      // If payment successful, notify local node to confirm booking and update its database
      if (newStatus === BookingStatus.PAID) {
        try {
          const departureStation = await prisma.station.findUnique({
            where: { id: booking.departureStationId },
            select: { 
              localServerIp: true,
              name: true 
            }
          });

          if (departureStation?.localServerIp) {
            console.log(`📡 Sending payment confirmation to local node ${departureStation.name} (${departureStation.localServerIp})`);
            
            // Notify local node about successful payment with full booking details
            const localNodeResponse = await axios.post(`http://${departureStation.localServerIp}:3001/api/bookings/confirm-payment`, {
              verificationCode: booking.verificationCode,
              paymentReference: payment_ref,
              status: 'PAID',
              paymentProcessedAt: new Date().toISOString(),
              centralBookingId: booking.id,
              // Additional data for local node to update its records
              updateData: {
                status: 'PAID',
                paymentReference: payment_ref as string,
                paymentProcessedAt: new Date(),
                confirmedAt: new Date()
              }
            }, {
              timeout: 10000, // 10 second timeout
              headers: {
                'Content-Type': 'application/json',
                'X-Central-Server': 'true'
              }
            });

            if (localNodeResponse.status === 200) {
              console.log(`✅ Local node ${departureStation.name} confirmed payment update: ${booking.verificationCode}`);
              
              // Update central booking to mark as synchronized with local node
              await prisma.booking.update({
                where: { id: booking.id },
                data: {
                  updatedAt: new Date()
                }
              });
            } else {
              console.warn(`⚠️ Local node responded with status ${localNodeResponse.status}`);
            }
            
          } else {
            console.warn(`⚠️ No local server IP found for departure station: ${booking.departureStationId}`);
          }
        } catch (localNodeError) {
          console.error('❌ Failed to notify local node about payment:', {
            error: localNodeError instanceof Error ? localNodeError.message : localNodeError,
            verificationCode: booking.verificationCode,
            paymentRef: payment_ref
          });
          
          // Log this as a critical issue that needs manual intervention
          console.error('🚨 CRITICAL: Payment confirmed but local node not updated. Manual sync required.');
          
          // Don't fail the webhook - payment was successful
          // But we should implement a retry mechanism or manual sync tool
        }

        // Broadcast payment success to mobile apps (including both central and local confirmation)
        broadcastBookingUpdate('payment_completed', {
          bookingId: booking.id,
          verificationCode: booking.verificationCode,
          userId: booking.userId,
          status: 'PAID',
          totalAmount: booking.totalAmount,
          paymentReference: payment_ref,
          confirmedAt: new Date().toISOString(),
          source: 'webhook_payment_confirmation'
        });
        
        console.log(`🎉 Payment completed successfully for booking ${booking.verificationCode}`);
      }

      res.json({
        success: true,
        message: 'Webhook processed successfully',
        data: {
          paymentRef: payment_ref,
          bookingId: booking.id,
          status: newStatus
        }
      });

    } catch (error) {
      console.error('❌ Error processing payment webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process payment webhook',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/bookings/user/:userId
   * Get all bookings for a specific user
   */
  async getUserBookings(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user?.id;

      // Check if user is authenticated and authorized
      if (!requestingUserId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      // Users can only view their own bookings
      if (requestingUserId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'You can only view your own bookings'
        });
        return;
      }

      // This would require querying multiple local nodes
      // For now, return a message indicating this is a distributed operation
      res.json({
        success: true,
        message: 'User booking history requires querying multiple stations',
        note: 'This endpoint will be implemented to aggregate bookings from all stations'
      });

    } catch (error) {
      console.error('❌ Error getting user bookings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user bookings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/central-bookings/booking-details/:paymentRef
   * Get complete booking details including vehicle and station information
   */
  async getBookingDetails(req: Request, res: Response): Promise<void> {
    try {
      const { paymentRef } = req.params;
      
      console.log(`🔍 Fetching complete booking details for: ${paymentRef}`);

      // Find the booking by payment reference with all related data
      const booking = await prisma.booking.findFirst({
        where: { paymentReference: paymentRef },
        select: {
          id: true,
          seatsBooked: true,
          totalAmount: true,
          journeyDate: true,
          estimatedDepartureTime: true,
          verificationCode: true,
          status: true,
          paymentReference: true,
          paymentProcessedAt: true,
          createdAt: true,
          updatedAt: true,
          departureStation: {
            select: {
              id: true,
              name: true,
              governorate: {
                select: {
                  name: true
                }
              },
              delegation: {
                select: {
                  name: true
                }
              },
              localServerIp: true
            }
          },
          destinationStation: {
            select: {
              id: true,
              name: true,
              governorate: {
                select: {
                  name: true
                }
              },
              delegation: {
                select: {
                  name: true
                }
              }
            }
          },
          user: {
            select: { 
              id: true, 
              phoneNumber: true, 
              firstName: true, 
              lastName: true 
            }
          }
        }
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          error: 'Booking not found',
          message: `No booking found for payment reference: ${paymentRef}`
        });
        return;
      }

      // Try to get vehicle allocations from the local station
      let vehicleAllocations = [];
      if (booking.departureStation?.localServerIp) {
        try {
          console.log(`🚗 Fetching vehicle allocations from station: ${booking.departureStation.localServerIp}`);
          
          // Call the local station to get vehicle allocation details
          const vehicleResponse = await fetch(`http://${booking.departureStation.localServerIp}:4000/api/queue-booking/allocations/${booking.id}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-central-server': 'true'
            }
          });

          if (vehicleResponse.ok) {
            const vehicleData = await vehicleResponse.json() as any;
            vehicleAllocations = vehicleData.data?.allocations || [];
            console.log(`✅ Vehicle allocations retrieved: ${vehicleAllocations.length} vehicles`);
          } else {
            console.warn(`⚠️ Could not fetch vehicle allocations: ${vehicleResponse.status}`);
          }
        } catch (vehicleError) {
          console.warn(`⚠️ Error fetching vehicle allocations:`, vehicleError);
        }
      }

      // Get payment details from Konnect
      let paymentData = null;
      try {
        const response = await axios.get(`${process.env.KONNECT_BASE_URL || 'https://api.sandbox.konnect.network/api/v2'}/payments/${paymentRef}`, {
          headers: {
            'x-api-key': process.env.KONNECT_API_KEY || '67476b489d4bb7dc8cdb57e7:w7GBMmJ25ALBHrdvMEaHDndw'
          }
        });
        paymentData = (response.data as any).payment;
      } catch (konnectError) {
        console.warn(`⚠️ Could not fetch payment from Konnect:`, konnectError);
      }

      // Construct the comprehensive response
      const response = {
        success: true,
        data: {
          booking: {
            id: booking.id,
            verificationCode: booking.verificationCode,
            status: booking.status,
            totalAmount: booking.totalAmount,
            seatsBooked: booking.seatsBooked,
            journeyDate: booking.journeyDate,
            estimatedDepartureTime: booking.estimatedDepartureTime,
            paymentReference: booking.paymentReference,
            paymentProcessedAt: booking.paymentProcessedAt,
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt,
            user: booking.user,
            departureStation: booking.departureStation,
            destinationStation: booking.destinationStation,
            vehicleAllocations: vehicleAllocations.map((allocation: any) => ({
              vehicleId: allocation.vehicleId,
              licensePlate: allocation.licensePlate,
              driverName: allocation.driverName,
              driverPhone: allocation.driverPhone,
              seatsBooked: allocation.seatsBooked,
              queuePosition: allocation.queuePosition,
              estimatedDeparture: allocation.estimatedDeparture,
              ticketIds: allocation.ticketIds
            }))
          },
          payment: paymentData ? {
            status: paymentData.status,
            amount: paymentData.amount,
            reachedAmount: paymentData.reachedAmount,
            currency: paymentData.token,
            expirationDate: paymentData.expirationDate,
            createdDate: paymentData.createdDate
          } : null,
          summary: {
            totalSeats: booking.seatsBooked,
            totalAmount: booking.totalAmount,
            vehicleCount: vehicleAllocations.length,
            isPaid: booking.status === 'PAID',
            departureLocation: `${booking.departureStation?.name}, ${booking.departureStation?.governorate}`,
            destinationLocation: `${booking.destinationStation?.name}, ${booking.destinationStation?.governorate}`,
            journeyDate: booking.journeyDate,
            estimatedDepartureTime: booking.estimatedDepartureTime
          }
        }
      };

      console.log(`✅ Complete booking details retrieved for: ${paymentRef}`);
      res.json(response);

    } catch (error) {
      console.error('❌ Error getting booking details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get booking details',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/central-bookings/latest-paid-ticket
   * Get the latest paid ticket for the authenticated user
   */
  async getLatestPaidTicket(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be logged in to view your tickets'
        });
        return;
      }

      console.log(`🎫 Getting latest paid ticket for user: ${userId}`);

      // Find the most recent paid booking for this user
      const latestBooking = await prisma.booking.findFirst({
        where: {
          userId: userId,
          status: 'PAID'
        },
        include: {
          departureStation: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              governorate: true,
              delegation: true,
              localServerIp: true
            }
          },
          destinationStation: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              governorate: true,
              delegation: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!latestBooking) {
        res.json({
          success: true,
          data: null,
          message: 'No paid tickets found'
        });
        return;
      }

      // Try to get ETD prediction from the local station
      let etaPrediction = null;
      if (latestBooking.departureStation?.localServerIp) {
        try {
          const response: any = await axios.get(
            `http://${latestBooking.departureStation.localServerIp}:3001/api/public/destinations`,
            {
              timeout: 5000,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );

          if (response.data?.success && response.data?.data?.destinations) {
            // Find the destination that matches our booking
            const destination = response.data.data.destinations.find(
              (dest: any) => dest.destinationId === latestBooking.destinationStation?.id
            );

            if (destination?.etaPrediction) {
              etaPrediction = destination.etaPrediction;
            }
          }
        } catch (error) {
          console.warn('⚠️ Could not fetch ETD prediction for latest ticket:', error);
        }
      }

      // Try to get vehicle allocation details
      let vehicles = [];
      if (latestBooking.departureStation?.localServerIp) {
        try {
          const vehicleResponse: any = await axios.get(
            `http://${latestBooking.departureStation.localServerIp}:3001/api/queue-booking/allocations/${latestBooking.id}`,
            {
              timeout: 5000,
              headers: {
                'Content-Type': 'application/json',
                'x-central-server': 'true'
              }
            }
          );

          if (vehicleResponse.data?.success && vehicleResponse.data?.data?.allocations) {
            vehicles = vehicleResponse.data.data.allocations;
          }
        } catch (error) {
          console.warn('⚠️ Could not fetch vehicle allocations for latest ticket:', error);
        }
      }

      const ticketData = {
        id: latestBooking.id,
        verificationCode: latestBooking.verificationCode,
        journeyDate: latestBooking.journeyDate,
        totalAmount: latestBooking.totalAmount,
        seatsBooked: latestBooking.seatsBooked,
        status: latestBooking.status,
        departureStation: latestBooking.departureStation,
        destinationStation: latestBooking.destinationStation,
        vehicles: vehicles,
        etaPrediction: etaPrediction,
        createdAt: latestBooking.createdAt,
        paymentReference: latestBooking.paymentReference
      };

      console.log(`✅ Latest paid ticket retrieved for user ${userId}: ${latestBooking.id}`);
      res.json({
        success: true,
        data: ticketData,
        message: 'Latest paid ticket retrieved successfully'
      });

    } catch (error) {
      console.error('❌ Error getting latest paid ticket:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get latest paid ticket',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/v1/central-bookings/expire-ticket/:bookingId
   * Expire a ticket when countdown and bonus time run out
   */
  async expireTicket(req: Request, res: Response): Promise<void> {
    try {
      const { bookingId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be logged in to expire a ticket'
        });
        return;
      }

      if (!bookingId) {
        res.status(400).json({
          success: false,
          error: 'Missing booking ID',
          message: 'Booking ID is required'
        });
        return;
      }

      console.log(`⏰ Expiring ticket ${bookingId} for user ${userId}`);

      // Find the booking and verify ownership
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          userId: userId,
          status: {
            in: ['PAID', 'COMPLETED'] // Only expire paid or completed tickets
          }
        }
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          error: 'Booking not found',
          message: 'Booking not found or you do not have permission to expire it'
        });
        return;
      }

      // Update booking status to EXPIRED
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'EXPIRED',
          updatedAt: new Date()
        }
      });

      console.log(`✅ Ticket ${bookingId} expired successfully`);

      // Broadcast the update to mobile apps
      broadcastBookingUpdate('ticket_expired', {
        bookingId: bookingId,
        status: 'EXPIRED',
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        data: {
          bookingId: bookingId,
          status: 'EXPIRED',
          expiredAt: new Date().toISOString()
        },
        message: 'Ticket expired successfully'
      });

    } catch (error) {
      console.error('❌ Error expiring ticket:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to expire ticket',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const centralBookingController = new CentralBookingController();
