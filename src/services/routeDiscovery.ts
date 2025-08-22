import { EventEmitter } from 'events';
import axios from 'axios';
import { prisma } from '../config/database';

interface StationConnection {
  stationId: string;
  stationName: string;
  localServerIp: string;
  isOnline: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
}

/**
 * Real-time Route Discovery Service
 * Monitors station availability and provides cached route data
 */
export class RouteDiscoveryService extends EventEmitter {
  private stationConnections: Map<string, StationConnection> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_INTERVAL = 30000; // 30 seconds
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  constructor() {
    super();
    this.initializeStations();
    this.startMonitoring();
  }

  /**
   * Initialize station connections from database
   */
  private async initializeStations(): Promise<void> {
    try {
      const stations = await prisma.station.findMany({
        where: {
          isActive: true,
          localServerIp: { not: null }
        },
        select: {
          id: true,
          name: true,
          localServerIp: true,
          isOnline: true
        }
      });

      stations.forEach(station => {
        if (station.localServerIp) {
          this.stationConnections.set(station.id, {
            stationId: station.id,
            stationName: station.name,
            localServerIp: station.localServerIp,
            isOnline: station.isOnline,
            lastChecked: new Date(),
            consecutiveFailures: 0
          });
        }
      });

      console.log(`🔄 Initialized monitoring for ${this.stationConnections.size} stations`);
    } catch (error) {
      console.error('❌ Error initializing stations:', error);
    }
  }

  /**
   * Start monitoring station availability
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.checkAllStations();
    }, this.MONITORING_INTERVAL);

    console.log('📡 Started station monitoring service');
  }

  /**
   * Check availability of all stations
   */
  private async checkAllStations(): Promise<void> {
    const checkPromises = Array.from(this.stationConnections.values()).map(
      station => this.checkStationHealth(station)
    );

    await Promise.all(checkPromises);
  }

  /**
   * Check health of a specific station
   */
  private async checkStationHealth(station: StationConnection): Promise<void> {
    try {
      const healthUrl = `http://${station.localServerIp}:3001/api/public/health`;
      
      const response = await axios.get(healthUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Louaj-Central-Server/1.0'
        }
      });

      const responseData = response.data as any;
      if (responseData.success) {
        // Station is healthy
        if (!station.isOnline) {
          console.log(`✅ Station ${station.stationName} is back online`);
          await this.updateStationStatus(station.stationId, true);
          this.emit('station_online', station);
        }

        station.isOnline = true;
        station.consecutiveFailures = 0;
        station.lastChecked = new Date();
      }

    } catch (error) {
      station.consecutiveFailures++;
      station.lastChecked = new Date();

      if (station.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && station.isOnline) {
        console.warn(`⚠️ Station ${station.stationName} is offline (${station.consecutiveFailures} failures)`);
        await this.updateStationStatus(station.stationId, false);
        station.isOnline = false;
        this.emit('station_offline', station);
      }
    }
  }

  /**
   * Update station online status in database
   */
  private async updateStationStatus(stationId: string, isOnline: boolean): Promise<void> {
    try {
      await prisma.station.update({
        where: { id: stationId },
        data: { 
          isOnline,
          lastHeartbeat: new Date()
        }
      });
    } catch (error) {
      console.error(`❌ Error updating station ${stationId} status:`, error);
    }
  }

  /**
   * Get real-time station availability
   */
  public getStationAvailability(): StationConnection[] {
    return Array.from(this.stationConnections.values());
  }

  /**
   * Get online stations only
   */
  public getOnlineStations(): StationConnection[] {
    return Array.from(this.stationConnections.values()).filter(station => station.isOnline);
  }

  /**
   * Check if a specific station is online
   */
  public isStationOnline(stationId: string): boolean {
    const station = this.stationConnections.get(stationId);
    return station ? station.isOnline : false;
  }

  /**
   * Force refresh of a specific station
   */
  public async refreshStation(stationId: string): Promise<boolean> {
    const station = this.stationConnections.get(stationId);
    if (!station) {
      return false;
    }

    await this.checkStationHealth(station);
    return station.isOnline;
  }

  /**
   * Get cached route data for quick response
   */
  public async getCachedRouteData(departureStationId: string, destinationId: string): Promise<any> {
    const station = this.stationConnections.get(departureStationId);
    
    if (!station || !station.isOnline) {
      return null;
    }

    try {
      const localNodeUrl = `http://${station.localServerIp}:3001/api/public/queue/${destinationId}`;
      
      const response = await axios.get(localNodeUrl, {
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Louaj-Central-Server/1.0'
        }
      });

      const responseData = response.data as any;
      if (responseData.success) {
        return {
          ...responseData.data,
          fetchedAt: new Date().toISOString(),
          fromCache: false
        };
      }

      return null;

    } catch (error) {
      console.error(`❌ Error fetching route data from ${station.stationName}:`, error);
      return null;
    }
  }

  /**
   * Stop monitoring service
   */
  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('🛑 Stopped station monitoring service');
  }
}

// Export singleton instance
export const routeDiscoveryService = new RouteDiscoveryService();
