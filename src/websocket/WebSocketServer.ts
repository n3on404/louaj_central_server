import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  stationId?: string;
  stationName?: string;
  authenticated: boolean;
  lastHeartbeat: Date;
  connectionType: 'local-node' | 'desktop-app' | 'mobile-app';
  ipAddress: string;
}

export interface WebSocketMessage {
  type: 'authenticate' | 'heartbeat' | 'connection_test' | 'sync_request' | 'data_update' | 'error' | 'success' | 
        'booking_update' | 'vehicle_update' | 'queue_update' | 'ip_update' | 'connected' | 'auth_error' |
        'ip_update_ack' | 'station_ip_update' | 'ip_update_error' | 'station_status_update' |
        'authenticated' | 'heartbeat_ack' | 'heartbeat_error' | 'connection_test_response' | 'sync_error' | 'sync_response' |
        // Staff authentication message types
        'staff_login_request' | 'staff_login_response' | 'staff_verify_request' | 'staff_verify_response' |
        // Vehicle sync message types
        'vehicle_sync_full' | 'vehicle_sync_update' | 'vehicle_sync_delete' | 'vehicle_sync_ack' | 'vehicle_sync_error' |
        // Real-time booking and seat availability message types
        'seat_availability_request' | 'seat_availability_response' | 'booking_created' | 'booking_payment_updated' | 'booking_cancelled';
  payload?: any;
  timestamp: number;
  messageId?: string;
}

export class CentralWebSocketServer extends EventEmitter {
  private static instance: CentralWebSocketServer | null = null;
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 60000; // 60 seconds

  constructor(server: HTTPServer) {
    super();
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      clientTracking: true
    });

    this.setupWebSocketServer();
    this.startHeartbeatMonitor();
    
    // Set singleton instance
    CentralWebSocketServer.instance = this;
  }

  /**
   * Get the singleton instance of the WebSocket server
   */
  public static getInstance(): CentralWebSocketServer | null {
    return CentralWebSocketServer.instance;
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const clientId = uuidv4();
      const ipAddress = request.socket.remoteAddress || 'unknown';
      
      console.log(`🔌 New WebSocket connection: ${clientId} from ${ipAddress}`);

      const client: ClientConnection = {
        id: clientId,
        ws,
        authenticated: false,
        lastHeartbeat: new Date(),
        connectionType: 'local-node',
        ipAddress
      };

      this.clients.set(clientId, client);

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        payload: {
          clientId,
          message: 'Connected to Louaj Central Server',
          serverTime: new Date().toISOString()
        },
        timestamp: Date.now()
      });

      // Setup message handlers
      ws.on('message', (data: Buffer) => {
        this.handleMessage(clientId, data);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.handleDisconnection(clientId, code, reason.toString());
      });

      ws.on('error', (error: Error) => {
        console.error(`❌ WebSocket error for client ${clientId}:`, error.message);
      });

      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.lastHeartbeat = new Date();
        }
      });
    });

    console.log('✅ Central WebSocket Server initialized');
  }

  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      console.log(`📨 Received message from ${clientId}: ${message.type}`);

      // Update last activity
      client.lastHeartbeat = new Date();

      switch (message.type) {
        case 'authenticate':
          await this.handleAuthentication(clientId, message.payload);
          break;

        case 'heartbeat':
          await this.handleHeartbeat(clientId, message.payload);
          break;

        case 'connection_test':
          this.handleConnectionTest(clientId);
          break;

        case 'sync_request':
          await this.handleSyncRequest(clientId, message.payload);
          break;

        case 'data_update':
          await this.handleDataUpdate(clientId, message.payload);
          break;

        case 'booking_update':
          await this.handleBookingUpdate(clientId, message.payload);
          break;

        case 'vehicle_update':
          await this.handleVehicleUpdate(clientId, message.payload);
          break;

        case 'queue_update':
          await this.handleQueueUpdate(clientId, message.payload);
          break;

        case 'ip_update':
          await this.handleIpUpdate(clientId, message.payload);
          break;

        case 'staff_login_request':
          await this.handleStaffLoginRequest(clientId, message);
          break;

        case 'staff_verify_request':
          await this.handleStaffVerifyRequest(clientId, message);
          break;

        case 'vehicle_sync_ack':
          await this.handleVehicleSyncAck(clientId, message.payload);
          break;

        case 'seat_availability_response':
          await this.handleSeatAvailabilityResponse(clientId, message.payload);
          break;

        default:
          console.warn(`⚠️ Unknown message type: ${message.type} from ${clientId}`);
          this.sendToClient(clientId, {
            type: 'error',
            payload: { message: `Unknown message type: ${message.type}` },
            timestamp: Date.now()
          });
      }
    } catch (error) {
      console.error(`❌ Error handling message from ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        payload: { message: 'Invalid message format' },
        timestamp: Date.now()
      });
    }
  }

  private async handleAuthentication(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const { stationId, publicIp } = payload;

      if (!stationId) {
        this.sendToClient(clientId, {
          type: 'auth_error',
          payload: { message: 'Station ID is required' },
          timestamp: Date.now()
        });
        return;
      }

      // Validate station exists and is active
      const station = await prisma.station.findUnique({
        where: { id: stationId },
        select: { id: true, name: true, isActive: true }
      });

      if (!station || !station.isActive) {
        this.sendToClient(clientId, {
          type: 'auth_error',
          payload: { message: 'Invalid station ID or station inactive' },
          timestamp: Date.now()
        });
        return;
      }

      // Update client info
      client.authenticated = true;
      client.stationId = stationId;
      client.stationName = station.name;
      client.lastHeartbeat = new Date();

      // Update station status in database - mark as online, update heartbeat, and store IP
      const updateData: any = {
        isOnline: true,
        lastHeartbeat: new Date()
      };

      // Add public IP if provided
      if (publicIp && typeof publicIp === 'string') {
        updateData.localServerIp = publicIp;
        console.log(`🌐 Updating station IP address: ${publicIp}`);
      }

      const updateResult = await prisma.station.update({
        where: { id: stationId },
        data: updateData
      });

      console.log(`📊 Database updated - Station ${station.name} marked ONLINE${publicIp ? ` with IP ${publicIp}` : ''}`);

      // Send authentication success
      this.sendToClient(clientId, {
        type: 'authenticated',
        payload: {
          stationId,
          stationName: station.name,
          serverTime: new Date().toISOString(),
          lastHeartbeat: updateResult.lastHeartbeat?.toISOString(),
          publicIp: publicIp || null
        },
        timestamp: Date.now()
      });

      // Broadcast station status update to other clients
      this.broadcastToOthers(clientId, {
        type: 'station_status_update',
        payload: {
          stationId,
          stationName: station.name,
          isOnline: true,
          connectedAt: new Date().toISOString(),
          publicIp: publicIp || null,
          reason: 'authentication_success'
        },
        timestamp: Date.now()
      });

      // Send initial vehicle sync after authentication
      await this.sendFullVehicleSync(clientId, stationId);

      console.log(`✅ Station authenticated and marked ONLINE: ${station.name} (${stationId}) - Client: ${clientId}${publicIp ? ` - IP: ${publicIp}` : ''}`);

    } catch (error) {
      console.error(`❌ Authentication error for ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'auth_error',
        payload: { message: 'Authentication failed' },
        timestamp: Date.now()
      });
    }
  }

  private async handleHeartbeat(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) {
      console.warn(`⚠️ Heartbeat from unauthenticated client: ${clientId}`);
      return;
    }

    try {
      const now = new Date();
      const { publicIp } = payload;
      
      // Update client's last heartbeat in memory
      client.lastHeartbeat = now;
      
      // Update heartbeat in database if station is authenticated
      if (client.stationId) {
        const updateData: any = { 
          lastHeartbeat: now,
          // Ensure station remains online during heartbeat
          isOnline: true
        };

        // Update IP if provided and different from current
        if (publicIp && typeof publicIp === 'string') {
          updateData.localServerIp = publicIp;
        }

        await prisma.station.update({
          where: { id: client.stationId },
          data: updateData
        });
        
        console.log(`💓 Heartbeat received from ${client.stationName} (${client.stationId})${publicIp ? ` - IP: ${publicIp}` : ''}`);
      }

      // Send heartbeat acknowledgment
      this.sendToClient(clientId, {
        type: 'heartbeat_ack',
        payload: {
          serverTime: now.toISOString(),
          clientTime: payload?.timestamp,
          stationId: client.stationId
        },
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`❌ Heartbeat error for ${clientId} (${client.stationName || 'Unknown'}):`, error);
      
      // Send error response to client
      this.sendToClient(clientId, {
        type: 'heartbeat_error',
        payload: { 
          message: 'Failed to process heartbeat',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        timestamp: Date.now()
      });
    }
  }

  private handleConnectionTest(clientId: string): void {
    this.sendToClient(clientId, {
      type: 'connection_test_response',
      payload: {
        message: 'Connection is working',
        serverTime: new Date().toISOString()
      },
      timestamp: Date.now()
    });
  }

  private async handleSyncRequest(clientId: string, _payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated || !client.stationId) {
      this.sendToClient(clientId, {
        type: 'sync_error',
        payload: { message: 'Not authenticated' },
        timestamp: Date.now()
      });
      return;
    }

    // TODO: Implement sync logic based on payload.lastSyncTimestamp
    // For now, send a basic response
    this.sendToClient(clientId, {
      type: 'sync_response',
      payload: {
        message: 'Sync request received',
        stationId: client.stationId
      },
      timestamp: Date.now()
    });
  }

  private async handleDataUpdate(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) return;

    console.log(`📝 Data update from ${client.stationName || clientId}:`, payload.type);
    
    // Broadcast update to other relevant clients
    this.broadcastToOthers(clientId, {
      type: 'data_update',
      payload: {
        ...payload,
        sourceStationId: client.stationId
      },
      timestamp: Date.now()
    });
  }

  private async handleBookingUpdate(clientId: string, payload: any): Promise<void> {
    // TODO: Implement booking update logic
    console.log(`📋 Booking update from ${clientId}:`, payload);
  }

  private async handleVehicleUpdate(clientId: string, payload: any): Promise<void> {
    // TODO: Implement vehicle update logic
    console.log(`🚐 Vehicle update from ${clientId}:`, payload);
  }

  private async handleQueueUpdate(clientId: string, payload: any): Promise<void> {
    // TODO: Implement queue update logic
    console.log(`📜 Queue update from ${clientId}:`, payload);
  }

  private async handleIpUpdate(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated || !client.stationId) {
      console.warn(`⚠️ IP update from unauthenticated client: ${clientId}`);
      return;
    }

    try {
      const { publicIp } = payload;

      if (publicIp && typeof publicIp === 'string') {
        // Update station IP in database
        await prisma.station.update({
          where: { id: client.stationId },
          data: { 
            localServerIp: publicIp,
            lastHeartbeat: new Date()
          }
        });

        console.log(`🌐 IP updated for station ${client.stationName} (${client.stationId}): ${publicIp}`);

        // Send confirmation to client
        this.sendToClient(clientId, {
          type: 'ip_update_ack',
          payload: {
            stationId: client.stationId,
            publicIp: publicIp,
            timestamp: new Date().toISOString()
          },
          timestamp: Date.now()
        });

        // Broadcast IP update to other clients
        this.broadcastToOthers(clientId, {
          type: 'station_ip_update',
          payload: {
            stationId: client.stationId,
            stationName: client.stationName,
            publicIp: publicIp,
            timestamp: new Date().toISOString()
          },
          timestamp: Date.now()
        });
      }

    } catch (error) {
      console.error(`❌ IP update error for ${clientId} (${client.stationName || 'Unknown'}):`, error);
      
      this.sendToClient(clientId, {
        type: 'ip_update_error',
        payload: { 
          message: 'Failed to update IP address',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        timestamp: Date.now()
      });
    }
  }

  private async handleStaffLoginRequest(clientId: string, message: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated || !client.stationId) {
      this.sendToClient(clientId, {
        type: 'staff_login_response',
        payload: { 
          success: false, 
          message: 'Station not authenticated with central server' 
        },
        timestamp: Date.now(),
        messageId: message.messageId
      });
      return;
    }

    try {
      const { cin } = message.payload;

      if (!cin) {
        this.sendToClient(clientId, {
          type: 'staff_login_response',
          payload: { 
            success: false, 
            message: 'CIN is required' 
          },
          timestamp: Date.now(),
          messageId: message.messageId
        });
        return;
      }

      // Import authService here to avoid circular dependency
      const { authService } = await import('../services/auth');

      // Call the existing initiate login service
      const result = await authService.initiateLogin(cin);

      console.log(`🔐 Staff login request via WebSocket from station ${client.stationName} for CIN: ${cin}`);

      // Send response back to local node
      this.sendToClient(clientId, {
        type: 'staff_login_response',
        payload: result,
        timestamp: Date.now(),
        messageId: message.messageId // Include messageId for Promise matching
      });

    } catch (error) {
      console.error(`❌ Error handling staff login request:`, error);
      this.sendToClient(clientId, {
        type: 'staff_login_response',
        payload: { 
          success: false, 
          message: 'Failed to process login request' 
        },
        timestamp: Date.now(),
        messageId: message.messageId
      });
    }
  }

  private async handleStaffVerifyRequest(clientId: string, message: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated || !client.stationId) {
      this.sendToClient(clientId, {
        type: 'staff_verify_response',
        payload: { 
          success: false, 
          message: 'Station not authenticated with central server' 
        },
        timestamp: Date.now(),
        messageId: message.messageId
      });
      return;
    }

    try {
      const { cin, verificationCode } = message.payload;

      if (!cin || !verificationCode) {
        this.sendToClient(clientId, {
          type: 'staff_verify_response',
          payload: { 
            success: false, 
            message: 'CIN and verification code are required' 
          },
          timestamp: Date.now(),
          messageId: message.messageId
        });
        return;
      }

      // Import authService here to avoid circular dependency
      const { authService } = await import('../services/auth');

      // Call the existing verify login service
      const result = await authService.verifyLogin(cin, verificationCode);

      console.log(`🔍 Staff verification request via WebSocket from station ${client.stationName} for CIN: ${cin}`);

      // Send response back to local node
      this.sendToClient(clientId, {
        type: 'staff_verify_response',
        payload: result,
        timestamp: Date.now(),
        messageId: message.messageId
      });

    } catch (error) {
      console.error(`❌ Error handling staff verification request:`, error);
      this.sendToClient(clientId, {
        type: 'staff_verify_response',
        payload: { 
          success: false, 
          message: 'Failed to process verification request' 
        },
        timestamp: Date.now(),
        messageId: message.messageId
      });
    }
  }

  private async handleDisconnection(clientId: string, code: number, reason: string): Promise<void> {
    const client = this.clients.get(clientId);
    const disconnectReason = this.getDisconnectReason(code);
    
    console.log(`❌ Client disconnected: ${clientId} - Code: ${code} (${disconnectReason}), Reason: ${reason}`);

    if (client && client.authenticated && client.stationId) {
      try {
        // Mark station as offline and update last heartbeat
        await prisma.station.update({
          where: { id: client.stationId },
          data: { 
            isOnline: false,
            lastHeartbeat: new Date() // Update to current time when disconnecting
          }
        });

        console.log(`📊 Database updated - Station ${client.stationName} marked OFFLINE`);

        // Broadcast station status update to other clients
        this.broadcastToOthers(clientId, {
          type: 'station_status_update',
          payload: {
            stationId: client.stationId,
            stationName: client.stationName,
            isOnline: false,
            disconnectedAt: new Date().toISOString(),
            disconnectCode: code,
            disconnectReason: disconnectReason,
            reason: 'disconnection'
          },
          timestamp: Date.now()
        });

        console.log(`🔴 Station marked OFFLINE: ${client.stationName} (${client.stationId}) - Reason: ${disconnectReason}`);
      } catch (error) {
        console.error(`❌ Error marking station offline for ${clientId} (${client.stationName}):`, error);
        // Still continue with cleanup even if database update fails
      }
    } else if (client) {
      console.log(`ℹ️  Unauthenticated client disconnected: ${clientId}`);
    }

    // Remove client from memory
    this.clients.delete(clientId);
  }

  private getDisconnectReason(code: number): string {
    switch (code) {
      case 1000: return 'Normal Closure';
      case 1001: return 'Going Away';
      case 1002: return 'Protocol Error';
      case 1003: return 'Unsupported Data';
      case 1006: return 'Abnormal Closure';
      case 1011: return 'Internal Error';
      case 1012: return 'Service Restart';
      case 1013: return 'Try Again Later';
      default: return 'Unknown';
    }
  }

  private sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`❌ Error sending message to ${clientId}:`, error);
      return false;
    }
  }

  private broadcastToOthers(excludeClientId: string, message: WebSocketMessage): void {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && client.authenticated) {
        this.sendToClient(clientId, message);
      }
    });
  }

  public broadcastToAll(message: WebSocketMessage): void {
    this.clients.forEach((client, clientId) => {
      if (client.authenticated) {
        this.sendToClient(clientId, message);
      }
    });
  }

  /**
   * Send a message to a specific station by station ID
   */
  public sendToStation(stationId: string, message: WebSocketMessage): boolean {
    const client = Array.from(this.clients.values()).find(c => c.stationId === stationId);
    if (client) {
      return this.sendToClient(client.id, message);
    }
    return false;
  }

  /**
   * Broadcast message to all connected mobile apps
   */
  public broadcastToMobileApps(message: WebSocketMessage): void {
    const mobileClients = Array.from(this.clients.values()).filter(
      client => client.authenticated && client.connectionType === 'mobile-app'
    );
    
    mobileClients.forEach(client => {
      this.sendToClient(client.id, message);
    });
    
    console.log(`📱 Broadcast to ${mobileClients.length} mobile apps: ${message.type}`);
  }

  /**
   * Broadcast message to all connected desktop apps
   */
  public broadcastToDesktopApps(message: WebSocketMessage): void {
    const desktopClients = Array.from(this.clients.values()).filter(
      client => client.authenticated && client.connectionType === 'desktop-app'
    );
    
    desktopClients.forEach(client => {
      this.sendToClient(client.id, message);
    });
    
    console.log(`💻 Broadcast to ${desktopClients.length} desktop apps: ${message.type}`);
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatInterval = setInterval(async () => {
      const now = new Date();
      
      for (const [clientId, client] of this.clients) {
        const timeSinceLastHeartbeat = now.getTime() - client.lastHeartbeat.getTime();
        
        if (timeSinceLastHeartbeat > this.CONNECTION_TIMEOUT) {
          console.warn(`⚠️ Client ${clientId} (${client.stationName || 'Unknown'}) timed out, closing connection`);
          
          // Mark station as offline in database before closing connection
          if (client.authenticated && client.stationId) {
            try {
              await prisma.station.update({
                where: { id: client.stationId },
                data: { 
                  isOnline: false,
                  lastHeartbeat: now
                }
              });
              
              console.log(`🔴 Station marked offline due to timeout: ${client.stationName} (${client.stationId})`);
              
              // Broadcast station status update
              this.broadcastToOthers(clientId, {
                type: 'station_status_update',
                payload: {
                  stationId: client.stationId,
                  stationName: client.stationName,
                  isOnline: false,
                  reason: 'timeout'
                },
                timestamp: Date.now()
              });
            } catch (error) {
              console.error(`❌ Error marking station offline on timeout:`, error);
            }
          }
          
          client.ws.close(1000, 'Connection timeout');
        } else if (client.ws.readyState === WebSocket.OPEN) {
          // Send ping to keep connection alive
          client.ws.ping();
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  // Public methods for external use
  public getConnectedClients(): ClientConnection[] {
    return Array.from(this.clients.values());
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public getAuthenticatedStations(): ClientConnection[] {
    return Array.from(this.clients.values()).filter(client => client.authenticated && client.stationId);
  }

  /**
   * Get station status from database
   */
  public async getStationStatus(stationId?: string): Promise<any> {
    try {
      if (stationId) {
        // Get specific station status
        const station = await prisma.station.findUnique({
          where: { id: stationId },
          select: {
            id: true,
            name: true,
            isActive: true,
            isOnline: true,
            lastHeartbeat: true,
            localServerIp: true
          }
        });
        
        return station ? {
          ...station,
          connectedClients: this.clients.has(stationId) ? 1 : 0,
          lastHeartbeatAge: station.lastHeartbeat 
            ? Date.now() - station.lastHeartbeat.getTime() 
            : null
        } : null;
      } else {
        // Get all stations status
        const stations = await prisma.station.findMany({
          select: {
            id: true,
            name: true,
            isActive: true,
            isOnline: true,
            lastHeartbeat: true,
            localServerIp: true
          },
          orderBy: { name: 'asc' }
        });
        
        return stations.map(station => ({
          ...station,
          connectedClients: Array.from(this.clients.values())
            .filter(client => client.stationId === station.id).length,
          lastHeartbeatAge: station.lastHeartbeat 
            ? Date.now() - station.lastHeartbeat.getTime() 
            : null
        }));
      }
    } catch (error) {
      console.error('❌ Error getting station status:', error);
      throw error;
    }
  }

  /**
   * Send full vehicle sync to a specific station
   */
  private async sendFullVehicleSync(clientId: string, stationId: string): Promise<void> {
    try {
      console.log(`🚐 Sending full vehicle sync to station ${stationId}`);

      // Get all vehicles authorized for this station
      const vehicles = await prisma.vehicle.findMany({
        where: {
          authorizedStations: {
            some: {
              stationId: stationId
            }
          },
          isActive: true // Only sync active vehicles
        },
        include: {
          driver: {
            select: {
              id: true,
              cin: true,
              phoneNumber: true,
              firstName: true,
              lastName: true,
              originGovernorateId: true,
              originDelegationId: true,
              originAddress: true,
              accountStatus: true,
              isActive: true
            }
          },
          authorizedStations: {
            select: {
              stationId: true,
              createdAt: true
            }
          }
        }
      });

      this.sendToClient(clientId, {
        type: 'vehicle_sync_full',
        payload: {
          vehicles,
          stationId,
          syncTime: new Date().toISOString(),
          count: vehicles.length
        },
        timestamp: Date.now(),
        messageId: `vehicle_sync_${Date.now()}`
      });

      console.log(`✅ Sent ${vehicles.length} vehicles to station ${stationId}`);
    } catch (error) {
      console.error(`❌ Error sending vehicle sync to station ${stationId}:`, error);
      this.sendToClient(clientId, {
        type: 'vehicle_sync_error',
        payload: {
          message: 'Failed to sync vehicles',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Send vehicle update to all stations where this vehicle is authorized
   */
  public async broadcastVehicleUpdate(vehicleId: string, operation: 'update' | 'delete'): Promise<void> {
    try {
      console.log(`🚐 Broadcasting vehicle ${operation}: ${vehicleId}`);

      if (operation === 'delete') {
        // For delete operations, we need to get the authorized stations before the vehicle is deleted
        // This should be called before the actual delete operation
        const vehicle = await prisma.vehicle.findUnique({
          where: { id: vehicleId },
          include: {
            authorizedStations: {
              select: { stationId: true }
            }
          }
        });

        if (vehicle) {
          const stationIds = vehicle.authorizedStations.map(auth => auth.stationId);
          for (const stationId of stationIds) {
            this.sendToStation(stationId, {
              type: 'vehicle_sync_delete',
              payload: {
                vehicleId,
                stationId,
                syncTime: new Date().toISOString()
              },
              timestamp: Date.now(),
              messageId: `vehicle_delete_${vehicleId}_${Date.now()}`
            });
          }
        }
      } else {
        // For update operations, get the current vehicle data and send to authorized stations
        const vehicle = await prisma.vehicle.findUnique({
          where: { id: vehicleId },
          include: {
            driver: {
              select: {
                id: true,
                cin: true,
                phoneNumber: true,
                firstName: true,
                lastName: true,
                originGovernorateId: true,
                originDelegationId: true,
                originAddress: true,
                accountStatus: true,
                isActive: true
              }
            },
            authorizedStations: {
              select: {
                stationId: true,
                createdAt: true
              }
            }
          }
        });

        if (vehicle && vehicle.isActive) {
          const stationIds = vehicle.authorizedStations.map(auth => auth.stationId);
          for (const stationId of stationIds) {
            this.sendToStation(stationId, {
              type: 'vehicle_sync_update',
              payload: {
                vehicle,
                stationId,
                syncTime: new Date().toISOString()
              },
              timestamp: Date.now(),
              messageId: `vehicle_update_${vehicleId}_${Date.now()}`
            });
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error broadcasting vehicle ${operation}:`, error);
    }
  }

  /**
   * Handle vehicle sync acknowledgment from local node
   */
  private async handleVehicleSyncAck(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) return;

    console.log(`✅ Vehicle sync acknowledged by ${client.stationName}: ${payload.messageId}`);
    
    // TODO: Track sync status and handle failed syncs
    // For now, just log the acknowledgment
  }

  /**
   * Handle seat availability response from local station
   */
  private async handleSeatAvailabilityResponse(clientId: string, payload: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) return;

    console.log(`📋 Seat availability response from ${client.stationName}: ${payload.requestId}`);
    
    // Emit event for booking service to handle
    // This allows the booking service to receive real-time seat availability updates
    this.emit('seat_availability_response', {
      stationId: client.stationId,
      requestId: payload.requestId,
      destinationId: payload.destinationId,
      success: payload.success,
      data: payload.data,
      error: payload.error,
      timestamp: payload.timestamp
    });
  }

  public async close(): Promise<void> {
    console.log('🔄 Closing WebSocket Server and cleaning up...');
    
    // Stop heartbeat monitoring
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Mark all authenticated stations as offline in database
    const authenticatedStations = Array.from(this.clients.values())
      .filter(client => client.authenticated && client.stationId);
    
    if (authenticatedStations.length > 0) {
      console.log(`📊 Marking ${authenticatedStations.length} stations as OFFLINE in database...`);
      
      try {
        // Mark all stations offline
        const stationIds = authenticatedStations.map(client => client.stationId!);
        await prisma.station.updateMany({
          where: {
            id: { in: stationIds }
          },
          data: {
            isOnline: false,
            lastHeartbeat: new Date()
          }
        });
        
        console.log(`✅ Successfully marked ${stationIds.length} stations as OFFLINE`);
        
        // Log each station being marked offline
        authenticatedStations.forEach(client => {
          console.log(`🔴 Station marked OFFLINE: ${client.stationName} (${client.stationId})`);
        });
        
      } catch (error) {
        console.error('❌ Error marking stations offline during shutdown:', error);
      }
    }
    
    // Close all client connections
    console.log(`🔌 Closing ${this.clients.size} client connections...`);
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1000, 'Server shutdown');
      }
    });
    
    // Clear clients map
    this.clients.clear();
    
    // Close WebSocket server
    this.wss.close();
    console.log('✅ Central WebSocket Server closed');
  }
}