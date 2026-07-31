import type { Metadata } from 'next';
import { requireUser, isOwner } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { formatDate, formatDateTime, currentSchoolYear } from '@/lib/utils';
import { ROLE_LABELS } from '@/types/database';
import { buildHandoffReport } from './actions';
import { TransferControls, HandoffReportView } from './transfer-controls';

export const metadata: Metadata = { title: 'Leadership transfer' };
export const dynamic = 'force-dynamic';

export default async function TransferPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const { data: accounts } = await supabase.from('profiles').select('*').order('role');
  const { data: terms } = await supabase
    .from('leadership_terms')
    .select('*')
    .order('school_year', { ascending: false });

  const report = await buildHandoffReport(supabase);
  const owner = isOwner(profile);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leadership transfer"
        description="Hand the website over to next year's officer team without losing anything."
      />

      <Alert tone="info" title="How the handover works">
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Invite the incoming officers so they can set their own passwords.</li>
          <li>Update the Officers page with the new team&apos;s names, photos, and bios.</li>
          <li>Print the handoff report below and walk the new president through it.</li>
          <li>Transfer ownership to the new president.</li>
          <li>Archive this school year, then suspend the outgoing accounts.</li>
        </ol>
      </Alert>

      <Card>
        <CardHeader
          title="Current leadership"
          description="Everyone with access to this dashboard."
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-100">
            {(accounts ?? []).map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    {account.full_name}
                    {account.id === profile.id && (
                      <span className="ml-2 text-xs font-normal text-ink-500">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-500">
                    {ROLE_LABELS[account.role]} · {account.email}
                    {account.last_login_at
                      ? ` · last signed in ${formatDate(account.last_login_at)}`
                      : ' · never signed in'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {account.is_owner && <Badge tone="info">Owner</Badge>}
                  {account.is_break_glass && <Badge tone="warning">Recovery</Badge>}
                  <Badge tone={account.status === 'active' ? 'success' : 'neutral'}>
                    {account.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <HandoffReportView report={report} />

      {owner ? (
        <TransferControls
          accounts={accounts ?? []}
          currentUserId={profile.id}
          defaultSchoolYear={currentSchoolYear()}
        />
      ) : (
        <Alert tone="info" title="Transfer controls">
          Inviting officers, changing account status, transferring ownership, and archiving the
          school year are limited to the account owner — currently{' '}
          {accounts?.find((a) => a.is_owner)?.full_name ?? 'unassigned'}.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Archived leadership history"
          description="Past officer teams. These records are permanent and cannot be deleted."
        />
        <CardBody className="p-0">
          {!terms || terms.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">
              No school years archived yet. Archive one at the end of the year to preserve the
              roster for future officers.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {terms.map((term) => {
                const roster = Array.isArray(term.roster)
                  ? (term.roster as Array<{ position?: string; name?: string }>)
                  : [];
                return (
                  <li key={term.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-ink-900">{term.school_year}</p>
                      <p className="text-xs text-ink-500">
                        Archived {formatDateTime(term.archived_at)} by {term.archived_by_name}
                      </p>
                    </div>
                    <ul className="mt-2 grid gap-1 text-sm text-ink-600 sm:grid-cols-2">
                      {roster.map((member, i) => (
                        <li key={`${member.name}-${i}`}>
                          <span className="font-medium text-ink-800">{member.position}</span> —{' '}
                          {member.name}
                        </li>
                      ))}
                    </ul>
                    {term.notes && <p className="mt-2 text-sm text-ink-600">{term.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
