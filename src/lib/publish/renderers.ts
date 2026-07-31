import {
  escapeHtml,
  sanitizeAssetPath,
  sanitizeRichText,
  sanitizeUrl,
} from './sanitize';
import type { ClubEvent, NewsPost, Officer, Settings, Sponsor } from '@/types/database';

/**
 * Region renderers.
 *
 * Each function reproduces the public site's EXISTING markup exactly — same
 * tags, same class names, same attribute order, same indentation. That is not
 * cosmetic: it means the very first publish after migration produces an empty
 * diff, which is how we prove the database seed captured the live site
 * faithfully before anyone trusts it with real edits.
 *
 * Every interpolated value passes through escapeHtml, sanitizeUrl, or
 * sanitizeAssetPath. Nothing reaches the public site unescaped.
 */

/** Officer photo alt text follows the site's existing convention. */
function officerAlt(officer: Officer): string {
  if (officer.photo_alt) return escapeHtml(officer.photo_alt);
  return escapeHtml(`Portrait of the Club America ${officer.position_title}`);
}

function renderOfficerCard(officer: Officer, extraClass = ''): string {
  const classes = `officer-card${extraClass ? ` ${extraClass}` : ''} reveal`;
  const photo = sanitizeAssetPath(officer.photo_path);

  const lines: string[] = [];
  lines.push(`<article class="${classes}">`);

  if (photo) {
    lines.push(`  <div class="officer-card__photo">`);
    lines.push(`    <img src="${photo}" alt="${officerAlt(officer)}" loading="lazy">`);
    lines.push(`  </div>`);
  }

  lines.push(`  <div class="officer-card__body">`);
  lines.push(`    <span class="officer-card__role">${escapeHtml(officer.position_title)}</span>`);
  lines.push(`    <h3 class="officer-card__name">${escapeHtml(officer.name)}</h3>`);

  if (officer.bio?.trim()) {
    lines.push(`    <p class="officer-card__bio">${escapeHtml(officer.bio.trim())}</p>`);
  }

  lines.push(`  </div>`);
  lines.push(`</article>`);

  return lines.join('\n');
}

/**
 * Main officers keep the site's original two-grid layout: President and Vice
 * President in a 2-column grid, then the remaining roles in a 3-column grid.
 */
export function renderOfficersMain(officers: Officer[]): string {
  const byRole = (key: string) => officers.find((o) => o.role_key === key && o.is_active);

  const executive = ['president', 'vice_president']
    .map(byRole)
    .filter((o): o is Officer => Boolean(o));

  const rest = ['secretary', 'treasurer', 'teacher_sponsor']
    .map(byRole)
    .filter((o): o is Officer => Boolean(o));

  const blocks: string[] = [];

  if (executive.length > 0) {
    blocks.push(
      [
        `<div class="grid grid--2" style="margin-bottom:1.75rem;">`,
        ...executive.map((o) => indent(renderOfficerCard(o), 2)),
        `</div>`,
      ].join('\n')
    );
  }

  if (rest.length > 0) {
    blocks.push(
      [
        `<div class="grid grid--3">`,
        ...rest.map((o) => indent(renderOfficerCard(o), 2)),
        `</div>`,
      ].join('\n')
    );
  }

  return blocks.join('\n\n');
}

/** Lower officers: unlimited positions in a 2-column grid, ordered by sort_order. */
export function renderOfficersLower(officers: Officer[]): string {
  const lower = officers
    .filter((o) => o.tier === 'lower' && o.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (lower.length === 0) return '';

  return [
    `<div class="grid grid--2">`,
    ...lower.map((o) => indent(renderOfficerCard(o, 'officer-card--wide'), 2)),
    `</div>`,
  ].join('\n');
}

/** Sponsors are ordered gold → silver → bronze, then by display order. */
const TIER_WEIGHT: Record<string, number> = { gold: 0, silver: 1, bronze: 2 };

export function sortSponsors(sponsors: Sponsor[]): Sponsor[] {
  return sponsors
    .filter((s) => s.is_active)
    .sort(
      (a, b) =>
        (TIER_WEIGHT[a.tier] ?? 9) - (TIER_WEIGHT[b.tier] ?? 9) ||
        a.sort_order - b.sort_order ||
        a.name.localeCompare(b.name)
    );
}

/**
 * Sponsor logo grid, used identically on the homepage and the Sponsors page.
 * A sponsor with a website becomes a link; one without stays a plain tile,
 * matching how the site renders today.
 */
export function renderSponsorGrid(sponsors: Sponsor[]): string {
  const visible = sortSponsors(sponsors).filter((s) => sanitizeAssetPath(s.logo_path));

  if (visible.length === 0) return '';

  return visible
    .map((sponsor) => {
      const logo = sanitizeAssetPath(sponsor.logo_path)!;
      const alt = escapeHtml(sponsor.logo_alt || `${sponsor.name} logo`);
      const img = `<img src="${logo}" alt="${alt}" width="140" height="70">`;
      const url = sanitizeUrl(sponsor.website_url);

      if (url) {
        const title = escapeHtml(sponsor.name);
        return (
          `<div class="sponsor-tile">` +
          `<a href="${url}" target="_blank" rel="noopener" title="${title}">${img}</a>` +
          `</div>`
        );
      }

      return `<div class="sponsor-tile">${img}</div>`;
    })
    .join('\n');
}

/** Smaller sponsor chips shown in the footer of every page. */
export function renderFooterSponsors(sponsors: Sponsor[]): string {
  const visible = sortSponsors(sponsors)
    .filter((s) => s.show_in_footer && sanitizeAssetPath(s.logo_path))
    .slice(0, 4);

  if (visible.length === 0) return '';

  return visible
    .map((sponsor) => {
      const logo = sanitizeAssetPath(sponsor.logo_path)!;
      const alt = escapeHtml(sponsor.logo_alt || `${sponsor.name} logo`);
      return (
        `<span class="footer-sponsor-chip">` +
        `<img src="${logo}" alt="${alt}" width="70" height="35">` +
        `</span>`
      );
    })
    .join('\n');
}

/** News cards, newest first, pinned posts on top. */
export function renderNewsList(posts: NewsPost[]): string {
  const published = posts
    .filter((p) => p.status === 'published')
    .sort(
      (a, b) =>
        Number(b.sort_pinned) - Number(a.sort_pinned) ||
        b.published_on.localeCompare(a.published_on)
    );

  if (published.length === 0) return '';

  return published
    .map((post) => {
      const lines: string[] = [`<article class="article-card reveal">`];

      const date = post.display_date?.trim() || formatMonthYear(post.published_on);
      lines.push(`  <span class="article-card__date">${escapeHtml(date)}</span>`);
      lines.push(`  <h3>${escapeHtml(post.title)}</h3>`);

      // Post bodies come from the rich-text editor, so they are sanitized
      // rather than escaped — the allowlist is what keeps them safe.
      const body = sanitizeRichText(post.body);
      if (body) {
        lines.push(indent(body, 2));
      }

      lines.push(`</article>`);
      return lines.join('\n');
    })
    .join('\n');
}

/**
 * Event rows. `limit` is how the homepage shows only the next 3 while the
 * Events page shows the full upcoming list — both from one source, which is
 * what stops the two pages drifting apart the way they had.
 */
export function renderEventList(events: ClubEvent[], limit?: number): string {
  const now = Date.now();

  const upcoming = events
    .filter((e) => !e.is_hidden)
    // Past events fall off automatically — no one has to remember to remove them.
    .filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const visible = typeof limit === 'number' ? upcoming.slice(0, limit) : upcoming;

  if (visible.length === 0) return '';

  return visible
    .map((event) => {
      const { day, month } = formatEventDate(event.starts_at);
      const lines: string[] = [`<div class="event-row">`];

      lines.push(
        `  <div class="event-row__date"><strong>${escapeHtml(day)}</strong>` +
          `<span>${escapeHtml(month)}</span></div>`
      );
      lines.push(`  <div>`);
      lines.push(`    <h3>${escapeHtml(event.title)}</h3>`);

      if (event.description?.trim()) {
        lines.push(`    <p>${escapeHtml(event.description.trim())}</p>`);
      }

      lines.push(`  </div>`);

      if (event.location?.trim()) {
        lines.push(`  <span class="badge">${escapeHtml(event.location.trim())}</span>`);
      }

      lines.push(`</div>`);
      return lines.join('\n');
    })
    .join('\n');
}

/**
 * The meeting headline shown on both the homepage and the Events page.
 *
 * These two pages previously carried hand-duplicated copies that were free to
 * drift; both now render from the same Settings fields.
 */
export function renderMeetingSummary(settings: Settings): string {
  const day = settings.meeting_day?.trim() || 'Friday';
  const time = settings.meeting_time?.trim() || '';
  const location = settings.meeting_location?.trim() || '';

  const headline = time ? `${day}, ${time}` : day;
  const subtitle = location ? `${location} · Van High School` : 'Van High School';

  return [
    `<h3>${escapeHtml(headline)}</h3>`,
    `<p style="color:#c7d1da; margin-bottom:0;">${escapeHtml(subtitle)}</p>`,
  ].join('\n');
}

/** The Day / Time / Location fact boxes on the homepage meeting card. */
export function renderMeetingFacts(settings: Settings): string {
  const day = settings.meeting_day?.trim() || 'Friday';
  const time = settings.meeting_time?.trim() || '';
  const location = settings.meeting_location?.trim() || '';

  return [
    `<div class="meeting-card__fact">`,
    `  <span>Day</span>`,
    `  <strong>${escapeHtml(day)}</strong>`,
    `</div>`,
    `<div class="meeting-card__fact">`,
    `  <span>Time</span>`,
    `  <strong>${escapeHtml(time)}</strong>`,
    `</div>`,
    `<div class="meeting-card__fact">`,
    `  <span>Location</span>`,
    `  <strong>${escapeHtml(location)}</strong>`,
    `</div>`,
  ].join('\n');
}

/** Footer social icons. The SVG paths are fixed; only the hrefs are editable. */
const SOCIAL_ICONS = {
  instagram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>' +
    '<circle cx="17.2" cy="6.8" r="1"/></svg>',
  tiktok:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
    '<path d="M14 4v9.5a3.5 3.5 0 11-3-3.46"/>' +
    '<path d="M14 4c.5 2.3 2 3.8 4 4.2V11c-1.6-.1-3-.6-4-1.4"/></svg>',
  facebook:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
    '<path d="M14 21v-7h2.5l.5-3H14V9c0-.9.3-1.5 1.8-1.5H17V4.8C16.6 4.7 15.6 4.6 14.5 4.6' +
    'c-2.3 0-3.9 1.4-3.9 4V11H8v3h2.6v7"/></svg>',
} as const;

export function renderFooterSocial(settings: Settings): string {
  const links: Array<[keyof typeof SOCIAL_ICONS, string | null, string]> = [
    ['instagram', settings.social_instagram, 'Club America Van on Instagram'],
    ['tiktok', settings.social_tiktok, 'Club America Van on TikTok'],
    ['facebook', settings.social_facebook, 'Club America Van on Facebook'],
  ];

  const rendered = links
    .map(([platform, url, label]) => {
      const safe = sanitizeUrl(url);
      if (!safe) return null;
      return (
        `<a href="${safe}" target="_blank" rel="noopener" ` +
        `aria-label="${escapeHtml(label)}">${SOCIAL_ICONS[platform]}</a>`
      );
    })
    .filter((v): v is string => v !== null);

  return rendered.join('\n');
}

export function renderFooterAddress(settings: Settings): string {
  const line1 = settings.contact_address_line1?.trim();
  const line2 = settings.contact_address_line2?.trim();

  if (!line1 && !line2) return '';

  const body = [line1, line2].filter(Boolean).map(escapeHtml).join('<br>');
  return `<address>${body}</address>`;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function indent(block: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return block
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n');
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Formats to the site's existing "21 / Aug" pill format, in Central Time —
 * the club's local timezone. Rendering in UTC would shift evening events onto
 * the following day.
 */
function formatEventDate(iso: string): { day: string; month: string } {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(date);

  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const monthNum = Number(parts.find((p) => p.type === 'month')?.value ?? '1');

  return { day, month: MONTHS[monthNum - 1] ?? '' };
}

function formatMonthYear(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  if (!year || !month) return isoDate;
  return `${MONTHS_LONG[month - 1]} ${year}`;
}
