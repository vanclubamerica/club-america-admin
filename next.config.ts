import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Supabase needs to be reachable from the browser for auth + storage uploads.
 * Derived from the public env var so the CSP stays correct across projects
 * instead of hardcoding one instance's hostname.
 */
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
})();

const supabaseWs = supabaseOrigin.replace(/^https:/, 'wss:');

/**
 * Strict by default. `unsafe-eval` is dev-only (React Refresh); `unsafe-inline`
 * on scripts is required by Next's inline bootstrap payload in the App Router.
 * Everything else is locked to same-origin plus the Supabase project.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`.trim(),
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Pin the workspace root: a lockfile in the user's home directory would
  // otherwise be inferred as the root and pull in unrelated files.
  outputFileTracingRoot: __dirname,

  // The admin dashboard is never indexed — it is a private control panel.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...securityHeaders, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },

  experimental: {
    serverActions: {
      // Vercel rejects request bodies larger than 4.5 MB at the edge on every
      // plan, before any application code runs — an over-limit upload becomes
      // an uncatchable 413 and a client-side crash. Staying under that ceiling
      // means our own validation is what users actually see.
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
