import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { Badge, Button, Card, CardBody, EmptyState, PageHeader } from '@/components/ui';
import { formatDate, truncate } from '@/lib/utils';
import { NewsRowActions } from './row-actions';
import type { ContentStatus } from '@/types/database';

export const metadata: Metadata = { title: 'News' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<ContentStatus, 'success' | 'warning' | 'neutral'> = {
  published: 'success',
  draft: 'warning',
  archived: 'neutral',
};

export default async function NewsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from('news_posts')
    .select('*')
    .order('sort_pinned', { ascending: false })
    .order('published_on', { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="News & Announcements"
        description="Posts appear on the website's News page, newest first. Drafts are saved here but never shown publicly."
        action={
          <Link href="/news/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New announcement
            </Button>
          </Link>
        }
      />

      {!posts || posts.length === 0 ? (
        <EmptyState
          title="No announcements yet"
          description="Create your first post to share club news on the website."
          action={
            <Link href="/news/new">
              <Button>Create announcement</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardBody className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-ink-900">{post.title}</h2>
                    <Badge tone={STATUS_TONE[post.status]}>{post.status}</Badge>
                    {post.sort_pinned && <Badge tone="info">Pinned</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-600">
                    {truncate(post.excerpt ?? '', 160) || 'No preview text.'}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-500">
                    {post.display_date || formatDate(post.published_on)}
                    {post.author_name ? ` · ${post.author_name}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/news/${post.id}`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <NewsRowActions id={post.id} status={post.status} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
