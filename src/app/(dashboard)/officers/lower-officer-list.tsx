'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { deleteLowerOfficer, saveLowerOfficer } from './actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, Card, CardBody, Field, Input, Textarea } from '@/components/ui';
import type { Officer } from '@/types/database';

function SaveButton({ label = 'Save' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="ghost" disabled={pending}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      {pending ? 'Removing…' : 'Remove'}
    </Button>
  );
}

function OfficerRow({ officer, storageBase }: { officer: Officer; storageBase: string }) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveLowerOfficer, {});
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deleteLowerOfficer,
    {}
  );

  const photoUrl = officer.photo_path ? `${storageBase}${officer.photo_path}` : null;

  return (
    <Card>
      <CardBody className="space-y-4">
        {saveState.error && <Alert tone="danger">{saveState.error}</Alert>}
        {saveState.message && <Alert tone="success">{saveState.message}</Alert>}
        {deleteState.error && <Alert tone="danger">{deleteState.error}</Alert>}

        <form action={saveAction} className="space-y-4">
          <input type="hidden" name="id" value={officer.id} />
          <input type="hidden" name="sort_order" value={officer.sort_order} />
          <input type="hidden" name="is_active" value="true" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Position">
              <Input name="position_title" defaultValue={officer.position_title} required />
            </Field>
            <Field label="Name">
              <Input name="name" defaultValue={officer.name} required />
            </Field>
          </div>

          <Field label="Description" hint="Optional. Leave blank to show just the name and position.">
            <Textarea name="bio" rows={2} defaultValue={officer.bio ?? ''} />
          </Field>

          <Field label="Photo">
            <div className="flex items-center gap-3">
              {photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt={`Current photo of ${officer.name}`}
                  className="h-12 w-12 rounded-lg border border-ink-200 object-cover"
                />
              )}
              <Input type="file" name="photo" accept="image/png,image/jpeg,image/webp" />
            </div>
          </Field>

          <div className="flex justify-end">
            <SaveButton />
          </div>
        </form>

        <form action={deleteAction} className="border-t border-ink-100 pt-3">
          <input type="hidden" name="id" value={officer.id} />
          <div className="flex justify-end">
            <DeleteButton />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function AddOfficerForm({ nextOrder }: { nextOrder: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveLowerOfficer, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add an officer
      </Button>
    );
  }

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="sort_order" value={nextOrder} />
          <h3 className="font-semibold text-ink-900">New officer</h3>

          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {state.message && <Alert tone="success">{state.message}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Position" hint="e.g. Historian, Social Media Manager">
              <Input name="position_title" required placeholder="Historian" />
            </Field>
            <Field label="Name">
              <Input name="name" required placeholder="Full name" />
            </Field>
          </div>

          <Field label="Description">
            <Textarea name="bio" rows={2} />
          </Field>

          <Field label="Photo">
            <Input type="file" name="photo" accept="image/png,image/jpeg,image/webp" />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton label="Add officer" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function LowerOfficerList({
  officers,
  storageBase,
}: {
  officers: Officer[];
  storageBase: string;
}) {
  return (
    <div className="space-y-4">
      {officers.map((officer) => (
        <OfficerRow key={officer.id} officer={officer} storageBase={storageBase} />
      ))}
      <AddOfficerForm nextOrder={officers.length} />
    </div>
  );
}
