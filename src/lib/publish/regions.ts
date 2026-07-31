/**
 * Region registry — the single source of truth for what the CMS controls.
 *
 * Each region corresponds to a pair of marker comments in the public site's
 * HTML:
 *
 *     <!-- cms:start officers-main -->
 *       ...generated content...
 *     <!-- cms:end officers-main -->
 *
 * Everything OUTSIDE these markers stays hand-written and is never touched by
 * a publish. That is what lets the site keep its hand-crafted design while
 * still being editable by officers who don't write code.
 *
 * Regions come in two flavours:
 *   - `prose`      — free-form content stored verbatim in `content_blocks`.
 *                    Edited with the rich-text editor, re-emitted as-is after
 *                    sanitization. No structural renderer needed.
 *   - `collection` — generated from a dedicated table (officers, sponsors,
 *                    news, events) or from settings. Has a renderer that
 *                    reproduces the site's existing markup exactly.
 */

export type RegionSource =
  | 'content_block'
  | 'officers_main'
  | 'officers_lower'
  | 'sponsors_grid'
  | 'sponsors_footer'
  | 'news_list'
  | 'events_list'
  | 'events_preview'
  | 'settings_meeting_summary'
  | 'settings_meeting_facts'
  | 'settings_social'
  | 'settings_address';

export interface RegionDef {
  key: string;
  label: string;
  /** HTML files that carry this region's markers. */
  pages: string[];
  source: RegionSource;
  /** Indentation (spaces) of the generated block, to keep git diffs clean. */
  indent: number;
  /** Which dashboard screen owns this region. */
  managedBy: string;
  description: string;
}

export const ALL_PAGES = [
  'index.html',
  'about.html',
  'officers.html',
  'sponsors.html',
  'events.html',
  'news.html',
  'join.html',
  'contact.html',
] as const;

export const REGIONS: RegionDef[] = [
  // --- Home page -------------------------------------------------------------
  {
    key: 'hero',
    label: 'Homepage hero',
    pages: ['index.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'About',
    description: 'The headline, tagline, and call-to-action buttons at the top of the homepage.',
  },
  {
    key: 'about-preview',
    label: 'Homepage — about summary',
    pages: ['index.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'About',
    description: 'The "Who We Are" summary shown on the homepage.',
  },
  {
    key: 'why-join',
    label: 'Homepage — why join cards',
    pages: ['index.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'About',
    description: 'The four benefit cards (Leadership, Community, Networking, Learning).',
  },
  {
    key: 'events-preview',
    label: 'Homepage — upcoming events',
    pages: ['index.html'],
    source: 'events_preview',
    indent: 8,
    managedBy: 'Events',
    description: 'The next 3 upcoming events. Past events disappear automatically.',
  },
  {
    key: 'sponsors-preview',
    label: 'Homepage — sponsor logos',
    pages: ['index.html'],
    source: 'sponsors_grid',
    indent: 8,
    managedBy: 'Sponsors',
    description: 'Sponsor logo grid on the homepage.',
  },

  // --- About page ------------------------------------------------------------
  {
    key: 'about-header',
    label: 'About — page header',
    pages: ['about.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'About',
    description: 'Title and intro line at the top of the About page.',
  },
  {
    key: 'about-intro',
    label: 'About — main text',
    pages: ['about.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'About',
    description: 'The main body text of the About page.',
  },
  {
    key: 'about-cards',
    label: 'About — mission cards',
    pages: ['about.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'About',
    description: 'Mission, Values, and What We Do cards.',
  },
  {
    key: 'about-semester',
    label: 'About — typical semester',
    pages: ['about.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'About',
    description: 'The "typical semester" cards.',
  },

  // --- Officers --------------------------------------------------------------
  {
    key: 'officers-header',
    label: 'Officers — page header',
    pages: ['officers.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'Officers',
    description: 'Title and intro line at the top of the Officers page.',
  },
  {
    key: 'officers-main',
    label: 'Officers — main officers',
    pages: ['officers.html'],
    source: 'officers_main',
    indent: 6,
    managedBy: 'Officers',
    description: 'The five fixed roles: President, VP, Secretary, Treasurer, Teacher Sponsor.',
  },
  {
    key: 'officers-lower',
    label: 'Officers — additional officers',
    pages: ['officers.html'],
    source: 'officers_lower',
    indent: 6,
    managedBy: 'Officers',
    description: 'Historian, Social Media Manager, and any other positions you add.',
  },

  // --- Sponsors --------------------------------------------------------------
  {
    key: 'sponsors-intro',
    label: 'Sponsors — intro text',
    pages: ['sponsors.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'Sponsors',
    description: 'Intro text and sponsorship benefits list.',
  },
  {
    key: 'sponsors-grid',
    label: 'Sponsors — logo grid',
    pages: ['sponsors.html'],
    source: 'sponsors_grid',
    indent: 6,
    managedBy: 'Sponsors',
    description: 'The full sponsor logo grid, ordered by tier.',
  },

  // --- Events ----------------------------------------------------------------
  {
    key: 'events-list',
    label: 'Events — upcoming list',
    pages: ['events.html'],
    source: 'events_list',
    indent: 8,
    managedBy: 'Events',
    description: 'Upcoming events on the Events page. Past events are removed automatically.',
  },

  // --- News ------------------------------------------------------------------
  {
    key: 'news-list',
    label: 'News — post list',
    pages: ['news.html'],
    source: 'news_list',
    indent: 8,
    managedBy: 'News',
    description: 'All published announcements, newest first.',
  },

  // --- Join / Contact --------------------------------------------------------
  {
    key: 'join-benefits',
    label: 'Join — benefits list',
    pages: ['join.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'About',
    description: 'The benefit cards shown on the Join page.',
  },
  {
    key: 'contact-info',
    label: 'Contact — details',
    pages: ['contact.html'],
    source: 'content_block',
    indent: 6,
    managedBy: 'Settings',
    description: 'Contact details shown on the Contact page.',
  },

  // --- Shared meeting info ---------------------------------------------------
  {
    key: 'meeting-summary',
    label: 'Meeting headline (home + events)',
    pages: ['index.html', 'events.html'],
    source: 'settings_meeting_summary',
    indent: 10,
    managedBy: 'Settings',
    description:
      'The "Every Friday, 10:20 – 10:50 AM" headline and location line. Edited once in ' +
      'Settings and written to both pages, which previously held separate copies.',
  },
  {
    key: 'meeting-facts',
    label: 'Meeting facts grid (home)',
    pages: ['index.html'],
    source: 'settings_meeting_facts',
    indent: 12,
    managedBy: 'Settings',
    description: 'The Day / Time / Location fact boxes on the homepage meeting card.',
  },

  // --- Footer (every page) ---------------------------------------------------
  {
    key: 'footer-sponsors',
    label: 'Footer — sponsor logos',
    pages: [...ALL_PAGES],
    source: 'sponsors_footer',
    indent: 8,
    managedBy: 'Sponsors',
    description: 'Sponsor chips in the footer of every page.',
  },
  {
    key: 'footer-social',
    label: 'Footer — social links',
    pages: [...ALL_PAGES],
    source: 'settings_social',
    indent: 8,
    managedBy: 'Settings',
    description: 'Instagram, TikTok, and Facebook links in the footer of every page.',
  },
  {
    key: 'footer-address',
    label: 'Footer — address',
    pages: [...ALL_PAGES],
    source: 'settings_address',
    indent: 10,
    managedBy: 'Settings',
    description: 'Mailing address in the footer of every page.',
  },
];

export const REGIONS_BY_KEY: Record<string, RegionDef> = Object.fromEntries(
  REGIONS.map((r) => [r.key, r])
);

/** Regions whose content lives in `content_blocks` (free-form prose). */
export const PROSE_REGION_KEYS = REGIONS.filter((r) => r.source === 'content_block').map(
  (r) => r.key
);

/** Which HTML files a set of regions touches — drives the atomic commit. */
export function pagesForRegions(regionKeys: string[]): string[] {
  const pages = new Set<string>();
  for (const key of regionKeys) {
    const region = REGIONS_BY_KEY[key];
    if (region) region.pages.forEach((p) => pages.add(p));
  }
  return [...pages].sort();
}

/** Every region fed by a given table — used to decide what a save invalidates. */
export function regionsForSource(...sources: RegionSource[]): string[] {
  return REGIONS.filter((r) => sources.includes(r.source)).map((r) => r.key);
}
