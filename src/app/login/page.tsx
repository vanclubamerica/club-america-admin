import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { AdminFooter } from '@/components/admin-footer';
import { Alert } from '@/components/ui';

export const metadata: Metadata = { title: 'Sign in' };

/** Messages for the states middleware and the guard can redirect back with. */
const STATUS_MESSAGES: Record<string, string> = {
  suspended:
    'Your account has been suspended. Contact your President or Teacher Sponsor to restore access.',
  archived: 'This account has been archived as part of a leadership transfer.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const statusMessage = params.error ? STATUS_MESSAGES[params.error] : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold text-ink-900">Club America</h1>
            <p className="text-sm text-ink-500">Van High School Chapter · Admin</p>
          </div>

          {statusMessage && (
            <div className="mb-4">
              <Alert tone="warning">{statusMessage}</Alert>
            </div>
          )}

          <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
            <LoginForm next={params.next} />
          </div>

          <p className="mt-4 text-center text-sm text-ink-500">
            <Link
              href="/reset-password"
              className="font-medium text-navy-600 underline underline-offset-2"
            >
              Forgot your password?
            </Link>
          </p>

          <p className="mt-6 text-center text-xs text-ink-400">
            Accounts are created by the club&apos;s account owner. There is no public sign-up.
          </p>
        </div>
      </div>

      <AdminFooter />
    </div>
  );
}
