'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type AuthFormState } from './actions';
import { Alert, Button, Field, Input } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(signIn, {});

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Email">
        <Input
          type="email"
          name="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password">
        <Input type="password" name="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton />
    </form>
  );
}
