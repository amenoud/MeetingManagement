// Structured JSON logs on stdout (PLAN-PLT-01, ADR-0011). Every argument goes through scrub(); the
// request context (request_id, tenant_id, user_id) is added automatically.
import pino, { type DestinationStream, type Logger } from 'pino';
import { currentContext } from './context.ts';
import { scrub } from './redact.ts';

export type { Logger };

export interface LoggerOptions {
  level?: string;
  /** Where lines are written (default: stdout). Tests pass a collecting stream. */
  destination?: DestinationStream;
  service?: string;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const settings: pino.LoggerOptions = {
    level: options.level ?? 'info',
    base: { service: options.service ?? 'meetingmanagement' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    // Errors are scrubbed by scrub() (see redact.ts), not by pino's default serializer.
    serializers: { err: (value: unknown) => value },
    mixin() {
      const context = currentContext();
      if (!context) return {};
      return {
        request_id: context.requestId,
        ...(context.tenantId ? { tenant_id: context.tenantId } : {}),
        ...(context.userId ? { user_id: context.userId } : {}),
      };
    },
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map((argument) => scrub(argument)) as Parameters<typeof method>);
      },
    },
  };
  return options.destination ? pino(settings, options.destination) : pino(settings);
}

let current: Logger | undefined;

/** Sets the process-wide logger (called once at startup with the configured level). */
export function initLogger(options: LoggerOptions = {}): Logger {
  current = createLogger(options);
  return current;
}

/** The process-wide logger (an info-level default if initLogger was not called). */
export function getLogger(): Logger {
  current ??= createLogger();
  return current;
}
