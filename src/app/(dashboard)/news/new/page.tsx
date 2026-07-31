import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { PageHeader } from '@/components/ui';
import { NewsEditor } from '../news-editor';

export const metadata: Metadata = { title: 'New announcement' };

export default async function NewNewsPage() {
  const { profile } = await requireUser();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New announcement" description="Share club news on the website." />
      <NewsEditor authorFallback={profile.full_name} />
    </div>
  );
}
