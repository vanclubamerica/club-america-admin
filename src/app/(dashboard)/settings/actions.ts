'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor, requireOwner } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAudit, describeChanges } from '@/lib/audit';
import { boolField, optionalString, runAction, type ActionState } from '@/lib/actions';
import { sanitizeUrl } from '@/lib/publish/sanitize';

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('settings')
      .select('*')
      .eq('id', true)
      .single();

    const socials = {
      social_instagram: sanitizeUrl(optionalString(formData, 'social_instagram')),
      social_tiktok: sanitizeUrl(optionalString(formData, 'social_tiktok')),
      social_facebook: sanitizeUrl(optionalString(formData, 'social_facebook')),
    };

    const payload = {
      meeting_day: optionalString(formData, 'meeting_day'),
      meeting_time: optionalString(formData, 'meeting_time'),
      meeting_location: optionalString(formData, 'meeting_location'),
      contact_email: optionalString(formData, 'contact_email'),
      contact_address_line1: optionalString(formData, 'contact_address_line1'),
      contact_address_line2: optionalString(formData, 'contact_address_line2'),
      google_calendar_id: optionalString(formData, 'google_calendar_id'),
      ...socials,
      updated_by: session.userId,
    };

    const { error } = await supabase.from('settings').update(payload).eq('id', true);
    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'update',
      section: 'Settings',
      summary: describeChanges(
        session.profile.full_name,
        'updated',
        'site settings',
        existing,
        payload
      ),
      previousValue: existing,
      newValue: payload,
    });

    revalidatePath('/', 'layout');
    return { ok: true, message: 'Settings saved. Publish to update the website.' };
  });
}

/**
 * Publishing kill switch and emergency lock — owner only.
 *
 * These are the controls that matter if an account is ever compromised, so
 * they are gated behind ownership rather than the equal content permissions
 * every officer shares.
 */
export async function setPublishingEnabled(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireOwner();
    const admin = createAdminClient();

    const enabled = boolField(formData, 'enabled');

    const { error } = await admin
      .from('settings')
      .update({ publishing_enabled: enabled, updated_by: session.userId })
      .eq('id', true);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'security',
      section: 'Security',
      summary: `${session.profile.full_name} ${enabled ? 'enabled' : 'paused'} publishing to the website`,
      newValue: { publishing_enabled: enabled },
    });

    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: enabled ? 'Publishing re-enabled.' : 'Publishing paused. Nothing can reach the public site.',
    };
  });
}

export async function setEmergencyLock(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireOwner();
    const admin = createAdminClient();

    const locked = boolField(formData, 'locked');
    const reason = optionalString(formData, 'reason');

    const { error } = await admin
      .from('settings')
      .update({
        emergency_lock: locked,
        emergency_lock_reason: locked ? reason : null,
        emergency_locked_at: locked ? new Date().toISOString() : null,
        emergency_locked_by: locked ? session.userId : null,
        // Locking also stops publishing; unlocking does not silently resume it.
        publishing_enabled: locked ? false : false,
        updated_by: session.userId,
      })
      .eq('id', true);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'security',
      section: 'Security',
      summary: locked
        ? `${session.profile.full_name} activated the EMERGENCY LOCK${reason ? `: ${reason}` : ''}`
        : `${session.profile.full_name} lifted the emergency lock`,
      newValue: { emergency_lock: locked, reason },
    });

    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: locked
        ? 'Emergency lock active. All editing and publishing is disabled for everyone.'
        : 'Emergency lock lifted. Publishing stays paused until you turn it back on.',
    };
  });
}

/** Forces a password reset email for one account. Owner only. */
export async function forcePasswordReset(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireOwner();
    const admin = createAdminClient();

    const targetId = optionalString(formData, 'user_id');
    if (!targetId) return { error: 'Choose an account.' };

    const { data: target } = await admin
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) return { error: 'That account no longer exists.' };

    await admin.from('profiles').update({ must_change_password: true }).eq('id', targetId);

    const { error } = await admin.auth.resetPasswordForEmail(target.email);
    if (error) return { error: `Could not send the reset email: ${error.message}` };

    await recordAudit(session.profile, {
      action: 'security',
      section: 'Security',
      summary: `${session.profile.full_name} forced a password reset for ${target.full_name}`,
      entityType: 'profile',
      entityId: targetId,
    });

    revalidatePath('/settings');
    return { ok: true, message: `A password reset email was sent to ${target.email}.` };
  });
}
