import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { Alert, Badge, Card, CardBody, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Activity logs' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  publish: 'success',
  restore: 'warning',
  login: 'neutral',
  login_failed: 'danger',
  logout: 'neutral',
  security: 'warning',
  transfer: 'warning',
  upload: 'info',
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; section?: string; action?: string; page?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const supabase = await createClient();

  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    // Postgres pattern matching; the value is parameterized by the client.
    query = query.ilike('summary', `%${params.q.trim()}%`);
  }
  if (params.section?.trim()) query = query.eq('section', params.section.trim());
  if (params.action?.trim()) query = query.eq('action', params.action.trim());

  const { data: logs, count } = await query;

  const { data: sectionRows } = await supabase.from('audit_logs').select('section').limit(500);
  const sections = [...new Set((sectionRows ?? []).map((r) => r.section))].sort();

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity logs"
        description="A permanent record of every change. Entries cannot be edited or deleted by anyone, including the account owner."
      />

      <Alert tone="info">
        These logs are protected at the database level. If an account is ever compromised, this
        history is how you find out exactly what was changed and when.
      </Alert>

      <Card>
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Input name="q" placeholder="Search descriptions…" defaultValue={params.q ?? ''} />
            </div>
            <Select name="section" defaultValue={params.section ?? ''}>
              <option value="">All sections</option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </Select>
            <Select name="action" defaultValue={params.action ?? ''}>
              <option value="">All actions</option>
              {Object.keys(ACTION_TONE).map((action) => (
                <option key={action} value={action}>
                  {action.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </form>
        </CardBody>
      </Card>

      {!logs || logs.length === 0 ? (
        <EmptyState title="No matching activity" description="Try a different search or filter." />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-ink-100">
              {logs.map((entry) => (
                <li key={entry.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-800">{entry.summary}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                        <Badge tone={ACTION_TONE[entry.action] ?? 'neutral'}>
                          {entry.action.replace(/_/g, ' ')}
                        </Badge>
                        <span>{entry.section}</span>
                        <span>·</span>
                        <span>{formatDateTime(entry.created_at)}</span>
                        {entry.actor_role && (
                          <>
                            <span>·</span>
                            <span>{entry.actor_role}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-ink-500">
            Page {page} of {totalPages} · {count} entries
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/logs?page=${page - 1}`}
                className="rounded-lg border border-ink-300 px-3 py-1.5 font-medium text-ink-700 hover:bg-ink-50"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/logs?page=${page + 1}`}
                className="rounded-lg border border-ink-300 px-3 py-1.5 font-medium text-ink-700 hover:bg-ink-50"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
