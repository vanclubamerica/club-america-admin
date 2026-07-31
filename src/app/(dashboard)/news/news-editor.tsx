'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveNewsPost } from './actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, Card, CardBody, Field, Input, Select } from '@/components/ui';
import { RichTextEditor } from '@/components/rich-text-editor';
import type { NewsPost } from '@/types/database';

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

export function NewsEditor({
  post,
  authorFallback,
}: {
  post?: NewsPost;
  authorFallback: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveNewsPost, {});

  return (
    <form action={formAction} className="space-y-6">
      {post && <input type="hidden" name="id" value={post.id} />}

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Card>
        <CardBody className="space-y-4">
          <Field label="Title">
            <Input
              name="title"
              defaultValue={post?.title ?? ''}
              required
              autoFocus={!post}
              placeholder="Welcome to the 2026–2027 School Year"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Author">
              <Input name="author_name" defaultValue={post?.author_name ?? authorFallback} />
            </Field>
            <Field label="Date" hint="Used for ordering.">
              <Input
                name="published_on"
                type="date"
                defaultValue={post?.published_on ?? new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Date label" hint='How the date reads on the site, e.g. "August 2026".'>
              <Input
                name="display_date"
                defaultValue={post?.display_date ?? ''}
                placeholder="August 2026"
              />
            </Field>
          </div>

          <Field label="Content">
            <RichTextEditor
              name="body"
              defaultValue={post?.body ?? ''}
              placeholder="Write the announcement here…"
              minHeight={220}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Status"
              hint="Drafts are saved but never appear on the public website."
            >
              <Select name="status" defaultValue={post?.status ?? 'draft'}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <label className="flex items-center gap-2 pt-8 text-sm text-ink-700">
              <input
                type="checkbox"
                name="sort_pinned"
                defaultChecked={post?.sort_pinned ?? false}
                className="h-4 w-4 rounded border-ink-300"
              />
              Pin to the top of the news list
            </label>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-between">
        <Link href="/news">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
        <SaveButton label={post ? 'Save changes' : 'Create announcement'} />
      </div>

      <p className="text-sm text-ink-500">
        Saving stores the announcement here. It reaches the public website when you press{' '}
        <span className="font-medium">Publish to the website</span> on the Dashboard.
      </p>
    </form>
  );
}
