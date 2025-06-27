import { PrismaClient, QueueType, QueueStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface SimpleVehicleEntry {
  licensePlate: string;
  queueType?: QueueType;
  estimatedDeparture?: Date | null;
}

export interface SimpleOvernightRegistration {
  licensePlate: string;
  estimatedDeparture?: Date | null;
}

/**
 * Service class for queue management operations
 */
export class QueueService {

  /**
   * Calculate next available position in destination queue
   */
  private async getNextQueuePosition(stationId: string, destinationId: string, queueType: QueueType): Promise<number> {
    if (queueType === 'OVERNIGHT') {
      // For overnight vehicles, get the next position among overnight vehicles
      const lastOvernightPosition = await prisma.vehicleQueue.findFirst({
        where: {
          stationId,
          destinationId,
          queueType: 'OVERNIGHT',
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        orderBy: { queuePosition: 'desc' }
      });

      return lastOvernightPosition ? lastOvernightPosition.queuePosition + 1 : 1;
    } else {
      // For regular vehicles, get position after all overnight vehicles
      const lastPosition = await prisma.vehicleQueue.findFirst({
        where: {
          stationId,
          destinationId,
          status: { in: ['WAITING', 'LOADING', 'READY'] }
        },
        orderBy: { queuePosition: 'desc' }
      });

      return lastPosition ? lastPosition.queuePosition + 1 : 1;
    }
  }

  /**
   * Reposition vehicles in queue after a vehicle departs
   */
  private async rebalanceQueuePositions(stationId: string, destinationId: string): Promise<void> {
    const activeVehicles = await prisma.vehicleQueue.findMany({
      where: {
        stationId,
        destinationId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      orderBy: [
        { queueType: 'asc' }, // OVERNIGHT first, then REGULAR
        { enteredAt: 'asc' }  // Then by entry time
      ]
    });

    // Update positions to be sequential starting from 1
    for (let i = 0; i < activeVehicles.length; i++) {
      const newPosition = i + 1;
      if (activeVehicles[i].queuePosition !== newPosition) {
        await prisma.vehicleQueue.update({
          where: { id: activeVehicles[i].id },
          data: { queuePosition: newPosition }
        });
      }
    }
  }

  /**
   * Get vehicle details and find suitable destination station
   */
  private async getVehicleAndDestination(licensePlate: string, supervisorStationId: string) {
    // Find vehicle by license plate
    const vehicle = await prisma.vehicle.findUnique({
      where: { licensePlate },
      include: { 
        driver: true,
        authorizedStations: {
          include: { station: true }
        }
      }
    });

    if (!vehicle) {
      throw new Error(`Vehicle with license plate ${licensePlate} not found`);
    }

    if (!vehicle.isActive || !vehicle.driver?.isActive) {
      throw new Error('Vehicle or driver is not active');
    }

    // Find first authorized station that's different from supervisor's station
    const destinationStation = vehicle.authorizedStations
      .map(auth => auth.station)
      .find(station => station.id !== supervisorStationId);

    if (!destinationStation) {
      throw new Error('No suitable destination found. Vehicle must be authorized for at least one station different from current station.');
    }

    return {
      vehicle,
      destinationStation,
      availableSeats: Math.max(0, vehicle.capacity - 2), // Leave 2 seats buffer
      totalSeats: vehicle.capacity
    };
  }

  /**
   * Vehicle enters station and joins destination queue (simplified)
   */
  async enterQueue(entryData: SimpleVehicleEntry, supervisorStationId: string) {
    // Get vehicle and auto-select destination
    const { vehicle, destinationStation, availableSeats, totalSeats } = 
      await this.getVehicleAndDestination(entryData.licensePlate, supervisorStationId);

    // Check if vehicle is already in a queue
    const existingQueue = await prisma.vehicleQueue.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      }
    });

    if (existingQueue) {
      throw new Error('Vehicle is already in a queue');
    }

    // Get supervisor's station
    const station = await prisma.station.findUnique({ 
      where: { id: supervisorStationId } 
    });

    if (!station) {
      throw new Error('Supervisor station not found');
    }

    // Get next queue position
    const queueType = entryData.queueType || 'REGULAR';
    const queuePosition = await this.getNextQueuePosition(
      supervisorStationId,
      destinationStation.id,
      queueType
    );

    // Get base price from route or use default
    const basePrice = 15.50; // Default price - could be fetched from Route table

    // Create queue entry
    const queueEntry = await prisma.vehicleQueue.create({
      data: {
        vehicleId: vehicle.id,
        stationId: supervisorStationId,
        destinationId: destinationStation.id,
        queueType,
        queuePosition,
        availableSeats,
        totalSeats,
        basePrice,
        estimatedDeparture: entryData.estimatedDeparture || null,
        status: 'WAITING'
      },
      include: {
        vehicle: {
          include: { driver: true }
        },
        station: true,
        destination: true
      }
    });

    // Calculate estimated wait time based on position
    const estimatedWaitMinutes = Math.max(0, (queuePosition - 1) * 30); // 30 minutes per vehicle

    return {
      success: true,
      queueEntry,
      queuePosition,
      estimatedWaitMinutes,
      message: `Vehicle ${entryData.licensePlate} entered queue at position ${queuePosition} for ${destinationStation.name}`
    };
  }

  /**
   * Vehicle leaves station by license plate - remove from queue and rebalance positions
   */
  async leaveQueueByPlate(licensePlate: string) {
    // Find vehicle by license plate
    const vehicle = await prisma.vehicle.findUnique({
      where: { licensePlate }
    });

    if (!vehicle) {
      throw new Error(`Vehicle with license plate ${licensePlate} not found`);
    }

    return this.leaveQueue(vehicle.id);
  }

  /**
   * Vehicle leaves station - remove from queue and rebalance positions
   */
  async leaveQueue(vehicleId: string) {
    // Find active queue entry for vehicle
    const queueEntry = await prisma.vehicleQueue.findFirst({
      where: {
        vehicleId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      include: {
        vehicle: { include: { driver: true } },
        station: true,
        destination: true
      }
    });

    if (!queueEntry) {
      throw new Error('Vehicle not found in any active queue');
    }

    // Mark as departed
    await prisma.vehicleQueue.update({
      where: { id: queueEntry.id },
      data: { 
        status: 'DEPARTED',
        actualDeparture: new Date()
      }
    });

    // Rebalance queue positions for remaining vehicles
    await this.rebalanceQueuePositions(
      queueEntry.stationId,
      queueEntry.destinationId
    );

    return {
      success: true,
      message: `Vehicle departed from ${queueEntry.station.name} to ${queueEntry.destination.name}`,
      departedVehicle: queueEntry
    };
  }

  /**
   * Register vehicle for overnight priority queue (simplified)
   */
  async registerOvernightQueue(registrationData: SimpleOvernightRegistration, supervisorStationId: string) {
    // Validate it's evening hours (6-8 PM) - simplified for demo
    // Remove time restriction for testing - in production would check: 
    // const currentHour = new Date().getHours();
    // if (currentHour < 18 || currentHour > 20)

    // Get vehicle and auto-select destination
    const { vehicle, destinationStation, availableSeats, totalSeats } = 
      await this.getVehicleAndDestination(registrationData.licensePlate, supervisorStationId);

    // Check if vehicle already has overnight registration for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const existingRegistration = await prisma.vehicleQueue.findFirst({
      where: {
        vehicleId: vehicle.id,
        stationId: supervisorStationId,
        destinationId: destinationStation.id,
        queueType: 'OVERNIGHT',
        status: 'WAITING',
        createdAt: { gte: tomorrow }
      }
    });

    if (existingRegistration) {
      throw new Error('Vehicle already registered for overnight queue for this destination');
    }

    // Get next overnight position
    const queuePosition = await this.getNextQueuePosition(
      supervisorStationId,
      destinationStation.id,
      'OVERNIGHT'
    );

    // Get base price from route or use default
    const basePrice = 15.50; // Default price - could be fetched from Route table

    // Create overnight queue entry with WAITING status (will be activated in morning)
    const overnightEntry = await prisma.vehicleQueue.create({
      data: {
        vehicleId: vehicle.id,
        stationId: supervisorStationId,
        destinationId: destinationStation.id,
        queueType: 'OVERNIGHT',
        queuePosition,
        availableSeats,
        totalSeats,
        basePrice,
        estimatedDeparture: registrationData.estimatedDeparture || null,
        status: 'WAITING' // Will be available for booking immediately
      },
      include: {
        vehicle: { include: { driver: true } },
        station: true,
        destination: true
      }
    });

    return {
      success: true,
      overnightEntry,
      queuePosition,
      message: `Vehicle ${registrationData.licensePlate} registered for overnight priority queue at position ${queuePosition}`
    };
  }

  /**
   * Activate overnight vehicles (called when station opens - 4-5 AM)
   */
  async activateOvernightVehicles(stationId: string) {
    // Find all overnight vehicles that are in WAITING status
    const overnightVehicles = await prisma.vehicleQueue.findMany({
      where: {
        stationId,
        queueType: 'OVERNIGHT',
        status: 'WAITING'
      },
      include: {
        vehicle: { include: { driver: true } },
        destination: true
      },
      orderBy: { queuePosition: 'asc' }
    });

    if (overnightVehicles.length === 0) {
      return {
        success: true,
        activatedCount: 0,
        message: 'No overnight vehicles to activate'
      };
    }

    // All overnight vehicles are already in WAITING status and available for booking
    // No status change needed, they're already active

    return {
      success: true,
      activatedCount: overnightVehicles.length,
      activatedVehicles: overnightVehicles,
      message: `Activated ${overnightVehicles.length} overnight vehicles`
    };
  }

  /**
   * Get queue status for specific destination from a station
   */
  async getQueueByDestination(stationId: string, destinationId: string) {
    const queueEntries = await prisma.vehicleQueue.findMany({
      where: {
        stationId,
        destinationId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      include: {
        vehicle: {
          include: { driver: true }
        },
        station: true,
        destination: true
      },
      orderBy: { queuePosition: 'asc' }
    });

    // Calculate total available seats
    const totalAvailableSeats = queueEntries.reduce((sum, entry) => sum + entry.availableSeats, 0);

    return {
      success: true,
      stationId,
      destinationId,
      queueLength: queueEntries.length,
      totalAvailableSeats,
      vehicles: queueEntries,
      nextDeparture: queueEntries[0]?.estimatedDeparture || null
    };
  }

  /**
   * Get all queues for a station (grouped by destination)
   */
  async getAllStationQueues(stationId: string) {
    const queueEntries = await prisma.vehicleQueue.findMany({
      where: {
        stationId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      include: {
        vehicle: {
          include: { driver: true }
        },
        station: true,
        destination: true
      },
      orderBy: [
        { destinationId: 'asc' },
        { queuePosition: 'asc' }
      ]
    });

    // Group by destination
    const queuesByDestination = queueEntries.reduce((acc, entry) => {
      const destId = entry.destinationId;
      if (!acc[destId]) {
        acc[destId] = {
          destination: entry.destination,
          vehicles: [],
          totalAvailableSeats: 0,
          queueLength: 0
        };
      }
      acc[destId].vehicles.push(entry);
      acc[destId].totalAvailableSeats += entry.availableSeats;
      acc[destId].queueLength = acc[destId].vehicles.length;
      return acc;
    }, {} as any);

    return {
      success: true,
      stationId,
      destinations: Object.values(queuesByDestination),
      totalQueues: Object.keys(queuesByDestination).length,
      totalVehicles: queueEntries.length
    };
  }

  /**
   * Update vehicle status in queue
   */
  async updateVehicleStatus(vehicleId: string, status: QueueStatus) {
    const queueEntry = await prisma.vehicleQueue.findFirst({
      where: {
        vehicleId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      }
    });

    if (!queueEntry) {
      throw new Error('Vehicle not found in active queue');
    }

    const updatedEntry = await prisma.vehicleQueue.update({
      where: { id: queueEntry.id },
      data: { status },
      include: {
        vehicle: { include: { driver: true } },
        station: true,
        destination: true
      }
    });

    return {
      success: true,
      queueEntry: updatedEntry,
      message: `Vehicle status updated to ${status}`
    };
  }

  /**
   * Manually adjust queue position (supervisor override)
   */
  async updateVehiclePosition(vehicleId: string, newPosition: number) {
    const queueEntry = await prisma.vehicleQueue.findFirst({
      where: {
        vehicleId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      }
    });

    if (!queueEntry) {
      throw new Error('Vehicle not found in active queue');
    }

    // Validate new position is valid
    if (newPosition < 1) {
      throw new Error('Position must be greater than 0');
    }

    const oldPosition = queueEntry.queuePosition;

    // Update the vehicle's position
    await prisma.vehicleQueue.update({
      where: { id: queueEntry.id },
      data: { queuePosition: newPosition }
    });

    // Rebalance all positions for this destination queue
    await this.rebalanceQueuePositions(
      queueEntry.stationId,
      queueEntry.destinationId
    );

    return {
      success: true,
      message: `Vehicle position changed from ${oldPosition} to ${newPosition}`,
      vehicleId,
      oldPosition,
      newPosition
    };
  }

  /**
   * Get vehicle's current queue information
   */
  async getVehicleQueueInfo(vehicleId: string) {
    const queueEntry = await prisma.vehicleQueue.findFirst({
      where: {
        vehicleId,
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      },
      include: {
        vehicle: { include: { driver: true } },
        station: true,
        destination: true
      }
    });

    if (!queueEntry) {
      return {
        success: false,
        message: 'Vehicle is not in any active queue',
        inQueue: false
      };
    }

    // Get vehicles ahead in queue
    const vehiclesAhead = await prisma.vehicleQueue.count({
      where: {
        stationId: queueEntry.stationId,
        destinationId: queueEntry.destinationId,
        queuePosition: { lt: queueEntry.queuePosition },
        status: { in: ['WAITING', 'LOADING', 'READY'] }
      }
    });

    const estimatedWaitMinutes = vehiclesAhead * 30; // 30 minutes per vehicle

    return {
      success: true,
      inQueue: true,
      queueEntry,
      vehiclesAhead,
      estimatedWaitMinutes
    };
  }
}

export const queueService = new QueueService();