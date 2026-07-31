# 2. GitHub setup

The dashboard publishes by committing to the public website repository. That needs an access token.

**Time needed:** about 5 minutes.

---

## Create a fine-grained access token

Use a **fine-grained** token, not a classic one. Fine-grained tokens can be limited to a single repository with a single permission — a classic token would have access to everything in the account.

1. Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. Fill in:
   - **Token name:** `club-america-admin publishing`
   - **Expiration:** 1 year. **Put a calendar reminder to renew it** — publishing stops working the day it expires, and the error message will tell you why.
   - **Resource owner:** `vanclubamerica`
3. Under **Repository access**, choose **Only select repositories** → pick **`clubamerica`** (the public website repo, *not* this admin repo).
4. Under **Permissions → Repository permissions**, set:
   - **Contents: Read and write**
   - Leave everything else as **No access**.
5. Click **Generate token** and copy it. **GitHub shows it once.**

> That single permission is all the dashboard needs. It cannot delete the repository, change settings, or touch any other project.

---

## Add it to your environment

In `.env.local`:

```bash
GITHUB_TOKEN=github_pat_xxxxxxxxxxxx
GITHUB_OWNER=vanclubamerica
GITHUB_REPO=clubamerica
GITHUB_TARGET_BRANCH=main
```

---

## Test against a branch first

Before letting it write to the live website, point it at a test branch:

```bash
GITHUB_TARGET_BRANCH=cms-test
```

Create that branch on GitHub, publish from the dashboard, and check the commit looks right. Then switch back to `main`.

This is worth doing once. After that, publishing to `main` is routine.

---

## Verifying the connection

Sign in to the dashboard and open **Settings**. Under **Connections** you should see:

> GitHub (website publishing) — **Connected to vanclubamerica/clubamerica**

If it shows an error instead:

| Message | Fix |
|---|---|
| "GitHub rejected the access token" | The token expired or was copied incorrectly. Generate a new one. |
| "does not have permission to write" | The token is missing **Contents: Read and write**. |
| "repository or branch could not be found" | Check `GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_TARGET_BRANCH`. |

---

## When the token expires

Publishing will fail with a clear message. To fix it:

1. Generate a new token following the steps above.
2. Update `GITHUB_TOKEN` in Vercel (**Settings → Environment Variables**).
3. Redeploy.

Nothing is lost while the token is expired — officers can keep editing, and everything publishes once the token is replaced.

---

**Next:** [3. First run](03-first-run.md)
