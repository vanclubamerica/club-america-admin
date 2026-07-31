'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAudit } from '@/lib/audit';
import { requiredString, runAction, type ActionState } from '@/lib/actions';
import { REGIONS_BY_KEY } from '@/lib/publish/regions';

/**
 * Prose regions (About page, homepage text, Join benefits).
 *
 * Draft vs Publish is the important distinction here: `draft_data` is a
 * staging column the publish pipeline ignores completely, so an officer can
 * save half-finished wording without it appearing on the public site.
 */
export async function saveContentBlock(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const key = requiredString(formData, 'key', 'Section');
    const html = String(formData.get('html') ?? '');
    const asDraft = formData.get('intent') === 'draft';

    const region = REGIONS_BY_KEY[key];
    if (!region) return { error: 'That section does not exist.' };

    const { data: existing } = await supabase
      .from('content_blocks')
      .select('*')
      .eq('key', key)
      .maybeSingle();

    if (!existing) {
      return {
        error:
          'That section has not been imported yet. Run "npm run seed:content" to load the current website content.',
      };
    }

    const payload = asDraft
      ? { draft_data: { html }, updated_by: session.userId }
      : {
          data: { html },
          draft_data: null,
          version: existing.version + 1,
          updated_by: session.userId,
        };

    const { error } = await supabase.from('content_blocks').update(payload).eq('key', key);
    if (error) throw error;

    // Snapshot every confirmed save so an officer can roll back a bad edit
    // even before the change reaches the public site.
    if (!asDraft) {
      const admin = createAdminClient();
      await admin.from('content_versions').insert({
        entity_type: 'content_block',
        entity_key: key,
        version: existing.version + 1,
        snapshot: { html } as never,
        note: `Edited by ${session.profile.full_name}`,
        created_by: session.userId,
        created_by_name: session.profile.full_name,
      });
    }

    await recordAudit(session.profile, {
      action: 'update',
      section: region.label,
      entityType: 'content_block',
      entityId: key,
      summary: asDraft
        ? `${session.profile.full_name} saved a draft of ${region.label}`
        : `${session.profile.full_name} edited ${region.label}`,
      previousValue: existing.data,
      newValue: { html },
    });

    revalidatePath('/about');

    return {
      ok: true,
      message: asDraft
        ? 'Draft saved. It will not appear on the website until you save it for real and publish.'
        : 'Saved. Publish from the Dashboard to update the public website.',
    };
  });
}

/** Restores a previous version of a prose section. */
export async function restoreContentVersion(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const key = requiredString(formData, 'key', 'Section');
    const versionId = requiredString(formData, 'version_id', 'Version');

    const { data: version } = await supabase
      .from('content_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (!version) return { error: 'That version no longer exists.' };

    const { data: block } = await supabase
      .from('content_blocks')
      .select('*')
      .eq('key', key)
      .maybeSingle();

    if (!block) return { error: 'That section no longer exists.' };

    const { error } = await supabase
      .from('content_blocks')
      .update({
        data: version.snapshot,
        draft_data: null,
        version: block.version + 1,
        updated_by: session.userId,
      })
      .eq('key', key);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'restore',
      section: REGIONS_BY_KEY[key]?.label ?? key,
      entityType: 'content_block',
      entityId: key,
      summary: `${session.profile.full_name} restored ${REGIONS_BY_KEY[key]?.label ?? key} to version ${version.version}`,
      previousValue: block.data,
      newValue: version.snapshot,
    });

    revalidatePath('/about');
    return {
      ok: true,
      message: `Restored version ${version.version}. Publish to update the public website.`,
    };
  });
}
