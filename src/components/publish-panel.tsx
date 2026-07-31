'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, CloudUpload, Eye, FileWarning } from 'lucide-react';
import { publishNow } from '@/app/(dashboard)/publish-actions';
import type { PreviewSummary } from '@/app/(dashboard)/publish-actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, Card, CardBody, CardHeader, Input } from '@/components/ui';

function PublishButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      <CloudUpload className="h-4 w-4" aria-hidden="true" />
      {pending ? 'Publishing…' : 'Publish to website'}
    </Button>
  );
}

/**
 * The publish control.
 *
 * Deliberately shows exactly which files will change before anything happens —
 * publishing edits a live public website, and the person clicking is often a
 * student doing it for the first time.
 */
export function PublishPanel({ preview }: { preview: PreviewSummary }) {
  const [state, formAction] = useActionState<ActionState, FormData>(publishNow, {});
  const [showPreview, setShowPreview] = useState(false);

  const hasChanges = preview.changedFiles.length > 0;

  return (
    <Card>
      <CardHeader
        title="Publish to the website"
        description="Push your saved changes to tpvan.com. GitHub keeps a permanent backup of every version."
      />
      <CardBody className="space-y-4">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.message && <Alert tone="success">{state.message}</Alert>}

        {preview.error && <Alert tone="warning">{preview.error}</Alert>}

        {preview.warnings.length > 0 && (
          <Alert tone="warning" title="Some sections were skipped">
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Alert>
        )}

        {preview.ready && !hasChanges && (
          <div className="flex items-start gap-2 text-sm text-ink-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <p>
              The website matches your saved content. There is nothing waiting to be published.
            </p>
          </div>
        )}

        {preview.ready && hasChanges && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-ink-700">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p>
                <span className="font-semibold">
                  {preview.changedFiles.length} page
                  {preview.changedFiles.length === 1 ? '' : 's'} will change
                </span>{' '}
                when you publish.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-700"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              {showPreview ? 'Hide' : 'Show'} the list
            </button>

            {showPreview && (
              <ul className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm">
                {preview.changedFiles.map((file) => (
                  <li key={file} className="font-mono text-xs text-ink-700">
                    {file}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form action={formAction} className="space-y-3 border-t border-ink-200 pt-4">
          <div>
            <label
              htmlFor="publish-message"
              className="mb-1.5 block text-sm font-medium text-ink-700"
            >
              What changed? <span className="font-normal text-ink-500">(saved with the backup)</span>
            </label>
            <Input
              id="publish-message"
              name="message"
              placeholder="Updated About page content"
              maxLength={120}
            />
          </div>

          <PublishButton disabled={!preview.ready} />
        </form>
      </CardBody>
    </Card>
  );
}
