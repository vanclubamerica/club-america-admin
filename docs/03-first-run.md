# 3. First run

This is the one-time step that connects the existing website to the dashboard. It runs twice: once against the website's HTML files, once against the database.

**Do this once, carefully. Read the whole page before starting.**

---

## What is about to happen

The website is currently hand-written HTML. To let the dashboard edit it safely, two things must be true:

1. The HTML needs **marker comments** showing where each editable section starts and ends.
2. The database needs the **current content**, so the first publish does not wipe anything.

`npm run migrate:public-site` does both, and it will not write anything unless it can prove the result is correct.

### The guarantee it enforces

Before writing a single file, the script re-renders every generated section using the *same code the dashboard uses at publish time* and compares it byte-for-byte against what it is about to save. If anything differs, it aborts.

That means: **after migration, the first publish from the dashboard changes nothing.** If it did, the migration would have refused to run.

---

## Step 1 — Get a local copy of the website

```bash
cd ..
git clone https://github.com/vanclubamerica/clubamerica.git
cd club-america-admin
```

If you already have it, make sure it is clean and up to date (`git status` should show nothing).

---

## Step 2 — Preview the changes

```bash
npm run migrate:public-site
```

This is a **dry run** — nothing is written. You should see something like:

```
1. Reading current website content
  officers  6 (5 main, 1 additional)
  sponsors  3
  news      3
  events    7 (merged from index.html + events.html)
  dropped   media/sponsors/sponsor-4.png (referenced but missing from the repo)

2. Inserting markers and normalizing content
  ✓ index.html       10 regions
  ✓ officers.html     6 regions
  ...

3. Verifying the first publish will change nothing
  ✓ every generated region round-trips exactly
```

If it aborts, **do not use `--force`.** The message says which section failed. Usually the website's HTML has changed since the anchors in `scripts/lib/anchors.ts` were written, and those need updating.

---

## Step 3 — Apply it on a branch

Never run this straight onto `main`. Make a branch so the change is easy to review and undo:

```bash
cd ../clubamerica
git checkout -b cms-migration
cd ../club-america-admin
npm run migrate:public-site -- --write
```

Then look at exactly what changed:

```bash
cd ../clubamerica
git diff
```

**What you should see:**

- Added `<!-- cms:start ... -->` and `<!-- cms:end ... -->` comment lines
- One added `<link rel="stylesheet" href="css/theme.css">` per page
- The broken `sponsor-4.png` tile removed
- `Colleeg` corrected to `College`, and `CCC A` written out in full
- The homepage and Events page now showing the same reconciled event list

**What you should NOT see:** any change to the design, CSS classes, layout, or wording you did not expect.

If it looks right, commit and merge:

```bash
git add -A
git commit -m "Prepare site for CMS management"
git checkout main
git merge cms-migration
git push
```

Give GitHub Pages a minute, then load tpvan.com and confirm it looks unchanged.

---

## Step 4 — Load the content into Supabase

```bash
npm run seed:content
```

This reads `scripts/output/seed-data.json` (written in step 3) and loads the officers, sponsors, news posts, events, page text, and meeting details into the database.

It is safe to re-run — records are matched on natural keys, so a second run updates rather than duplicating.

---

## Step 5 — Create the first admin account

```bash
npm run create:admin
```

It asks for a name, email, role, and password. The password is typed at a prompt, never on the command line, so it does not end up in your shell history.

**The first account created becomes the Owner.** Make this the President (or yourself, if you are setting it up for them — ownership can be transferred later from the Leadership Transfer page).

---

## Step 6 — Try it

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000), sign in, and check:

- The dashboard shows real counts — officers, sponsors, news
- **Officers** lists the real officer names
- **Publish to the website** reports *"The website is already up to date"*

That last one is the proof that everything lined up. If it wants to change files, stop and look at what — it means the database and the website have diverged somewhere.

---

**Next:** [4. Deploy](04-deploy.md)
