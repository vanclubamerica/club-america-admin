import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { PageHeader } from '@/components/ui';
import { SponsorList } from './sponsor-form';

export const metadata: Metadata = { title: 'Sponsors' };
export const dynamic = 'force-dynamic';

export default async function SponsorsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: sponsors } = await supabase
    .from('sponsors')
    .select('*')
    .order('tier')
    .order('sort_order');

  const storageBase = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sponsors"
        description="Businesses and organizations supporting the chapter. Logos appear on the homepage, the Sponsors page, and optionally in the footer of every page."
      />
      <SponsorList sponsors={sponsors ?? []} storageBase={storageBase} />
    </div>
  );
}
