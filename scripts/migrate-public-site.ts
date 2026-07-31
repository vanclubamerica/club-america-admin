/**
 * One-time migration of the public website into a CMS-managed site.
 *
 * What it does, per page:
 *   1. Wraps each managed block in `<!-- cms:start KEY -->` markers.
 *   2. Replaces collection blocks (officers, sponsors, news, events, footer)
 *      with output rendered from the data it just extracted.
 *   3. Adds the theme stylesheet link.
 *   4. Fixes the known content bugs.
 *
 * Step 2 is the important one. Because the file is written with exactly what
 * the renderers produce, the FIRST PUBLISH FROM THE DASHBOARD IS A NO-OP. The
 * script asserts this before writing anything: it re-renders every region from
 * the extracted data and compares against the file it is about to save. If any
 * region disagrees, it refuses to write.
 *
 * Usage:
 *   npm run migrate:public-site               # dry run, prints a report
 *   npm run migrate:public-site -- --write    # actually modify the files
 *   npm run migrate:public-site -- --write --site ../clubamerica
 *
 * Nothing is committed or pushed. Review with `git diff` in the website repo,
 * then commit yourself.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PAGE_ANCHORS, CONTENT_FIXES, STYLE_LINK, THEME_LINK, type AnchorDef } from './lib/anchors';
import {
  applySplice,
  locateElement,
  locateInner,
  locateRun,
  locateSpan,
  locateSpanElements,
  type Splice,
} from './lib/html-surgery';
import {
  extractEvents,
  extractNews,
  extractOfficers,
  extractSettings,
  extractSponsors,
} from './lib/extract';
import { REGIONS_BY_KEY } from '../src/lib/publish/regions';
import { replaceRegion } from '../src/lib/publish/markers';
import {
  renderEventList,
  renderFooterAddress,
  renderFooterSocial,
  renderFooterSponsors,
  renderMeetingFacts,
  renderMeetingSummary,
  renderNewsList,
  renderOfficersLower,
  renderOfficersMain,
  renderSponsorGrid,
} from '../src/lib/publish/renderers';

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const siteArgIdx = args.indexOf('--site');
const SITE_PATH = resolve(
  siteArgIdx !== -1 && args[siteArgIdx + 1]
    ? args[siteArgIdx + 1]
    : process.env.PUBLIC_SITE_PATH || '../clubamerica'
);

const OUTPUT_DIR = resolve('./scripts/output');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function heading(text: string) {
  console.log(`\n${c.bold}${c.cyan}${text}${c.reset}`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  heading('Club America — public site migration');
  console.log(`Site:  ${SITE_PATH}`);
  console.log(`Mode:  ${WRITE ? `${c.yellow}WRITE${c.reset}` : `${c.dim}dry run${c.reset}`}`);

  if (!existsSync(SITE_PATH)) {
    fail(
      `Website folder not found at ${SITE_PATH}.\n` +
        `Pass the path explicitly:  npm run migrate:public-site -- --site ../clubamerica`
    );
  }

  const pages = Object.keys(PAGE_ANCHORS);
  const originals: Record<string, string> = {};

  const alreadyMigrated = pages.filter((page) => {
    const path = join(SITE_PATH, page);
    return existsSync(path) && readFileSync(path, 'utf8').includes('<!-- cms:start ');
  });

  if (alreadyMigrated.length > 0 && !args.includes('--force')) {
    fail(
      `These pages already contain CMS markers:\n` +
        alreadyMigrated.map((p) => `  - ${p}`).join('\n') +
        `\n\nRunning again would nest markers inside each other and corrupt the pages.\n` +
        `The migration only needs to run once. If you are genuinely re-migrating after\n` +
        `reverting the site, pass --force.`
    );
  }

  for (const page of pages) {
    const path = join(SITE_PATH, page);
    if (!existsSync(path)) fail(`Expected page not found: ${path}`);
    // Content fixes are applied BEFORE extraction so the corrected text flows
    // into the database too. Fixing only the HTML would leave the typo in the
    // seed data, and the next publish would put it straight back.
    originals[page] = applyContentFixes(page, readFileSync(path, 'utf8'));
  }

  // --- 1. Extract the current content ---------------------------------------
  heading('1. Reading current website content');

  const existingAssets = collectExistingAssets(SITE_PATH);

  const officers = extractOfficers(originals['officers.html']);
  const sponsors = extractSponsors(
    originals['sponsors.html'],
    originals['index.html'],
    existingAssets
  );
  const news = extractNews(originals['news.html']);
  const events = extractEvents(originals['index.html'], originals['events.html']);
  const settings = extractSettings(originals['index.html']);

  console.log(`  officers  ${officers.length} (${officers.filter((o) => o.tier === 'main').length} main, ${officers.filter((o) => o.tier === 'lower').length} additional)`);
  console.log(`  sponsors  ${sponsors.length}`);
  console.log(`  news      ${news.length}`);
  console.log(`  events    ${events.length} ${c.dim}(merged from index.html + events.html)${c.reset}`);
  console.log(`  meeting   ${settings.meeting_day}, ${settings.meeting_time} — ${settings.meeting_location}`);

  const droppedAssets = findDroppedSponsors(originals['sponsors.html'], existingAssets);
  for (const asset of droppedAssets) {
    console.log(`  ${c.yellow}dropped${c.reset}   ${asset} ${c.dim}(referenced but missing from the repo)${c.reset}`);
  }

  // --- 2. Build the rendered content for every region -----------------------
  const rendered = buildRenderedRegions({ officers, sponsors, news, events, settings });

  // --- 3. Rewrite each page --------------------------------------------------
  heading('2. Inserting markers and normalizing content');

  const updated: Record<string, string> = {};
  const proseBlocks: Record<string, { page: string; html: string }> = {};

  for (const page of pages) {
    const anchors = PAGE_ANCHORS[page];
    let html = originals[page];

    // Locate every region first, then splice back-to-front so that earlier
    // offsets stay valid as the document grows.
    const located: Array<{ def: AnchorDef; splice: Splice }> = [];

    for (const def of anchors) {
      try {
        located.push({ def, splice: locate(html, def, page) });
      } catch (err) {
        fail(
          `Could not locate region "${def.region}" in ${page}.\n  ${(err as Error).message}\n\n` +
            `The page markup may have changed since this script was written. ` +
            `Update scripts/lib/anchors.ts.`
        );
      }
    }

    located.sort((a, b) => b.splice.start - a.splice.start);

    for (const { def, splice } of located) {
      const region = REGIONS_BY_KEY[def.region];
      if (!region) fail(`Unknown region "${def.region}" — not present in regions.ts`);

      let content: string;

      if (region.source === 'content_block') {
        // Prose keeps its original markup verbatim; it becomes editable text
        // rather than regenerated structure. Stored dedented so the database
        // holds content, not the page's indentation.
        content = dedent(splice.inner, splice.indent);
        proseBlocks[def.region] = { page, html: content };
      } else {
        content = rendered[def.region] ?? '';
      }

      html = applySplice(html, splice, def.region, content);
    }

    html = addThemeLink(html);

    updated[page] = html;

    const regionCount = anchors.length;
    const changed = html !== originals[page];
    console.log(
      `  ${changed ? c.green + '✓' + c.reset : c.dim + '·' + c.reset} ${page.padEnd(16)} ${regionCount} regions`
    );
  }

  // --- 4. Verify a publish would be a no-op ---------------------------------
  heading('3. Verifying the first publish will change nothing');

  const mismatches: string[] = [];

  // Simulate a real publish: run the SAME replaceRegion() the dashboard uses
  // over the migrated file, for every region on the page. If the result is
  // byte-identical, publishing genuinely cannot change anything.
  for (const page of pages) {
    let simulated = updated[page];

    for (const def of PAGE_ANCHORS[page]) {
      const region = REGIONS_BY_KEY[def.region];
      if (!region) continue;

      const content =
        region.source === 'content_block'
          ? (proseBlocks[def.region]?.html ?? '')
          : (rendered[def.region] ?? '');

      simulated = replaceRegion(simulated, def.region, content, page);
    }

    if (simulated !== updated[page]) {
      mismatches.push(`${page}\n${c.dim}${firstDifference(updated[page], simulated)}${c.reset}`);
    }
  }

  if (mismatches.length > 0) {
    console.log(`  ${c.red}✗ ${mismatches.length} region(s) would change on first publish${c.reset}\n`);
    mismatches.forEach((m) => console.log(`  ${m}\n`));
    fail(
      'Refusing to write. The renderers do not reproduce what this script is about to ' +
        'save, which means publishing would produce an unexpected diff on the live site.'
    );
  }

  console.log(`  ${c.green}✓${c.reset} every generated region round-trips exactly`);

  // --- 5. Write ---------------------------------------------------------------
  const seed = {
    generatedAt: new Date().toISOString(),
    sourcePath: SITE_PATH,
    settings,
    officers,
    sponsors,
    news,
    events,
    blocks: Object.entries(proseBlocks).map(([key, value]) => ({
      key,
      page: value.page,
      label: REGIONS_BY_KEY[key]?.label ?? key,
      kind: 'prose',
      data: { html: value.html },
    })),
  };

  if (!WRITE) {
    heading('Dry run complete — nothing was written');
    console.log(`Re-run with ${c.bold}--write${c.reset} to apply:\n`);
    console.log(`  npm run migrate:public-site -- --write\n`);
    summarizeFixes();
    return;
  }

  heading('4. Writing files');

  for (const page of pages) {
    writeFileSync(join(SITE_PATH, page), updated[page], 'utf8');
    console.log(`  wrote ${join(SITE_PATH, page)}`);
  }

  const themeCssPath = join(SITE_PATH, 'css', 'theme.css');
  if (!existsSync(themeCssPath)) {
    writeFileSync(
      themeCssPath,
      '/* Generated by the Club America admin dashboard. Do not edit by hand. */\n' +
        '/* Theme: Normal — no overrides. */\n',
      'utf8'
    );
    console.log(`  wrote ${themeCssPath}`);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const seedPath = join(OUTPUT_DIR, 'seed-data.json');
  writeFileSync(seedPath, JSON.stringify(seed, null, 2), 'utf8');
  console.log(`  wrote ${seedPath}`);

  summarizeFixes();

  heading('Next steps');
  console.log(`  1. Review the changes:   ${c.bold}cd ${SITE_PATH} && git diff${c.reset}`);
  console.log(`  2. Commit them on a branch first, not straight to main.`);
  console.log(`  3. Load the content into Supabase:  ${c.bold}npm run seed:content${c.reset}\n`);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function locate(html: string, def: AnchorDef, page: string): Splice {
  switch (def.strategy) {
    case 'element':
      return locateElement(html, def.anchor, page);
    case 'inner':
      return locateInner(html, def.anchor, page);
    case 'run':
      return locateRun(html, def.anchor, page);
    case 'span':
      return locateSpan(html, def.anchor, def.endAnchor!, page);
    case 'span-elements':
      return locateSpanElements(html, def.anchor, def.endAnchor!, page);
  }
}

interface SeedBundle {
  officers: ReturnType<typeof extractOfficers>;
  sponsors: ReturnType<typeof extractSponsors>;
  news: ReturnType<typeof extractNews>;
  events: ReturnType<typeof extractEvents>;
  settings: ReturnType<typeof extractSettings>;
}

/**
 * Renders every generated region from the extracted data, using the SAME
 * renderers the dashboard uses at publish time. That shared code path is what
 * makes the no-op guarantee meaningful.
 */
function buildRenderedRegions(seed: SeedBundle): Record<string, string> {
  // The renderers expect database rows; seed records carry the same fields
  // plus defaults the database would supply.
  const officers = seed.officers.map((o, i) => ({
    ...o,
    id: `seed-${i}`,
    email: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    updated_by: null,
  })) as never[];

  const sponsors = seed.sponsors.map((s, i) => ({
    ...s,
    id: `seed-${i}`,
    website_url: null,
    description: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    updated_by: null,
  })) as never[];

  const news = seed.news.map((n, i) => ({
    ...n,
    id: `seed-${i}`,
    slug: null,
    excerpt: null,
    author_name: null,
    image_path: null,
    image_alt: null,
    sort_pinned: false,
    created_at: '',
    updated_at: '',
    created_by: null,
    updated_by: null,
  })) as never[];

  const events = seed.events.map((e, i) => ({
    ...e,
    id: `seed-${i}`,
    ends_at: null,
    all_day: false,
    external_uid: null,
    is_hidden: false,
    created_at: '',
    updated_at: '',
    updated_by: null,
  })) as never[];

  const settings = { ...seed.settings } as never;

  return {
    'officers-main': renderOfficersMain(officers),
    'officers-lower': renderOfficersLower(officers),
    'sponsors-grid': renderSponsorGrid(sponsors),
    'sponsors-preview': renderSponsorGrid(sponsors),
    'footer-sponsors': renderFooterSponsors(sponsors),
    'news-list': renderNewsList(news),
    'events-list': renderEventList(events),
    'events-preview': renderEventList(events, 3),
    'meeting-summary': renderMeetingSummary(settings),
    'meeting-facts': renderMeetingFacts(settings),
    'footer-social': renderFooterSocial(settings),
    'footer-address': renderFooterAddress(settings),
  };
}

/** Every media file that actually exists, used to drop broken references. */
function collectExistingAssets(sitePath: string): Set<string> {
  const found = new Set<string>();
  const mediaRoot = join(sitePath, 'media');
  if (!existsSync(mediaRoot)) return found;

  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else found.add(rel);
    }
  };

  walk(mediaRoot, 'media');
  return found;
}

function findDroppedSponsors(sponsorsHtml: string, existing: Set<string>): string[] {
  const referenced = [...sponsorsHtml.matchAll(/src="(media\/sponsors\/[^"]+)"/g)].map((m) => m[1]);
  return [...new Set(referenced)].filter((src) => !existing.has(src));
}

/** Inserts the theme stylesheet link after style.css, once. */
function addThemeLink(html: string): string {
  if (html.includes(THEME_LINK)) return html;
  if (!html.includes(STYLE_LINK)) return html;
  return html.replace(STYLE_LINK, `${STYLE_LINK}\n${THEME_LINK}`);
}

function applyContentFixes(page: string, html: string): string {
  let result = html;
  for (const fix of CONTENT_FIXES) {
    if (fix.file !== page) continue;
    result = result.split(fix.find).join(fix.replace);
  }
  return result;
}

function summarizeFixes() {
  heading('Content fixes included');
  for (const fix of CONTENT_FIXES) {
    console.log(`  ${fix.file.padEnd(16)} ${fix.reason}`);
  }
  console.log(`  index/events     Event lists merged into one source`);
  console.log(`  sponsors/index   Broken sponsor-4.png tile removed`);
}

/** Removes a uniform indent so stored prose is not double-indented later. */
function dedent(block: string, indent: string): string {
  if (!indent) return block;
  return block
    .split('\n')
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n');
}

/** Pinpoints where two versions of a page diverge, for the failure report. */
function firstDifference(expected: string, actual: string): string {
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) i++;

  const line = expected.slice(0, i).split('\n').length;
  const context = 60;
  const from = Math.max(0, i - 20);

  return (
    `  diverges at line ${line}\n` +
    `  migrated: ${JSON.stringify(expected.slice(from, from + context))}\n` +
    `  publish:  ${JSON.stringify(actual.slice(from, from + context))}`
  );
}

function fail(message: string): never {
  console.error(`\n${c.red}${c.bold}Migration aborted${c.reset}\n${message}\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n${c.red}Unexpected error:${c.reset}`, err);
  process.exit(1);
});
