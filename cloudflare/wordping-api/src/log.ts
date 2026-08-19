/**
 * Structured diagnostics.
 *
 * Deliberately narrow: this module accepts only scalars, so there is no code
 * path that can serialise a request body, an Authorization header, a
 * RevenueCat token, or user text into the log stream. Callers pass lengths and
 * hashes instead of content. `redactError` strips stack traces, which are never
 * logged and never returned to a client.
 */

export type LogValue = string | number | boolean | null | undefined;

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: LogValue;
}

const CONSOLE: Readonly<Record<LogLevel, (message: string) => void>> = {
  info: message => console.log(message),
  warn: message => console.warn(message),
  error: message => console.error(message),
};

export function log(level: LogLevel, event: string, requestId: string, fields: LogFields = {}): void {
  const entry: Record<string, LogValue> = { event, requestId };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) entry[key] = value;
  }
  CONSOLE[level](JSON.stringify(entry));
}

/**
 * Reduces an unknown thrown value to a name and a short class of failure.
 * The message is included only for `Error` instances and truncated, because
 * upstream SDKs occasionally embed request URLs (which can carry query
 * parameters) into messages.
 */
export function redactError(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message.slice(0, 200) };
  }
  return { errorName: 'UnknownError', errorMessage: '' };
}
