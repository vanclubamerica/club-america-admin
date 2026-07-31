'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAudit, recordLoginAttempt } from '@/lib/audit';
import { checkAccountLockout, checkLoginRateLimit } from '@/lib/auth/rate-limit';
import { publicEnv } from '@/lib/env';

export interface AuthFormState {
  error?: string;
  message?: string;
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
}

/**
 * Sign in.
 *
 * Failures return one deliberately vague message. Telling an attacker whether
 * an email exists, or whether the password was merely wrong, hands them a way
 * to enumerate the club's officer accounts.
 */
export async function signIn(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password } = parsed.data;
  const ip = await clientIp();

  const rate = await checkLoginRateLimit(ip);
  if (!rate.allowed) return { error: rate.reason };

  const lockout = await checkAccountLockout(email);
  if (!lockout.allowed) return { error: lockout.reason };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await recordLoginAttempt(email, false);
    return { error: 'That email and password combination did not work. Please try again.' };
  }

  // Authentication succeeded, but the account still has to be active. A
  // suspended or archived officer must not get a working session.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    await recordLoginAttempt(email, false);
    return {
      error:
        'This login has no admin profile yet. Ask your President or Teacher Sponsor to finish setting up the account.',
    };
  }

  if (profile.status !== 'active') {
    await supabase.auth.signOut();
    await recordLoginAttempt(email, false, profile.full_name);
    return {
      error:
        profile.status === 'suspended'
          ? 'This account is suspended. Contact your President or Teacher Sponsor.'
          : 'This account has been archived and can no longer sign in.',
    };
  }

  await admin
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', profile.id);

  await recordLoginAttempt(email, true, profile.full_name);

  const next = formData.get('next');
  const destination =
    typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
      ? next
      : '/dashboard';

  revalidatePath('/', 'layout');
  redirect(destination);
}

export async function signOut() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      await recordAudit(profile, {
        action: 'logout',
        section: 'Security',
        summary: `${profile.full_name} signed out`,
      });
    }
  }

  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Password reset request.
 *
 * Always reports success, whether or not the address is registered — the
 * response must not reveal which emails have accounts.
 */
export async function requestPasswordReset(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }

  const ip = await clientIp();
  const rate = await checkLoginRateLimit(ip);
  if (!rate.allowed) return { error: rate.reason };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_ADMIN_URL}/update-password`,
  });

  return {
    message:
      'If that email belongs to an admin account, a password reset link is on its way. Check your inbox and spam folder.',
  };
}

const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters — this account can publish to the public website.');

export async function updatePassword(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (password !== confirm) return { error: 'The two passwords do not match.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'This reset link has expired. Request a new one from the sign-in page.' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profile) {
    await admin.from('profiles').update({ must_change_password: false }).eq('id', profile.id);
    await recordAudit(profile, {
      action: 'security',
      section: 'Security',
      summary: `${profile.full_name} changed their password`,
    });
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
