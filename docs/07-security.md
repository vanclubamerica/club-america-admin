# 7. Security

How the system protects itself, and what to do when something goes wrong.

---

## If an account is compromised — do this first

**Activate the emergency lock.** Settings → Security controls → **Activate emergency lock**.

This immediately:

- disables all editing and publishing, for everyone
- blocks writes at the database level, not just in the app

The **public website stays online and completely unchanged**. Visitors notice nothing. You are freezing the control panel, not taking the site down.

Then:

1. **Settings → Force a password reset** for the affected account.
2. **Activity Logs** — filter by that person and read what was actually done. These records cannot be faked or erased.
3. If content was tampered with, restore it: **About → History → Restore**, or revert the commit in GitHub.
4. Once it is resolved, lift the lock. **Publishing stays paused** until you explicitly turn it back on — a deliberate extra step so nothing goes live before you have checked it.

Only the account Owner or the Teacher Sponsor can lock or unlock.

---

## The security model

### Accounts

- One account per person. **No shared logins** — shared accounts make the audit trail meaningless.
- Passwords are hashed by Supabase Auth. This application never sees, stores, or transmits a password.
- Minimum 12 characters.
- **5 failed sign-ins locks the account for 15 minutes.** Keyed on the email address, so rotating IP addresses does not help an attacker.
- Sign-in failures are deliberately vague — "that email and password combination did not work" — so the response cannot be used to discover which officers have accounts.

### Permissions

All five roles have **identical content permissions**. Anyone can edit anything and publish.

A separate **Owner** flag gates only: account management, emergency lock, forced password resets, and ownership transfer.

The reason is containment. If content permissions and administrative control were the same thing, one compromised account could lock out the entire leadership team. Splitting them means the worst a compromised officer account can do is make content changes — all of them logged, all of them reversible.

The Teacher Sponsor also holds a **recovery** flag: an adult backstop that survives student graduation.

### Database

Row Level Security is on for every table and **denies by default**. Even with a valid login, the database itself refuses reads and writes the policies do not allow.

Two tables are never reachable from the browser at all: `login_attempts` and `rate_limits`.

### Audit logs

**Permanently append-only, enforced in three layers:**

1. Row Level Security grants officers `SELECT` only — there is no insert policy for the browser at all.
2. `UPDATE`, `DELETE`, and `TRUNCATE` are revoked from every database role.
3. Database triggers reject those operations regardless of who is asking.

Layer 3 is what makes this real. Triggers fire for superusers too, so **even a leaked service role key cannot erase evidence of its own misuse.**

Archived leadership terms and content version snapshots are protected the same way.

### Published content

This is the highest-risk boundary in the system: text typed into the dashboard becomes a public web page served from tpvan.com, and it persists in git history.

- Plain fields (names, titles, locations) are **HTML-escaped**. They can never contain markup.
- Rich text passes a **strict allowlist** — paragraphs, emphasis, headings, lists, links. Anything else is discarded.
- Links are limited to `http`, `https`, and `mailto`. `javascript:`, `data:`, and protocol-relative URLs are rejected.
- Image paths must resolve inside `media/`. Directory traversal and absolute URLs are refused.
- Theme colors are validated as real CSS colors before being written into a public stylesheet.

### Uploads

- Validated by **magic bytes**, not filename or the browser's declared type. A `.png` that is actually something else is rejected.
- Images: PNG, JPEG, WebP, GIF only, 5 MB max.
- **SVG is deliberately rejected.** It can carry embedded script, and these files are published to a public website where that would become stored XSS against visitors.
- Documents go to a **private** bucket. Downloads use signed URLs that expire in five minutes.

### Application

- Session cookies are verified against Supabase on every request, not trusted as-is.
- **Account status is re-checked on every request.** Suspending someone takes effect immediately, not whenever their token happens to expire.
- Content Security Policy locked to same-origin. No external fonts, scripts, or stylesheets.
- The service role key is server-only, enforced by the `server-only` package — the build fails if it is ever imported into browser code.
- Rate limiting on sign-ins, uploads, and publishing.

---

## Routine maintenance

| When | Task |
|---|---|
| Yearly | Renew the GitHub token before it expires (calendar reminder) |
| Yearly | Run the [leadership transfer](06-leadership-transfer.md); suspend departing officers |
| Each term | Skim Activity Logs for anything unexpected |
| If a key leaks | Rotate it in Supabase / GitHub, update Vercel, redeploy |

---

## What is deliberately *not* protected

Being honest about the boundaries:

- **Anyone with repository write access can edit the website directly on GitHub**, bypassing this dashboard entirely. That is intentional — GitHub is the master backup and the escape hatch if the dashboard is ever unavailable. The publish pipeline detects such edits and refuses to overwrite them silently.
- **The Supabase service role key can read and write all content.** It cannot rewrite audit history. Guard it accordingly.
- **This is not a high-security system.** It is a school club website. The design goal is that ordinary mistakes are recoverable and misuse is visible — not that it resists a determined, targeted attacker.

---

## Reporting a problem

Contact **Brant Borden** — the link is in the footer of every dashboard page.

If it looks like an active compromise, **activate the emergency lock first, then get in touch.** It is easy to undo and costs nothing if you were wrong.
