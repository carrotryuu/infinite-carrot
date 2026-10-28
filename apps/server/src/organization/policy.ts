import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@carrot/shared';

export const ACCESS_POLICY = 'access-policy';
export const GLOBAL_READABLE = 'global-readable';
export type AccessPolicy =
  | { kind: 'public'; reason: string }
  | { kind: 'session' }
  | { kind: 'permission'; point: Permission; scope: 'team' | 'project' | 'organization' };
export const Public = (reason: string) =>
  SetMetadata(ACCESS_POLICY, { kind: 'public', reason } satisfies AccessPolicy);
export const Authenticated = () =>
  SetMetadata(ACCESS_POLICY, { kind: 'session' } satisfies AccessPolicy);
export const RequirePermission = (
  point: Permission,
  scope: 'team' | 'project' | 'organization' = 'team',
) => SetMetadata(ACCESS_POLICY, { kind: 'permission', point, scope } satisfies AccessPolicy);
export const GlobalReadable = () => SetMetadata(GLOBAL_READABLE, true);
