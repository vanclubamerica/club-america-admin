import 'server-only';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROLE_LABELS, type Json, type Profile } from '@/types/database';

/**
 * Audit trail.
 *
 * Writes go through the service role because `authenticated` deliberately has
 * no INSERT policy on audit_logs — that way a user can never forge or suppress
 * an entry from the browser. The table also rejects UPDATE/DELETE at the
 * trigger level, so these records are permanent once written.
 */

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'restore'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'security'
  | 'transfer'
  | 'upload';

export interface AuditEntry {
  action: AuditAction;
  section: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/** Best-effort client attribution; behind Vercel the real IP is in a header. */
async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    return {
      ip: forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip'),
      userAgent: h.get('user-agent'),
    };
  } catch {
    // Outside a request scope (e.g. a CLI script).
    return { ip: null, userAgent: null };
  }
}

/**
 * Records an action. Never throws: a logging failure must not roll back the
 * user's actual work, but it is surfaced in server logs so it gets noticed.
 */
export async function recordAudit(actor: Profile | null, entry: AuditEntry): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext();
    const supabase = createAdminClient();

    const { error } = await supabase.from('audit_logs').insert({
      actor_id: actor?.id ?? null,
      actor_name: actor?.full_name ?? 'System',
      actor_role: actor ? ROLE_LABELS[actor.role] : null,
      action: entry.action,
      section: entry.section,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      summary: entry.summary,
      previous_value: (entry.previousValue ?? null) as Json,
      new_value: (entry.newValue ?? null) as Json,
      ip_address: ip,
      user_agent: userAgent,
    });

    if (error) {
      console.error('[audit] failed to record entry', { entry, error });
    }
  } catch (err) {
    console.error('[audit] unexpected failure', err);
  }
}

/**
 * Logs an attempt to sign in. Recorded for both outcomes so the Activity Logs
 * screen can surface brute-force patterns against a specific account.
 */
export async function recordLoginAttempt(
  email: string,
  succeeded: boolean,
  actorName?: string
): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext();
    const supabase = createAdminClient();

    await supabase.from('login_attempts').insert({
      email: email.toLowerCase(),
      ip_address: ip,
      succeeded,
    });

    await supabase.from('audit_logs').insert({
      actor_name: actorName ?? email,
      action: succeeded ? 'login' : 'login_failed',
      section: 'Security',
      summary: succeeded
        ? `${actorName ?? email} signed in`
        : `Failed sign-in attempt for ${email}`,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (err) {
    console.error('[audit] failed to record login attempt', err);
  }
}

/**
 * Produces a readable one-line diff summary, e.g.
 *   "Brant Borden edited About Page (heading, paragraphs)"
 * Falls back gracefully when either side is not a plain object.
 */
export function describeChanges(
  actorName: string,
  verb: string,
  subject: string,
  before?: unknown,
  after?: unknown
): string {
  const changed = changedKeys(before, after);
  if (changed.length === 0) return `${actorName} ${verb} ${subject}`;
  return `${actorName} ${verb} ${subject} (${changed.join(', ')})`;
}

function changedKeys(before: unknown, after: unknown): string[] {
  if (!isPlainObject(before) || !isPlainObject(after)) return [];

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];

  for (const key of keys) {
    // Timestamps and audit columns change on every write and would drown out
    // the fields a human actually cares about.
    if (key === 'updated_at' || key === 'updated_by' || key === 'created_at') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(humanizeKey(key));
    }
  }

  return changed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ');
}
