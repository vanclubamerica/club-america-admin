'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestPasswordReset, type AuthFormState } from '@/app/login/actions';
import { Alert, Button, Field, Input } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Sending…' : 'Send reset link'}
    </Button>
  );
}

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-ink-900">Reset your password</h1>
          <p className="mt-1 text-sm text-ink-500">
            We&apos;ll email you a link to choose a new one.
          </p>
        </div>

        <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
          <form action={formAction} className="space-y-4">
            {state.error && <Alert tone="danger">{state.error}</Alert>}
            {state.message && <Alert tone="success">{state.message}</Alert>}

            <Field label="Email">
              <Input type="email" name="email" required autoFocus placeholder="you@example.com" />
            </Field>

            <SubmitButton />
          </form>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="font-medium text-navy-600 underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
