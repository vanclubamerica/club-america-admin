import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { Alert, PageHeader } from '@/components/ui';
import { EventManager } from './event-manager';

export const metadata: Metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .gte('starts_at', new Date(Date.now() - 86_400_000).toISOString())
    .order('starts_at');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="The homepage shows the next 3 upcoming events and the Events page shows the full list. Past events are removed automatically."
      />

      <Alert tone="info" title="Google Calendar stays in charge">
        The club calendar remains the source of truth. Syncing copies upcoming events here so they
        can be shown on the website — it never writes back to Google.
      </Alert>

      <EventManager events={events ?? []} />
    </div>
  );
}
