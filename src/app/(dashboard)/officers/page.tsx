import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, Alert } from '@/components/ui';
import { ROLE_LABELS, ROLE_ORDER, type Officer } from '@/types/database';
import { MainOfficerCard } from './main-officer-card';
import { LowerOfficerList } from './lower-officer-list';
import { publicEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Officers' };
export const dynamic = 'force-dynamic';

export default async function OfficersPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: officers } = await supabase.from('officers').select('*').order('sort_order');

  const byRole = new Map<string, Officer>();
  for (const officer of officers ?? []) {
    if (officer.tier === 'main' && officer.role_key) byRole.set(officer.role_key, officer);
  }

  const lower = (officers ?? [])
    .filter((o) => o.tier === 'lower')
    .sort((a, b) => a.sort_order - b.sort_order);

  const storageBase = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Officers"
        description="Update who leads the chapter. Changes appear on the website's Officers page after you publish."
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Main officers</h2>
          <p className="mt-1 text-sm text-ink-500">
            These five positions are fixed by the club&apos;s structure. You can change the name,
            photo, and biography — the role itself cannot be renamed or removed.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {ROLE_ORDER.map((roleKey) => (
            <MainOfficerCard
              key={roleKey}
              roleKey={roleKey}
              roleLabel={ROLE_LABELS[roleKey]}
              officer={byRole.get(roleKey) ?? null}
              storageBase={storageBase}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Additional officers</h2>
          <p className="mt-1 text-sm text-ink-500">
            Historian, Social Media Manager, Event Coordinator, and any other positions your team
            creates. Add as many as you need and drag to reorder.
          </p>
        </div>

        {lower.length === 0 && (
          <Alert tone="info">
            No additional officers yet. Use the form below to add your first one.
          </Alert>
        )}

        <LowerOfficerList officers={lower} storageBase={storageBase} />
      </section>
    </div>
  );
}
