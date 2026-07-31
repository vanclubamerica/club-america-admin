import { parse, type HTMLElement } from 'node-html-parser';

/**
 * Reads the existing hand-written site into structured seed data.
 *
 * This runs once, during migration. Its job is to make the database an exact
 * mirror of what is already published, so that nothing an officer wrote over
 * the years is silently lost the first time someone hits Publish.
 */

export interface SeedOfficer {
  tier: 'main' | 'lower';
  role_key: string | null;
  position_title: string;
  name: string;
  bio: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  sort_order: number;
}

export interface SeedSponsor {
  name: string;
  logo_path: string;
  logo_alt: string;
  tier: 'gold' | 'silver' | 'bronze';
  sort_order: number;
  show_in_footer: boolean;
}

export interface SeedNews {
  title: string;
  body: string;
  display_date: string;
  published_on: string;
  status: 'published';
}

export interface SeedEvent {
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  source: 'manual';
}

export interface SeedSettings {
  meeting_day: string;
  meeting_time: string;
  meeting_location: string;
  contact_address_line1: string;
  contact_address_line2: string;
  social_instagram: string | null;
  social_tiktok: string | null;
  social_facebook: string | null;
}

/** Maps the site's role labels onto the five fixed role keys. */
const ROLE_KEY_BY_LABEL: Record<string, string> = {
  president: 'president',
  'vice president': 'vice_president',
  secretary: 'secretary',
  treasurer: 'treasurer',
  'teacher sponsor': 'teacher_sponsor',
};

/**
 * Decodes the named entities the site actually uses. A full entity table is
 * unnecessary here and a dependency we would rather not carry.
 */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&middot;': '·',
    '&rsquo;': '’',
    '&lsquo;': '‘',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&hellip;': '…',
  };

  return text
    .replace(/&[a-z]+;/gi, (m) => named[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function textOf(el: HTMLElement | null): string {
  if (!el) return '';
  return decodeEntities(el.innerHTML)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// -----------------------------------------------------------------------------
// Officers
// -----------------------------------------------------------------------------

export function extractOfficers(officersHtml: string): SeedOfficer[] {
  const root = parse(officersHtml);
  const officers: SeedOfficer[] = [];
  let lowerOrder = 0;

  for (const card of root.querySelectorAll('article.officer-card')) {
    const roleLabel = textOf(card.querySelector('.officer-card__role'));
    // Main cards use h3.officer-card__name; the Historian card uses a bare h3,
    // which is exactly the kind of inconsistency the CMS normalizes away.
    const name =
      textOf(card.querySelector('.officer-card__name')) || textOf(card.querySelector('h3'));
    const bio = textOf(card.querySelector('.officer-card__bio'));

    const img = card.querySelector('.officer-card__photo img');
    const photoPath = img?.getAttribute('src')?.trim() ?? null;
    const photoAlt = img ? decodeEntities(img.getAttribute('alt') ?? '') : null;

    if (!name) continue;

    const roleKey = ROLE_KEY_BY_LABEL[roleLabel.toLowerCase()] ?? null;

    officers.push({
      tier: roleKey ? 'main' : 'lower',
      role_key: roleKey,
      position_title: roleLabel || 'Officer',
      name,
      bio: bio || null,
      photo_path: photoPath,
      photo_alt: photoAlt || null,
      sort_order: roleKey ? 0 : lowerOrder++,
    });
  }

  return officers;
}

// -----------------------------------------------------------------------------
// Sponsors
// -----------------------------------------------------------------------------

/**
 * `existingAssets` filters out logos referenced in HTML but missing from the
 * repository — which is how the broken sponsor-4 tile disappears.
 */
export function extractSponsors(
  sponsorsHtml: string,
  footerHtml: string,
  existingAssets: Set<string>
): SeedSponsor[] {
  const root = parse(sponsorsHtml);
  const sponsors: SeedSponsor[] = [];

  const footerLogos = new Set(
    parse(footerHtml)
      .querySelectorAll('.footer-sponsor-chip img')
      .map((img) => img.getAttribute('src')?.trim())
      .filter((src): src is string => Boolean(src))
  );

  let order = 0;

  for (const tile of root.querySelectorAll('.sponsor-tile img')) {
    const src = tile.getAttribute('src')?.trim();
    if (!src) continue;
    if (!existingAssets.has(src)) continue; // broken reference — drop it

    const alt = decodeEntities(tile.getAttribute('alt') ?? '').trim();

    sponsors.push({
      // The current site stores no sponsor names, only logo files. Officers
      // fill in real names from the dashboard; this keeps them distinguishable
      // until then.
      name: deriveSponsorName(src),
      logo_path: src,
      logo_alt: alt || 'Sponsor logo',
      tier: 'bronze',
      sort_order: order++,
      show_in_footer: footerLogos.has(src),
    });
  }

  return sponsors;
}

function deriveSponsorName(src: string): string {
  const file = src.split('/').pop() ?? src;
  const base = file.replace(/\.[a-z0-9]+$/i, '');
  return base
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// -----------------------------------------------------------------------------
// News
// -----------------------------------------------------------------------------

export function extractNews(newsHtml: string): SeedNews[] {
  const root = parse(newsHtml);
  const posts: SeedNews[] = [];

  for (const card of root.querySelectorAll('article.article-card')) {
    const displayDate = textOf(card.querySelector('.article-card__date'));
    const title = textOf(card.querySelector('h3'));
    const paragraph = card.querySelector('p');

    if (!title) continue;

    posts.push({
      title,
      // Kept as HTML so the rich-text editor opens it with formatting intact.
      body: paragraph ? `<p>${paragraph.innerHTML.trim()}</p>` : '',
      display_date: displayDate,
      published_on: monthYearToDate(displayDate),
      status: 'published',
    });
  }

  return posts;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** "August 2026" -> "2026-08-01". Falls back to today if unparseable. */
function monthYearToDate(display: string): string {
  const match = display.trim().toLowerCase().match(/([a-z]+)\s+(\d{4})/);
  if (!match) return new Date().toISOString().slice(0, 10);

  const monthIdx = MONTH_NAMES.indexOf(match[1]);
  if (monthIdx === -1) return new Date().toISOString().slice(0, 10);

  return `${match[2]}-${String(monthIdx + 1).padStart(2, '0')}-01`;
}

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

const MONTH_ABBR = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function parseEventRows(html: string): SeedEvent[] {
  const root = parse(html);
  const events: SeedEvent[] = [];

  for (const row of root.querySelectorAll('.event-row')) {
    const day = textOf(row.querySelector('.event-row__date strong'));
    const month = textOf(row.querySelector('.event-row__date span'));
    const title = textOf(row.querySelector('h3'));
    const description = textOf(row.querySelector('div > p'));
    const location = textOf(row.querySelector('.badge'));

    if (!title || !day || !month) continue;

    const startsAt = nextOccurrence(Number(day), month);
    if (!startsAt) continue;

    events.push({
      title,
      description: description || null,
      location: location || null,
      starts_at: startsAt,
      source: 'manual',
    });
  }

  return events;
}

/**
 * The site records only a day and month ("21 Aug"), so the year is inferred as
 * the next time that date occurs. Anchored to the club's Central timezone at
 * 10:20am, the standard meeting time.
 */
function nextOccurrence(day: number, monthAbbr: string, now = new Date()): string | null {
  const monthIdx = MONTH_ABBR.indexOf(monthAbbr.slice(0, 3).toLowerCase());
  if (monthIdx === -1 || !Number.isFinite(day)) return null;

  const year = now.getUTCFullYear();
  // 15:20 UTC is 10:20 America/Chicago during daylight saving time.
  let candidate = new Date(Date.UTC(year, monthIdx, day, 15, 20, 0));

  if (candidate.getTime() < now.getTime()) {
    candidate = new Date(Date.UTC(year + 1, monthIdx, day, 15, 20, 0));
  }

  return candidate.toISOString();
}

/**
 * Merges the two event lists, which had drifted apart. The Events page wins on
 * conflicts — its own copy tells visitors it is "the most accurate source".
 */
export function extractEvents(indexHtml: string, eventsHtml: string): SeedEvent[] {
  const fromEventsPage = parseEventRows(eventsHtml);
  const fromHomepage = parseEventRows(indexHtml);

  const byTitle = new Map<string, SeedEvent>();

  for (const event of fromEventsPage) {
    byTitle.set(event.title.toLowerCase(), event);
  }
  for (const event of fromHomepage) {
    const key = event.title.toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, event);
  }

  return [...byTitle.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------

export function extractSettings(indexHtml: string): SeedSettings {
  const root = parse(indexHtml);

  const facts = root.querySelectorAll('.meeting-card__fact');
  const factValue = (label: string): string => {
    for (const fact of facts) {
      if (textOf(fact.querySelector('span')).toLowerCase() === label.toLowerCase()) {
        return textOf(fact.querySelector('strong'));
      }
    }
    return '';
  };

  const address = root.querySelector('address');
  const addressLines = address
    ? decodeEntities(address.innerHTML)
        .split(/<br\s*\/?>/i)
        .map((line) => line.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
    : [];

  const socialHref = (fragment: string): string | null => {
    for (const link of root.querySelectorAll('.site-footer .social-row a')) {
      const href = link.getAttribute('href');
      if (href?.includes(fragment)) return href;
    }
    return null;
  };

  return {
    meeting_day: factValue('Day') || 'Friday',
    meeting_time: factValue('Time') || '10:20 – 10:50 AM',
    meeting_location: factValue('Location') || 'College Career Center A',
    contact_address_line1: addressLines[0] ?? '985 N Maple St',
    contact_address_line2: addressLines[1] ?? 'Van, TX 75790',
    social_instagram: socialHref('instagram.com'),
    social_tiktok: socialHref('tiktok.com'),
    social_facebook: socialHref('facebook.com'),
  };
}
