import { AlertTriangle, LogOut } from 'lucide-react';
import { requireUser } from '@/lib/auth/guard';
import { Sidebar } from '@/components/sidebar';
import { AdminFooter } from '@/components/admin-footer';
import { ROLE_LABELS } from '@/types/database';
import { signOut } from '@/app/login/actions';

/**
 * Shell for every authenticated page.
 *
 * requireUser() runs here, so a suspended account is bounced even if its
 * session cookie is still valid. Individual pages and server actions re-check
 * as well — this is a convenience layer, not the security boundary.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const { profile, settings } = session;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar userName={profile.full_name} userRole={ROLE_LABELS[profile.role]} />

      <div className="flex min-w-0 flex-1 flex-col bg-ink-50">
        {settings.emergency_lock && (
          <div className="flex items-start gap-3 bg-flag-600 px-6 py-3 text-sm text-white">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Emergency lock is active</p>
              <p className="text-flag-50">
                Editing and publishing are disabled for everyone.
                {settings.emergency_lock_reason ? ` Reason: ${settings.emergency_lock_reason}` : ''}{' '}
                The account owner can lift this in Settings.
              </p>
            </div>
          </div>
        )}

        {!settings.publishing_enabled && !settings.emergency_lock && (
          <div className="bg-amber-100 px-6 py-2.5 text-sm text-amber-900">
            <span className="font-semibold">Publishing is paused.</span> You can still edit and save
            drafts — nothing will reach the public website until publishing is re-enabled in
            Settings.
          </div>
        )}

        <div className="flex items-center justify-end border-b border-ink-200 bg-white px-6 py-2.5">
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>

        <main className="flex-1 px-6 py-6">{children}</main>
        <AdminFooter />
      </div>
    </div>
  );
}
