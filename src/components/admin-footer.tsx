import { publicEnv } from '@/lib/env';

/**
 * Appears at the bottom of every admin page.
 *
 * This matters more than it looks: officers change every year, and when
 * something breaks the new team needs to know who to ask without digging
 * through old emails.
 */
export function AdminFooter() {
  const name = publicEnv.NEXT_PUBLIC_SUPPORT_NAME;
  const email = publicEnv.NEXT_PUBLIC_SUPPORT_EMAIL;

  return (
    <footer className="mt-10 border-t border-ink-200 px-6 py-5 text-xs text-ink-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          Website created and maintained by <span className="font-semibold text-ink-700">{name}</span>
        </p>
        <p>
          Having a technical problem?{' '}
          <a
            href={`mailto:${email}?subject=${encodeURIComponent('Club America admin dashboard')}`}
            className="font-medium text-navy-600 underline underline-offset-2 hover:text-navy-700"
          >
            Contact {name}
          </a>
        </p>
      </div>
    </footer>
  );
}
