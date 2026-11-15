import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ApiErrorBody } from "@kitchenos/shared";

/**
 * Translates every thrown error — HttpException or not — into the
 * ApiErrorBody shape the frontend expects, and never leaks internal
 * error details for unexpected (500) errors.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = "Internal Server Error";
    let message = "An unexpected error occurred.";

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      error = HttpStatus[statusCode] ?? "Error";
      message =
        typeof body === "string"
          ? body
          : ((body as { message?: string | string[] }).message?.toString() ?? exception.message);
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error("Unknown exception thrown", JSON.stringify(exception));
    }

    const body: ApiErrorBody = {
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: (request.headers["x-request-id"] as string) ?? undefined,
    };

    response.status(statusCode).json(body);
  }
}
