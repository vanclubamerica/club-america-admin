'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { recordAudit, describeChanges } from '@/lib/audit';
import {
  boolField,
  intField,
  optionalString,
  requiredString,
  runAction,
  type ActionState,
} from '@/lib/actions';
import { uploadImage } from '@/lib/upload-actions';
import { ROLE_LABELS, type UserRole } from '@/types/database';

const MAIN_ROLE_KEYS: UserRole[] = [
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'teacher_sponsor',
];

/**
 * Main officers: name, photo, and biography are editable; the ROLE IS NOT.
 * The five executive positions are fixed by the club's structure, so the form
 * never exposes a role field and this action ignores any that is submitted.
 */
export async function saveMainOfficer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const roleKey = requiredString(formData, 'role_key', 'Role');
    if (!MAIN_ROLE_KEYS.includes(roleKey as UserRole)) {
      return { error: 'That is not one of the five main officer roles.' };
    }

    const name = requiredString(formData, 'name', 'Name');
    const bio = optionalString(formData, 'bio');

    const { data: existing } = await supabase
      .from('officers')
      .select('*')
      .eq('role_key', roleKey)
      .eq('tier', 'main')
      .maybeSingle();

    const photo = formData.get('photo');
    let photoPath = existing?.photo_path ?? null;

    if (photo instanceof File && photo.size > 0) {
      const upload = await uploadImage(photo, 'officers', roleKey);
      if (upload.error) return { error: upload.error };
      photoPath = upload.path ?? photoPath;
    }

    const positionTitle = ROLE_LABELS[roleKey as UserRole];

    const payload = {
      tier: 'main' as const,
      role_key: roleKey,
      position_title: positionTitle,
      name,
      bio,
      photo_path: photoPath,
      photo_alt: `Portrait of the Club America ${positionTitle}`,
      is_active: true,
      updated_by: session.userId,
    };

    const { error } = existing
      ? await supabase.from('officers').update(payload).eq('id', existing.id)
      : await supabase.from('officers').insert(payload);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: existing ? 'update' : 'create',
      section: 'Officers',
      entityType: 'officer',
      entityId: existing?.id,
      summary: describeChanges(
        session.profile.full_name,
        existing ? 'updated' : 'added',
        `the ${positionTitle}`,
        existing ?? undefined,
        payload
      ),
      previousValue: existing ?? null,
      newValue: payload,
    });

    revalidatePath('/officers');
    return { ok: true, message: `${positionTitle} saved.` };
  });
}

/** Additional officers (Historian, Social Media Manager, …) — unlimited. */
export async function saveLowerOfficer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = optionalString(formData, 'id');
    const name = requiredString(formData, 'name', 'Name');
    const positionTitle = requiredString(formData, 'position_title', 'Position');
    const bio = optionalString(formData, 'bio');
    const sortOrder = intField(formData, 'sort_order');

    const { data: existing } = id
      ? await supabase.from('officers').select('*').eq('id', id).maybeSingle()
      : { data: null };

    const photo = formData.get('photo');
    let photoPath = existing?.photo_path ?? null;

    if (photo instanceof File && photo.size > 0) {
      const upload = await uploadImage(photo, 'officers', positionTitle);
      if (upload.error) return { error: upload.error };
      photoPath = upload.path ?? photoPath;
    }

    const payload = {
      tier: 'lower' as const,
      role_key: null,
      position_title: positionTitle,
      name,
      bio,
      photo_path: photoPath,
      photo_alt: `Portrait of the Club America ${positionTitle}`,
      sort_order: sortOrder,
      is_active: boolField(formData, 'is_active') || !id,
      updated_by: session.userId,
    };

    const { error } = existing
      ? await supabase.from('officers').update(payload).eq('id', existing.id)
      : await supabase.from('officers').insert(payload);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: existing ? 'update' : 'create',
      section: 'Officers',
      entityType: 'officer',
      entityId: existing?.id,
      summary: `${session.profile.full_name} ${existing ? 'updated' : 'added'} ${positionTitle} (${name})`,
      previousValue: existing ?? null,
      newValue: payload,
    });

    revalidatePath('/officers');
    return { ok: true, message: `${positionTitle} saved.` };
  });
}

export async function deleteLowerOfficer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = requiredString(formData, 'id', 'Officer');

    const { data: existing } = await supabase
      .from('officers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return { error: 'That officer no longer exists.' };

    // Only additional officers can be removed — the five main roles always
    // exist, and are cleared by blanking the name instead.
    if (existing.tier === 'main') {
      return {
        error:
          'Main officer positions cannot be deleted because the club always has them. Clear the name instead, or update it for the new officer.',
      };
    }

    const { error } = await supabase.from('officers').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'delete',
      section: 'Officers',
      entityType: 'officer',
      entityId: id,
      summary: `${session.profile.full_name} removed ${existing.position_title} (${existing.name})`,
      previousValue: existing,
    });

    revalidatePath('/officers');
    return { ok: true, message: `${existing.position_title} removed.` };
  });
}

/** Drag-to-reorder support for the additional officers list. */
export async function reorderLowerOfficers(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const raw = formData.get('order');
    if (typeof raw !== 'string') return { error: 'Nothing to reorder.' };

    const ids: string[] = JSON.parse(raw);

    await Promise.all(
      ids.map((id, index) =>
        supabase.from('officers').update({ sort_order: index }).eq('id', id)
      )
    );

    await recordAudit(session.profile, {
      action: 'update',
      section: 'Officers',
      summary: `${session.profile.full_name} reordered the additional officers`,
      newValue: ids,
    });

    revalidatePath('/officers');
    return { ok: true, message: 'Order saved.' };
  });
}
