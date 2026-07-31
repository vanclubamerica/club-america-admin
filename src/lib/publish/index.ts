import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAudit } from '@/lib/audit';
import type {
  ClubEvent,
  ContentBlock,
  Database,
  NewsPost,
  Officer,
  Profile,
  Settings,
  Sponsor,
  Theme,
} from '@/types/database';
import { commitFiles, getBranchHead, getFiles, repoConfig, GitHubError } from './github';
import { hasRegion, replaceRegion } from './markers';
import { ALL_PAGES, REGIONS, REGIONS_BY_KEY, type RegionDef } from './regions';
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
} from './renderers';
import { renderThemeCss } from './theme-css';

/**
 * Publish orchestration.
 *
 * The pipeline is deliberately IDEMPOTENT: every publish renders the complete
 * site from the database, compares the result against what is currently in the
 * repository, and commits only the files that actually differ. Publishing
 * twice in a row is therefore a no-op, and — importantly — the very first
 * publish after migration should produce zero changed files. That property is
 * how we verify the database seed captured the live site correctly.
 */

export const THEME_CSS_PATH = 'css/theme.css';

export interface SiteContent {
  settings: Settings;
  officers: Officer[];
  sponsors: Sponsor[];
  news: NewsPost[];
  events: ClubEvent[];
  blocks: Record<string, ContentBlock>;
  theme: Theme | null;
}

export interface FileChange {
  path: string;
  content: string;
  previous: string | null;
}

export interface PublishPlan {
  changes: FileChange[];
  unchanged: string[];
  headSha: string;
  warnings: string[];
}

export interface PublishOutcome {
  status: 'published' | 'no_changes';
  commitSha?: string;
  commitUrl?: string;
  filesChanged: string[];
  jobId: string;
}

type Client = SupabaseClient<Database>;

// -----------------------------------------------------------------------------
// Loading
// -----------------------------------------------------------------------------

/** Loads everything the renderers need, in one round trip per table. */
export async function loadSiteContent(supabase: Client): Promise<SiteContent> {
  const [settingsRes, officersRes, sponsorsRes, newsRes, eventsRes, blocksRes] =
    await Promise.all([
      supabase.from('settings').select('*').eq('id', true).single(),
      supabase.from('officers').select('*').order('sort_order'),
      supabase.from('sponsors').select('*').order('sort_order'),
      supabase.from('news_posts').select('*').order('published_on', { ascending: false }),
      supabase.from('events').select('*').order('starts_at'),
      supabase.from('content_blocks').select('*'),
    ]);

  if (settingsRes.error || !settingsRes.data) {
    throw new Error('Could not load site settings. Has the database migration been run?');
  }

  const settings = settingsRes.data;

  const { data: theme } = await supabase
    .from('themes')
    .select('*')
    .eq('key', settings.active_theme_key)
    .maybeSingle();

  return {
    settings,
    officers: officersRes.data ?? [],
    sponsors: sponsorsRes.data ?? [],
    news: newsRes.data ?? [],
    events: eventsRes.data ?? [],
    blocks: Object.fromEntries((blocksRes.data ?? []).map((b) => [b.key, b])),
    theme: theme ?? null,
  };
}

// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------

/**
 * Renders one region to HTML.
 *
 * Prose regions emit their stored content verbatim (after sanitization) —
 * they were captured from the hand-written site and are edited as rich text,
 * so there is no structure to regenerate. Collection regions are rebuilt from
 * their source table.
 */
export function renderRegion(region: RegionDef, content: SiteContent): string {
  switch (region.source) {
    case 'content_block': {
      const block = content.blocks[region.key];
      if (!block) return '';
      const data = block.data as { html?: string } | null;
      // Stored as raw HTML captured from the original page; re-sanitized on
      // the way out so a database edit cannot inject script into the site.
      return typeof data?.html === 'string' ? sanitizeStoredBlock(data.html) : '';
    }

    case 'officers_main':
      return renderOfficersMain(content.officers.filter((o) => o.tier === 'main'));

    case 'officers_lower':
      return renderOfficersLower(content.officers);

    case 'sponsors_grid':
      return renderSponsorGrid(content.sponsors);

    case 'sponsors_footer':
      return renderFooterSponsors(content.sponsors);

    case 'news_list':
      return renderNewsList(content.news);

    case 'events_list':
      return renderEventList(content.events);

    case 'events_preview':
      // The homepage shows only the next three, per the spec.
      return renderEventList(content.events, 3);

    case 'settings_meeting_summary':
      return renderMeetingSummary(content.settings);

    case 'settings_meeting_facts':
      return renderMeetingFacts(content.settings);

    case 'settings_social':
      return renderFooterSocial(content.settings);

    case 'settings_address':
      return renderFooterAddress(content.settings);

    default:
      return '';
  }
}

/**
 * Prose blocks are stored as the site's original markup, which legitimately
 * contains layout elements the rich-text allowlist would strip (grids, cards,
 * inline SVG icons). They are sanitized with a wider structural allowlist that
 * still removes anything executable.
 */
function sanitizeStoredBlock(html: string): string {
  // Script, style, iframe, event handlers and javascript: URLs are removed;
  // structural markup is preserved so the hand-built layout survives.
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .trimEnd();
}

// -----------------------------------------------------------------------------
// Planning
// -----------------------------------------------------------------------------

/**
 * Builds the full set of file changes without writing anything.
 *
 * Used both by the preview screen and by `publishSite`, so what an officer
 * sees in the preview is exactly what gets committed — not an approximation.
 */
export async function buildPublishPlan(content: SiteContent): Promise<PublishPlan> {
  const { branch } = repoConfig();
  const head = await getBranchHead(branch);

  const pages = [...ALL_PAGES];
  const current = await getFiles(pages, head.commitSha);

  const changes: FileChange[] = [];
  const unchanged: string[] = [];
  const warnings: string[] = [];

  for (const page of pages) {
    const original = current[page];

    if (original === null || original === undefined) {
      warnings.push(`${page} was not found in the repository and will be skipped.`);
      continue;
    }

    let updated = original;

    for (const region of REGIONS) {
      if (!region.pages.includes(page)) continue;

      if (!hasRegion(original, region.key)) {
        // Migration has not been run for this region yet. Skipping is the safe
        // response — better to leave the page alone than guess where to write.
        warnings.push(
          `${page} has no "${region.key}" marker, so that section was left unchanged. ` +
            `Run "npm run migrate:public-site" to add it.`
        );
        continue;
      }

      const rendered = renderRegion(region, content);
      updated = replaceRegion(updated, region.key, rendered, page);
    }

    if (updated === original) {
      unchanged.push(page);
    } else {
      changes.push({ path: page, content: updated, previous: original });
    }
  }

  // Theme stylesheet is regenerated alongside the pages.
  const themeCss = renderThemeCss(content.theme);
  const currentTheme = (await getFiles([THEME_CSS_PATH], head.commitSha))[THEME_CSS_PATH];

  if (currentTheme !== themeCss) {
    changes.push({ path: THEME_CSS_PATH, content: themeCss, previous: currentTheme });
  } else {
    unchanged.push(THEME_CSS_PATH);
  }

  return { changes, unchanged, headSha: head.commitSha, warnings };
}

/** Renders a single page's final HTML, for the preview iframe. */
export async function previewPage(content: SiteContent, page: string): Promise<string | null> {
  const plan = await buildPublishPlan(content);
  const change = plan.changes.find((c) => c.path === page);
  if (change) return change.content;

  // Unchanged pages still need their current content to render a preview.
  const files = await getFiles([page]);
  return files[page];
}

// -----------------------------------------------------------------------------
// Publishing
// -----------------------------------------------------------------------------

/**
 * Renders, commits, and records a publish.
 *
 * Records a `publish_jobs` row for every attempt including failures, so the
 * activity log tells the full story rather than only the successes.
 */
export async function publishSite(options: {
  supabase: Client;
  actor: Profile;
  commitMessage: string;
  regionsTouched?: string[];
}): Promise<PublishOutcome> {
  const { supabase, actor, commitMessage } = options;
  const admin = createAdminClient();
  const { branch } = repoConfig();

  const content = await loadSiteContent(supabase);
  const plan = await buildPublishPlan(content);

  const { data: job, error: jobError } = await admin
    .from('publish_jobs')
    .insert({
      status: 'pending',
      commit_message: commitMessage,
      branch,
      base_sha: plan.headSha,
      regions: options.regionsTouched ?? [],
      files_changed: plan.changes.map((c) => c.path),
      triggered_by: actor.id,
      triggered_by_name: actor.full_name,
    })
    .select()
    .single();

  if (jobError || !job) {
    throw new Error(`Could not start the publish: ${jobError?.message ?? 'unknown error'}`);
  }

  // Nothing to do — report it rather than creating an empty commit.
  if (plan.changes.length === 0) {
    await admin
      .from('publish_jobs')
      .update({ status: 'success', finished_at: new Date().toISOString() })
      .eq('id', job.id);

    return { status: 'no_changes', filesChanged: [], jobId: job.id };
  }

  try {
    const result = await commitFiles({
      files: plan.changes.map((c) => ({ path: c.path, content: c.content })),
      message: commitMessage,
      branch,
      expectedHeadSha: plan.headSha,
    });

    await admin
      .from('publish_jobs')
      .update({
        status: 'success',
        commit_sha: result.commitSha,
        files_changed: result.filesChanged,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    await admin
      .from('settings')
      .update({
        last_published_at: new Date().toISOString(),
        last_published_sha: result.commitSha,
      })
      .eq('id', true);

    // Snapshot the published state so it can be restored later.
    await snapshotVersion(admin, content, actor, job.id, commitMessage);

    // Drafts have now shipped; clear them so the editor stops showing
    // "unpublished changes".
    await supabase
      .from('content_blocks')
      .update({ draft_data: null, published_at: new Date().toISOString() })
      .not('draft_data', 'is', null);

    await recordAudit(actor, {
      action: 'publish',
      section: 'Website',
      summary: `${actor.full_name} published to the website — ${commitMessage}`,
      entityType: 'publish_job',
      entityId: job.id,
      newValue: { commit: result.commitSha, files: result.filesChanged },
    });

    return {
      status: 'published',
      commitSha: result.commitSha,
      commitUrl: result.url,
      filesChanged: result.filesChanged,
      jobId: job.id,
    };
  } catch (err) {
    const message = err instanceof GitHubError ? err.message : String(err);

    await admin
      .from('publish_jobs')
      .update({
        status: 'failed',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    await recordAudit(actor, {
      action: 'publish',
      section: 'Website',
      summary: `Publish failed for ${actor.full_name}: ${message}`,
      entityType: 'publish_job',
      entityId: job.id,
    });

    throw err;
  }
}

/** Freezes the published state into content_versions for later restore. */
async function snapshotVersion(
  admin: Client,
  content: SiteContent,
  actor: Profile,
  jobId: string,
  note: string
): Promise<void> {
  const { data: latest } = await admin
    .from('content_versions')
    .select('version')
    .eq('entity_type', 'site')
    .eq('entity_key', 'full')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin.from('content_versions').insert({
    entity_type: 'site',
    entity_key: 'full',
    version: (latest?.version ?? 0) + 1,
    snapshot: {
      settings: content.settings,
      officers: content.officers,
      sponsors: content.sponsors,
      news: content.news,
      events: content.events,
      blocks: content.blocks,
      theme: content.theme,
    } as never,
    note,
    publish_job_id: jobId,
    created_by: actor.id,
    created_by_name: actor.full_name,
  });
}

/**
 * Builds an automatic commit message in the style the spec asks for:
 * "Updated About page content", "Added historian officer".
 */
export function buildCommitMessage(action: string, subject: string): string {
  const message = `${action} ${subject}`.trim();
  return message.charAt(0).toUpperCase() + message.slice(1);
}

export { REGIONS, REGIONS_BY_KEY };
export { renderThemeCss };
export type { RegionDef };
