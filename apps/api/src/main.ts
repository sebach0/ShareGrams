import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { EnvConfig } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = app.get(ConfigService<EnvConfig, true>);
  const port = config.get('port', { infer: true });

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ShareGrams API escuchando en http://localhost:${port}`);
}

bootstrap();
