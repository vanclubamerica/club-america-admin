# 5. Officer guide

For anyone using the dashboard. **No coding knowledge needed.**

Sign in at **[admin.tpvan.com](https://admin.tpvan.com)**.

---

## The one thing to understand

Editing and publishing are **two separate steps**.

1. You make changes and **save** them. Nothing on the public website changes yet.
2. You go to the **Dashboard** and press **Publish to the website**. Now it is live.

This is on purpose. You can work on something across several days, get it wrong, fix it, and only push it live when you are happy. Nobody sees a half-finished page.

---

## Common tasks

### Post an announcement

**News → New announcement.** Write a title and the text, set the status to **Published**, save. Then publish from the Dashboard.

Leaving it as **Draft** saves it without ever showing it publicly.

### Update an officer

**Officers.** The five main positions — President, Vice President, Secretary, Treasurer, Teacher Sponsor — are fixed. You can change the name, photo, and biography, but not the role itself, because those positions always exist.

Additional positions like Historian or Social Media Manager are under **Additional officers**, where you can add, edit, remove, and reorder freely.

### Add a sponsor

**Sponsors → Add a sponsor.** Enter the business name, upload the logo, and pick Gold, Silver, or Bronze. Gold sponsors appear first.

Tick **Show in the footer** to also put their logo at the bottom of every page.

### Update events

**Events → Sync from Google Calendar.** The club calendar stays the source of truth — syncing just copies upcoming events over so they can appear on the website. It never writes anything back to Google.

The homepage shows the next 3 events and the Events page shows the full list. **Past events disappear on their own** — you never need to clean them up.

You can also add a one-off event manually if it is not on the calendar.

### Edit page text

**About.** Every editable block of text on the website is here, grouped by page. Use the formatting buttons — bold, italic, headings, lists, links. You never write HTML.

**Save draft** keeps your work private. **Save** makes it ready to publish.

Each block keeps a **History**. If an edit goes wrong, open History and press **Restore**.

### Upload a document

**Documents.** For the constitution, meeting agendas, sponsor packets, and forms. These are private — only signed-in officers can download them, using links that expire after a few minutes.

### Change the site for a holiday

**Themes.** Pick Christmas, Halloween, Thanksgiving, and so on, then publish. Choosing **Normal** puts it back exactly as it was — the original design file is never modified, so this is always safe to undo.

You can edit any theme's colors, and future officers can build out new ones.

---

## Publishing

On the **Dashboard**, the publish panel tells you what will happen before it happens:

- *"The website is already up to date"* — nothing to do.
- *"3 pages will change"* — press **Show the list** to see which.

Type a short note about what changed (this is saved with the backup), then press **Publish to the website**. It takes a few seconds. GitHub Pages then takes a minute or two to show the change publicly.

### If publishing fails

Read the message — it is written to tell you what to do. The two most common:

- **"The GitHub token has expired"** — an adult needs to create a new one. See [docs/02](02-github-setup.md).
- **"The website repository changed since this publish was prepared"** — someone edited the site directly on GitHub. Refresh the page and try again so their work is not overwritten.

---

## Everything is recorded

**Activity Logs** shows every change ever made — who, what, and when. These records **cannot be edited or deleted by anyone**, including the President. That is deliberate: if something goes wrong or an account is misused, this is how you find out exactly what happened.

Do not be nervous about it. It is a safety net, not surveillance.

---

## If something goes wrong

**You edited something and want it back:** open **About**, find the block, press **History**, and **Restore** an earlier version.

**The website looks broken after publishing:** the previous version is safe in GitHub. Contact Brant Borden.

**You think someone got into an account:** tell your President or Teacher Sponsor immediately. They can activate the **emergency lock**, which instantly stops all editing and publishing. The public website stays online and unchanged. See [docs/07](07-security.md).

**You are locked out after too many wrong passwords:** wait 15 minutes, or ask your President or Teacher Sponsor to send you a reset link.

---

## Getting help

Website created and maintained by **Brant Borden**. For technical problems, contact Brant Borden — the link is at the bottom of every page in the dashboard.
