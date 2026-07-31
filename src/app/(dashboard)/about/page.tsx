import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { Alert, PageHeader } from '@/components/ui';
import { REGIONS } from '@/lib/publish/regions';
import { BlockEditor } from './block-editor';
import type { ContentVersion } from '@/types/database';

export const metadata: Metadata = { title: 'About & page text' };
export const dynamic = 'force-dynamic';

/** Groups the editable prose regions by the page they appear on. */
const PAGE_LABELS: Record<string, string> = {
  'about.html': 'About page',
  'index.html': 'Homepage',
  'join.html': 'Join page',
  'contact.html': 'Contact page',
  'officers.html': 'Officers page',
  'sponsors.html': 'Sponsors page',
};

export default async function AboutPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: blocks } = await supabase
    .from('content_blocks')
    .select('*')
    .order('page')
    .order('sort_order');

  const { data: versions } = await supabase
    .from('content_versions')
    .select('*')
    .eq('entity_type', 'content_block')
    .order('version', { ascending: false })
    .limit(200);

  const versionsByKey = new Map<string, ContentVersion[]>();
  for (const version of versions ?? []) {
    const list = versionsByKey.get(version.entity_key) ?? [];
    if (list.length < 10) list.push(version);
    versionsByKey.set(version.entity_key, list);
  }

  const grouped = new Map<string, typeof blocks>();
  for (const block of blocks ?? []) {
    const list = grouped.get(block.page) ?? [];
    list.push(block);
    grouped.set(block.page, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Page text"
        description="Edit the written content of the website. No HTML required — use the formatting buttons, save, then publish from the Dashboard."
      />

      {(!blocks || blocks.length === 0) && (
        <Alert tone="warning" title="No content imported yet">
          Run <code className="font-mono">npm run migrate:public-site -- --write</code> and then{' '}
          <code className="font-mono">npm run seed:content</code> to load the current website text
          into the dashboard. See docs/03-first-run.md.
        </Alert>
      )}

      {[...grouped.entries()].map(([page, pageBlocks]) => (
        <section key={page} className="space-y-4">
          <h2 className="text-lg font-semibold text-ink-900">{PAGE_LABELS[page] ?? page}</h2>
          {pageBlocks?.map((block) => {
            const region = REGIONS.find((r) => r.key === block.key);
            return (
              <BlockEditor
                key={block.key}
                block={block}
                label={region?.label ?? block.label}
                description={region?.description ?? ''}
                versions={versionsByKey.get(block.key) ?? []}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
