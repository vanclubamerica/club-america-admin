import { z } from 'zod';

/**
 * Environment validation.
 *
 * Split deliberately in two: `publicEnv` is safe to reference from client
 * components, `serverEnv()` throws if it is ever reached from the browser.
 * The service role key and GitHub token must never cross that line.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('https://tpvan.com'),
  NEXT_PUBLIC_ADMIN_URL: z.string().url().default('https://admin.tpvan.com'),
  NEXT_PUBLIC_SUPPORT_NAME: z.string().default('Brant Borden'),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().default('brsnt3@gmail.com'),
});

// Next.js inlines process.env.NEXT_PUBLIC_* at build time only for statically
// analysable member expressions, so these must be written out longhand — which
// is also why both spellings below are written in full rather than looked up
// dynamically.
//
// Supabase renamed its keys: what used to be "anon" is now "publishable", and
// "service_role" is now "secret". Same privileges, new labels. Both names are
// accepted so a project set up under either generation of the dashboard works.
const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  NEXT_PUBLIC_SUPPORT_NAME: process.env.NEXT_PUBLIC_SUPPORT_NAME,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
});

if (!parsedPublic.success) {
  const issues = parsedPublic.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(
    `Missing or invalid public environment variables:\n${issues.join('\n')}\n\n` +
      'Copy .env.example to .env.local and fill in the values. See docs/01-supabase-setup.md.'
  );
}

export const publicEnv = parsedPublic.data;

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  GITHUB_TOKEN: z.string().min(1).optional(),
  GITHUB_OWNER: z.string().default('vanclubamerica'),
  GITHUB_REPO: z.string().default('clubamerica'),
  GITHUB_TARGET_BRANCH: z.string().default('main'),
  GITHUB_COMMIT_AUTHOR_NAME: z.string().default('Club America Admin'),
  GITHUB_COMMIT_AUTHOR_EMAIL: z.string().default('admin@tpvan.com'),

  GOOGLE_CALENDAR_ID: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  NOTIFICATION_FROM_EMAIL: z.string().default('admin@tpvan.com'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

/**
 * Server-only secrets. Throws loudly rather than silently degrading, so a
 * misconfigured deploy fails at the first request instead of quietly writing
 * to the wrong repository.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Server secrets must never be bundled.');
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    // "secret key" is Supabase's current name for the service_role key.
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || undefined,
    GITHUB_OWNER: process.env.GITHUB_OWNER,
    GITHUB_REPO: process.env.GITHUB_REPO,
    GITHUB_TARGET_BRANCH: process.env.GITHUB_TARGET_BRANCH,
    GITHUB_COMMIT_AUTHOR_NAME: process.env.GITHUB_COMMIT_AUTHOR_NAME,
    GITHUB_COMMIT_AUTHOR_EMAIL: process.env.GITHUB_COMMIT_AUTHOR_EMAIL,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    NOTIFICATION_FROM_EMAIL: process.env.NOTIFICATION_FROM_EMAIL,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Missing or invalid server environment variables:\n${issues.join('\n')}`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/** GitHub publishing is optional — the dashboard still runs without a token. */
export function isGitHubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

/** Email is opt-in; without a key notifications are recorded but not sent. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
