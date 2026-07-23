import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, type AppRole } from '../decorators/roles.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Enforces @Roles(). Runs after JwtAuthGuard (which populates req.user).
 * Routes without @Roles() are allowed for any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    const roles = req.user?.roles ?? [];
    const allowed = required.some((r) => roles.includes(r));
    if (!allowed) {
      throw new ForbiddenException('You do not have permission to do this.');
    }
    return true;
  }
}
