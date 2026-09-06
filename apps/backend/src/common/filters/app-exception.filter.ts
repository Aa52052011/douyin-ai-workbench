import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '../errors/app-error.js';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof AppError) {
      const body = exception.getResponse() as { code: string; message: string };
      response.status(exception.getStatus()).json(body);
      return;
    }

    if (isMulterFileTooLarge(exception)) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Import file is too large',
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (status === HttpStatus.BAD_REQUEST && isValidationResponse(raw)) {
        response.status(status).json({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
        });
        return;
      }
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        response.status(HttpStatus.BAD_REQUEST).json({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Import file is too large',
        });
        return;
      }
      if (status === HttpStatus.UNAUTHORIZED) {
        response.status(status).json({
          code: ErrorCode.AUTH_UNAUTHORIZED,
          message: 'Authentication required',
        });
        return;
      }
      const message = typeof raw === 'string' ? raw : 'Request failed';
      response.status(status).json({
        code: ErrorCode.AUTH_UNAUTHORIZED,
        message,
      });
      return;
    }

    this.logger.error(
      `Unhandled error on ${request.method} ${request.path}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}

function isMulterFileTooLarge(exception: unknown): boolean {
  return Boolean(
    exception &&
      typeof exception === 'object' &&
      'code' in exception &&
      (exception as { code?: string }).code === 'LIMIT_FILE_SIZE',
  );
}

function isValidationResponse(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { message?: unknown }).message)
  );
}
