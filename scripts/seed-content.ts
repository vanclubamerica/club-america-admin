/**
 * Loads the content extracted by `migrate:public-site` into Supabase.
 *
 * Run this once, after the migration, so the dashboard opens with the real
 * website content already in place rather than an empty shell.
 *
 * Safe to re-run: every table is upserted on a natural key, so a second run
 * updates rather than duplicating. It will NOT overwrite edits officers have
 * already made unless you pass --replace.
 *
 * Usage:
 *   npm run seed:content
 *   npm run seed:content -- --replace    # wipe and reload from seed-data.json
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = process.argv.slice(2);
const REPLACE = args.includes('--replace');
const SEED_PATH = resolve('./scripts/output/seed-data.json');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

interface SeedFile {
  generatedAt: string;
  settings: Record<string, string | null>;
  officers: Array<Record<string, unknown>>;
  sponsors: Array<Record<string, unknown>>;
  news: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  blocks: Array<{ key: string; page: string; label: string; kind: string; data: unknown }>;
}

async function main() {
  console.log(`\n${c.bold}${c.cyan}Club America — seed content into Supabase${c.reset}\n`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // "secret key" is Supabase's current name for the service_role key.
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    fail(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Copy .env.example to .env.local and fill them in — see docs/01-supabase-setup.md.'
    );
  }

  if (!existsSync(SEED_PATH)) {
    fail(
      `No seed data found at ${SEED_PATH}.\n` +
        `Run the migration first:  npm run migrate:public-site -- --write`
    );
  }

  const seed: SeedFile = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  console.log(`Seed generated: ${c.dim}${seed.generatedAt}${c.reset}`);
  console.log(`Target:         ${c.dim}${url}${c.reset}`);
  console.log(`Mode:           ${REPLACE ? `${c.bold}REPLACE${c.reset}` : 'upsert'}\n`);

  // Service role: seeding writes to tables that RLS deliberately restricts,
  // and runs before any user account exists.
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Confirm the schema is actually there before writing anything.
  const { error: pingError } = await supabase.from('settings').select('id').limit(1);
  if (pingError) {
    fail(
      `Could not reach the database: ${pingError.message}\n\n` +
        `Have you run the migrations in supabase/migrations/ ? See docs/01-supabase-setup.md.`
    );
  }

  if (REPLACE) {
    console.log(`${c.dim}Clearing existing content...${c.reset}`);
    // Order matters: nothing here is referenced by another content table, but
    // audit logs and versions are never touched — that history is permanent.
    for (const table of ['officers', 'sponsors', 'news_posts', 'events', 'content_blocks'] as const) {
      const { error } = await supabase.from(table).delete().gte('created_at', '1900-01-01');
      // content_blocks has no created_at; fall back to a key-based delete.
      if (error) {
        await supabase.from(table).delete().not('key', 'is', null);
      }
    }
  }

  // --- settings --------------------------------------------------------------
  const { error: settingsError } = await supabase
    .from('settings')
    .update({
      meeting_day: seed.settings.meeting_day,
      meeting_time: seed.settings.meeting_time,
      meeting_location: seed.settings.meeting_location,
      contact_address_line1: seed.settings.contact_address_line1,
      contact_address_line2: seed.settings.contact_address_line2,
      social_instagram: seed.settings.social_instagram,
      social_tiktok: seed.settings.social_tiktok,
      social_facebook: seed.settings.social_facebook,
      google_calendar_id: process.env.GOOGLE_CALENDAR_ID ?? null,
    })
    .eq('id', true);

  report('settings', settingsError, 1);

  // --- officers --------------------------------------------------------------
  // Main officers key on role_key so re-running updates the same five slots.
  const mainOfficers = seed.officers.filter((o) => o.tier === 'main');
  const lowerOfficers = seed.officers.filter((o) => o.tier === 'lower');

  let officerError: { message: string } | null = null;

  for (const officer of mainOfficers) {
    const { data: existing } = await supabase
      .from('officers')
      .select('id')
      .eq('role_key', officer.role_key as string)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('officers').update(officer).eq('id', existing.id)
      : await supabase.from('officers').insert(officer);

    if (error) officerError = error;
  }

  for (const officer of lowerOfficers) {
    const { data: existing } = await supabase
      .from('officers')
      .select('id')
      .eq('tier', 'lower')
      .eq('position_title', officer.position_title as string)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('officers').update(officer).eq('id', existing.id)
      : await supabase.from('officers').insert(officer);

    if (error) officerError = error;
  }

  report('officers', officerError, seed.officers.length);

  // --- sponsors --------------------------------------------------------------
  let sponsorError: { message: string } | null = null;
  for (const sponsor of seed.sponsors) {
    const { data: existing } = await supabase
      .from('sponsors')
      .select('id')
      .eq('logo_path', sponsor.logo_path as string)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('sponsors').update(sponsor).eq('id', existing.id)
      : await supabase.from('sponsors').insert(sponsor);

    if (error) sponsorError = error;
  }
  report('sponsors', sponsorError, seed.sponsors.length);

  // --- news ------------------------------------------------------------------
  let newsError: { message: string } | null = null;
  for (const post of seed.news) {
    const { data: existing } = await supabase
      .from('news_posts')
      .select('id')
      .eq('title', post.title as string)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('news_posts').update(post).eq('id', existing.id)
      : await supabase.from('news_posts').insert(post);

    if (error) newsError = error;
  }
  report('news posts', newsError, seed.news.length);

  // --- events ----------------------------------------------------------------
  let eventError: { message: string } | null = null;
  for (const event of seed.events) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('title', event.title as string)
      .eq('starts_at', event.starts_at as string)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('events').update(event).eq('id', existing.id)
      : await supabase.from('events').insert(event);

    if (error) eventError = error;
  }
  report('events', eventError, seed.events.length);

  // --- content blocks --------------------------------------------------------
  const { error: blockError } = await supabase.from('content_blocks').upsert(
    seed.blocks.map((block, index) => ({
      key: block.key,
      page: block.page,
      label: block.label,
      kind: block.kind,
      sort_order: index,
      data: block.data as never,
      draft_data: null,
      published_at: new Date().toISOString(),
    })),
    { onConflict: 'key' }
  );
  report('content blocks', blockError, seed.blocks.length);

  console.log(`\n${c.green}${c.bold}Done.${c.reset} The dashboard now mirrors the live website.\n`);
  console.log(`Next: create your admin account with  ${c.bold}npm run create:admin${c.reset}\n`);
}

function report(label: string, error: { message: string } | null, count: number) {
  if (error) {
    console.log(`  ${c.red}✗${c.reset} ${label.padEnd(16)} ${error.message}`);
  } else {
    console.log(`  ${c.green}✓${c.reset} ${label.padEnd(16)} ${count}`);
  }
}

function fail(message: string): never {
  console.error(`\n${c.red}${c.bold}Seed aborted${c.reset}\n${message}\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n${c.red}Unexpected error:${c.reset}`, err);
  process.exit(1);
});
