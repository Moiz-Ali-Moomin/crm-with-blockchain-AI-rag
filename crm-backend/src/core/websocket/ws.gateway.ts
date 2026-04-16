/**
 * WebSocket Gateway
 *
 * Room architecture:
 * - tenant:{tenantId} - for tenant-wide broadcasts (new lead, deal won)
 * - user:{userId}     - for user-specific messages (task assigned, notification)
 *
 * Authentication: JWT validated on handshake via middleware
 * Reconnection: Handled by socket.io client with exponential backoff
 */

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    tenantId: string;
    email: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/ws',
  transports: ['websocket', 'polling'],
})
export class WsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WsGateway.name);
  private connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socket IDs

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server) {
    // JWT authentication middleware on socket handshake
    server.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const payload = this.jwtService.verify(token, {
          secret: this.config.get<string>('JWT_SECRET'),
        });

        socket.data.userId = payload.sub;
        socket.data.tenantId = payload.tenantId;
        socket.data.email = payload.email;

        next();
      } catch {
        next(new Error('Invalid authentication token'));
      }
    });

    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(socket: AuthenticatedSocket) {
    const { userId, tenantId } = socket.data;

    if (!userId || !tenantId) {
      socket.disconnect();
      return;
    }

    // Join rooms for targeted messaging
    socket.join(`user:${userId}`);
    socket.join(`tenant:${tenantId}`);

    // Track connected socket for this user
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socket.id);

    this.logger.debug(`Client connected: ${socket.id} (user: ${userId}, tenant: ${tenantId})`);
  }

  handleDisconnect(socket: AuthenticatedSocket) {
    const { userId } = socket.data;

    if (userId) {
      const sockets = this.connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
    }

    this.logger.debug(`Client disconnected: ${socket.id}`);
  }

  // Client can join additional rooms (e.g., specific deal or ticket threads)
  @SubscribeMessage('join:room')
  handleJoinRoom(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { room: string },
  ) {
    // Only allow joining rooms prefixed with tenant ID to prevent snooping
    const room = `${socket.data.tenantId}:${data.room}`;
    socket.join(room);
    return { success: true, room };
  }

  @SubscribeMessage('leave:room')
  handleLeaveRoom(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { room: string },
  ) {
    const room = `${socket.data.tenantId}:${data.room}`;
    socket.leave(room);
    return { success: true };
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.connectedUsers.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }

  getOnlineUsersInTenant(_tenantId: string): string[] {
    return Array.from(this.connectedUsers.entries())
      .filter(([, sockets]) => sockets.size > 0)
      .map(([userId]) => userId);
  }
}
