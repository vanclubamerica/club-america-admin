'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Lock } from 'lucide-react';
import { saveMainOfficer } from './actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, Card, CardBody, Field, Input, Textarea } from '@/components/ui';
import { ImageInput } from '@/components/image-input';
import type { Officer } from '@/types/database';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save'}
    </Button>
  );
}

export function MainOfficerCard({
  roleKey,
  roleLabel,
  officer,
  storageBase,
}: {
  roleKey: string;
  roleLabel: string;
  officer: Officer | null;
  storageBase: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveMainOfficer, {});

  const photoUrl = officer?.photo_path ? `${storageBase}${officer.photo_path}` : null;

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="role_key" value={roleKey} />

          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-ink-900">{roleLabel}</h3>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-500"
              title="The five main roles are fixed and cannot be renamed"
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
              Fixed role
            </span>
          </div>

          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {state.message && <Alert tone="success">{state.message}</Alert>}

          <Field label="Name">
            <Input
              name="name"
              defaultValue={officer?.name ?? ''}
              required
              placeholder="e.g. Jordan Blake"
            />
          </Field>

          <Field
            label="Biography"
            hint="A sentence or two about what this officer does. Shown under their photo."
          >
            <Textarea name="bio" rows={3} defaultValue={officer?.bio ?? ''} />
          </Field>

          <Field label="Photo" hint="PNG, JPG, or WebP. Large photos are resized automatically. Leave empty to keep the current photo.">
            <div className="flex items-center gap-3">
              {photoUrl && (
                // Plain <img>: these are Supabase Storage URLs, and next/image
                // optimization adds no value for a handful of admin thumbnails.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt={`Current photo of the ${roleLabel}`}
                  className="h-14 w-14 rounded-lg border border-ink-200 object-cover"
                />
              )}
              <ImageInput name="photo" />
            </div>
          </Field>

          <div className="flex justify-end">
            <SaveButton />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
