import type { Permission } from '@carrot/shared';

// T02 receives the fixed PoC principal's capabilities from the server.
// T04 replaces the capability source with authenticated team membership.
export function usePermission(permissions: Permission[], required: Permission) {
  return permissions.includes(required);
}
