import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Rate limiting and account lockout, backed by Postgres.
 *
 * Deliberately not Redis: this keeps the whole platform on free tiers with one
 * fewer service for a future officer to renew, and the club's traffic is a few
 * logins a week — a table with an atomic counter is more than sufficient.
 */

export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };
export const LOGIN_LOCKOUT = { maxFailures: 5, windowMinutes: 15, lockoutMinutes: 15 };
export const UPLOAD_RATE_LIMIT = { limit: 40, windowMs: 60 * 60 * 1000 };
export const PUBLISH_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Fixed-window counter. Fails OPEN on infrastructure errors — locking every
 * officer out of their own dashboard because of a transient database blip
 * would be a worse outcome than briefly allowing extra attempts, and account
 * lockout below still protects credentials.
 */
export async function consumeRateLimit(
  bucket: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_bucket: bucket,
      p_limit: limit,
      p_window_ms: windowMs,
    });

    if (error) {
      console.error('[rate-limit] check failed, allowing request', error);
      return true;
    }

    return data !== false;
  } catch (err) {
    console.error('[rate-limit] unexpected failure, allowing request', err);
    return true;
  }
}

/**
 * Account lockout: N failed sign-ins for one email within the window locks
 * that account temporarily. Keyed on email rather than IP so an attacker
 * rotating addresses still trips it.
 */
export async function checkAccountLockout(email: string): Promise<RateLimitResult> {
  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - LOGIN_LOCKOUT.windowMinutes * 60_000).toISOString();

    const { data, error } = await supabase
      .from('login_attempts')
      .select('succeeded, created_at')
      .eq('email', email.toLowerCase())
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) return { allowed: true };

    // Only failures since the most recent success count toward a lockout, so
    // a successful sign-in clears the slate.
    const failuresSinceSuccess: typeof data = [];
    for (const attempt of data) {
      if (attempt.succeeded) break;
      failuresSinceSuccess.push(attempt);
    }

    if (failuresSinceSuccess.length >= LOGIN_LOCKOUT.maxFailures) {
      return {
        allowed: false,
        reason:
          `Too many failed sign-in attempts. This account is locked for ` +
          `${LOGIN_LOCKOUT.lockoutMinutes} minutes. If this was not you, contact your ` +
          `President or Teacher Sponsor — they can force a password reset.`,
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error('[lockout] check failed, allowing request', err);
    return { allowed: true };
  }
}

/** Throttles sign-in attempts per IP, independent of which account is targeted. */
export async function checkLoginRateLimit(ip: string | null): Promise<RateLimitResult> {
  const allowed = await consumeRateLimit(
    `login:${ip ?? 'unknown'}`,
    LOGIN_RATE_LIMIT.limit,
    LOGIN_RATE_LIMIT.windowMs
  );

  return allowed
    ? { allowed: true }
    : { allowed: false, reason: 'Too many sign-in attempts. Please wait a few minutes.' };
}
