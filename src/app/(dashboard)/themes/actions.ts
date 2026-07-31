'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit';
import { optionalString, requiredString, runAction, type ActionState } from '@/lib/actions';
import { sanitizeCssColor, sanitizeThemeCss } from '@/lib/publish/sanitize';

/** Switches which theme the public website uses. */
export async function activateTheme(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const key = requiredString(formData, 'key', 'Theme');

    const { data: theme } = await supabase
      .from('themes')
      .select('*')
      .eq('key', key)
      .maybeSingle();

    if (!theme) return { error: 'That theme no longer exists.' };

    const { error } = await supabase
      .from('settings')
      .update({ active_theme_key: key, updated_by: session.userId })
      .eq('id', true);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'update',
      section: 'Themes',
      entityType: 'theme',
      entityId: key,
      summary: `${session.profile.full_name} switched the website theme to ${theme.name}`,
      newValue: { active_theme_key: key },
    });

    revalidatePath('/themes');
    return {
      ok: true,
      message: `${theme.name} selected. Publish from the Dashboard to apply it to the website.`,
    };
  });
}

/**
 * Saves a theme's colors.
 *
 * Every value is validated as a real CSS color before being stored, because
 * these are written verbatim into a public stylesheet — an unvalidated string
 * there is a CSS injection into the live site.
 */
export async function saveTheme(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const key = requiredString(formData, 'key', 'Theme');

    const colorFields = [
      'primary_color',
      'secondary_color',
      'accent_color',
      'background_color',
      'text_color',
    ] as const;

    const colors: Record<string, string | null> = {};

    for (const field of colorFields) {
      const raw = optionalString(formData, field);
      if (!raw) {
        colors[field] = null;
        continue;
      }
      const safe = sanitizeCssColor(raw);
      if (!safe) {
        return { error: `"${raw}" is not a valid color. Use a hex value like #0f5132.` };
      }
      colors[field] = safe;
    }

    const payload = {
      ...colors,
      name: optionalString(formData, 'name') ?? key,
      banner_message: optionalString(formData, 'banner_message'),
      extra_css: sanitizeThemeCss(formData.get('extra_css')) || null,
      updated_by: session.userId,
    };

    const { error } = await supabase.from('themes').update(payload).eq('key', key);
    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'update',
      section: 'Themes',
      entityType: 'theme',
      entityId: key,
      summary: `${session.profile.full_name} updated the ${payload.name} theme`,
      newValue: payload,
    });

    revalidatePath('/themes');
    return { ok: true, message: `${payload.name} saved.` };
  });
}
