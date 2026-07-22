import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  sub: string;
  email?: string;
  roles: string[];
}

/** Injects the authenticated user (from the JWT) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return req.user;
  },
);
