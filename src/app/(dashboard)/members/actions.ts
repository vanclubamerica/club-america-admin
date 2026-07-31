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

export async function saveMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = optionalString(formData, 'id');
    const fullName = requiredString(formData, 'full_name', 'Name');
    const grade = intField(formData, 'grade', 0);

    if (grade && (grade < 9 || grade > 12)) {
      return { error: 'Grade must be between 9 and 12.' };
    }

    const payload = {
      full_name: fullName,
      grade: grade || null,
      email: optionalString(formData, 'email'),
      position: optionalString(formData, 'position'),
      join_date: optionalString(formData, 'join_date'),
      is_active: id ? boolField(formData, 'is_active') : true,
      updated_by: session.userId,
    };

    const { error } = id
      ? await supabase.from('members').update(payload).eq('id', id)
      : await supabase.from('members').insert(payload);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: id ? 'update' : 'create',
      section: 'Members',
      entityType: 'member',
      entityId: id ?? undefined,
      summary: `${session.profile.full_name} ${id ? 'updated' : 'added'} member ${fullName}`,
      newValue: payload,
    });

    revalidatePath('/members');
    return { ok: true, message: `${fullName} saved.` };
  });
}

export async function deleteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = requiredString(formData, 'id', 'Member');
    const { data: existing } = await supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return { error: 'That member no longer exists.' };

    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'delete',
      section: 'Members',
      entityType: 'member',
      entityId: id,
      summary: `${session.profile.full_name} removed member ${existing.full_name}`,
      previousValue: existing,
    });

    revalidatePath('/members');
    return { ok: true, message: `${existing.full_name} removed.` };
  });
}

/** Creates a meeting and records who attended, in one submission. */
export async function saveAttendance(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const title = requiredString(formData, 'title', 'Meeting title');
    const meetingDate = requiredString(formData, 'meeting_date', 'Meeting date');

    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert({
        title,
        meeting_date: meetingDate,
        location: optionalString(formData, 'location'),
        created_by: session.userId,
      })
      .select()
      .single();

    if (meetingError || !meeting) throw meetingError ?? new Error('Could not create the meeting.');

    const presentIds = formData.getAll('present').map(String);
    const { data: members } = await supabase.from('members').select('id').eq('is_active', true);

    const rows = (members ?? []).map((member) => ({
      meeting_id: meeting.id,
      member_id: member.id,
      present: presentIds.includes(member.id),
      recorded_by: session.userId,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from('attendance').insert(rows);
      if (error) throw error;
    }

    await recordAudit(session.profile, {
      action: 'create',
      section: 'Attendance',
      entityType: 'meeting',
      entityId: meeting.id,
      summary: `${session.profile.full_name} recorded attendance for "${title}" (${presentIds.length} of ${rows.length} present)`,
      newValue: { meeting: title, present: presentIds.length, total: rows.length },
    });

    revalidatePath('/members');
    return {
      ok: true,
      message: `Attendance saved: ${presentIds.length} of ${rows.length} members present.`,
    };
  });
}
