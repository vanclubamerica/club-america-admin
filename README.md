# Club America Admin

Content management system and secure admin dashboard for the **Van High School Club America** website ([tpvan.com](https://tpvan.com)).

Built so that officers can update the public website without touching code, and so the whole thing can be handed from one president to the next every year.

---

## What this is

Three pieces that work together:

| Piece | Where it lives | What it does |
|---|---|---|
| **Public website** | `vanclubamerica/clubamerica` on GitHub Pages | The real tpvan.com. Plain HTML/CSS/JS. Keeps working on its own. |
| **Admin dashboard** | This repo, deployed to `admin.tpvan.com` | Where officers edit content. |
| **Database** | Supabase | Content, accounts, permissions, audit logs, file storage. |

**GitHub stays the master backup.** When an officer publishes, the dashboard commits the rendered HTML back to the website repository. Every version of the site is preserved in git history forever.

**If the dashboard goes offline, the public website keeps working.** It is static HTML served by GitHub Pages and does not call this application at all.

---

## How publishing works

The public site's HTML contains invisible marker comments:

```html
<!-- cms:start officers-main -->
  ...content generated from the database...
<!-- cms:end officers-main -->
```

Publishing replaces **only** what is between those markers, then commits all changed files to GitHub in a **single atomic commit**. Everything outside the markers stays exactly as it was hand-written — the design, layout, and CSS are untouched.

A few properties worth knowing:

- **Publishing is idempotent.** Every publish renders the whole site and commits only the files that actually differ. Publishing twice in a row does nothing the second time.
- **Nothing is partial.** A sponsor change touches the footer of all 8 pages. Those land as one commit or not at all.
- **Drift is detected.** If someone edits the website directly on GitHub, the next publish refuses rather than silently overwriting their work.

---

## Setup

Follow these in order. Each doc is short.

1. **[docs/01-supabase-setup.md](docs/01-supabase-setup.md)** — create the database, run the migrations
2. **[docs/02-github-setup.md](docs/02-github-setup.md)** — create the access token for publishing
3. **[docs/03-first-run.md](docs/03-first-run.md)** — import the existing website content, create the first admin
4. **[docs/04-deploy.md](docs/04-deploy.md)** — deploy to Vercel and point `admin.tpvan.com` at it

Then:

- **[docs/05-officer-guide.md](docs/05-officer-guide.md)** — day-to-day guide for officers
- **[docs/06-leadership-transfer.md](docs/06-leadership-transfer.md)** — the yearly handover runbook
- **[docs/07-security.md](docs/07-security.md)** — how the security model works, and what to do if an account is compromised

### Quick start for developers

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

---

## Commands

```bash
npm run dev                              # start the dev server
npm run build                            # production build
npm run typecheck                        # TypeScript, no emit
npm run lint                             # ESLint

npm run migrate:public-site              # dry run: preview the one-time site migration
npm run migrate:public-site -- --write   # apply it
npm run seed:content                     # load website content into Supabase
npm run create:admin                     # create an administrator account
```

---

## Roles and permissions

Five accounts, one per position: **President, Vice President, Secretary, Treasurer, Teacher Sponsor**. No shared logins.

**All five have identical content permissions.** Any officer can edit anything, upload images, and publish.

One account additionally holds an **Owner** flag (the President by default). Ownership gates only:

- suspending or archiving accounts
- the emergency website lock
- forcing password resets
- transferring ownership

This exists so that a single compromised account cannot lock the entire leadership team out of their own website. The Teacher Sponsor account is also marked as a recovery account — an adult backstop that survives student graduation.

---

## Cost

Everything runs on free tiers. Expected cost: **$0/month**.

| Service | Plan | Why it's enough |
|---|---|---|
| Supabase | Free | 500 MB database, 1 GB storage |
| Vercel | Hobby | Non-commercial use; a school club qualifies |
| GitHub | Free | Public repository |
| Google Calendar | Free | Read via the public `.ics` feed — no API key, no billing account |
| Resend (optional) | Free | 3,000 emails/month |

Google Calendar is read through its public feed on purpose. The official API would need a Cloud project, OAuth credentials, and a billing account — three things that would quietly expire the first time leadership changed hands.

---

## Project structure

```
club-america-admin/
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # authenticated pages — one folder per section
│   │   ├── login/             # sign in, sign out, password reset
│   │   └── layout.tsx
│   ├── components/            # shared UI
│   ├── lib/
│   │   ├── auth/              # session guard, rate limiting, lockout
│   │   ├── publish/           # the publishing engine
│   │   │   ├── regions.ts     # what the CMS controls  ← start here
│   │   │   ├── renderers.ts   # database → website HTML
│   │   │   ├── markers.ts     # marker splicing
│   │   │   ├── github.ts      # atomic commits
│   │   │   └── sanitize.ts    # output sanitization
│   │   ├── audit.ts           # permanent activity log
│   │   └── uploads.ts         # file validation
│   └── types/database.ts      # mirrors the SQL schema
├── supabase/migrations/       # database schema — run these in order
├── scripts/                   # migration, seeding, admin creation
└── docs/                      # setup and operations guides
```

**If you are picking this up cold, read `src/lib/publish/regions.ts` first.** It is the registry of every part of the website the CMS controls, and the rest of the publishing code follows from it.

---

## Security summary

- Supabase Auth with per-person accounts; passwords are hashed by Supabase and never handled by this application.
- Row Level Security on every table, denying by default.
- **Audit logs are physically append-only** — enforced by database triggers that reject UPDATE and DELETE from every role, including the service role. Even a leaked service key cannot erase evidence of its own misuse.
- All published content is HTML-escaped or passed through a strict allowlist. Content typed here becomes a public web page, so this is treated as the highest-risk boundary in the system.
- Uploads are validated by **magic bytes**, not filename or declared type. SVG is rejected because it can carry script.
- Rate limiting and account lockout are backed by Postgres — no extra paid service to renew.
- Emergency lock instantly disables all editing and publishing without taking the public website down.

Full detail in [docs/07-security.md](docs/07-security.md).

---

## Maintenance

Website created and maintained by **Brant Borden**.

For technical problems, contact Brant Borden. Future officers: the operational guides in `docs/` are written for non-programmers and are the best starting point.
