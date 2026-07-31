import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { MemberManager } from './member-manager';

export const metadata: Metadata = { title: 'Members' };
export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  await requireUser();
  const supabase = await createClient();

  const membersQuery = supabase
    .from('members')
    .select('*')
    .eq('is_active', true)
    .order('full_name');
  const statsQuery = supabase.from('member_attendance_stats').select('*');

  const { data: members } = await membersQuery;
  const { data: stats } = await statsQuery;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members & attendance"
        description="An internal roster for the officer team. This information never appears on the public website."
      />
      <MemberManager members={members ?? []} stats={stats ?? []} />
    </div>
  );
}
