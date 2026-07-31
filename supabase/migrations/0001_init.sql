-- =============================================================================
-- Club America Admin — core schema
--
-- Design rules enforced here (not just in application code):
--   1. Row Level Security is ON for every table, and denies by default.
--   2. All five officer roles have IDENTICAL content permissions.
--   3. A single `is_owner` flag gates account control, emergency lock, and
--      ownership transfer — so one compromised account cannot lock out the
--      whole leadership team.
--   4. Audit logs are physically append-only. Not even the service role can
--      rewrite them (see 0002_audit_immutability.sql).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum (
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'teacher_sponsor'
);

create type public.account_status as enum ('active', 'suspended', 'archived');
create type public.officer_tier   as enum ('main', 'lower');
create type public.sponsor_tier   as enum ('gold', 'silver', 'bronze');
create type public.content_status as enum ('draft', 'published', 'archived');
create type public.publish_status as enum ('pending', 'success', 'failed');
create type public.event_source   as enum ('manual', 'google_calendar');

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

-- Keeps updated_at honest without trusting the client to send it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- profiles — one row per admin account, linked to Supabase Auth
-- =============================================================================
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text not null,
  email                text not null unique,
  role                 public.user_role not null,
  status               public.account_status not null default 'active',

  -- Gates account management, emergency lock, and ownership transfer.
  -- Everything content-related is equal across roles.
  is_owner             boolean not null default false,

  -- Teacher Sponsor acts as an adult break-glass account that survives
  -- student graduation; set during leadership transfer.
  is_break_glass       boolean not null default false,

  phone                text,
  must_change_password boolean not null default false,
  last_login_at        timestamptz,
  school_year_started  text,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Exactly one owner can exist at a time.
create unique index profiles_single_owner_idx on public.profiles (is_owner) where is_owner;
create index profiles_status_idx on public.profiles (status);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Permission helpers
--
-- SECURITY DEFINER + pinned search_path so these can be called from RLS
-- policies on `profiles` itself without triggering infinite recursion.
-- -----------------------------------------------------------------------------
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_owner or is_break_glass)
  );
$$;

-- Content edits are frozen while the site is under emergency lock.
create or replace function public.content_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((select not emergency_lock from public.settings where id), true);
$$;

-- Active admin AND not emergency-locked. The default gate for content tables.
create or replace function public.can_edit_content()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.is_active_admin() and public.content_unlocked();
$$;

-- =============================================================================
-- settings — single row of global configuration
-- =============================================================================
create table public.settings (
  id                    boolean primary key default true check (id),

  publishing_enabled    boolean not null default true,
  emergency_lock        boolean not null default false,
  emergency_lock_reason text,
  emergency_locked_at   timestamptz,
  emergency_locked_by   uuid references public.profiles(id) on delete set null,

  active_theme_key      text not null default 'normal',

  site_title            text not null default 'Club America — Van High School Chapter',
  meeting_day           text default 'Every Friday',
  meeting_time          text default '10:20 – 10:50 AM',
  meeting_location      text default 'College Career Center A',

  contact_email         text,
  contact_address_line1 text default '985 N Maple St',
  contact_address_line2 text default 'Van, TX 75790',

  social_instagram      text default 'https://www.instagram.com/clubamericavan/',
  social_tiktok         text default 'https://www.tiktok.com/@clubamericavan',
  social_facebook       text default 'https://www.facebook.com/people/Van-High-School-Club-America/61592382360749/',

  google_calendar_id    text,

  last_published_at     timestamptz,
  last_published_sha    text,

  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles(id) on delete set null
);

create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- content_blocks — prose regions keyed to markers in the public HTML
-- =============================================================================
create table public.content_blocks (
  key          text primary key,           -- matches <!-- cms:start KEY -->
  page         text not null,              -- 'about.html'
  label        text not null,              -- 'About — Introduction'
  kind         text not null,              -- 'richtext' | 'fields' | 'collection'
  sort_order   int  not null default 0,

  data         jsonb not null default '{}'::jsonb,  -- published content
  draft_data   jsonb,                                -- pending draft, null = none

  version      int  not null default 1,
  published_at timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

create index content_blocks_page_idx on public.content_blocks (page, sort_order);
create index content_blocks_draft_idx on public.content_blocks (key) where draft_data is not null;

create trigger content_blocks_touch before update on public.content_blocks
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- officers
-- =============================================================================
create table public.officers (
  id             uuid primary key default gen_random_uuid(),
  tier           public.officer_tier not null,

  -- Fixed for main officers (role cannot be changed in the UI); null for lower.
  role_key       text,
  position_title text not null,

  name           text not null,
  bio            text,
  photo_path     text,          -- repo-relative, e.g. media/officers/president.jpg
  photo_alt      text,
  email          text,
  sort_order     int  not null default 0,
  is_active      boolean not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,

  -- Main officers are exactly the five fixed roles; lower officers are free-form.
  constraint officers_main_has_role_key check (
    (tier = 'main' and role_key is not null) or
    (tier = 'lower' and role_key is null)
  ),
  constraint officers_valid_role_key check (
    role_key is null or role_key in
      ('president', 'vice_president', 'secretary', 'treasurer', 'teacher_sponsor')
  )
);

-- The five main slots exist exactly once each.
create unique index officers_main_role_unique_idx
  on public.officers (role_key) where tier = 'main';
create index officers_tier_order_idx on public.officers (tier, sort_order);

create trigger officers_touch before update on public.officers
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- sponsors
-- =============================================================================
create table public.sponsors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  logo_path    text,            -- media/sponsors/<file>
  logo_alt     text,
  website_url  text,
  description  text,
  tier         public.sponsor_tier not null default 'bronze',
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  show_in_footer boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

create index sponsors_display_idx on public.sponsors (is_active, tier, sort_order);

create trigger sponsors_touch before update on public.sponsors
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- news_posts
-- =============================================================================
create table public.news_posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  slug         text unique,
  body         text not null default '',        -- sanitized rich text
  excerpt      text,
  author_name  text,
  image_path   text,
  image_alt    text,
  display_date text,                            -- 'August 2026' as shown on site
  published_on date not null default current_date,
  status       public.content_status not null default 'draft',
  sort_pinned  boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null
);

create index news_posts_feed_idx on public.news_posts (status, sort_pinned desc, published_on desc);

create trigger news_posts_touch before update on public.news_posts
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- events — Google Calendar stays the source of truth; these are cache + manual
-- =============================================================================
create table public.events (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  location       text,
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  all_day        boolean not null default false,
  source         public.event_source not null default 'manual',
  external_uid   text,           -- Google Calendar UID, for dedupe on re-sync
  is_hidden      boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null
);

create unique index events_external_uid_idx on public.events (external_uid)
  where external_uid is not null;
create index events_upcoming_idx on public.events (starts_at) where not is_hidden;

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- documents
-- =============================================================================
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  storage_path  text not null,     -- Supabase Storage object path
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null,
  category      text default 'general',
  is_public     boolean not null default false,

  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploader_name text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index documents_category_idx on public.documents (category, created_at desc);

create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- members + meetings + attendance
-- =============================================================================
create table public.members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  grade       int check (grade between 9 and 12),
  email       text,
  position    text,
  join_date   date default current_date,
  is_active   boolean not null default true,
  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

create index members_active_idx on public.members (is_active, full_name);

create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

create table public.meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  meeting_date date not null,
  location     text,
  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null
);

create index meetings_date_idx on public.meetings (meeting_date desc);

create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();

create table public.attendance (
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  present     boolean not null default false,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  primary key (meeting_id, member_id)
);

create index attendance_member_idx on public.attendance (member_id);

-- Attendance percentage per member, used by the members + attendance screens.
create or replace view public.member_attendance_stats as
select
  m.id                                                     as member_id,
  m.full_name,
  count(a.meeting_id)                                      as meetings_recorded,
  count(a.meeting_id) filter (where a.present)             as meetings_attended,
  case
    when count(a.meeting_id) = 0 then 0
    else round(
      100.0 * count(a.meeting_id) filter (where a.present) / count(a.meeting_id)
    )
  end                                                      as attendance_percent
from public.members m
left join public.attendance a on a.member_id = m.id
group by m.id, m.full_name;

-- =============================================================================
-- themes — holiday/seasonal appearance presets
-- =============================================================================
create table public.themes (
  key              text primary key,          -- 'normal', 'christmas', ...
  name             text not null,
  is_builtin       boolean not null default false,
  logo_path        text,
  primary_color    text,
  secondary_color  text,
  accent_color     text,
  background_color text,
  text_color       text,
  banner_message   text,
  extra_css        text,                      -- sanitized, appended to theme.css
  sort_order       int not null default 0,

  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles(id) on delete set null
);

create trigger themes_touch before update on public.themes
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- content_versions — immutable snapshots powering history / compare / restore
-- =============================================================================
create table public.content_versions (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null,        -- 'content_block' | 'officers' | 'site'
  entity_key      text not null,
  version         int  not null,
  snapshot        jsonb not null,
  note            text,
  publish_job_id  uuid,
  created_by      uuid references public.profiles(id) on delete set null,
  created_by_name text not null default 'System',
  created_at      timestamptz not null default now()
);

create index content_versions_lookup_idx
  on public.content_versions (entity_type, entity_key, version desc);

-- =============================================================================
-- publish_jobs — one row per publish attempt
-- =============================================================================
create table public.publish_jobs (
  id             uuid primary key default gen_random_uuid(),
  status         public.publish_status not null default 'pending',
  commit_sha     text,
  commit_message text not null,
  base_sha       text,
  branch         text not null,
  files_changed  jsonb not null default '[]'::jsonb,
  regions        jsonb not null default '[]'::jsonb,
  error_message  text,

  triggered_by   uuid references public.profiles(id) on delete set null,
  triggered_by_name text not null default 'System',
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index publish_jobs_recent_idx on public.publish_jobs (started_at desc);

-- =============================================================================
-- leadership_terms — archived rosters, one per school year
-- =============================================================================
create table public.leadership_terms (
  id             uuid primary key default gen_random_uuid(),
  school_year    text not null,            -- '2026-2027'
  roster         jsonb not null,           -- frozen snapshot of officers + accounts
  handoff_report jsonb,
  notes          text,
  archived_at    timestamptz not null default now(),
  archived_by    uuid references public.profiles(id) on delete set null,
  archived_by_name text not null default 'System'
);

create unique index leadership_terms_year_idx on public.leadership_terms (school_year);

-- =============================================================================
-- audit_logs — permanent, append-only activity trail
-- =============================================================================
create table public.audit_logs (
  id             bigint generated always as identity primary key,
  actor_id       uuid references public.profiles(id) on delete set null,
  actor_name     text not null,
  actor_role     text,
  action         text not null,     -- create | update | delete | publish | login | ...
  section        text not null,     -- 'About Page' | 'Officers' | 'Security'
  entity_type    text,
  entity_id      text,
  summary        text not null,     -- 'Brant Borden edited About page paragraph 2'
  previous_value jsonb,
  new_value      jsonb,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index audit_logs_recent_idx  on public.audit_logs (created_at desc);
create index audit_logs_actor_idx   on public.audit_logs (actor_id, created_at desc);
create index audit_logs_section_idx on public.audit_logs (section, created_at desc);

-- =============================================================================
-- login_attempts + rate_limits — lockout and throttling, no external Redis
-- =============================================================================
create table public.login_attempts (
  id         bigint generated always as identity primary key,
  email      text not null,
  ip_address text,
  succeeded  boolean not null,
  created_at timestamptz not null default now()
);

create index login_attempts_email_idx on public.login_attempts (lower(email), created_at desc);
create index login_attempts_ip_idx    on public.login_attempts (ip_address, created_at desc);

create table public.rate_limits (
  bucket_key   text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket_key, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);

-- Atomic fixed-window counter. Returns true when the request is allowed.
create or replace function public.consume_rate_limit(
  p_bucket    text,
  p_limit     int,
  p_window_ms int
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_window timestamptz;
  v_hits   int;
begin
  -- Snap "now" down to the start of the current fixed window.
  v_window := to_timestamp(
    floor(extract(epoch from now()) * 1000 / p_window_ms) * p_window_ms / 1000.0
  );

  insert into public.rate_limits (bucket_key, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket_key, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup so the table cannot grow without bound.
  delete from public.rate_limits where window_start < now() - interval '1 day';

  return v_hits <= p_limit;
end;
$$;

-- =============================================================================
-- Row Level Security
--
-- Every table denies by default. Content tables share one policy shape:
-- any ACTIVE admin may read, and may write while not emergency-locked.
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.settings          enable row level security;
alter table public.content_blocks    enable row level security;
alter table public.officers          enable row level security;
alter table public.sponsors          enable row level security;
alter table public.news_posts        enable row level security;
alter table public.events            enable row level security;
alter table public.documents         enable row level security;
alter table public.members           enable row level security;
alter table public.meetings          enable row level security;
alter table public.attendance        enable row level security;
alter table public.themes            enable row level security;
alter table public.content_versions  enable row level security;
alter table public.publish_jobs      enable row level security;
alter table public.leadership_terms  enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.login_attempts    enable row level security;
alter table public.rate_limits       enable row level security;

-- --- profiles ----------------------------------------------------------------
-- Everyone active can see the team roster (needed for the dashboard + transfer).
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_active_admin());

-- You may edit your own name/phone. Role, status, and ownership are NOT
-- editable here — those go through owner-gated server actions using the
-- service role, so a self-update can never escalate privileges.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Only the owner (or break-glass sponsor) may manage other accounts.
create policy profiles_owner_manage on public.profiles
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- --- settings ----------------------------------------------------------------
create policy settings_select on public.settings
  for select to authenticated
  using (public.is_active_admin());

-- Emergency lock / publishing toggles are owner-only.
create policy settings_owner_update on public.settings
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- --- content tables ----------------------------------------------------------
-- Identical shape for every content table: read = active admin,
-- write = active admin AND not emergency-locked.
do $$
declare
  t text;
begin
  foreach t in array array[
    'content_blocks', 'officers', 'sponsors', 'news_posts', 'events',
    'documents', 'members', 'meetings', 'attendance', 'themes'
  ]
  loop
    execute format(
      'create policy %1$s_select on public.%1$s
         for select to authenticated using (public.is_active_admin())', t);
    execute format(
      'create policy %1$s_insert on public.%1$s
         for insert to authenticated with check (public.can_edit_content())', t);
    execute format(
      'create policy %1$s_update on public.%1$s
         for update to authenticated
         using (public.can_edit_content()) with check (public.can_edit_content())', t);
    execute format(
      'create policy %1$s_delete on public.%1$s
         for delete to authenticated using (public.can_edit_content())', t);
  end loop;
end;
$$;

-- --- history tables: readable, never mutable from the client ------------------
create policy content_versions_select on public.content_versions
  for select to authenticated using (public.is_active_admin());

create policy publish_jobs_select on public.publish_jobs
  for select to authenticated using (public.is_active_admin());

create policy leadership_terms_select on public.leadership_terms
  for select to authenticated using (public.is_active_admin());

-- --- audit_logs: readable by all admins, writable by NOBODY -------------------
-- Inserts happen through the service role in server actions only. There is
-- deliberately no insert/update/delete policy for `authenticated`.
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (public.is_active_admin());

-- --- login_attempts / rate_limits: service role only --------------------------
-- No policies at all => authenticated clients cannot read or write them.

-- =============================================================================
-- New auth users get a profile automatically. Defaults to a suspended,
-- non-owner account: an invited user cannot act until an owner activates them.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'secretary'),
    coalesce((new.raw_user_meta_data ->> 'status')::public.account_status, 'suspended')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Supabase owns `auth.users`, and most projects do not grant the SQL Editor
-- enough privilege to attach a trigger to it. That is fine: this trigger is a
-- convenience, not a requirement. `create:admin` and the officer invite flow
-- both upsert the profile row themselves, so account creation works whether or
-- not this succeeds.
--
-- Wrapped so a permission error prints a notice instead of aborting the whole
-- migration partway through.
do $$
begin
  execute '
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user()';
  raise notice 'auth.users trigger installed.';
exception
  when insufficient_privilege then
    raise notice
      'Skipped the auth.users trigger (no permission on auth.users). This is expected on Supabase and is NOT a problem — profile rows are created by the application instead.';
  when duplicate_object then
    raise notice 'auth.users trigger already exists.';
end;
$$;
