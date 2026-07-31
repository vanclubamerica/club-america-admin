/**
 * Where each CMS region lives in the hand-written HTML.
 *
 * Anchors are exact substrings copied from the current site. The migration
 * script fails loudly on any anchor it cannot find uniquely rather than
 * guessing — a wrong guess here would corrupt the live website.
 *
 * If a future redesign changes these tags, update the anchors here and re-run
 * `npm run migrate:public-site` against a branch.
 */

export type AnchorStrategy = 'element' | 'inner' | 'run' | 'span' | 'span-elements';

export interface AnchorDef {
  region: string;
  strategy: AnchorStrategy;
  /** Opening tag (element/inner/run/span-elements) or the first line (span). */
  anchor: string;
  /** Closing line (`span`) or the second opening tag (`span-elements`). */
  endAnchor?: string;
}

const FOOTER_ANCHORS: AnchorDef[] = [
  { region: 'footer-sponsors', strategy: 'inner', anchor: '<div class="footer-sponsors">' },
  // The footer social row has no style attribute; the homepage's other social
  // row does, which keeps this anchor unambiguous.
  { region: 'footer-social', strategy: 'inner', anchor: '<div class="social-row">' },
  { region: 'footer-address', strategy: 'element', anchor: '<address>' },
];

const MEETING_SUMMARY: AnchorDef = {
  region: 'meeting-summary',
  strategy: 'span',
  anchor: '<h3>Every Friday, 10:20&nbsp;&ndash;&nbsp;10:50 AM</h3>',
  endAnchor:
    '<p style="color:#c7d1da; margin-bottom:0;">College Career Center A &middot; Van High School</p>',
};

export const PAGE_ANCHORS: Record<string, AnchorDef[]> = {
  'index.html': [
    { region: 'hero', strategy: 'element', anchor: '<div class="hero__content">' },
    {
      region: 'about-preview',
      strategy: 'element',
      anchor: '<div class="grid grid--2" style="align-items:center; gap:3rem;">',
    },
    MEETING_SUMMARY,
    { region: 'meeting-facts', strategy: 'inner', anchor: '<div class="meeting-card__facts">' },
    { region: 'why-join', strategy: 'element', anchor: '<div class="grid grid--4">' },
    { region: 'events-preview', strategy: 'run', anchor: '<div class="event-row">' },
    { region: 'sponsors-preview', strategy: 'inner', anchor: '<div class="sponsor-grid reveal">' },
    ...FOOTER_ANCHORS,
  ],

  'about.html': [
    { region: 'about-header', strategy: 'element', anchor: '<section class="page-header">' },
    {
      region: 'about-intro',
      strategy: 'element',
      anchor: '<div class="grid grid--2" style="gap:3rem; align-items:start;">',
    },
    { region: 'about-cards', strategy: 'element', anchor: '<div class="grid grid--3">' },
    {
      region: 'about-semester',
      strategy: 'element',
      anchor: '<div class="grid grid--2" style="gap:1.5rem;">',
    },
    ...FOOTER_ANCHORS,
  ],

  'officers.html': [
    { region: 'officers-header', strategy: 'element', anchor: '<section class="page-header">' },
    // Two sibling grids (executive pair, then the remaining three roles) are
    // wrapped as one region so the renderer owns the whole layout.
    {
      region: 'officers-main',
      strategy: 'span-elements',
      anchor: '<div class="grid grid--2" style="margin-bottom:1.75rem;">',
      endAnchor: '<div class="grid grid--3">',
    },
    { region: 'officers-lower', strategy: 'element', anchor: '<div class="grid grid--2">' },
    ...FOOTER_ANCHORS,
  ],

  'sponsors.html': [
    { region: 'sponsors-intro', strategy: 'element', anchor: '<section class="page-header">' },
    { region: 'sponsors-grid', strategy: 'inner', anchor: '<div class="sponsor-grid reveal">' },
    ...FOOTER_ANCHORS,
  ],

  'events.html': [
    MEETING_SUMMARY,
    { region: 'events-list', strategy: 'run', anchor: '<div class="event-row">' },
    ...FOOTER_ANCHORS,
  ],

  'news.html': [
    { region: 'news-list', strategy: 'inner', anchor: '<div class="grid grid--3">' },
    ...FOOTER_ANCHORS,
  ],

  'join.html': [
    {
      region: 'join-benefits',
      strategy: 'element',
      anchor: '<div class="grid" style="gap:1.25rem; margin-top:1.5rem;">',
    },
    ...FOOTER_ANCHORS,
  ],

  'contact.html': [
    { region: 'contact-info', strategy: 'element', anchor: '<section class="page-header">' },
    ...FOOTER_ANCHORS,
  ],
};

/**
 * The theme stylesheet link, injected once per page during migration so the
 * holiday theme system has somewhere to write without ever touching style.css.
 */
export const STYLE_LINK = '<link rel="stylesheet" href="css/style.css">';
export const THEME_LINK = '<link rel="stylesheet" href="css/theme.css">';

/**
 * Known content bugs on the live site, fixed as part of the migration commit
 * so that the first publish afterwards produces an empty diff.
 */
export const CONTENT_FIXES: Array<{
  file: string;
  find: string;
  replace: string;
  reason: string;
}> = [
  {
    file: 'events.html',
    find: '<span class="badge">Colleeg Career Center A</span>',
    replace: '<span class="badge">College Career Center A</span>',
    reason: 'Typo: "Colleeg" -> "College"',
  },
  {
    file: 'events.html',
    find: '<span class="badge">CCC A</span>',
    replace: '<span class="badge">College Career Center A</span>',
    reason: 'Abbreviation "CCC A" expanded to match every other event',
  },
];

/**
 * `media/sponsors/sponsor-4.png` is referenced on two pages but does not exist
 * in the repository, so visitors see a broken image. The seed only imports
 * sponsors whose logo files are actually present, which removes the tile.
 */
export const MISSING_ASSETS = ['media/sponsors/sponsor-4.png'];
