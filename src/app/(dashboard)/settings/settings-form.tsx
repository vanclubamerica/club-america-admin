'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ShieldAlert } from 'lucide-react';
import {
  forcePasswordReset,
  saveSettings,
  setEmergencyLock,
  setPublishingEnabled,
} from './actions';
import type { ActionState } from '@/lib/actions';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
} from '@/components/ui';
import { ROLE_LABELS, type Profile, type Settings } from '@/types/database';

function SaveButton({ label = 'Save settings' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveSettings, {});

  return (
    <form action={formAction}>
      <Card>
        <CardHeader
          title="Chapter details"
          description="Meeting information appears on the homepage and the Events page — edited once here, written to both."
        />
        <CardBody className="space-y-4">
          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {state.message && <Alert tone="success">{state.message}</Alert>}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Meeting day">
              <Input name="meeting_day" defaultValue={settings.meeting_day ?? ''} placeholder="Friday" />
            </Field>
            <Field label="Meeting time">
              <Input
                name="meeting_time"
                defaultValue={settings.meeting_time ?? ''}
                placeholder="10:20 – 10:50 AM"
              />
            </Field>
            <Field label="Meeting location">
              <Input
                name="meeting_location"
                defaultValue={settings.meeting_location ?? ''}
                placeholder="College Career Center A"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address line 1">
              <Input
                name="contact_address_line1"
                defaultValue={settings.contact_address_line1 ?? ''}
              />
            </Field>
            <Field label="Address line 2">
              <Input
                name="contact_address_line2"
                defaultValue={settings.contact_address_line2 ?? ''}
              />
            </Field>
          </div>

          <Field label="Contact email">
            <Input name="contact_email" type="email" defaultValue={settings.contact_email ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Instagram">
              <Input name="social_instagram" defaultValue={settings.social_instagram ?? ''} />
            </Field>
            <Field label="TikTok">
              <Input name="social_tiktok" defaultValue={settings.social_tiktok ?? ''} />
            </Field>
            <Field label="Facebook">
              <Input name="social_facebook" defaultValue={settings.social_facebook ?? ''} />
            </Field>
          </div>

          <Field
            label="Google Calendar ID"
            hint="Found in Google Calendar under Settings → Integrate calendar. The calendar must be public."
          >
            <Input name="google_calendar_id" defaultValue={settings.google_calendar_id ?? ''} />
          </Field>

          <div className="flex justify-end">
            <SaveButton />
          </div>
        </CardBody>
      </Card>
    </form>
  );
}

/** Owner-only controls. Rendered only when the viewer holds the Owner flag. */
export function SecurityControls({
  settings,
  accounts,
}: {
  settings: Settings;
  accounts: Profile[];
}) {
  const [publishState, publishAction] = useActionState<ActionState, FormData>(
    setPublishingEnabled,
    {}
  );
  const [lockState, lockAction] = useActionState<ActionState, FormData>(setEmergencyLock, {});
  const [resetState, resetAction] = useActionState<ActionState, FormData>(forcePasswordReset, {});

  return (
    <Card className="border-flag-200">
      <CardHeader
        title={
          <span className="flex items-center gap-2 text-flag-700">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Security controls
          </span>
        }
        description="Available to the account owner only."
      />
      <CardBody className="space-y-6">
        {publishState.error && <Alert tone="danger">{publishState.error}</Alert>}
        {publishState.message && <Alert tone="success">{publishState.message}</Alert>}
        {lockState.error && <Alert tone="danger">{lockState.error}</Alert>}
        {lockState.message && <Alert tone="success">{lockState.message}</Alert>}
        {resetState.error && <Alert tone="danger">{resetState.error}</Alert>}
        {resetState.message && <Alert tone="success">{resetState.message}</Alert>}

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-800">Publishing</p>
          <p className="text-sm text-ink-500">
            Pausing lets officers keep editing while nothing reaches the public website.
          </p>
          <form action={publishAction}>
            <input type="hidden" name="enabled" value={settings.publishing_enabled ? '' : 'true'} />
            <Button type="submit" variant={settings.publishing_enabled ? 'outline' : 'primary'}>
              {settings.publishing_enabled ? 'Pause publishing' : 'Resume publishing'}
            </Button>
          </form>
        </div>

        <div className="space-y-2 border-t border-ink-100 pt-5">
          <p className="text-sm font-medium text-ink-800">Emergency website lock</p>
          <p className="text-sm text-ink-500">
            Use this if an account is compromised. It immediately disables all editing and
            publishing for everyone. The public website stays online and unchanged.
          </p>
          <form action={lockAction} className="space-y-3">
            <input type="hidden" name="locked" value={settings.emergency_lock ? '' : 'true'} />
            {!settings.emergency_lock && (
              <Input name="reason" placeholder="What happened? (recorded in the logs)" />
            )}
            <Button type="submit" variant={settings.emergency_lock ? 'primary' : 'danger'}>
              {settings.emergency_lock ? 'Lift emergency lock' : 'Activate emergency lock'}
            </Button>
          </form>
        </div>

        <div className="space-y-2 border-t border-ink-100 pt-5">
          <p className="text-sm font-medium text-ink-800">Force a password reset</p>
          <p className="text-sm text-ink-500">
            Sends a reset link and requires the officer to choose a new password.
          </p>
          <form action={resetAction} className="flex flex-wrap gap-2">
            <Select name="user_id" className="max-w-xs">
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.full_name} ({ROLE_LABELS[account.role]})
                </option>
              ))}
            </Select>
            <Button type="submit" variant="outline">
              Send reset email
            </Button>
          </form>
        </div>
      </CardBody>
    </Card>
  );
}
