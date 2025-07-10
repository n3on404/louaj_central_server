import { prisma } from '../config/database';

interface SyncTripRequest {
  tripId: string;
  vehicleId: string;
  licensePlate: string;
  departureStationId: string;
  destinationStationId: string;
  destinationName: string;
  queueId: string;
  seatsBooked: number;
  startTime: Date;
}

interface TripResponse {
  id: string;
  vehicleId: string;
  licensePlate: string;
  departureStationId: string;
  destinationStationId: string;
  destinationName: string;
  queueId: string;
  seatsBooked: number;
  startTime: Date;
  createdAt: Date;
  departureStation?: {
    id: string;
    name: string;
    governorate: string;
    delegation: string;
  };
  destinationStation?: {
    id: string;
    name: string;
    governorate: string;
    delegation: string;
  };
  vehicle?: {
    id: string;
    licensePlate: string;
    capacity: number;
    model?: string;
  };
}

interface SyncTripResult {
  success: boolean;
  trip?: TripResponse;
  error?: string;
}

interface GetTripsRequest {
  page: number;
  limit: number;
  stationId?: string;
  vehicleId?: string;
  status?: string;
}

interface GetTripsResult {
  success: boolean;
  data?: {
    trips: TripResponse[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  error?: string;
}

class TripService {
  /**
   * Sync trip from local station
   */
  async syncTripFromStation(tripData: SyncTripRequest): Promise<SyncTripResult> {
    try {
      console.log(`🚛 Syncing trip from station: ${tripData.licensePlate} to ${tripData.destinationName}`);

      // Check if trip already exists (avoid duplicates)
      const existingTrip = await prisma.trip.findFirst({
        where: {
          vehicleId: tripData.vehicleId,
          queueId: tripData.queueId,
          startTime: tripData.startTime
        }
      });

      if (existingTrip) {
        console.log(`⚠️ Trip already exists: ${existingTrip.id}`);
        return {
          success: true,
          trip: this.formatTripResponse(existingTrip)
        };
      }

      // Validate that stations exist
      const [departureStation, destinationStation] = await Promise.all([
        prisma.station.findUnique({
          where: { id: tripData.departureStationId },
          include: { governorate: true, delegation: true }
        }),
        prisma.station.findUnique({
          where: { id: tripData.destinationStationId },
          include: { governorate: true, delegation: true }
        })
      ]);

      if (!departureStation) {
        return {
          success: false,
          error: `Departure station not found: ${tripData.departureStationId}`
        };
      }

      if (!destinationStation) {
        return {
          success: false,
          error: `Destination station not found: ${tripData.destinationStationId}`
        };
      }

      // Validate that vehicle exists
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: tripData.vehicleId }
      });

      if (!vehicle) {
        return {
          success: false,
          error: `Vehicle not found: ${tripData.vehicleId}`
        };
      }

      // Create trip record in central server
      const trip = await prisma.trip.create({
        data: {
          id: `central_${tripData.tripId}`, // Prefix to distinguish from local IDs
          vehicleId: tripData.vehicleId,
          licensePlate: tripData.licensePlate,
          departureStationId: tripData.departureStationId,
          destinationStationId: tripData.destinationStationId,
          destinationName: tripData.destinationName,
          queueId: tripData.queueId,
          seatsBooked: tripData.seatsBooked,
          startTime: tripData.startTime
        },
        include: {
          departureStation: {
            include: { governorate: true, delegation: true }
          },
          destinationStation: {
            include: { governorate: true, delegation: true }
          },
          vehicle: true
        }
      });

      console.log(`✅ Trip synced to central server: ${trip.id}`);
      console.log(`🚐 Vehicle: ${trip.licensePlate} (${trip.seatsBooked} seats)`);
      console.log(`📍 Route: ${trip.departureStation.name} → ${trip.destinationName}`);

      return {
        success: true,
        trip: this.formatTripResponse(trip)
      };

    } catch (error) {
      console.error('❌ Error syncing trip:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get trips with filtering and pagination
   */
  async getTrips(request: GetTripsRequest): Promise<GetTripsResult> {
    try {
      const { page, limit, stationId, vehicleId } = request;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};
      if (stationId) {
        where.OR = [
          { departureStationId: stationId },
          { destinationStationId: stationId }
        ];
      }
      if (vehicleId) {
        where.vehicleId = vehicleId;
      }

      // Get trips with pagination
      const [trips, total] = await Promise.all([
        prisma.trip.findMany({
          where,
          include: {
            departureStation: {
              include: { governorate: true, delegation: true }
            },
            destinationStation: {
              include: { governorate: true, delegation: true }
            },
            vehicle: true
          },
          orderBy: { startTime: 'desc' },
          skip,
          take: limit
        }),
        prisma.trip.count({ where })
      ]);

      const pages = Math.ceil(total / limit);

      return {
        success: true,
        data: {
          trips: trips.map(trip => this.formatTripResponse(trip)),
          total,
          page,
          limit,
          pages
        }
      };

    } catch (error) {
      console.error('❌ Error getting trips:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get trip by ID
   */
  async getTripById(tripId: string): Promise<{
    success: boolean;
    trip?: TripResponse;
    error?: string;
  }> {
    try {
      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          departureStation: {
            include: { governorate: true, delegation: true }
          },
          destinationStation: {
            include: { governorate: true, delegation: true }
          },
          vehicle: true
        }
      });

      if (!trip) {
        return {
          success: false,
          error: 'Trip not found'
        };
      }

      return {
        success: true,
        trip: this.formatTripResponse(trip)
      };

    } catch (error) {
      console.error('❌ Error getting trip:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Format trip response
   */
  private formatTripResponse(trip: any): TripResponse {
    return {
      id: trip.id,
      vehicleId: trip.vehicleId,
      licensePlate: trip.licensePlate,
      departureStationId: trip.departureStationId,
      destinationStationId: trip.destinationStationId,
      destinationName: trip.destinationName,
      queueId: trip.queueId,
      seatsBooked: trip.seatsBooked,
      startTime: trip.startTime,
      createdAt: trip.createdAt,
      ...(trip.departureStation && {
        departureStation: {
          id: trip.departureStation.id,
          name: trip.departureStation.name,
          governorate: trip.departureStation.governorate?.name || '',
          delegation: trip.departureStation.delegation?.name || ''
        }
      }),
      ...(trip.destinationStation && {
        destinationStation: {
          id: trip.destinationStation.id,
          name: trip.destinationStation.name,
          governorate: trip.destinationStation.governorate?.name || '',
          delegation: trip.destinationStation.delegation?.name || ''
        }
      }),
      ...(trip.vehicle && {
        vehicle: {
          id: trip.vehicle.id,
          licensePlate: trip.vehicle.licensePlate,
          capacity: trip.vehicle.capacity,
          model: trip.vehicle.model
        }
      })
    };
  }
}

// Export singleton instance
export const tripService = new TripService();
export { TripService };
export type { SyncTripRequest, TripResponse, SyncTripResult, GetTripsRequest, GetTripsResult };
