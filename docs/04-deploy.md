# 4. Deploy to Vercel and set up DNS

**Time needed:** about 20 minutes, plus DNS propagation.

---

## Push this repository to GitHub

```bash
git add -A
git commit -m "Initial admin dashboard"
git push -u origin main
```

---

## Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New → Project**, then import `vanclubamerica/club-america-admin`.
3. Vercel detects Next.js automatically — leave the build settings alone.
4. Before deploying, expand **Environment Variables** and add every value from your `.env.local`:

| Variable | Secret? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** |
| `GITHUB_TOKEN` | **Yes** |
| `GITHUB_OWNER` | No |
| `GITHUB_REPO` | No |
| `GITHUB_TARGET_BRANCH` | No |
| `NEXT_PUBLIC_SITE_URL` | No |
| `NEXT_PUBLIC_ADMIN_URL` | No |
| `GOOGLE_CALENDAR_ID` | No |
| `NEXT_PUBLIC_SUPPORT_NAME` | No |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | No |

5. Click **Deploy**.

> Vercel's Hobby plan is free but is for non-commercial use. A school club qualifies. Do not put ads on it.

---

## Point admin.tpvan.com at it

### In Vercel

1. Open the project → **Settings → Domains**.
2. Add `admin.tpvan.com`.
3. Vercel shows the DNS record you need. It is normally:

```
Type:   CNAME
Name:   admin
Value:  cname.vercel-dns.com
```

### At your domain registrar

Wherever `tpvan.com` is registered, open the DNS settings and add exactly that record.

**Leave every existing record alone.** The root `tpvan.com` records point at GitHub Pages and must not change — breaking them takes the public website down.

You are only adding one new `admin` subdomain record.

### Wait

DNS usually updates within 30 minutes, occasionally up to 48 hours. Vercel issues the HTTPS certificate automatically once it sees the record.

When Vercel's Domains page shows a green check next to `admin.tpvan.com`, visit it — you should get the sign-in page.

---

## After deploying

1. **Update Supabase.** Go to **Authentication → URL Configuration** and set **Site URL** to `https://admin.tpvan.com`. Add `https://admin.tpvan.com/update-password` to the redirect URLs.
2. **Sign in** and check **Settings → Connections**. GitHub should report connected.
3. **Publish once** to confirm the whole path works end to end.

---

## Updating the site later

Vercel redeploys automatically whenever you push to `main` in this repository. There is nothing to run by hand.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Build fails: "Missing or invalid public environment variables" | An env var is missing in Vercel | Add it in Settings → Environment Variables, then redeploy |
| Domain stuck on "Invalid Configuration" | DNS record not visible yet | Check the record at your registrar; wait longer |
| Sign-in works but immediately bounces back | Supabase Site URL still points at localhost | Update it in Authentication → URL Configuration |
| Password reset emails link to localhost | Same cause | Same fix, plus add the redirect URL |

---

**Next:** [5. Officer guide](05-officer-guide.md)
