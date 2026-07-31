'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updatePassword, type AuthFormState } from '@/app/login/actions';
import { Alert, Button, Field, Input } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Saving…' : 'Set new password'}
    </Button>
  );
}

export default function UpdatePasswordPage() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(updatePassword, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-ink-900">Choose a new password</h1>
        </div>

        <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
          <form action={formAction} className="space-y-4">
            {state.error && <Alert tone="danger">{state.error}</Alert>}

            <Field
              label="New password"
              hint="At least 12 characters. This account can publish to the public website, so make it unique."
            >
              <Input type="password" name="password" autoComplete="new-password" required autoFocus />
            </Field>

            <Field label="Confirm new password">
              <Input type="password" name="confirm" autoComplete="new-password" required />
            </Field>

            <SubmitButton />
          </form>
        </div>
      </div>
    </div>
  );
}
