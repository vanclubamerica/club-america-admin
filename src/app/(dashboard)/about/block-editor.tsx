'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { History } from 'lucide-react';
import { restoreContentVersion, saveContentBlock } from './actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Badge, Button, Card, CardBody, CardHeader } from '@/components/ui';
import { RichTextEditor } from '@/components/rich-text-editor';
import { formatDateTime } from '@/lib/utils';
import type { ContentBlock, ContentVersion } from '@/types/database';

function SubmitButton({
  label,
  intent,
  variant = 'primary',
}: {
  label: string;
  intent: 'draft' | 'publish';
  variant?: 'primary' | 'outline';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="intent" value={intent} variant={variant} disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function blockHtml(value: unknown): string {
  if (value && typeof value === 'object' && 'html' in value) {
    const html = (value as { html?: unknown }).html;
    return typeof html === 'string' ? html : '';
  }
  return '';
}

export function BlockEditor({
  block,
  label,
  description,
  versions,
}: {
  block: ContentBlock;
  label: string;
  description: string;
  versions: ContentVersion[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveContentBlock, {});
  const [restoreState, restoreAction] = useActionState<ActionState, FormData>(
    restoreContentVersion,
    {}
  );
  const [showHistory, setShowHistory] = useState(false);

  const hasDraft = block.draft_data !== null;
  // An unsaved draft is what the officer was last working on, so that is what
  // the editor should open with.
  const current = hasDraft ? blockHtml(block.draft_data) : blockHtml(block.data);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {label}
            {hasDraft && <Badge tone="warning">Unpublished draft</Badge>}
          </span>
        }
        description={description}
        action={
          versions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-700"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              History ({versions.length})
            </button>
          )
        }
      />
      <CardBody className="space-y-4">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.message && <Alert tone="success">{state.message}</Alert>}
        {restoreState.error && <Alert tone="danger">{restoreState.error}</Alert>}
        {restoreState.message && <Alert tone="success">{restoreState.message}</Alert>}

        {showHistory && (
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Previous versions
            </p>
            <ul className="space-y-1.5">
              {versions.map((version) => (
                <li key={version.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-700">
                    Version {version.version} · {formatDateTime(version.created_at)} ·{' '}
                    {version.created_by_name}
                  </span>
                  <form action={restoreAction}>
                    <input type="hidden" name="key" value={block.key} />
                    <input type="hidden" name="version_id" value={version.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Restore
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="key" value={block.key} />

          <RichTextEditor name="html" defaultValue={current} minHeight={180} />

          <div className="flex flex-wrap justify-end gap-2">
            <SubmitButton label="Save draft" intent="draft" variant="outline" />
            <SubmitButton label="Save" intent="publish" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
