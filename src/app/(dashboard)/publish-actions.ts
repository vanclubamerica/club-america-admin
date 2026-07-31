'use server';

import { revalidatePath } from 'next/cache';
import { requirePublisher, requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { runAction, type ActionState } from '@/lib/actions';
import { consumeRateLimit, PUBLISH_RATE_LIMIT } from '@/lib/auth/rate-limit';
import { buildPublishPlan, loadSiteContent, publishSite } from '@/lib/publish';
import { isGitHubConfigured } from '@/lib/env';

/**
 * Publishing is the only action that changes the public internet, so it gets
 * the strictest gate: active account, not emergency-locked, publishing not
 * paused, and rate limited so a stuck button cannot spam commit history.
 */
export async function publishNow(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return runAction(async () => {
    if (!isGitHubConfigured()) {
      return {
        error:
          'GitHub publishing is not set up yet. Add a GITHUB_TOKEN to the environment variables — see docs/02-github-setup.md.',
      };
    }

    const session = await requirePublisher();

    const allowed = await consumeRateLimit(
      `publish:${session.userId}`,
      PUBLISH_RATE_LIMIT.limit,
      PUBLISH_RATE_LIMIT.windowMs
    );
    if (!allowed) {
      return { error: 'That is a lot of publishing in one hour. Wait a bit and try again.' };
    }

    const message =
      (formData.get('message') as string | null)?.trim() || 'Updated website content';

    const supabase = await createClient();
    const result = await publishSite({
      supabase,
      actor: session.profile,
      commitMessage: message,
    });

    revalidatePath('/', 'layout');

    if (result.status === 'no_changes') {
      return {
        ok: true,
        message: 'The website is already up to date — nothing needed publishing.',
      };
    }

    return {
      ok: true,
      message: `Published. ${result.filesChanged.length} file${
        result.filesChanged.length === 1 ? '' : 's'
      } updated on the live website.`,
    };
  });
}

export interface PreviewSummary {
  ready: boolean;
  error?: string;
  changedFiles: string[];
  unchangedFiles: string[];
  warnings: string[];
}

/**
 * Computes what a publish WOULD change, without writing anything. Backs both
 * the "unpublished changes" indicator and the preview screen.
 */
export async function getPublishPreview(): Promise<PreviewSummary> {
  try {
    await requireUser();

    if (!isGitHubConfigured()) {
      return {
        ready: false,
        error: 'GitHub is not connected yet, so changes cannot be previewed or published.',
        changedFiles: [],
        unchangedFiles: [],
        warnings: [],
      };
    }

    const supabase = await createClient();
    const content = await loadSiteContent(supabase);
    const plan = await buildPublishPlan(content);

    return {
      ready: true,
      changedFiles: plan.changes.map((c) => c.path),
      unchangedFiles: plan.unchanged,
      warnings: plan.warnings,
    };
  } catch (err) {
    return {
      ready: false,
      error: err instanceof Error ? err.message : 'Could not check the website for changes.',
      changedFiles: [],
      unchangedFiles: [],
      warnings: [],
    };
  }
}
