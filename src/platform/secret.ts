import { inspect } from 'node:util';

const MASK = '[REDACTED]';

/**
 * Holds a secret value so it cannot reach a log, a JSON response or a console by accident.
 * Only reveal() returns the value: call it at the single point of use (pool, SMTP, S3).
 */
export class Secret<T = string> {
  readonly #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  reveal(): T {
    return this.#value;
  }

  toString(): string {
    return MASK;
  }

  toJSON(): string {
    return MASK;
  }

  [inspect.custom](): string {
    return `Secret(${MASK})`;
  }
}
