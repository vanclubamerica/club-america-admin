import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/auth/guard';
import { recordAudit } from '@/lib/audit';
import { consumeRateLimit, UPLOAD_RATE_LIMIT } from '@/lib/auth/rate-limit';
import {
  buildMediaPath,
  formatBytes,
  slugify,
  validateDocumentUpload,
  validateImageUpload,
} from '@/lib/uploads';

/**
 * Upload helpers shared by the officer, sponsor, news, and theme screens.
 *
 * Images live in Supabase Storage under a repo-shaped path (`media/officers/…`)
 * so the same string works as both the storage key and the path committed to
 * the website repository. Publishing copies the bytes into GitHub, which keeps
 * the public site working even if this dashboard is offline.
 */

export interface UploadResult {
  path?: string;
  publicUrl?: string;
  error?: string;
}

const MEDIA_BUCKET = 'media';

export async function uploadImage(
  file: File,
  folder: 'officers' | 'sponsors' | 'news' | 'themes',
  nameHint: string
): Promise<UploadResult> {
  const session = await requireEditor();

  const allowed = await consumeRateLimit(
    `upload:${session.userId}`,
    UPLOAD_RATE_LIMIT.limit,
    UPLOAD_RATE_LIMIT.windowMs
  );
  if (!allowed) {
    return { error: 'Too many uploads in a short time. Wait a few minutes and try again.' };
  }

  // Content is checked by its actual bytes, not its filename or declared type.
  const validation = await validateImageUpload(file);
  if (!validation.ok || !validation.kind) {
    return { error: validation.error ?? 'That file could not be used.' };
  }

  const path = buildMediaPath(`media/${folder}`, nameHint, validation.kind.extension);
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: validation.kind.mime, upsert: true });

  if (error) {
    return { error: `The image could not be uploaded: ${error.message}` };
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  await recordAudit(session.profile, {
    action: 'upload',
    section: 'Media',
    entityType: 'image',
    entityId: path,
    summary: `${session.profile.full_name} uploaded an image (${formatBytes(file.size)}) to ${folder}`,
    newValue: { path },
  });

  return { path, publicUrl: data.publicUrl };
}

export interface DocumentUploadResult {
  storagePath?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

/** Documents go to the PRIVATE bucket — they are internal club records. */
export async function uploadDocument(file: File, nameHint: string): Promise<DocumentUploadResult> {
  const session = await requireEditor();

  const allowed = await consumeRateLimit(
    `upload:${session.userId}`,
    UPLOAD_RATE_LIMIT.limit,
    UPLOAD_RATE_LIMIT.windowMs
  );
  if (!allowed) {
    return { error: 'Too many uploads in a short time. Wait a few minutes and try again.' };
  }

  const validation = await validateDocumentUpload(file);
  if (!validation.ok || !validation.kind) {
    return { error: validation.error ?? 'That file could not be used.' };
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? validation.kind.extension;
  const suffix = Math.random().toString(36).slice(2, 8);
  const storagePath = `${slugify(nameHint) || 'document'}-${suffix}.${extension}`;

  const supabase = await createClient();
  const { error } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { contentType: file.type || validation.kind.mime, upsert: false });

  if (error) {
    return { error: `The document could not be uploaded: ${error.message}` };
  }

  return {
    storagePath,
    fileName: file.name,
    mimeType: file.type || validation.kind.mime,
    sizeBytes: file.size,
  };
}

/** Short-lived signed URL for downloading a private document. */
export async function getDocumentUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from('documents').createSignedUrl(storagePath, 60 * 5);
  return data?.signedUrl ?? null;
}
