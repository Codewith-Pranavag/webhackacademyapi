import { SetMetadata } from '@nestjs/common';

export type AppRole = 'student' | 'instructor' | 'admin';

export const ROLES_KEY = 'roles';

/** Restricts a route/controller to users holding at least one of the given roles. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
