import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let dbError = false;
    const isProd = process.env.NODE_ENV === 'production';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : ((res as any).message ?? exception.message);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      dbError = true;
      // Mapeo de los errores de Prisma más comunes a códigos HTTP correctos
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target =
            (exception.meta?.target as string[] | undefined)?.join(', ') ??
            'campo único';
          message = `Ya existe un registro con ese valor (${target})`;
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'El registro solicitado no existe';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Referencia inválida: el recurso relacionado no existe';
          break;
        case 'P2021':
        case 'P2022':
          // Tabla/columna inexistente => esquema desincronizado (faltan migraciones)
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message =
            `La base de datos no está sincronizada con el esquema [${exception.code}]. ` +
            'Aplica las migraciones: `npm run prisma:deploy` (o `npm run db:reset` en dev).';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = isProd
            ? `Error de base de datos [${exception.code}]`
            : `Error de base de datos [${exception.code}]: ${exception.message
                .replace(/\n/g, ' ')
                .slice(0, 300)}`;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      dbError = true;
      status = HttpStatus.BAD_REQUEST;
      message = isProd
        ? 'Datos inválidos para la operación solicitada'
        : `Consulta Prisma inválida: ${exception.message
            .replace(/\n/g, ' ')
            .slice(0, 300)}`;
    } else if (
      exception instanceof Prisma.PrismaClientInitializationError
    ) {
      dbError = true;
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message =
        'No se pudo conectar a la base de datos. Verifica DATABASE_URL y que PostgreSQL esté activo.';
    }

    // 5xx y errores de BD siempre con traza/código real para diagnosticar.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR || dbError) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${JSON.stringify(
          message,
        )}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.debug(
        `${request.method} ${request.url} -> ${status}: ${JSON.stringify(
          message,
        )}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    });
  }
}
