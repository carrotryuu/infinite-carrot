import { createContext, useContext } from 'react';
import { Permission, type OrganizationContext } from '@carrot/shared';

// T02 receives the fixed PoC principal's capabilities from the server.
// T04 replaces the capability source with authenticated team membership.
export function usePocPermission(permissions: Permission[], required: Permission) {
  return permissions.includes(required);
}
export const PermissionsContext = createContext<OrganizationContext | null>(null);
export function usePermission(point: Permission, projectId?: string) {
  const context = useContext(PermissionsContext);
  if (!context) return false;
  if (point === Permission.AccountManage || point === Permission.GlobalView)
    return context.organizationPermissions.includes(point);
  return (
    (projectId
      ? context.projects.find((project) => project.id === projectId)?.permissions
      : context.permissions
    )?.includes(point) ?? false
  );
}
