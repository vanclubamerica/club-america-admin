'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { deleteEvent, saveEvent, syncGoogleCalendar } from './actions';
import type { ActionState } from '@/lib/actions';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  Textarea,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import type { ClubEvent } from '@/types/database';

function SaveButton({ label = 'Save' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

/** Converts an ISO timestamp into the value a datetime-local input expects. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function EventFields({ event }: { event?: ClubEvent }) {
  return (
    <>
      <Field label="Title">
        <Input name="title" defaultValue={event?.title ?? ''} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date and time">
          <Input
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={event ? toLocalInput(event.starts_at) : ''}
          />
        </Field>
        <Field label="Location">
          <Input
            name="location"
            defaultValue={event?.location ?? ''}
            placeholder="College Career Center A"
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea name="description" rows={2} defaultValue={event?.description ?? ''} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          name="is_hidden"
          defaultChecked={event?.is_hidden ?? false}
          className="h-4 w-4 rounded border-ink-300"
        />
        Hide from the website
      </label>
    </>
  );
}

function EventRow({ event }: { event: ClubEvent }) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveEvent, {});
  const [, deleteAction] = useActionState<ActionState, FormData>(deleteEvent, {});
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-ink-900">{event.title}</p>
              {event.source === 'google_calendar' && <Badge tone="info">Google Calendar</Badge>}
              {event.is_hidden && <Badge tone="neutral">Hidden</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-500">
              {formatDateTime(event.starts_at)}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'Edit'}
          </Button>
        </div>

        {saveState.error && <Alert tone="danger">{saveState.error}</Alert>}
        {saveState.message && <Alert tone="success">{saveState.message}</Alert>}

        {open && (
          <>
            <form action={saveAction} className="space-y-4 border-t border-ink-100 pt-4">
              <input type="hidden" name="id" value={event.id} />
              <EventFields event={event} />
              <div className="flex justify-end">
                <SaveButton />
              </div>
            </form>

            <form action={deleteAction} className="flex justify-end border-t border-ink-100 pt-3">
              <input type="hidden" name="id" value={event.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            </form>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function AddEventForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(saveEvent, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add an event manually
      </Button>
    );
  }

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <h3 className="font-semibold text-ink-900">New event</h3>
          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {state.message && <Alert tone="success">{state.message}</Alert>}

          <EventFields />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton label="Add event" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function SyncButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async () => syncGoogleCalendar(),
    {}
  );

  return (
    <div className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}
      <form action={action}>
        <Button type="submit" variant="secondary" disabled={pending}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {pending ? 'Syncing…' : 'Sync from Google Calendar'}
        </Button>
      </form>
    </div>
  );
}

export function EventManager({ events }: { events: ClubEvent[] }) {
  return (
    <div className="space-y-4">
      <SyncButton />

      {events.length === 0 ? (
        <EmptyState
          title="No upcoming events"
          description="Sync from Google Calendar, or add an event manually. Past events disappear from the website automatically."
        />
      ) : (
        events.map((event) => <EventRow key={event.id} event={event} />)
      )}

      <AddEventForm />
    </div>
  );
}
