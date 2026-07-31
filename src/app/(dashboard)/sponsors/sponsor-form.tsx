'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { deleteSponsor, saveSponsor } from './actions';
import type { ActionState } from '@/lib/actions';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { ImageInput } from '@/components/image-input';
import type { Sponsor, SponsorTier } from '@/types/database';

const TIER_TONE: Record<SponsorTier, 'warning' | 'neutral' | 'info'> = {
  gold: 'warning',
  silver: 'neutral',
  bronze: 'info',
};

function SaveButton({ label = 'Save' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function SponsorFields({ sponsor }: { sponsor?: Sponsor }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name">
          <Input name="name" defaultValue={sponsor?.name ?? ''} required />
        </Field>
        <Field label="Sponsor tier" hint="Gold sponsors appear first on the website.">
          <Select name="tier" defaultValue={sponsor?.tier ?? 'bronze'}>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="bronze">Bronze</option>
          </Select>
        </Field>
      </div>

      <Field label="Website" hint="Optional. The logo becomes a link. Must start with https://">
        <Input
          name="website_url"
          type="url"
          defaultValue={sponsor?.website_url ?? ''}
          placeholder="https://example.com"
        />
      </Field>

      <Field label="Description" hint="Optional. Not shown on the current site design, but kept on file.">
        <Textarea name="description" rows={2} defaultValue={sponsor?.description ?? ''} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display order" hint="Lower numbers appear first within a tier.">
          <Input
            name="sort_order"
            type="number"
            min={0}
            defaultValue={sponsor?.sort_order ?? 0}
          />
        </Field>
        <div className="space-y-2 pt-6">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name="show_in_footer"
              defaultChecked={sponsor?.show_in_footer ?? false}
              className="h-4 w-4 rounded border-ink-300"
            />
            Show in the footer of every page
          </label>
          {sponsor && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={sponsor.is_active}
                className="h-4 w-4 rounded border-ink-300"
              />
              Show on the website
            </label>
          )}
        </div>
      </div>
    </>
  );
}

function SponsorRow({ sponsor, storageBase }: { sponsor: Sponsor; storageBase: string }) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveSponsor, {});
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteSponsor, {});
  const [open, setOpen] = useState(false);

  const logoUrl = sponsor.logo_path ? `${storageBase}${sponsor.logo_path}` : null;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${sponsor.name} logo`}
                className="h-10 w-20 rounded border border-ink-200 bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-10 w-20 items-center justify-center rounded border border-dashed border-ink-300 text-xs text-ink-400">
                No logo
              </div>
            )}
            <div>
              <p className="font-medium text-ink-900">{sponsor.name}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge tone={TIER_TONE[sponsor.tier]}>{sponsor.tier}</Badge>
                {!sponsor.is_active && <Badge tone="neutral">Hidden</Badge>}
                {sponsor.show_in_footer && <Badge tone="info">In footer</Badge>}
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'Edit'}
          </Button>
        </div>

        {saveState.error && <Alert tone="danger">{saveState.error}</Alert>}
        {saveState.message && <Alert tone="success">{saveState.message}</Alert>}
        {deleteState.error && <Alert tone="danger">{deleteState.error}</Alert>}

        {open && (
          <>
            <form action={saveAction} className="space-y-4 border-t border-ink-100 pt-4">
              <input type="hidden" name="id" value={sponsor.id} />
              <SponsorFields sponsor={sponsor} />

              <Field label="Replace logo" hint="PNG, JPG, or WebP. Large images are resized automatically. Leave empty to keep the current one.">
                <ImageInput name="logo" />
              </Field>

              <div className="flex justify-end">
                <SaveButton />
              </div>
            </form>

            <form action={deleteAction} className="flex justify-end border-t border-ink-100 pt-3">
              <input type="hidden" name="id" value={sponsor.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove sponsor
              </Button>
            </form>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function AddSponsorForm({ nextOrder }: { nextOrder: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveSponsor, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a sponsor
      </Button>
    );
  }

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <h3 className="font-semibold text-ink-900">New sponsor</h3>
          <input type="hidden" name="sort_order" value={nextOrder} />

          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {state.message && <Alert tone="success">{state.message}</Alert>}

          <SponsorFields />

          <Field label="Logo" hint="PNG, JPG, or WebP. Large images are resized automatically. Wide logos look best.">
            <ImageInput name="logo" />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton label="Add sponsor" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function SponsorList({
  sponsors,
  storageBase,
}: {
  sponsors: Sponsor[];
  storageBase: string;
}) {
  return (
    <div className="space-y-4">
      {sponsors.map((sponsor) => (
        <SponsorRow key={sponsor.id} sponsor={sponsor} storageBase={storageBase} />
      ))}
      <AddSponsorForm nextOrder={sponsors.length} />
    </div>
  );
}
