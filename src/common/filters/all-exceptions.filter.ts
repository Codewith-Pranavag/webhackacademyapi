import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
    timestamp: string;
  };
}

const STATUS_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL',
  501: 'NOT_IMPLEMENTED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Converts any thrown error into the standard API error envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        message = (p.message as string) ?? exception.message;
        // class-validator returns message: string[]
        if (Array.isArray(p.message)) {
          message = 'Validation failed';
          details = p.message;
        }
        if (typeof p.code === 'string') code = p.code;
        if (p.details !== undefined) details = p.details;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const requestId =
      (req.headers['x-request-id'] as string) ??
      (req.headers['x-correlation-id'] as string) ??
      undefined;

    const body: ErrorBody = {
      error: {
        code: code ?? STATUS_CODE[status] ?? 'ERROR',
        message,
        ...(details !== undefined ? { details } : {}),
        ...(requestId ? { requestId } : {}),
        timestamp: new Date().toISOString(),
      },
    };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${status}: ${message}`);
    }

    res.status(status).json(body);
  }
}
