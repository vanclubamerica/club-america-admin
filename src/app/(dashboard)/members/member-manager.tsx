'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { deleteMember, saveAttendance, saveMember } from './actions';
import type { ActionState } from '@/lib/actions';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { Member, MemberAttendanceStats } from '@/types/database';

export function MemberManager({
  members,
  stats,
}: {
  members: Member[];
  stats: MemberAttendanceStats[];
}) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveMember, {});
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteMember, {});
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const statsById = new Map(stats.map((s) => [s.member_id, s]));

  return (
    <div className="space-y-4">
      {saveState.error && <Alert tone="danger">{saveState.error}</Alert>}
      {saveState.message && <Alert tone="success">{saveState.message}</Alert>}
      {deleteState.error && <Alert tone="danger">{deleteState.error}</Alert>}

      <Card>
        <CardHeader
          title="Member directory"
          description="Optional. Members are never shown on the public website."
          action={
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add member
            </Button>
          }
        />
        <CardBody className="p-0">
          {adding && (
            <form action={saveAction} className="space-y-4 border-b border-ink-200 bg-ink-50 p-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Name">
                  <Input name="full_name" required />
                </Field>
                <Field label="Grade">
                  <Input name="grade" type="number" min={9} max={12} />
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" />
                </Field>
                <Field label="Position">
                  <Input name="position" placeholder="Member" />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Add member
                </Button>
              </div>
            </form>
          )}

          {members.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No members yet"
                description="Add students to keep a roster and track meeting attendance."
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Grade</Th>
                  <Th>Position</Th>
                  <Th>Joined</Th>
                  <Th>Attendance</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const stat = statsById.get(member.id);
                  const editing = editingId === member.id;

                  return (
                    <tr key={member.id}>
                      <Td>
                        {editing ? (
                          <form
                            action={saveAction}
                            id={`edit-${member.id}`}
                            className="flex flex-wrap gap-2"
                          >
                            <input type="hidden" name="id" value={member.id} />
                            <input type="hidden" name="is_active" value="true" />
                            <Input name="full_name" defaultValue={member.full_name} required />
                            <Input
                              name="grade"
                              type="number"
                              min={9}
                              max={12}
                              defaultValue={member.grade ?? ''}
                              className="w-20"
                            />
                            <Input
                              name="position"
                              defaultValue={member.position ?? ''}
                              className="w-32"
                            />
                          </form>
                        ) : (
                          <div>
                            <p className="font-medium text-ink-900">{member.full_name}</p>
                            {member.email && (
                              <p className="text-xs text-ink-500">{member.email}</p>
                            )}
                          </div>
                        )}
                      </Td>
                      <Td>{member.grade ?? '—'}</Td>
                      <Td>{member.position ?? 'Member'}</Td>
                      <Td>{formatDate(member.join_date)}</Td>
                      <Td>
                        {stat && stat.meetings_recorded > 0 ? (
                          <span>
                            {stat.attendance_percent}%{' '}
                            <span className="text-xs text-ink-500">
                              ({stat.meetings_attended}/{stat.meetings_recorded})
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          {editing ? (
                            <>
                              <Button
                                type="submit"
                                form={`edit-${member.id}`}
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingId(member.id)}
                            >
                              Edit
                            </Button>
                          )}
                          <form action={deleteAction}>
                            <input type="hidden" name="id" value={member.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Remove
                            </Button>
                          </form>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {members.length > 0 && <AttendanceForm members={members} />}
    </div>
  );
}

function AttendanceForm({ members }: { members: Member[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveAttendance, {});
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Record meeting attendance"
        description="Create a meeting and tick off who attended. Percentages update automatically."
        action={
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'New meeting'}
          </Button>
        }
      />
      {open && (
        <CardBody>
          <form action={formAction} className="space-y-4">
            {state.error && <Alert tone="danger">{state.error}</Alert>}
            {state.message && <Alert tone="success">{state.message}</Alert>}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Meeting title">
                <Input name="title" required placeholder="Weekly meeting" />
              </Field>
              <Field label="Date">
                <Input
                  name="meeting_date"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </Field>
              <Field label="Location">
                <Input name="location" placeholder="College Career Center A" />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-700">Who attended?</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {members.map((member) => (
                  <label key={member.id} className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      name="present"
                      value={member.id}
                      className="h-4 w-4 rounded border-ink-300"
                    />
                    {member.full_name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex justify-end">
              <Button type="submit" size="sm">
                Save attendance
              </Button>
            </div>
          </form>
        </CardBody>
      )}
    </Card>
  );
}
