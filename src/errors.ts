import type { SafeNpmError } from './types.js';

const BLOCKED_PATTERNS = [
  /\b403\b/i,
  /\bforbidden\b/i,
  /\bunavailable\b/i,
  /\bquarantined\b/i,
  /\bblocked\b/i,
  /\bdenied\b/i,
  /package unavailable/i,
  /not found in registry/i,
];

export function isBlockedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as SafeNpmError;
  const status = err.statusCode ?? (err as { status?: number }).status;
  const code = err.code?.toUpperCase();

  if (status === 403 || code === 'E403' || code === 'FORBIDDEN') {
    return true;
  }

  const message = err.message ?? String(error);
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(message));
}

export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as SafeNpmError;
  const code = err.code?.toUpperCase();
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED'
  );
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
