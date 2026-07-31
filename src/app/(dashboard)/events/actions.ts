'use server';

import { revalidatePath } from 'next/cache';
import { requireEditor } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit';
import {
  boolField,
  optionalString,
  requiredString,
  runAction,
  type ActionState,
} from '@/lib/actions';
import { fetchUpcomingEvents } from '@/lib/google-calendar';

/**
 * Pulls events from Google Calendar into the local cache.
 *
 * Events are matched on their calendar UID, so re-syncing updates existing
 * rows instead of duplicating them, and manually-created events are never
 * touched.
 */
export async function syncGoogleCalendar(): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const { data: settings } = await supabase
      .from('settings')
      .select('google_calendar_id')
      .eq('id', true)
      .maybeSingle();

    const calendarId = settings?.google_calendar_id?.trim();
    if (!calendarId) {
      return {
        error:
          'No Google Calendar is connected. Add the calendar ID in Settings, and make sure the calendar is public.',
      };
    }

    const { events, error } = await fetchUpcomingEvents(calendarId);
    if (error) return { error };

    if (events.length === 0) {
      return { ok: true, message: 'The calendar has no upcoming events in the next 6 months.' };
    }

    let added = 0;
    let updated = 0;

    for (const event of events) {
      const { data: existing } = await supabase
        .from('events')
        .select('id')
        .eq('external_uid', event.uid)
        .maybeSingle();

      const payload = {
        title: event.title,
        description: event.description,
        location: event.location,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        all_day: event.allDay,
        source: 'google_calendar' as const,
        external_uid: event.uid,
        updated_by: session.userId,
      };

      if (existing) {
        await supabase.from('events').update(payload).eq('id', existing.id);
        updated += 1;
      } else {
        await supabase.from('events').insert(payload);
        added += 1;
      }
    }

    await recordAudit(session.profile, {
      action: 'update',
      section: 'Events',
      summary: `${session.profile.full_name} synced Google Calendar (${added} added, ${updated} updated)`,
      newValue: { added, updated },
    });

    revalidatePath('/events');
    return {
      ok: true,
      message: `Synced. ${added} new event${added === 1 ? '' : 's'}, ${updated} updated.`,
    };
  });
}

export async function saveEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = optionalString(formData, 'id');
    const title = requiredString(formData, 'title', 'Title');
    const startsAtLocal = requiredString(formData, 'starts_at', 'Date and time');

    const startsAt = new Date(startsAtLocal);
    if (Number.isNaN(startsAt.getTime())) return { error: 'That date and time is not valid.' };

    const { data: existing } = id
      ? await supabase.from('events').select('*').eq('id', id).maybeSingle()
      : { data: null };

    const payload = {
      title,
      description: optionalString(formData, 'description'),
      location: optionalString(formData, 'location'),
      starts_at: startsAt.toISOString(),
      is_hidden: boolField(formData, 'is_hidden'),
      source: existing?.source ?? ('manual' as const),
      updated_by: session.userId,
    };

    const { error } = existing
      ? await supabase.from('events').update(payload).eq('id', existing.id)
      : await supabase.from('events').insert(payload);

    if (error) throw error;

    await recordAudit(session.profile, {
      action: existing ? 'update' : 'create',
      section: 'Events',
      entityType: 'event',
      entityId: existing?.id,
      summary: `${session.profile.full_name} ${existing ? 'updated' : 'added'} the event "${title}"`,
      previousValue: existing ?? null,
      newValue: payload,
    });

    revalidatePath('/events');
    return { ok: true, message: `"${title}" saved.` };
  });
}

export async function deleteEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireEditor();
    const supabase = await createClient();

    const id = requiredString(formData, 'id', 'Event');
    const { data: existing } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return { error: 'That event no longer exists.' };

    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(session.profile, {
      action: 'delete',
      section: 'Events',
      entityType: 'event',
      entityId: id,
      summary: `${session.profile.full_name} removed the event "${existing.title}"`,
      previousValue: existing,
    });

    revalidatePath('/events');
    return { ok: true, message: `"${existing.title}" removed.` };
  });
}
