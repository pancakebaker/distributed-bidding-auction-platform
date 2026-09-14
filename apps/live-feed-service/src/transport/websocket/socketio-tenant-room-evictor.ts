/** Socket.IO adapter for revoking public auction rooms after tenant disablement. */
import type { Server } from 'socket.io';
import type { TenantRoomEvictor } from '../../application/ports/tenant-room-evictor.js';
import { auctionRoomPrefix } from './rooms.js';

const tenantEvictionEvent = 'live-feed:tenant-rooms-evict';

type TenantEvictionServer = Server & {
  serverSideEmit?: (event: string, ...args: unknown[]) => void;
};

/**
 * Removes every locally visible public auction room for a tenant. The Redis adapter
 * server-side event asks other Live Feed instances to perform the same local scan.
 */
export class SocketIoTenantRoomEvictor implements TenantRoomEvictor {
  private readonly io: TenantEvictionServer;

  public constructor(io: Server) {
    this.io = io as TenantEvictionServer;
    this.io.on(tenantEvictionEvent, (tenantId: string) => {
      this.evictLocalTenantRooms(tenantId);
    });
  }

  /** Evicts all public auction rooms currently visible for the tenant. */
  public async evictTenantRooms(tenantId: string): Promise<void> {
    this.evictLocalTenantRooms(tenantId);
    await Promise.resolve();
    if (this.io.serverSideEmit) {
      this.io.serverSideEmit(tenantEvictionEvent, tenantId);
    }
  }

  private evictLocalTenantRooms(tenantId: string): void {
    const prefix = auctionRoomPrefix(tenantId);
    const rooms = [...this.io.of('/').adapter.rooms.keys()].filter((room) =>
      room.startsWith(prefix),
    );

    for (const room of rooms) {
      this.io.in(room).emit('auction:subscription-revoked', {
        code: 'live_feed_unavailable',
      });
      this.io.in(room).socketsLeave(room);
    }
  }
}
