import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cabeceras de seguridad. CSP desactivada (rompe Swagger UI) y CORP
  // en cross-origin porque la API se consume desde otro puerto/dominio.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Límite de tamaño del body (defensa básica ante payloads enormes)
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // CORS — lista blanca de orígenes (FRONTEND_URL admite varios separados por coma)
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir herramientas sin origin (curl, health checks, apps móviles)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origen no permitido por CORS: ${origin}`));
      }
    },
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Documentation — deshabilitada en producción salvo SWAGGER_ENABLED=true
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true';
  const config = new DocumentBuilder()
    .setTitle('TrazApp API')
    .setDescription(
      'API para gestión de proyectos y actividades con sistema de etapas y aprobaciones',
    )
    .setVersion('1.0')
    .addTag('auth', 'Autenticación y autorización')
    .addTag('users', 'Gestión de usuarios')
    .addTag('projects', 'Gestión de proyectos')
    .addTag('stages', 'Gestión de etapas')
    .addTag('activities', 'Gestión de actividades')
    .addTag('tags', 'Gestión de etiquetas')
    .addTag('comments', 'Comentarios en actividades')
    .addTag('stage-changes', 'Solicitudes de cambio de etapa')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Ingresa tu token JWT',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'TrazApp API Docs',
      customfavIcon: 'https://nestjs.com/img/logo-small.svg',
      customCss: '.swagger-ui .topbar { display: none }',
    });
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Servidor corriendo en http://localhost:${port}/api`);
  if (swaggerEnabled) {
    console.log(
      `📚 Documentación Swagger en http://localhost:${port}/api/docs`,
    );
  }
}
bootstrap();
