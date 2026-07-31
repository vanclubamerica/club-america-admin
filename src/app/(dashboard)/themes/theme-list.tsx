'use client';

import { useActionState, useState } from 'react';
import { Check } from 'lucide-react';
import { activateTheme, saveTheme } from './actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Badge, Button, Card, CardBody, Field, Input, Textarea } from '@/components/ui';
import type { Theme } from '@/types/database';

const COLOR_FIELDS = [
  ['primary_color', 'Primary'],
  ['secondary_color', 'Secondary'],
  ['accent_color', 'Accent'],
  ['background_color', 'Background'],
  ['text_color', 'Text'],
] as const;

function ThemeCard({ theme, active }: { theme: Theme; active: boolean }) {
  const [activateState, activateAction] = useActionState<ActionState, FormData>(activateTheme, {});
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveTheme, {});
  const [open, setOpen] = useState(false);

  const swatches = COLOR_FIELDS.map(([field]) => theme[field]).filter(Boolean) as string[];

  return (
    <Card className={active ? 'border-navy-400 ring-1 ring-navy-200' : undefined}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {swatches.length > 0 ? (
                swatches.map((color, i) => (
                  <span
                    key={`${color}-${i}`}
                    className="h-6 w-6 rounded border border-ink-200"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                ))
              ) : (
                <span className="text-xs text-ink-400">No colors — uses the site default</span>
              )}
            </div>
            <div>
              <p className="font-medium text-ink-900">{theme.name}</p>
              {active && (
                <Badge tone="success">
                  <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                  Active
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? 'Close' : 'Edit'}
            </Button>
            {!active && (
              <form action={activateAction}>
                <input type="hidden" name="key" value={theme.key} />
                <Button type="submit" size="sm">
                  Use this theme
                </Button>
              </form>
            )}
          </div>
        </div>

        {activateState.error && <Alert tone="danger">{activateState.error}</Alert>}
        {activateState.message && <Alert tone="success">{activateState.message}</Alert>}
        {saveState.error && <Alert tone="danger">{saveState.error}</Alert>}
        {saveState.message && <Alert tone="success">{saveState.message}</Alert>}

        {open && (
          <form action={saveAction} className="space-y-4 border-t border-ink-100 pt-4">
            <input type="hidden" name="key" value={theme.key} />

            <Field label="Theme name">
              <Input name="name" defaultValue={theme.name} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              {COLOR_FIELDS.map(([field, label]) => (
                <Field key={field} label={label}>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      defaultValue={theme[field] ?? '#ffffff'}
                      className="h-9 w-12 p-1"
                      onChange={(event) => {
                        const text = event.currentTarget
                          .closest('div')
                          ?.querySelector<HTMLInputElement>('input[type="text"]');
                        if (text) text.value = event.currentTarget.value;
                      }}
                      aria-label={`${label} color picker`}
                    />
                    <Input
                      type="text"
                      name={field}
                      defaultValue={theme[field] ?? ''}
                      placeholder="#0f5132"
                    />
                  </div>
                </Field>
              ))}
            </div>

            <Field label="Banner message" hint="Optional greeting shown during this season.">
              <Input name="banner_message" defaultValue={theme.banner_message ?? ''} />
            </Field>

            <Field
              label="Extra CSS"
              hint="Advanced and optional. Imports, scripts, and external URLs are removed automatically."
            >
              <Textarea
                name="extra_css"
                rows={3}
                defaultValue={theme.extra_css ?? ''}
                className="font-mono text-xs"
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" size="sm">
                Save theme
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

export function ThemeList({ themes, activeKey }: { themes: Theme[]; activeKey: string }) {
  return (
    <div className="space-y-3">
      {themes.map((theme) => (
        <ThemeCard key={theme.key} theme={theme} active={theme.key === activeKey} />
      ))}
    </div>
  );
}
