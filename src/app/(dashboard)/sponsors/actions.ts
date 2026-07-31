'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit';
import {
  boolField,
  intField,
  optionalString,
  requiredString,
  runAction,
  type ActionState,
} from '@/lib/actions';
import { uploadImage } from '@/lib/upload-actions';
import { sanitizeUrl } from '@/lib/publish/sanitize';
import type { SponsorTier } from '@/types/database';

const TIERS: SponsorTier[] = ['gold', 'silver', 'bronze'];

export async function saveSponsor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = optionalString(formData, 'id');
    const name = requiredString(formData, 'name', 'Business name');
    const tier = (optionalString(formData, 'tier') ?? 'bronze') as SponsorTier;

    if (!TIERS.includes(tier)) return { error: 'Choose Gold, Silver, or Bronze.' };

    const rawWebsite = optionalString(formData, 'website_url');
    const website = rawWebsite ? sanitizeUrl(rawWebsite) : null;

    // Reject rather than silently dropping — a sponsor paying for a link
    // should not find it quietly missing from the site.
    if (rawWebsite && !website) {
      return { error: 'That website address is not valid. Use a full https:// link.' };
    }

    const { data: existing } = id
      ? await supabase.from('sponsors').select('*').eq('id', id).maybeSingle()
      : { data: null };

    const logo = formData.get('logo');
    let logoPath = existing?.logo_path ?? null;

    if (logo instanceof File && logo.size > 0) {
      const upload = await uploadImage(logo, 'sponsors', name);
      if (upload.error) return { error: upload.error };
      logoPath = upload.path ?? logoPath;
    }

    const payload = {
      name,
      logo_path: logoPath,
      logo_alt: `${name} logo`,
      website_url: website,
      description: optionalString(formData, 'description'),
      tier,
      sort_order: intField(formData, 'sort_order'),
      is_active: id ? boolField(formData, 'is_active') : true,
      show_in_footer: boolField(formData, 'show_in_footer'),
      updated_by: session.userId,
    };

    const { error } = existing
      ? await supabase.from('sponsors').update(payload).eq('id', existing.id)
      : await supabase.from('sponsors').insert(payload);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: existing ? 'update' : 'create',
      section: 'Sponsors',
      entityType: 'sponsor',
      entityId: existing?.id,
      summary: `${session.profile.full_name} ${existing ? 'updated' : 'added'} sponsor ${name}`,
      previousValue: existing ?? null,
      newValue: payload,
    });

    revalidatePath('/sponsors');
    return { ok: true, message: `${name} saved.` };
  });
}

export async function deleteSponsor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = requiredString(formData, 'id', 'Sponsor');
    const { data: existing } = await supabase
      .from('sponsors')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return { error: 'That sponsor no longer exists.' };

    const { error } = await supabase.from('sponsors').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'delete',
      section: 'Sponsors',
      entityType: 'sponsor',
      entityId: id,
      summary: `${session.profile.full_name} removed sponsor ${existing.name}`,
      previousValue: existing,
    });

    revalidatePath('/sponsors');
    return { ok: true, message: `${existing.name} removed.` };
  });
}
