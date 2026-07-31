import type { Metadata } from 'next';
import { requireUser, isOwner } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { checkConnection } from '@/lib/publish/github';
import { isEmailConfigured, isGitHubConfigured } from '@/lib/env';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { SettingsForm, SecurityControls } from './settings-form';
import { ROLE_LABELS } from '@/types/database';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { profile, settings } = await requireUser();
  const supabase = await createClient();

  const { data: accounts } = await supabase.from('profiles').select('*').order('role');

  const github = isGitHubConfigured()
    ? await checkConnection()
    : { ok: false, message: 'No GitHub token configured — publishing is disabled.' };

  const owner = isOwner(profile);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Chapter details, integrations, and security controls."
      />

      <Card>
        <CardHeader title="Connections" description="Services this dashboard depends on." />
        <CardBody className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-700">GitHub (website publishing)</span>
            <Badge tone={github.ok ? 'success' : 'danger'}>{github.message}</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-700">Google Calendar</span>
            <Badge tone={settings.google_calendar_id ? 'success' : 'neutral'}>
              {settings.google_calendar_id ? 'Connected' : 'Not set'}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-700">Email notifications</span>
            <Badge tone={isEmailConfigured() ? 'success' : 'neutral'}>
              {isEmailConfigured() ? 'Enabled' : 'Off — no API key set'}
            </Badge>
          </div>
        </CardBody>
      </Card>

      <SettingsForm settings={settings} />

      <Card>
        <CardHeader
          title="Admin accounts"
          description="Everyone listed here has the same content permissions."
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-100">
            {(accounts ?? []).map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">{account.full_name}</p>
                  <p className="text-xs text-ink-500">
                    {ROLE_LABELS[account.role]} · {account.email}
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

      {owner ? (
        <SecurityControls settings={settings} accounts={accounts ?? []} />
      ) : (
        <Alert tone="info" title="Security controls">
          Emergency lock, publishing pause, and forced password resets are limited to the account
          owner. This prevents a single compromised account from locking out the whole team. Ask
          your President or Teacher Sponsor if you need one of these.
        </Alert>
      )}
    </div>
  );
}
