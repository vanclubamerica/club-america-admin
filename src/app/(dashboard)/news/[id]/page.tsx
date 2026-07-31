import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { NewsEditor } from '../news-editor';

export const metadata: Metadata = { title: 'Edit announcement' };
export const dynamic = 'force-dynamic';

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const { data: post } = await supabase.from('news_posts').select('*').eq('id', id).maybeSingle();

  if (!post) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit announcement" description={post.title} />
      <NewsEditor post={post} authorFallback={profile.full_name} />
    </div>
  );
}
