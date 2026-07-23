import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

// Allow BigInt (e.g. media sizeBytes) to serialize to JSON as a string.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true, // needed for Razorpay webhook signature verification
  });

  // Local upload storage (avatars). In production this moves to S3/R2.
  mkdirSync(join(process.cwd(), 'uploads', 'avatars'), { recursive: true });
  mkdirSync(join(process.cwd(), 'uploads', 'resources'), { recursive: true });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // Structured logging (pino)
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // CORS — allow the configured client origins (CLIENT_URL may be a
  // comma-separated list) plus the known production/dev origins. We match on a
  // NORMALISED origin (trailing slash + case stripped) and echo the exact
  // request origin back — never "*", so credentialed requests are permitted.
  const DEFAULT_ORIGINS = [
    'http://localhost:3000',
    'https://webhackacademy.vercel.app',
  ];
  const normalizeOrigin = (o: string) =>
    o.trim().replace(/\/+$/, '').toLowerCase();
  const allowedOrigins = new Set(
    [...DEFAULT_ORIGINS, ...config.get('CLIENT_URL', { infer: true }).split(',')]
      .map(normalizeOrigin)
      .filter(Boolean),
  );

  app.enableCors({
    origin(origin, callback) {
      // No Origin header → non-browser client (curl, server-to-server) or
      // a same-origin request (e.g. Swagger UI). Always allow those.
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  // URI versioning → /v1/*
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  // Global validation — DTOs enforced, unknown props rejected
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger / OpenAPI at /v1/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('WebHack Academy API')
    .setDescription('WebHack Academy LMS — backend API')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearerAuth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    jsonDocumentUrl: 'v1/openapi.json',
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`API listening on ${config.get('APP_URL', { infer: true })}/v1`);
  logger.log(`Swagger UI at ${config.get('APP_URL', { infer: true })}/v1/docs`);
}

void bootstrap();
