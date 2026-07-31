import 'server-only';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Settings } from '@/types/database';

/**
 * The single authorization chokepoint.
 *
 * Every server action and protected page funnels through `requireUser()` (or
 * one of its stricter variants). Middleware alone is not enough — it only sees
 * cookies, not account status, so a user suspended mid-session would keep
 * working until their token expired. These helpers re-check the live database
 * record on every request.
 */

export interface AdminSession {
  userId: string;
  email: string;
  profile: Profile;
  settings: Settings;
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly code: 'unauthenticated' | 'inactive' | 'not_owner' | 'locked'
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** Returns the session, or null when signed out / not provisioned. */
export async function getSession(): Promise<AdminSession | null> {
  const supabase = await createClient();

  // getUser() revalidates the JWT with Supabase rather than trusting a cookie
  // that could have been tampered with locally.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Kicked off together, awaited separately: Promise.all would widen these two
  // different row types into a union and lose the field types.
  const profileQuery = supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const settingsQuery = supabase.from('settings').select('*').eq('id', true).maybeSingle();

  const { data: profile } = await profileQuery;
  const { data: settings } = await settingsQuery;

  if (!profile || !settings) return null;

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    settings,
  };
}

/**
 * Requires an authenticated, ACTIVE account. Redirects rather than throwing so
 * it can be called directly at the top of a page component.
 */
export async function requireUser(): Promise<AdminSession> {
  const session = await getSession();

  if (!session) redirect('/login');

  if (session.profile.status !== 'active') {
    // Suspended or archived accounts are pushed straight back out, even if
    // their session cookie is still technically valid.
    redirect(`/login?error=${session.profile.status}`);
  }

  return session;
}

/**
 * Requires ownership. The Owner flag — plus the Teacher Sponsor break-glass
 * account — gates account management, emergency lock, and ownership transfer.
 * Content permissions remain equal across all five roles.
 */
export async function requireOwner(): Promise<AdminSession> {
  const session = await requireUser();

  if (!session.profile.is_owner && !session.profile.is_break_glass) {
    throw new AuthorizationError(
      'This action is limited to the account owner. Ask your President or Teacher Sponsor.',
      'not_owner'
    );
  }

  return session;
}

/**
 * Requires an active account AND that the site is not emergency-locked.
 * Use for any action that changes content or publishes.
 */
export async function requireEditor(): Promise<AdminSession> {
  const session = await requireUser();

  if (session.settings.emergency_lock) {
    throw new AuthorizationError(
      session.settings.emergency_lock_reason
        ? `The site is under emergency lock: ${session.settings.emergency_lock_reason}`
        : 'The site is under emergency lock. Editing and publishing are disabled.',
      'locked'
    );
  }

  return session;
}

/** Publishing additionally respects the `publishing_enabled` kill switch. */
export async function requirePublisher(): Promise<AdminSession> {
  const session = await requireEditor();

  if (!session.settings.publishing_enabled) {
    throw new AuthorizationError(
      'Publishing to the public website is currently disabled in Settings.',
      'locked'
    );
  }

  return session;
}

export function isOwner(profile: Profile): boolean {
  return profile.is_owner || profile.is_break_glass;
}
