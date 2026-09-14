/** Application port for revoking public auction-room memberships for one tenant. */
export interface TenantRoomEvictor {
  evictTenantRooms(tenantId: string): Promise<void>;
}
