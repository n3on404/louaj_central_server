import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { CentralWebSocketServer } from '../websocket/WebSocketServer';

export interface SyncMessage {
  type: 'instant_sync';
  syncType: 'staff' | 'route' | 'station' | 'vehicle' | 'destination' | 'governorate' | 'delegation';
  data: any;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  syncId: string;
  timestamp: number;
  stationId?: string | undefined; // For targeted sync
}

export interface SyncAckMessage {
  type: 'instant_sync_ack';
  syncId: string;
  success: boolean;
  error?: string;
  dataType?: string;
  operation?: string;
}

export class InstantSyncService extends EventEmitter {
  private static instance: InstantSyncService | null = null;
  private wsServer: CentralWebSocketServer | null = null;
  private pendingSyncs: Map<string, { timestamp: number; retries: number }> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly ACK_TIMEOUT = 10000; // 10 seconds

  constructor() {
    super();
    InstantSyncService.instance = this;
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): InstantSyncService {
    if (!InstantSyncService.instance) {
      InstantSyncService.instance = new InstantSyncService();
    }
    return InstantSyncService.instance;
  }

  /**
   * Set the WebSocket server instance
   */
  public setWebSocketServer(wsServer: CentralWebSocketServer): void {
    this.wsServer = wsServer;
    console.log('📡 InstantSyncService connected to WebSocket server');
  }

  /**
   * Sync staff data to local nodes
   */
  public async syncStaff(operation: 'CREATE' | 'UPDATE' | 'DELETE', staffData: any, stationId?: string): Promise<void> {
    if (!this.wsServer) {
      console.warn('⚠️ WebSocket server not available for staff sync');
      return;
    }

    const syncId = uuidv4();
    const message: SyncMessage = {
      type: 'instant_sync',
      syncType: 'staff',
      data: staffData,
      operation,
      syncId,
      timestamp: Date.now(),
      stationId
    };

    try {
      if (stationId) {
        // Target specific station
        await this.sendToStation(stationId, message);
        console.log(`📡 Staff ${operation} sync sent to station ${stationId}: ${syncId}`);
      } else {
        // Broadcast to all local nodes
        await this.broadcastToLocalNodes(message);
        console.log(`📡 Staff ${operation} sync broadcasted to all local nodes: ${syncId}`);
      }

      // Track pending sync
      this.pendingSyncs.set(syncId, { timestamp: Date.now(), retries: 0 });
      
      // Set timeout for acknowledgment
      setTimeout(() => {
        this.handleSyncTimeout(syncId);
      }, this.ACK_TIMEOUT);

    } catch (error) {
      console.error(`❌ Error syncing staff ${operation}:`, error);
    }
  }

  /**
   * Sync route data to local nodes
   */
  public async syncRoute(operation: 'CREATE' | 'UPDATE' | 'DELETE', routeData: any): Promise<void> {
    if (!this.wsServer) {
      console.warn('⚠️ WebSocket server not available for route sync');
      return;
    }

    const syncId = uuidv4();
    const message: SyncMessage = {
      type: 'instant_sync',
      syncType: 'route',
      data: routeData,
      operation,
      syncId,
      timestamp: Date.now()
    };

    try {
      // Routes are broadcasted to all stations since they affect multiple stations
      await this.broadcastToLocalNodes(message);
      console.log(`📡 Route ${operation} sync broadcasted to all local nodes: ${syncId}`);

      // Track pending sync
      this.pendingSyncs.set(syncId, { timestamp: Date.now(), retries: 0 });
      
      // Set timeout for acknowledgment
      setTimeout(() => {
        this.handleSyncTimeout(syncId);
      }, this.ACK_TIMEOUT);

    } catch (error) {
      console.error(`❌ Error syncing route ${operation}:`, error);
    }
  }

  /**
   * Sync vehicle data to local nodes
   */
  public async syncVehicle(operation: 'CREATE' | 'UPDATE' | 'DELETE', vehicleData: any, authorizedStationIds?: string[]): Promise<void> {
    if (!this.wsServer) {
      console.warn('⚠️ WebSocket server not available for vehicle sync');
      return;
    }

    const syncId = uuidv4();
    const message: SyncMessage = {
      type: 'instant_sync',
      syncType: 'vehicle',
      data: vehicleData,
      operation,
      syncId,
      timestamp: Date.now()
    };

    try {
      if (authorizedStationIds && authorizedStationIds.length > 0) {
        // Send to authorized stations only
        for (const stationId of authorizedStationIds) {
          await this.sendToStation(stationId, { ...message, stationId });
        }
        console.log(`📡 Vehicle ${operation} sync sent to authorized stations: ${syncId}`);
      } else {
        // Broadcast to all local nodes
        await this.broadcastToLocalNodes(message);
        console.log(`📡 Vehicle ${operation} sync broadcasted to all local nodes: ${syncId}`);
      }

      // Track pending sync
      this.pendingSyncs.set(syncId, { timestamp: Date.now(), retries: 0 });
      
      // Set timeout for acknowledgment
      setTimeout(() => {
        this.handleSyncTimeout(syncId);
      }, this.ACK_TIMEOUT);

    } catch (error) {
      console.error(`❌ Error syncing vehicle ${operation}:`, error);
    }
  }

  /**
   * Sync station data to local nodes
   */
  public async syncStation(operation: 'CREATE' | 'UPDATE' | 'DELETE', stationData: any, excludeStationId?: string): Promise<void> {
    if (!this.wsServer) {
      console.warn('⚠️ WebSocket server not available for station sync');
      return;
    }

    const syncId = uuidv4();
    const message: SyncMessage = {
      type: 'instant_sync',
      syncType: 'station',
      data: stationData,
      operation,
      syncId,
      timestamp: Date.now()
    };

    try {
      // Send to all stations except the source station
      await this.broadcastToLocalNodes(message, excludeStationId);
      console.log(`📡 Station ${operation} sync broadcasted to all local nodes: ${syncId}`);

      // Track pending sync
      this.pendingSyncs.set(syncId, { timestamp: Date.now(), retries: 0 });
      
      // Set timeout for acknowledgment
      setTimeout(() => {
        this.handleSyncTimeout(syncId);
      }, this.ACK_TIMEOUT);

    } catch (error) {
      console.error(`❌ Error syncing station ${operation}:`, error);
    }
  }

  /**
   * Sync geographic data (governorate, delegation, destination) to local nodes
   */
  public async syncGeographicData(dataType: 'governorate' | 'delegation' | 'destination', operation: 'CREATE' | 'UPDATE' | 'DELETE', data: any): Promise<void> {
    if (!this.wsServer) {
      console.warn('⚠️ WebSocket server not available for geographic data sync');
      return;
    }

    const syncId = uuidv4();
    const message: SyncMessage = {
      type: 'instant_sync',
      syncType: dataType,
      data,
      operation,
      syncId,
      timestamp: Date.now()
    };

    try {
      // Geographic data is broadcasted to all stations
      await this.broadcastToLocalNodes(message);
      console.log(`📡 ${dataType} ${operation} sync broadcasted to all local nodes: ${syncId}`);

      // Track pending sync
      this.pendingSyncs.set(syncId, { timestamp: Date.now(), retries: 0 });
      
      // Set timeout for acknowledgment
      setTimeout(() => {
        this.handleSyncTimeout(syncId);
      }, this.ACK_TIMEOUT);

    } catch (error) {
      console.error(`❌ Error syncing ${dataType} ${operation}:`, error);
    }
  }

  /**
   * Send message to a specific station
   */
  private async sendToStation(stationId: string, message: SyncMessage): Promise<void> {
    if (!this.wsServer) {
      throw new Error('WebSocket server not available');
    }

    const clients = this.wsServer.getConnectedClients();
    const targetClient = Array.from(clients.values()).find(
      client => client.stationId === stationId && client.authenticated && client.connectionType === 'local-node'
    );

    if (targetClient) {
      this.wsServer.sendToStation(stationId, message);
      console.log(`📤 Sent sync message to station ${stationId} (${targetClient.id})`);
    } else {
      console.warn(`⚠️ No authenticated local node found for station ${stationId}`);
    }
  }

  /**
   * Broadcast message to all local nodes
   */
  private async broadcastToLocalNodes(message: SyncMessage, excludeStationId?: string): Promise<void> {
    if (!this.wsServer) {
      throw new Error('WebSocket server not available');
    }

    const clients = this.wsServer.getConnectedClients();
    const localNodes = Array.from(clients.values()).filter(
      client => client.authenticated && 
                client.connectionType === 'local-node' && 
                (!excludeStationId || client.stationId !== excludeStationId)
    );

    if (localNodes.length === 0) {
      console.warn('⚠️ No authenticated local nodes available for broadcast');
      return;
    }

    for (const client of localNodes) {
      this.wsServer.sendToStation(client.stationId!, message);
      console.log(`📤 Sent sync message to local node ${client.id} (station: ${client.stationId})`);
    }

    console.log(`📡 Broadcasted sync message to ${localNodes.length} local nodes`);
  }

  /**
   * Handle sync acknowledgment
   */
  public handleSyncAck(ackMessage: SyncAckMessage): void {
    const { syncId, success, error, dataType, operation } = ackMessage;
    
    if (this.pendingSyncs.has(syncId)) {
      this.pendingSyncs.delete(syncId);
      
      if (success) {
        console.log(`✅ Sync acknowledged: ${dataType} ${operation} (${syncId})`);
      } else {
        console.error(`❌ Sync failed: ${dataType} ${operation} (${syncId}) - ${error}`);
      }
    } else {
      console.warn(`⚠️ Received acknowledgment for unknown sync: ${syncId}`);
    }
  }

  /**
   * Handle sync timeout
   */
  private handleSyncTimeout(syncId: string): void {
    const pendingSync = this.pendingSyncs.get(syncId);
    if (!pendingSync) return;

    if (pendingSync.retries < this.MAX_RETRIES) {
      // Retry sync
      pendingSync.retries++;
      this.pendingSyncs.set(syncId, pendingSync);
      console.warn(`⚠️ Sync timeout, retrying (${pendingSync.retries}/${this.MAX_RETRIES}): ${syncId}`);
      
      // TODO: Implement retry logic based on sync type
    } else {
      // Max retries reached, remove from pending
      this.pendingSyncs.delete(syncId);
      console.error(`❌ Sync failed after ${this.MAX_RETRIES} retries: ${syncId}`);
    }
  }

  /**
   * Get pending syncs count
   */
  public getPendingSyncsCount(): number {
    return this.pendingSyncs.size;
  }

  /**
   * Clear all pending syncs
   */
  public clearPendingSyncs(): void {
    this.pendingSyncs.clear();
  }
}

// Export singleton instance
export const instantSyncService = InstantSyncService.getInstance();