// Expected errors and their translation to an HTTP response (PLAN-PLT-01).
// Rule: only AppError messages ever reach a user. Any other error becomes a generic response and is
// logged (scrubbed) with the request id, so support can find it without the user seeing internals.

import type { Translator } from './i18n/translator.ts';

/**
 * An error the caller can safely show: `message` is PUBLIC text (no data, no SQL, no identifiers of
 * other tenants). `code` is stable and is what the UI localizes (FR/DE/EN, PLT-02).
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  /** `defaultMessage` (English) is only a fallback: the user sees the message `errors.<code>` of the catalogs. */
  constructor(code: string, status: number, defaultMessage: string, options?: ErrorOptions) {
    super(defaultMessage, options);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export interface HttpErrorBody {
  error: { code: string; message: string; requestId: string };
}

const GENERIC_MESSAGE =
  'An unexpected error occurred. Quote the request id when contacting support.';

/** Never reads `message` of anything that is not an AppError. */
export function toHttpError(
  error: unknown,
  requestId: string,
  translator?: Translator<string>,
): { status: number; body: HttpErrorBody } {
  const localized = (code: string, fallback: string): string =>
    translator?.has(`errors.${code}`) ? translator.t(`errors.${code}`) : fallback;
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: { code: error.code, message: localized(error.code, error.message), requestId },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: 'internal_error',
        message: localized('internal_error', GENERIC_MESSAGE),
        requestId,
      },
    },
  };
}
