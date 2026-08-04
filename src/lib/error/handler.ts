import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logging/logger';

const errorLogger = createLogger('error-handler');

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    errorLogger.warn(`App error: ${error.message}`, {
      statusCode: error.statusCode,
      code: error.code,
      details: error.details,
    });

    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(process.env.NODE_ENV === 'development' && { details: error.details }),
      },
      { status: error.statusCode },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: 'Invalid request format.' },
      { status: 400 },
    );
  }

  errorLogger.error('Unhandled error', error);
  return NextResponse.json(
    { error: 'An unexpected error occurred. Please try again.' },
    { status: 500 },
  );
}

type ApiHandler = (...args: unknown[]) => Promise<Response> | Response;

export function withErrorHandler(handler: ApiHandler) {
  return async (...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}
