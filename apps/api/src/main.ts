import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { I18nExceptionFilter, I18nResponseInterceptor } from './common/i18n/i18n.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Messages in Arabic when the user chose Arabic (X-Lang header or erp_lang cookie).
  app.useGlobalFilters(new I18nExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.useGlobalInterceptors(new I18nResponseInterceptor());

  const swagger = new DocumentBuilder()
    .setTitle('ERP API')
    .setDescription(
      'REST API of the ERP. Log in with POST /api/v1/auth/login, then click "Authorize" and paste the accessToken.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  Logger.log(`API ready on http://localhost:${port}/api/v1 — docs on /api/docs`, 'Bootstrap');
}

void bootstrap();
