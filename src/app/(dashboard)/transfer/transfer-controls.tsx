'use client';

import { useActionState } from 'react';
import { Printer } from 'lucide-react';
import {
  archiveSchoolYear,
  inviteOfficer,
  setAccountStatus,
  transferOwnership,
  type HandoffReport,
} from './actions';
import type { ActionState } from '@/lib/actions';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { ROLE_LABELS, ROLE_ORDER, type Profile } from '@/types/database';

/**
 * The generated handoff report.
 *
 * Rendered as a normal page section that prints cleanly, rather than a
 * generated PDF — no extra dependency, and a new president can print it,
 * annotate it, and keep it in the club binder.
 */
export function HandoffReportView({ report }: { report: HandoffReport }) {
  return (
    <Card>
      <CardHeader
        title="Leadership handoff report"
        description={`Generated ${formatDateTime(report.generatedAt)}. Print this and give it to the incoming president.`}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print
          </Button>
        }
      />
      <CardBody className="space-y-5 text-sm">
        <section>
          <h3 className="mb-1.5 font-semibold text-ink-900">Website status</h3>
          <ul className="space-y-0.5 text-ink-600">
            <li>
              Last published:{' '}
              {report.website.lastPublishedAt
                ? formatDateTime(report.website.lastPublishedAt)
                : 'never from this dashboard'}
            </li>
            <li>Publishing: {report.website.publishingEnabled ? 'enabled' : 'paused'}</li>
            <li>Active theme: {report.website.activeTheme}</li>
            <li>
              Meeting: {report.meeting.day ?? '—'}, {report.meeting.time ?? '—'} in{' '}
              {report.meeting.location ?? '—'}
            </li>
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 font-semibold text-ink-900">
            Officers shown on the website ({report.officers.length})
          </h3>
          <ul className="space-y-0.5 text-ink-600">
            {report.officers.map((officer, i) => (
              <li key={`${officer.position}-${i}`}>
                <span className="font-medium text-ink-800">{officer.position}</span> — {officer.name}
                {!officer.hasPhoto && <span className="text-flag-600"> (no photo)</span>}
                {!officer.hasBio && <span className="text-ink-400"> (no bio)</span>}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 font-semibold text-ink-900">
            Admin accounts ({report.accounts.length})
          </h3>
          <ul className="space-y-0.5 text-ink-600">
            {report.accounts.map((account) => (
              <li key={account.email}>
                {account.name} — {account.role} ({account.status})
                {account.isOwner && <span className="font-medium text-navy-600"> · OWNER</span>}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 font-semibold text-ink-900">
            Active sponsors ({report.sponsors.length})
          </h3>
          {report.sponsors.length === 0 ? (
            <p className="text-ink-500">None recorded.</p>
          ) : (
            <ul className="space-y-0.5 text-ink-600">
              {report.sponsors.map((sponsor) => (
                <li key={sponsor.name}>
                  {sponsor.name} — {sponsor.tier}
                  {sponsor.website ? ` · ${sponsor.website}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 font-semibold text-ink-900">
            Documents on file ({report.documents.length})
          </h3>
          {report.documents.length === 0 ? (
            <p className="text-ink-500">None uploaded.</p>
          ) : (
            <ul className="space-y-0.5 text-ink-600">
              {report.documents.map((doc) => (
                <li key={doc.name}>
                  {doc.name} ({doc.category}) — uploaded by {doc.uploadedBy}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 font-semibold text-ink-900">Content totals</h3>
          <p className="text-ink-600">
            {report.counts.news} news posts · {report.counts.events} events ·{' '}
            {report.counts.members} members
          </p>
        </section>
      </CardBody>
    </Card>
  );
}

export function TransferControls({
  accounts,
  currentUserId,
  defaultSchoolYear,
}: {
  accounts: Profile[];
  currentUserId: string;
  defaultSchoolYear: string;
}) {
  const [inviteState, inviteAction] = useActionState<ActionState, FormData>(inviteOfficer, {});
  const [statusState, statusAction] = useActionState<ActionState, FormData>(setAccountStatus, {});
  const [ownerState, ownerAction] = useActionState<ActionState, FormData>(transferOwnership, {});
  const [archiveState, archiveAction] = useActionState<ActionState, FormData>(
    archiveSchoolYear,
    {}
  );

  const others = accounts.filter((a) => a.id !== currentUserId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Invite an incoming officer"
          description="They receive an email and choose their own password. You never see it."
        />
        <CardBody>
          <form action={inviteAction} className="space-y-4">
            {inviteState.error && <Alert tone="danger">{inviteState.error}</Alert>}
            {inviteState.message && <Alert tone="success">{inviteState.message}</Alert>}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Full name">
                <Input name="full_name" required />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" required />
              </Field>
              <Field label="Role">
                <Select name="role" required defaultValue="secretary">
                  {ROLE_ORDER.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm">
                Send invitation
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Account status"
          description="Suspend outgoing officers once the handover is complete. Archived accounts keep their history but can never sign in again."
        />
        <CardBody>
          <form action={statusAction} className="space-y-4">
            {statusState.error && <Alert tone="danger">{statusState.error}</Alert>}
            {statusState.message && <Alert tone="success">{statusState.message}</Alert>}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Account">
                <Select name="user_id" required>
                  {others.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.full_name} ({ROLE_LABELS[account.role]})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="New status">
                <Select name="status" defaultValue="suspended">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>
              <div className="pt-6">
                <Button type="submit" size="sm" variant="outline">
                  Update status
                </Button>
              </div>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card className="border-navy-200">
        <CardHeader
          title="Transfer ownership"
          description="Hands control of accounts, emergency lock, and this page to the incoming president. You keep full content permissions."
        />
        <CardBody>
          <form action={ownerAction} className="space-y-4">
            {ownerState.error && <Alert tone="danger">{ownerState.error}</Alert>}
            {ownerState.message && <Alert tone="success">{ownerState.message}</Alert>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="New owner">
                <Select name="user_id" required>
                  {others
                    .filter((a) => a.status === 'active')
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.full_name} ({ROLE_LABELS[account.role]})
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Type TRANSFER to confirm">
                <Input name="confirm" placeholder="TRANSFER" required />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm">
                Transfer ownership
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Archive this school year"
          description="Freezes the current roster and handoff report into permanent history."
        />
        <CardBody>
          <form action={archiveAction} className="space-y-4">
            {archiveState.error && <Alert tone="danger">{archiveState.error}</Alert>}
            {archiveState.message && <Alert tone="success">{archiveState.message}</Alert>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="School year">
                <Input name="school_year" defaultValue={defaultSchoolYear} required />
              </Field>
              <Field label="Notes for future officers">
                <Textarea name="notes" rows={2} />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="outline">
                Archive year
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
