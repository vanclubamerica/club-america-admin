'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireEditor } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit';
import {
  boolField,
  optionalString,
  requiredString,
  runAction,
  type ActionState,
} from '@/lib/actions';
import { sanitizeRichText, stripHtml } from '@/lib/publish/sanitize';
import { slugify } from '@/lib/uploads';
import type { ContentStatus } from '@/types/database';

const STATUSES: ContentStatus[] = ['draft', 'published', 'archived'];

export async function saveNewsPost(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = optionalString(formData, 'id');
    const title = requiredString(formData, 'title', 'Title');
    const status = (optionalString(formData, 'status') ?? 'draft') as ContentStatus;

    if (!STATUSES.includes(status)) return { error: 'Choose a valid status.' };

    // Sanitized here so the database never stores markup we would refuse to
    // publish. The publish pipeline sanitizes again as a second line of defence.
    const body = sanitizeRichText(formData.get('body'));
    const publishedOn = optionalString(formData, 'published_on') ?? new Date().toISOString().slice(0, 10);

    const { data: existing } = id
      ? await supabase.from('news_posts').select('*').eq('id', id).maybeSingle()
      : { data: null };

    const payload = {
      title,
      slug: slugify(title) || null,
      body,
      excerpt: stripHtml(body).slice(0, 200) || null,
      author_name: optionalString(formData, 'author_name') ?? session.profile.full_name,
      display_date: optionalString(formData, 'display_date'),
      published_on: publishedOn,
      status,
      sort_pinned: boolField(formData, 'sort_pinned'),
      updated_by: session.userId,
      ...(existing ? {} : { created_by: session.userId }),
    };

    const { error } = existing
      ? await supabase.from('news_posts').update(payload).eq('id', existing.id)
      : await supabase.from('news_posts').insert(payload);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: existing ? 'update' : 'create',
      section: 'News',
      entityType: 'news_post',
      entityId: existing?.id,
      summary: `${session.profile.full_name} ${existing ? 'updated' : 'created'} the announcement "${title}"${
        status === 'published' ? '' : ' (draft)'
      }`,
      previousValue: existing ?? null,
      newValue: payload,
    });

    revalidatePath('/news');
    redirect('/news');
  });
}

export async function deleteNewsPost(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = requiredString(formData, 'id', 'Post');
    const { data: existing } = await supabase
      .from('news_posts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return { error: 'That announcement no longer exists.' };

    const { error } = await supabase.from('news_posts').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'delete',
      section: 'News',
      entityType: 'news_post',
      entityId: id,
      summary: `${session.profile.full_name} deleted the announcement "${existing.title}"`,
      previousValue: existing,
    });

    revalidatePath('/news');
    return { ok: true, message: `"${existing.title}" deleted.` };
  });
}

/** Archive keeps the post on file but removes it from the public website. */
export async function setNewsStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = requiredString(formData, 'id', 'Post');
    const status = requiredString(formData, 'status', 'Status') as ContentStatus;

    if (!STATUSES.includes(status)) return { error: 'Choose a valid status.' };

    const { data: existing } = await supabase
      .from('news_posts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return { error: 'That announcement no longer exists.' };

    const { error } = await supabase
      .from('news_posts')
      .update({ status, updated_by: session.userId })
      .eq('id', id);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'update',
      section: 'News',
      entityType: 'news_post',
      entityId: id,
      summary: `${session.profile.full_name} moved "${existing.title}" to ${status}`,
      previousValue: { status: existing.status },
      newValue: { status },
    });

    revalidatePath('/news');
    return { ok: true, message: `"${existing.title}" is now ${status}.` };
  });
}
