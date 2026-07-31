'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner, requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAudit } from '@/lib/audit';
import { optionalString, requiredString, runAction, type ActionState } from '@/lib/actions';
import { currentSchoolYear } from '@/lib/utils';
import { ROLE_LABELS, type UserRole } from '@/types/database';

const VALID_ROLES: UserRole[] = [
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'teacher_sponsor',
];

/**
 * Invites a new officer.
 *
 * The account is created ACTIVE but with a forced password change, and the
 * person sets their own password from the emailed link — nobody, including
 * the owner, ever types or sees someone else's password.
 */
export async function inviteOfficer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireOwner();
    const admin = createAdminClient();

    const email = requiredString(formData, 'email', 'Email').toLowerCase();
    const fullName = requiredString(formData, 'full_name', 'Name');
    const role = requiredString(formData, 'role', 'Role') as UserRole;

    if (!VALID_ROLES.includes(role)) return { error: 'Choose one of the five officer roles.' };

    const { data: duplicate } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (duplicate) return { error: 'An account with that email already exists.' };

    const { data: created, error: createError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role, status: 'active' },
    });

    if (createError || !created.user) {
      return { error: `Could not send the invitation: ${createError?.message ?? 'unknown error'}` };
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        full_name: fullName,
        email,
        role,
        status: 'active',
        must_change_password: true,
        school_year_started: currentSchoolYear(),
      })
      .eq('id', created.user.id);

    if (profileError) {
      return { error: `The invitation was sent but the profile could not be set up: ${profileError.message}` };
    }

    await recordAudit(session.profile, {
      action: 'transfer',
      section: 'Leadership',
      entityType: 'profile',
      entityId: created.user.id,
      summary: `${session.profile.full_name} invited ${fullName} as ${ROLE_LABELS[role]}`,
      newValue: { email, role },
    });

    revalidatePath('/transfer');
    return { ok: true, message: `Invitation sent to ${email}.` };
  });
}

/** Suspends or reactivates an account. Owner only. */
export async function setAccountStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireOwner();
    const admin = createAdminClient();

    const targetId = requiredString(formData, 'user_id', 'Account');
    const status = requiredString(formData, 'status', 'Status');

    if (!['active', 'suspended', 'archived'].includes(status)) {
      return { error: 'Choose a valid status.' };
    }

    // The owner cannot lock themselves out — that would leave the club with no
    // one able to manage accounts at all.
    if (targetId === session.userId && status !== 'active') {
      return {
        error:
          'You cannot suspend your own account. Transfer ownership to someone else first, then have them do it.',
      };
    }

    const { data: target } = await admin
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) return { error: 'That account no longer exists.' };

    const { error } = await admin
      .from('profiles')
      .update({ status: status as 'active' | 'suspended' | 'archived' })
      .eq('id', targetId);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'security',
      section: 'Leadership',
      entityType: 'profile',
      entityId: targetId,
      summary: `${session.profile.full_name} set ${target.full_name}'s account to ${status}`,
      previousValue: { status: target.status },
      newValue: { status },
    });

    revalidatePath('/transfer');
    return { ok: true, message: `${target.full_name} is now ${status}.` };
  });
}

/**
 * Hands ownership to another officer.
 *
 * Done as a single logical step so the club is never left with zero owners or
 * two. The database's unique index on `is_owner` enforces that invariant even
 * if this code were called concurrently.
 */
export async function transferOwnership(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireOwner();
    const admin = createAdminClient();

    const targetId = requiredString(formData, 'user_id', 'New owner');
    const confirmation = optionalString(formData, 'confirm');

    if (confirmation !== 'TRANSFER') {
      return { error: 'Type TRANSFER to confirm. This hands over control of the website.' };
    }

    if (targetId === session.userId) return { error: 'You already hold ownership.' };

    const { data: target } = await admin
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) return { error: 'That account no longer exists.' };
    if (target.status !== 'active') {
      return { error: 'Ownership can only be given to an active account.' };
    }

    // Release first: the unique index allows only one owner at a time.
    const { error: releaseError } = await admin
      .from('profiles')
      .update({ is_owner: false })
      .eq('id', session.userId);

    if (releaseError) throw releaseError;

    const { error: assignError } = await admin
      .from('profiles')
      .update({ is_owner: true })
      .eq('id', targetId);

    if (assignError) {
      // Put it back rather than leaving the club with no owner at all.
      await admin.from('profiles').update({ is_owner: true }).eq('id', session.userId);
      throw assignError;
    }

    await recordAudit(session.profile, {
      action: 'transfer',
      section: 'Leadership',
      entityType: 'profile',
      entityId: targetId,
      summary: `${session.profile.full_name} transferred account ownership to ${target.full_name}`,
      previousValue: { owner: session.profile.full_name },
      newValue: { owner: target.full_name },
    });

    revalidatePath('/', 'layout');
    return { ok: true, message: `${target.full_name} is now the account owner.` };
  });
}

/**
 * Archives the outgoing year: freezes the roster and the handoff report into
 * `leadership_terms`, which is delete-protected at the database level.
 */
export async function archiveSchoolYear(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireOwner();
    const supabase = await createClient();
    const admin = createAdminClient();

    const schoolYear = requiredString(formData, 'school_year', 'School year');
    const notes = optionalString(formData, 'notes');

    const { data: existing } = await admin
      .from('leadership_terms')
      .select('id')
      .eq('school_year', schoolYear)
      .maybeSingle();

    if (existing) {
      return { error: `${schoolYear} has already been archived.` };
    }

    const report = await buildHandoffReport(supabase);

    const { error } = await admin.from('leadership_terms').insert({
      school_year: schoolYear,
      roster: report.officers as never,
      handoff_report: report as never,
      notes,
      archived_by: session.userId,
      archived_by_name: session.profile.full_name,
    });

    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'transfer',
      section: 'Leadership',
      summary: `${session.profile.full_name} archived the ${schoolYear} leadership term`,
      newValue: { school_year: schoolYear },
    });

    revalidatePath('/transfer');
    return { ok: true, message: `${schoolYear} archived. It can never be deleted.` };
  });
}

export interface HandoffReport {
  generatedAt: string;
  schoolYear: string;
  website: {
    lastPublishedAt: string | null;
    lastPublishedSha: string | null;
    publishingEnabled: boolean;
    activeTheme: string;
  };
  officers: Array<{ position: string; name: string; hasPhoto: boolean; hasBio: boolean }>;
  accounts: Array<{ name: string; email: string; role: string; status: string; isOwner: boolean }>;
  sponsors: Array<{ name: string; tier: string; website: string | null }>;
  documents: Array<{ name: string; category: string; uploadedBy: string }>;
  counts: { news: number; events: number; members: number };
  meeting: { day: string | null; time: string | null; location: string | null };
}

/**
 * Everything a new president needs on day one, gathered in one place.
 * Generated on demand so it is never out of date.
 */
export async function buildHandoffReport(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<HandoffReport> {
  const { data: settings } = await supabase.from('settings').select('*').eq('id', true).single();
  const { data: officers } = await supabase.from('officers').select('*').order('sort_order');
  const { data: accounts } = await supabase.from('profiles').select('*').order('role');
  const { data: sponsors } = await supabase.from('sponsors').select('*').order('tier');
  const { data: documents } = await supabase.from('documents').select('*').order('name');

  const [news, events, members] = await Promise.all([
    supabase.from('news_posts').select('id', { count: 'exact', head: true }),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('members').select('id', { count: 'exact', head: true }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    schoolYear: currentSchoolYear(),
    website: {
      lastPublishedAt: settings?.last_published_at ?? null,
      lastPublishedSha: settings?.last_published_sha ?? null,
      publishingEnabled: settings?.publishing_enabled ?? true,
      activeTheme: settings?.active_theme_key ?? 'normal',
    },
    officers: (officers ?? []).map((o) => ({
      position: o.position_title,
      name: o.name,
      hasPhoto: Boolean(o.photo_path),
      hasBio: Boolean(o.bio),
    })),
    accounts: (accounts ?? []).map((a) => ({
      name: a.full_name,
      email: a.email,
      role: ROLE_LABELS[a.role],
      status: a.status,
      isOwner: a.is_owner,
    })),
    sponsors: (sponsors ?? []).map((s) => ({
      name: s.name,
      tier: s.tier,
      website: s.website_url,
    })),
    documents: (documents ?? []).map((d) => ({
      name: d.name,
      category: d.category ?? 'general',
      uploadedBy: d.uploader_name,
    })),
    counts: {
      news: news.count ?? 0,
      events: events.count ?? 0,
      members: members.count ?? 0,
    },
    meeting: {
      day: settings?.meeting_day ?? null,
      time: settings?.meeting_time ?? null,
      location: settings?.meeting_location ?? null,
    },
  };
}

export async function generateHandoffReport(): Promise<HandoffReport> {
  await requireUser();
  const supabase = await createClient();
  return buildHandoffReport(supabase);
}
