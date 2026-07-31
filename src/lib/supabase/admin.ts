import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Service-role client. BYPASSES Row Level Security.
 *
 * The `server-only` import above makes the build fail if this module is ever
 * pulled into a client bundle — the key must never reach a browser.
 *
 * Use this ONLY where RLS genuinely cannot express the rule:
 *   - writing audit logs (clients have no insert policy, by design)
 *   - rate limiting and login-attempt tracking (pre-authentication)
 *   - account administration after an explicit `requireOwner()` check
 *
 * Everything else should go through the RLS-bound clients so that policy
 * remains the enforcement layer rather than a suggestion.
 */
export function createAdminClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );
}
