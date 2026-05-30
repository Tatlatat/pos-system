import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  branchId?: string;
  fullName: string;
}

const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

@WebSocketGateway({
  cors: { origin: CORS_ORIGIN, credentials: true },
  namespace: '/dashboard',
})
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private connectedClients = new Map<string, { userId: string; role: string; branchId?: string }>();

  handleConnection(client: Socket) {
    const token = client.handshake.query?.token as string;
    if (!token) {
      this.logger.warn(`WS rejected: no token (${client.id})`);
      client.disconnect();
      return;
    }
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET not configured');
      const payload = jwt.verify(token, secret) as JwtPayload;

      // Store verified user info
      this.connectedClients.set(client.id, {
        userId: payload.sub,
        role: payload.role,
        branchId: payload.branchId,
      });

      // Auto-join rooms based on permissions
      if (payload.role === 'SUPER_ADMIN' || payload.role === 'OWNER') {
        client.join('all');
      }
      if (payload.branchId) {
        client.join(`branch:${payload.branchId}`);
      }

      this.logger.log(`WS connected: ${payload.fullName} (${payload.role})`);
    } catch {
      this.logger.warn(`WS rejected: invalid token (${client.id})`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`WS disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket) {
    // Rooms already joined in handleConnection — no client input needed
    const info = this.connectedClients.get(client.id);
    return { status: 'ok', user: info ? { role: info.role, branchId: info.branchId } : null };
  }

  emitNewSale(saleData: any) {
    this.server.to('all').emit('new-sale', saleData);
    if (saleData.branchId) this.server.to(`branch:${saleData.branchId}`).emit('new-sale', saleData);
  }

  emitLowStockAlert(alert: any) {
    this.server.to('all').emit('low-stock-alert', alert);
    if (alert.branchId) this.server.to(`branch:${alert.branchId}`).emit('low-stock-alert', alert);
  }

  emitRefresh(type: string, data?: any) {
    this.server.to('all').emit('refresh', { type, data });
    if (data?.branchId) this.server.to(`branch:${data.branchId}`).emit('refresh', { type, data });
  }
}
