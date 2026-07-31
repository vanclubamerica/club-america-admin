# 1. Supabase setup

Supabase is the database, login system, and file storage. The free tier is plenty for this club.

**Time needed:** about 15 minutes.

---

## Create the project

1. Go to [supabase.com](https://supabase.com) and sign up (GitHub login is fine).
2. Click **New project**.
3. Fill in:
   - **Name:** `club-america-admin`
   - **Database password:** generate a strong one and **save it in a password manager**. You will rarely need it, but it cannot be recovered later.
   - **Region:** pick the closest US region.
4. Click **Create new project** and wait a couple of minutes.

---

## Run the database migrations

The files in `supabase/migrations/` create every table, permission rule, and safety trigger. Run them **in order**.

1. In Supabase, open **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase/migrations/0001_init.sql`, copy the whole file, paste it in, and click **Run**.
4. Repeat for each remaining file, in this order:
   - `0002_audit_immutability.sql`
   - `0003_storage.sql`
   - `0004_seed.sql`

Each should report success. If one reports an **error**, stop and fix it before continuing — later files depend on earlier ones.

### If a migration fails partway through

The SQL Editor commits statements as it goes, so a script that errors leaves behind everything it managed to create before failing. Running it again then hits `type "..." already exists` or similar.

The migrations are written to be re-runnable — tables use `create table if not exists`, enums and policies are guarded — so a second run is normally safe.

**But `if not exists` cannot repair a table that was created with an older definition.** If you have already had a failed run and are unsure what state the database is in, start clean:

1. Open `supabase/reset.sql`, read the warning at the top, and run it.
2. Run `0001` through `0004` again in order.

`reset.sql` drops and recreates the `public` schema. It does **not** touch your Auth users, your Storage files, or the public website. Do not run it once officers are actually using the system.

### Notices you can safely ignore

Supabase owns two tables that it does not let the SQL Editor modify: `auth.users` and `storage.objects`. The migrations handle this — they print a notice and carry on instead of failing.

You may see either of these. **Both are expected and neither is a problem:**

> `NOTICE: Skipped the auth.users trigger (no permission on auth.users). This is expected on Supabase and is NOT a problem — profile rows are created by the application instead.`

Nothing to do. `npm run create:admin` and the officer invite flow create profile rows themselves.

> `NOTICE: Skipped N storage policy statement(s) — this project does not allow creating policies on storage.objects from SQL.`

If you see this one, you **do** need to add the storage policies by hand. Open **Storage → Policies** in the dashboard and create them exactly as listed in the comment at the bottom of `0003_storage.sql`. Without them, image and document uploads will be rejected.

The difference: a **NOTICE** is informational and the migration continued. An **ERROR** means it stopped.

> **What 0002 does, and why it matters:** it makes the activity log permanently append-only using database triggers. After running it, *nobody* can edit or delete a log entry — not officers, not the owner, not even someone holding the service role key. That is deliberate. If an account is ever compromised, this history is how you find out what happened.

---

## Copy the API keys

1. Go to **Project Settings → API**.
2. You need three values:

| Setting | Where it goes | Notes |
|---|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` | Safe to share |
| **anon / public key** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Safe to share — protected by Row Level Security |
| **service_role key** | `SUPABASE_SERVICE_ROLE_KEY` | **SECRET.** Bypasses all security rules |

3. Copy `.env.example` to `.env.local` and paste them in.

> ⚠️ **The service_role key is effectively a master password for your database.** Never commit it, never paste it into a chat or email, and never put it in any file that starts with `NEXT_PUBLIC_`. If it ever leaks, rotate it immediately in Project Settings → API.

---

## Configure email

Supabase sends the password reset and officer invitation emails.

1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to `https://admin.tpvan.com` (use `http://localhost:3000` while developing).
3. Under **Redirect URLs**, add:
   - `https://admin.tpvan.com/update-password`
   - `http://localhost:3000/update-password`

The built-in email service is rate-limited but fine for a club that adds a handful of accounts per year.

---

## Turn off public sign-ups

There is no public registration in this app, but close the door at the database level too:

1. Go to **Authentication → Providers → Email**.
2. Turn **Enable email signups** **off**.

Accounts are created only by the owner, from the Leadership Transfer page, or with `npm run create:admin`.

---

## Check it worked

In the SQL Editor, run:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

You should see about 18 tables including `profiles`, `officers`, `sponsors`, `audit_logs`, and `content_blocks`.

Then confirm the audit log really is locked down:

```sql
-- This SHOULD fail. That is the point.
delete from public.audit_logs where id = 1;
```

Expected error: `audit_logs is append-only: DELETE is not permitted on this table`.

---

**Next:** [2. GitHub setup](02-github-setup.md)
