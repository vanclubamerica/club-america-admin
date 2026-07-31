/**
 * Database types.
 *
 * Hand-maintained to mirror supabase/migrations/*.sql. If you change a
 * migration, change the matching interface here — `npm run typecheck` is what
 * catches drift between the schema and the app.
 */

export type UserRole =
  | 'president'
  | 'vice_president'
  | 'secretary'
  | 'treasurer'
  | 'teacher_sponsor';

export type AccountStatus = 'active' | 'suspended' | 'archived';
export type OfficerTier = 'main' | 'lower';
export type SponsorTier = 'gold' | 'silver' | 'bronze';
export type ContentStatus = 'draft' | 'published' | 'archived';
export type PublishStatus = 'pending' | 'success' | 'failed';
export type EventSource = 'manual' | 'google_calendar';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/** Display labels for the five fixed roles, used across the UI. */
export const ROLE_LABELS: Record<UserRole, string> = {
  president: 'President',
  vice_president: 'Vice President',
  secretary: 'Secretary',
  treasurer: 'Treasurer',
  teacher_sponsor: 'Teacher Sponsor',
};

export const ROLE_ORDER: UserRole[] = [
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'teacher_sponsor',
];

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  is_owner: boolean;
  is_break_glass: boolean;
  phone: string | null;
  must_change_password: boolean;
  last_login_at: string | null;
  school_year_started: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type Settings = {
  id: boolean;
  publishing_enabled: boolean;
  emergency_lock: boolean;
  emergency_lock_reason: string | null;
  emergency_locked_at: string | null;
  emergency_locked_by: string | null;
  active_theme_key: string;
  site_title: string;
  meeting_day: string | null;
  meeting_time: string | null;
  meeting_location: string | null;
  contact_email: string | null;
  contact_address_line1: string | null;
  contact_address_line2: string | null;
  social_instagram: string | null;
  social_tiktok: string | null;
  social_facebook: string | null;
  google_calendar_id: string | null;
  last_published_at: string | null;
  last_published_sha: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type ContentBlock = {
  key: string;
  page: string;
  label: string;
  kind: string;
  sort_order: number;
  data: Json;
  draft_data: Json | null;
  version: number;
  published_at: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type Officer = {
  id: string;
  tier: OfficerTier;
  role_key: string | null;
  position_title: string;
  name: string;
  bio: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  email: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type Sponsor = {
  id: string;
  name: string;
  logo_path: string | null;
  logo_alt: string | null;
  website_url: string | null;
  description: string | null;
  tier: SponsorTier;
  sort_order: number;
  is_active: boolean;
  show_in_footer: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type NewsPost = {
  id: string;
  title: string;
  slug: string | null;
  body: string;
  excerpt: string | null;
  author_name: string | null;
  image_path: string | null;
  image_alt: string | null;
  display_date: string | null;
  published_on: string;
  status: ContentStatus;
  sort_pinned: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type ClubEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  source: EventSource;
  external_uid: string | null;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type DocumentRecord = {
  id: string;
  name: string;
  description: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  category: string | null;
  is_public: boolean;
  uploaded_by: string | null;
  uploader_name: string;
  created_at: string;
  updated_at: string;
}

export type Member = {
  id: string;
  full_name: string;
  grade: number | null;
  email: string | null;
  position: string | null;
  join_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export type Attendance = {
  meeting_id: string;
  member_id: string;
  present: boolean;
  recorded_at: string;
  recorded_by: string | null;
}

export type MemberAttendanceStats = {
  member_id: string;
  full_name: string;
  meetings_recorded: number;
  meetings_attended: number;
  attendance_percent: number;
}

export type Theme = {
  key: string;
  name: string;
  is_builtin: boolean;
  logo_path: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  banner_message: string | null;
  extra_css: string | null;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

export type ContentVersion = {
  id: string;
  entity_type: string;
  entity_key: string;
  version: number;
  snapshot: Json;
  note: string | null;
  publish_job_id: string | null;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
}

export type PublishJob = {
  id: string;
  status: PublishStatus;
  commit_sha: string | null;
  commit_message: string;
  base_sha: string | null;
  branch: string;
  files_changed: Json;
  regions: Json;
  error_message: string | null;
  triggered_by: string | null;
  triggered_by_name: string;
  started_at: string;
  finished_at: string | null;
}

export type LeadershipTerm = {
  id: string;
  school_year: string;
  roster: Json;
  handoff_report: Json | null;
  notes: string | null;
  archived_at: string;
  archived_by: string | null;
  archived_by_name: string;
}

export type AuditLog = {
  id: number;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: string;
  section: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  previous_value: Json | null;
  new_value: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Security tables. RLS grants `authenticated` no access at all — these are
 * written only by the service role, before or around authentication.
 */
export type LoginAttempt = {
  id: number;
  email: string;
  ip_address: string | null;
  succeeded: boolean;
  created_at: string;
};

export type RateLimit = {
  bucket_key: string;
  window_start: string;
  hits: number;
};

/**
 * Table entries are written out explicitly rather than through a generic
 * helper: supabase-js resolves `select('*')` by structurally walking this
 * type, and it cannot see through a custom generic alias — every query would
 * silently infer `null` instead of the row type.
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      settings: {
        Row: Settings;
        Insert: Partial<Settings>;
        Update: Partial<Settings>;
        Relationships: [];
      };
      content_blocks: {
        Row: ContentBlock;
        Insert: Partial<ContentBlock> & Pick<ContentBlock, 'key' | 'page' | 'label' | 'kind'>;
        Update: Partial<ContentBlock>;
        Relationships: [];
      };
      officers: {
        Row: Officer;
        Insert: Partial<Officer> & Pick<Officer, 'tier' | 'position_title' | 'name'>;
        Update: Partial<Officer>;
        Relationships: [];
      };
      sponsors: {
        Row: Sponsor;
        Insert: Partial<Sponsor> & Pick<Sponsor, 'name'>;
        Update: Partial<Sponsor>;
        Relationships: [];
      };
      news_posts: {
        Row: NewsPost;
        Insert: Partial<NewsPost> & Pick<NewsPost, 'title'>;
        Update: Partial<NewsPost>;
        Relationships: [];
      };
      events: {
        Row: ClubEvent;
        Insert: Partial<ClubEvent> & Pick<ClubEvent, 'title' | 'starts_at'>;
        Update: Partial<ClubEvent>;
        Relationships: [];
      };
      documents: {
        Row: DocumentRecord;
        Insert: Partial<DocumentRecord> & Pick<DocumentRecord, 'name' | 'storage_path' | 'file_name' | 'mime_type' | 'size_bytes' | 'uploader_name'>;
        Update: Partial<DocumentRecord>;
        Relationships: [];
      };
      members: {
        Row: Member;
        Insert: Partial<Member> & Pick<Member, 'full_name'>;
        Update: Partial<Member>;
        Relationships: [];
      };
      meetings: {
        Row: Meeting;
        Insert: Partial<Meeting> & Pick<Meeting, 'title' | 'meeting_date'>;
        Update: Partial<Meeting>;
        Relationships: [];
      };
      attendance: {
        Row: Attendance;
        Insert: Partial<Attendance> & Pick<Attendance, 'meeting_id' | 'member_id'>;
        Update: Partial<Attendance>;
        Relationships: [];
      };
      themes: {
        Row: Theme;
        Insert: Partial<Theme> & Pick<Theme, 'key' | 'name'>;
        Update: Partial<Theme>;
        Relationships: [];
      };
      content_versions: {
        Row: ContentVersion;
        Insert: Partial<ContentVersion> & Pick<ContentVersion, 'entity_type' | 'entity_key' | 'version' | 'snapshot'>;
        Update: Partial<ContentVersion>;
        Relationships: [];
      };
      publish_jobs: {
        Row: PublishJob;
        Insert: Partial<PublishJob> & Pick<PublishJob, 'commit_message' | 'branch'>;
        Update: Partial<PublishJob>;
        Relationships: [];
      };
      leadership_terms: {
        Row: LeadershipTerm;
        Insert: Partial<LeadershipTerm> & Pick<LeadershipTerm, 'school_year' | 'roster'>;
        Update: Partial<LeadershipTerm>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Partial<AuditLog> & Pick<AuditLog, 'actor_name' | 'action' | 'section' | 'summary'>;
        Update: Partial<AuditLog>;
        Relationships: [];
      };
      login_attempts: {
        Row: LoginAttempt;
        Insert: Partial<LoginAttempt> & Pick<LoginAttempt, 'email' | 'succeeded'>;
        Update: Partial<LoginAttempt>;
        Relationships: [];
      };
      rate_limits: {
        Row: RateLimit;
        Insert: Partial<RateLimit> & Pick<RateLimit, 'bucket_key' | 'window_start'>;
        Update: Partial<RateLimit>;
        Relationships: [];
      };
    };
    Views: {
      member_attendance_stats: { Row: MemberAttendanceStats; Relationships: [] };
      audit_log_feed: { Row: AuditLog & { created_at_local: string }; Relationships: [] };
    };
    Functions: {
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_ms: number };
        Returns: boolean;
      };
      is_active_admin: { Args: Record<string, never>; Returns: boolean };
      is_owner: { Args: Record<string, never>; Returns: boolean };
      can_edit_content: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      account_status: AccountStatus;
      officer_tier: OfficerTier;
      sponsor_tier: SponsorTier;
      content_status: ContentStatus;
      publish_status: PublishStatus;
      event_source: EventSource;
    };
    CompositeTypes: Record<string, never>;
  };
}
