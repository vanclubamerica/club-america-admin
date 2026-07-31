import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, FileText, Info, Megaphone, ScrollText, UserPlus } from 'lucide-react';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { getRecentCommits } from '@/lib/publish/github';
import { isGitHubConfigured } from '@/lib/env';
import { getPublishPreview } from '../publish-actions';
import { PublishPanel } from '@/components/publish-panel';
import { Card, CardBody, CardHeader, StatTile } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

// Always fresh: this page reports the live state of the public website.
export const dynamic = 'force-dynamic';

const QUICK_ACTIONS = [
  { href: '/news/new', label: 'Create announcement', icon: Megaphone },
  { href: '/officers', label: 'Add officer', icon: UserPlus },
  { href: '/sponsors/new', label: 'Add sponsor', icon: Building2 },
  { href: '/about', label: 'Edit About page', icon: Info },
  { href: '/documents', label: 'Upload document', icon: FileText },
  { href: '/logs', label: 'View activity logs', icon: ScrollText },
];

export default async function DashboardPage() {
  const { profile, settings } = await requireUser();
  const supabase = await createClient();

  // Counts drive the overview tiles. `head: true` fetches only the count.
  const [news, events, sponsors, officers, members, documents] = await Promise.all([
    supabase
      .from('news_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', new Date().toISOString())
      .eq('is_hidden', false),
    supabase.from('sponsors').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('officers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('documents').select('id', { count: 'exact', head: true }),
  ]);

  const { data: recentActivity } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8);

  const { data: upcoming } = await supabase
    .from('events')
    .select('*')
    .gte('starts_at', new Date().toISOString())
    .eq('is_hidden', false)
    .order('starts_at')
    .limit(3);

  const [preview, commits] = await Promise.all([
    getPublishPreview(),
    isGitHubConfigured() ? getRecentCommits(3) : Promise.resolve([]),
  ]);

  const firstName = profile.full_name.split(' ')[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Welcome, {firstName}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {settings.last_published_at
            ? `The website was last published ${formatRelative(settings.last_published_at)}.`
            : 'The website has not been published from here yet.'}
        </p>
      </div>

      <section aria-label="Website overview">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="News posts" value={news.count ?? 0} href="/news" />
          <StatTile label="Upcoming events" value={events.count ?? 0} href="/events" />
          <StatTile label="Sponsors" value={sponsors.count ?? 0} href="/sponsors" />
          <StatTile label="Officers" value={officers.count ?? 0} href="/officers" />
          <StatTile label="Members" value={members.count ?? 0} href="/members" />
          <StatTile label="Documents" value={documents.count ?? 0} href="/documents" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PublishPanel preview={preview} />

          <Card>
            <CardHeader
              title="Recent activity"
              description="Every change is recorded permanently and cannot be edited or deleted."
              action={
                <Link
                  href="/logs"
                  className="text-sm font-medium text-navy-600 hover:text-navy-700"
                >
                  View all
                </Link>
              }
            />
            <CardBody className="p-0">
              {recentActivity && recentActivity.length > 0 ? (
                <ul className="divide-y divide-ink-100">
                  {recentActivity.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink-800">{entry.summary}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {entry.section} · {formatRelative(entry.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-ink-500">
                  No activity recorded yet. Changes you make will show up here.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="grid grid-cols-1 gap-2">
              {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:border-navy-300 hover:bg-navy-50/50"
                >
                  <Icon className="h-4 w-4 text-navy-600" aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Next 3 events" description="Shown on the homepage." />
            <CardBody className="p-0">
              {upcoming && upcoming.length > 0 ? (
                <ul className="divide-y divide-ink-100">
                  {upcoming.map((event) => (
                    <li key={event.id} className="px-5 py-3">
                      <p className="text-sm font-medium text-ink-800">{event.title}</p>
                      <p className="text-xs text-ink-500">{formatDateTime(event.starts_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-ink-500">
                  No upcoming events. Past events disappear automatically.
                </p>
              )}
            </CardBody>
          </Card>

          {commits.length > 0 && (
            <Card>
              <CardHeader title="Website backups" description="Recent commits on GitHub." />
              <CardBody className="p-0">
                <ul className="divide-y divide-ink-100">
                  {commits.map((commit) => (
                    <li key={commit.sha} className="px-5 py-3">
                      <a
                        href={commit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-navy-600 hover:text-navy-700"
                      >
                        {commit.message}
                      </a>
                      <p className="text-xs text-ink-500">{formatRelative(commit.date)}</p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
