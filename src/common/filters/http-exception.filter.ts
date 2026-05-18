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

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : ((res as any).message ?? exception.message);
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError
    ) {
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
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Error de base de datos';
      }
    } else if (
      exception instanceof Prisma.PrismaClientValidationError
    ) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Datos inválidos para la operación solicitada';
    }

    // Logueamos SIEMPRE lo inesperado (5xx) con la traza real para poder
    // depurar en producción; los 4xx solo en debug.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
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
