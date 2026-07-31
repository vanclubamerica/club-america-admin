import 'server-only';

import { AuthorizationError } from '@/lib/auth/guard';
import { GitHubError } from '@/lib/publish/github';
import { MarkerError } from '@/lib/publish/markers';

/**
 * Shared server-action plumbing.
 *
 * Every action returns the same shape so forms can render errors uniformly,
 * and every unexpected failure is translated into something a student officer
 * can actually act on. A raw Postgres error string is useless to them and can
 * leak schema details, so the mapping below is both a usability and a security
 * measure.
 */

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export const EMPTY_STATE: ActionState = {};

/**
 * Wraps an action body, converting thrown errors into a friendly message.
 * Next.js redirect/notFound signals are re-thrown untouched — swallowing them
 * would break navigation.
 */
export async function runAction(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    console.error('[action] failed', err);
    return { error: describeError(err) };
  }
}

/** Next signals control flow by throwing; these must propagate. */
function isNextControlFlow(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest: unknown }).digest === 'string' &&
    ((err as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
      (err as { digest: string }).digest === 'NEXT_NOT_FOUND')
  );
}

export function describeError(err: unknown): string {
  if (err instanceof AuthorizationError) return err.message;
  if (err instanceof GitHubError) return err.message;
  if (err instanceof MarkerError) return err.message;

  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    const message = 'message' in err ? String((err as { message: unknown }).message) : '';

    switch (code) {
      case '23505':
        return 'Something with that name already exists. Try a different one.';
      case '23503':
        return 'That item is still linked to something else and cannot be removed yet.';
      case '23514':
        return 'Some of those values are not allowed. Check the form and try again.';
      case '42501':
      case 'PGRST301':
        return 'You do not have permission to do that. If the site is under emergency lock, the owner needs to lift it first.';
      case 'PGRST116':
        return 'That item no longer exists — someone may have deleted it.';
      default:
        return message || 'Something went wrong. Please try again.';
    }
  }

  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

/** Reads a trimmed string from a form, or null when blank. */
export function optionalString(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function requiredString(form: FormData, key: string, label: string): string {
  const value = optionalString(form, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

export function boolField(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === 'on' || value === 'true' || value === '1';
}

export function intField(form: FormData, key: string, fallback = 0): number {
  const value = Number(form.get(key));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
