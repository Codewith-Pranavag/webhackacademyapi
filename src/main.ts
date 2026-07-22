import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Structured logging (pino)
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: [config.get('CLIENT_URL', { infer: true })],
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
