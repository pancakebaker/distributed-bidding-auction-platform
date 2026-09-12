/** Session claims carried by a single-use browser handoff code. */
export type AdminHandoffClaims = {
  sub: string;
  role: string;
  permissions: string[];
};

/** Stores opaque browser handoff codes for one-time redemption. */
export interface AdminHandoffStore {
  create(claims: AdminHandoffClaims, expiresAt: Date): Promise<string>;
  consume(code: string): Promise<AdminHandoffClaims | undefined>;
}
