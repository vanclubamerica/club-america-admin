import 'server-only';

import ICAL from 'ical.js';

/**
 * Google Calendar sync via the PUBLIC .ics feed.
 *
 * Deliberately not the Google Calendar API: that needs a Cloud project,
 * OAuth credentials, and a billing account attached — three things that would
 * expire or get lost the first time leadership changes hands. Any public
 * Google Calendar exposes an .ics URL that needs no key at all, which keeps
 * this working for years with nothing to renew.
 *
 * Google Calendar remains the source of truth; these events are only a cache
 * used to render the website.
 */

export interface CalendarEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
}

export interface SyncResult {
  events: CalendarEvent[];
  error?: string;
}

function icsUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(
    calendarId
  )}/public/basic.ics`;
}

/**
 * Fetches upcoming events. Recurring events are expanded so a weekly meeting
 * shows its next few occurrences rather than only its original start date.
 */
export async function fetchUpcomingEvents(
  calendarId: string,
  options: { limit?: number; horizonDays?: number } = {}
): Promise<SyncResult> {
  const limit = options.limit ?? 25;
  const horizonDays = options.horizonDays ?? 180;

  if (!calendarId.trim()) {
    return { events: [], error: 'No Google Calendar ID is configured.' };
  }

  let raw: string;

  try {
    const response = await fetch(icsUrl(calendarId), {
      // Calendars change rarely; an hour of caching keeps this cheap.
      next: { revalidate: 3600 },
      headers: { Accept: 'text/calendar' },
    });

    if (!response.ok) {
      return {
        events: [],
        error:
          response.status === 404
            ? 'That calendar could not be found, or it is not public. In Google Calendar, set "Make available to public" under sharing.'
            : `Google Calendar returned an error (${response.status}).`,
      };
    }

    raw = await response.text();
  } catch (err) {
    return {
      events: [],
      error: `Could not reach Google Calendar: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  try {
    const parsed = ICAL.parse(raw);
    const comp = new ICAL.Component(parsed);

    const now = new Date();
    const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
    const collected: CalendarEvent[] = [];

    for (const vevent of comp.getAllSubcomponents('vevent')) {
      const event = new ICAL.Event(vevent);

      // Cancelled entries stay in the feed; they should not reach the site.
      if (vevent.getFirstPropertyValue('status') === 'CANCELLED') continue;

      if (event.isRecurring()) {
        const iterator = event.iterator();
        let next = iterator.next();
        let occurrences = 0;

        // Cap iterations: an unbounded recurrence rule would loop forever.
        while (next && occurrences < 50) {
          const occurrence = next.toJSDate();
          if (occurrence > horizon) break;

          if (occurrence >= now) {
            const details = event.getOccurrenceDetails(next);
            collected.push({
              uid: `${event.uid}-${occurrence.toISOString()}`,
              title: event.summary || 'Untitled event',
              description: event.description || null,
              location: event.location || null,
              startsAt: occurrence.toISOString(),
              endsAt: details.endDate?.toJSDate().toISOString() ?? null,
              allDay: event.startDate?.isDate ?? false,
            });
            occurrences += 1;
          }

          next = iterator.next();
        }
      } else {
        const start = event.startDate?.toJSDate();
        if (!start || start < now || start > horizon) continue;

        collected.push({
          uid: event.uid,
          title: event.summary || 'Untitled event',
          description: event.description || null,
          location: event.location || null,
          startsAt: start.toISOString(),
          endsAt: event.endDate?.toJSDate().toISOString() ?? null,
          allDay: event.startDate?.isDate ?? false,
        });
      }
    }

    collected.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { events: collected.slice(0, limit) };
  } catch (err) {
    return {
      events: [],
      error: `The calendar feed could not be read: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}
