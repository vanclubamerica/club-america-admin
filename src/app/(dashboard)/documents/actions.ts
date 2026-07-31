'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit';
import { optionalString, requiredString, runAction, type ActionState } from '@/lib/actions';
import { uploadDocument, getDocumentUrl } from '@/lib/upload-actions';

export async function uploadClubDocument(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const name = requiredString(formData, 'name', 'Document name');
    const file = formData.get('file');

    if (!(file instanceof File) || file.size === 0) {
      return { error: 'Choose a file to upload.' };
    }

    const upload = await uploadDocument(file, name);
    if (upload.error) return { error: upload.error };

    const { error } = await supabase.from('documents').insert({
      name,
      description: optionalString(formData, 'description'),
      category: optionalString(formData, 'category') ?? 'general',
      storage_path: upload.storagePath!,
      file_name: upload.fileName!,
      mime_type: upload.mimeType!,
      size_bytes: upload.sizeBytes!,
      uploaded_by: session.userId,
      uploader_name: session.profile.full_name,
    });

    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'create',
      section: 'Documents',
      entityType: 'document',
      summary: `${session.profile.full_name} uploaded the document "${name}"`,
      newValue: { name, file: upload.fileName },
    });

    revalidatePath('/documents');
    return { ok: true, message: `"${name}" uploaded.` };
  });
}

export async function deleteClubDocument(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = requiredString(formData, 'id', 'Document');
    const { data: existing } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return { error: 'That document no longer exists.' };

    // Remove the stored file first; a leftover row is easier to explain than
    // an orphaned file nobody can see or delete.
    await supabase.storage.from('documents').remove([existing.storage_path]);

    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'delete',
      section: 'Documents',
      entityType: 'document',
      entityId: id,
      summary: `${session.profile.full_name} deleted the document "${existing.name}"`,
      previousValue: existing,
    });

    revalidatePath('/documents');
    return { ok: true, message: `"${existing.name}" deleted.` };
  });
}

/** Issues a short-lived signed download link. Documents are never public. */
export async function requestDownload(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState & { url?: string }> {
  return runAction(async () => {
    await requireEditor();
    const path = requiredString(formData, 'path', 'Document');
    const url = await getDocumentUrl(path);

    if (!url) return { error: 'That file could not be found in storage.' };
    return { ok: true, message: url };
  });
}
