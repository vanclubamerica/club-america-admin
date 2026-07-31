import 'server-only';

import { Octokit } from '@octokit/rest';
import { serverEnv } from '@/lib/env';

/**
 * GitHub integration.
 *
 * Uses the Git Data API (blobs → tree → commit → ref) rather than the simpler
 * Contents API, because a single content change can touch up to eight files —
 * a sponsor edit updates the footer of every page. The Contents API would
 * write those one at a time, so a failure halfway through would leave the live
 * site in a half-updated state. The Git Data approach builds the whole tree
 * first and moves the branch pointer once: it either all lands, or none of it
 * does.
 */

export interface RepoFile {
  path: string;
  content: string;
}

export interface CommitResult {
  commitSha: string;
  treeSha: string;
  parentSha: string;
  filesChanged: string[];
  url: string;
}

export class GitHubError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'GitHubError';
  }
}

let cachedClient: Octokit | null = null;

function octokit(): Octokit {
  if (cachedClient) return cachedClient;

  const { GITHUB_TOKEN } = serverEnv();
  if (!GITHUB_TOKEN) {
    throw new GitHubError(
      'GitHub publishing is not configured. Add GITHUB_TOKEN to your environment ' +
        'variables — see docs/02-github-setup.md.'
    );
  }

  cachedClient = new Octokit({
    auth: GITHUB_TOKEN,
    userAgent: 'club-america-admin',
  });
  return cachedClient;
}

export function repoConfig() {
  const env = serverEnv();
  return {
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_TARGET_BRANCH,
    authorName: env.GITHUB_COMMIT_AUTHOR_NAME,
    authorEmail: env.GITHUB_COMMIT_AUTHOR_EMAIL,
  };
}

/** Verifies the token works and has write access, for the Settings screen. */
export async function checkConnection(): Promise<{
  ok: boolean;
  message: string;
  canWrite?: boolean;
  defaultBranch?: string;
}> {
  try {
    const { owner, repo } = repoConfig();
    const { data } = await octokit().repos.get({ owner, repo });

    return {
      ok: true,
      message: `Connected to ${data.full_name}`,
      canWrite: data.permissions?.push ?? false,
      defaultBranch: data.default_branch,
    };
  } catch (err) {
    return { ok: false, message: describeGitHubError(err) };
  }
}

/** Reads one file. Returns null when it does not exist on that ref. */
export async function getFile(path: string, ref?: string): Promise<string | null> {
  const { owner, repo, branch } = repoConfig();

  try {
    const { data } = await octokit().repos.getContent({
      owner,
      repo,
      path,
      ref: ref ?? branch,
    });

    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      return null;
    }

    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw new GitHubError(`Could not read ${path} from GitHub: ${describeGitHubError(err)}`, err);
  }
}

/** Reads several files in parallel. Missing files come back as null. */
export async function getFiles(
  paths: string[],
  ref?: string
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    paths.map(async (path) => [path, await getFile(path, ref)] as const)
  );
  return Object.fromEntries(entries);
}

/**
 * Every file path in the repository at a given tree.
 *
 * One API call instead of probing paths individually, which matters because
 * publishing needs to know which referenced images are already committed.
 */
export async function listRepoPaths(treeSha: string): Promise<Set<string>> {
  const { owner, repo } = repoConfig();

  try {
    const { data } = await octokit().git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: 'true',
    });

    return new Set(
      (data.tree ?? [])
        .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
        .map((entry) => entry.path as string)
    );
  } catch (err) {
    throw new GitHubError(
      `Could not list the website's files: ${describeGitHubError(err)}`,
      err
    );
  }
}

/** Current head commit of the target branch. */
export async function getBranchHead(branch?: string): Promise<{
  commitSha: string;
  treeSha: string;
}> {
  const { owner, repo, branch: defaultBranch } = repoConfig();
  const targetBranch = branch ?? defaultBranch;

  try {
    const { data: ref } = await octokit().git.getRef({
      owner,
      repo,
      ref: `heads/${targetBranch}`,
    });

    const { data: commit } = await octokit().git.getCommit({
      owner,
      repo,
      commit_sha: ref.object.sha,
    });

    return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
  } catch (err) {
    if (isNotFound(err)) {
      throw new GitHubError(
        `Branch "${targetBranch}" does not exist in the website repository. ` +
          `Check GITHUB_TARGET_BRANCH.`
      );
    }
    throw new GitHubError(`Could not read branch "${targetBranch}": ${describeGitHubError(err)}`, err);
  }
}

/**
 * Commits a set of text files atomically.
 *
 * `expectedHeadSha` implements optimistic concurrency: if someone else pushed
 * to the repo since we read it, the publish is refused rather than silently
 * overwriting their work.
 */
export async function commitFiles(options: {
  files: RepoFile[];
  message: string;
  branch?: string;
  expectedHeadSha?: string;
  binaryFiles?: Array<{ path: string; base64: string }>;
}): Promise<CommitResult> {
  const { owner, repo, branch: defaultBranch, authorName, authorEmail } = repoConfig();
  const branch = options.branch ?? defaultBranch;
  const client = octokit();

  if (options.files.length === 0 && !options.binaryFiles?.length) {
    throw new GitHubError('Nothing to commit.');
  }

  const head = await getBranchHead(branch);

  if (options.expectedHeadSha && options.expectedHeadSha !== head.commitSha) {
    throw new GitHubError(
      'The website repository changed since this publish was prepared. ' +
        'Someone may have edited the site directly on GitHub. ' +
        'Refresh the preview and try again so their changes are not overwritten.'
    );
  }

  try {
    // 1. Upload every file as a blob.
    const textBlobs = await Promise.all(
      options.files.map(async (file) => {
        const { data } = await client.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content, 'utf8').toString('base64'),
          encoding: 'base64',
        });
        return { path: file.path, sha: data.sha };
      })
    );

    const binaryBlobs = await Promise.all(
      (options.binaryFiles ?? []).map(async (file) => {
        const { data } = await client.git.createBlob({
          owner,
          repo,
          content: file.base64,
          encoding: 'base64',
        });
        return { path: file.path, sha: data.sha };
      })
    );

    // 2. Build a tree on top of the current one.
    const { data: tree } = await client.git.createTree({
      owner,
      repo,
      base_tree: head.treeSha,
      tree: [...textBlobs, ...binaryBlobs].map((blob) => ({
        path: blob.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha,
      })),
    });

    // 3. Create the commit.
    const { data: commit } = await client.git.createCommit({
      owner,
      repo,
      message: options.message,
      tree: tree.sha,
      parents: [head.commitSha],
      author: {
        name: authorName,
        email: authorEmail,
        date: new Date().toISOString(),
      },
    });

    // 4. Move the branch. Nothing is visible on the live site until this
    //    succeeds, which is what makes the whole publish atomic.
    await client.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.sha,
      force: false,
    });

    return {
      commitSha: commit.sha,
      treeSha: tree.sha,
      parentSha: head.commitSha,
      filesChanged: [
        ...options.files.map((f) => f.path),
        ...(options.binaryFiles ?? []).map((f) => f.path),
      ],
      url: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
    };
  } catch (err) {
    if (err instanceof GitHubError) throw err;
    throw new GitHubError(`Publish failed: ${describeGitHubError(err)}`, err);
  }
}

/** Recent commits, for the "website status" panel on the dashboard. */
export async function getRecentCommits(limit = 5): Promise<
  Array<{ sha: string; message: string; date: string; url: string }>
> {
  const { owner, repo, branch } = repoConfig();

  try {
    const { data } = await octokit().repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: limit,
    });

    return data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message.split('\n')[0],
      date: commit.commit.author?.date ?? '',
      url: commit.html_url,
    }));
  } catch {
    // The dashboard should still render if GitHub is unreachable.
    return [];
  }
}

// -----------------------------------------------------------------------------
// Error helpers
// -----------------------------------------------------------------------------

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && err.status === 404;
}

/** Turns Octokit errors into something a student officer can act on. */
export function describeGitHubError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: number }).status;
    const message = 'message' in err ? String((err as { message: unknown }).message) : '';

    switch (status) {
      case 401:
        return 'GitHub rejected the access token. It may have expired — a new one needs to be created and added to the environment variables.';
      case 403:
        return message.toLowerCase().includes('rate limit')
          ? 'GitHub rate limit reached. Wait a few minutes and try again.'
          : 'The GitHub token does not have permission to write to the website repository. It needs "Contents: Read and write".';
      case 404:
        return 'The website repository or branch could not be found. Check GITHUB_OWNER, GITHUB_REPO, and GITHUB_TARGET_BRANCH.';
      case 409:
        return 'The repository changed while publishing. Try again.';
      case 422:
        return `GitHub rejected the request: ${message}`;
      default:
        return message || `GitHub returned an unexpected error (${status}).`;
    }
  }

  return err instanceof Error ? err.message : 'Unknown error contacting GitHub.';
}
