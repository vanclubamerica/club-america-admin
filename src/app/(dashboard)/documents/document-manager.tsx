'use client';

import { useActionState, useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { deleteClubDocument, requestDownload, uploadClubDocument } from './actions';
import type { ActionState } from '@/lib/actions';
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { formatBytes, formatDate } from '@/lib/utils';
import type { DocumentRecord } from '@/types/database';

const CATEGORIES = [
  ['constitution', 'Constitution & bylaws'],
  ['agenda', 'Meeting agendas'],
  ['sponsor', 'Sponsor packets'],
  ['form', 'Forms'],
  ['resource', 'Resources'],
  ['general', 'General'],
] as const;

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES) as Record<string, string>;

function DownloadButton({ path }: { path: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set('path', path);
    const result = await requestDownload({}, formData);

    setPending(false);

    if (result.error || !result.message) {
      setError(result.error ?? 'Could not create a download link.');
      return;
    }

    // The action returns a signed URL valid for a few minutes.
    window.open(result.message, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col items-end">
      <Button size="sm" variant="outline" onClick={download} disabled={pending}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {pending ? 'Preparing…' : 'Download'}
      </Button>
      {error && <p className="mt-1 text-xs text-flag-600">{error}</p>}
    </div>
  );
}

export function DocumentManager({ documents }: { documents: DocumentRecord[] }) {
  const [uploadState, uploadAction] = useActionState<ActionState, FormData>(
    uploadClubDocument,
    {}
  );
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deleteClubDocument,
    {}
  );
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {uploadState.error && <Alert tone="danger">{uploadState.error}</Alert>}
      {uploadState.message && <Alert tone="success">{uploadState.message}</Alert>}
      {deleteState.error && <Alert tone="danger">{deleteState.error}</Alert>}

      {adding ? (
        <Card>
          <CardBody>
            <form action={uploadAction} className="space-y-4">
              <h3 className="font-semibold text-ink-900">Upload a document</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Document name">
                  <Input name="name" required placeholder="Chapter Constitution" />
                </Field>
                <Field label="Category">
                  <Select name="category" defaultValue="general">
                    {CATEGORIES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Description">
                <Textarea name="description" rows={2} />
              </Field>

              <Field label="File" hint="PDF, Word, Excel, text, or image. Up to 20 MB.">
                <Input type="file" name="file" required />
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Upload
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Upload a document
        </Button>
      )}

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload the constitution, meeting agendas, or sponsor packets so future officers can find them."
        />
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardBody className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{doc.name}</p>
                  {doc.description && (
                    <p className="mt-0.5 text-sm text-ink-600">{doc.description}</p>
                  )}
                  <p className="mt-1 text-xs text-ink-500">
                    {CATEGORY_LABELS[doc.category ?? 'general'] ?? 'General'} ·{' '}
                    {formatBytes(doc.size_bytes)} · uploaded by {doc.uploader_name} on{' '}
                    {formatDate(doc.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 items-start gap-2">
                  <DownloadButton path={doc.storage_path} />
                  <form
                    action={deleteAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`Delete "${doc.name}" permanently?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={doc.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </form>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
