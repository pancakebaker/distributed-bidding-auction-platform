/** Application-specific authentication claim and permission identifiers. */
export const applicationClaimNames = {
  permissions: 'permissions',
  role: 'role',
} as const;

/** Application role values consumed by live-feed authorization. */
export const applicationRoles = {
  admin: 'admin',
} as const;

/** Permissions consumed by live-feed authorization. */
export const applicationPermissions = {
  liveFeedAdmin: 'access-live-feed-admin',
} as const;
