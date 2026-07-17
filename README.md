# Suade.MSJ — Word Add-in

Motion for Summary Judgment drafting assistant for Massachusetts
employment lawyers — a fork of Suade. See [PRD.md](PRD.md) for product
context. Dev ports differ from Suade so both can run side by side:
task pane on https://localhost:3100, backend on https://localhost:3101.

## Prerequisites

- Node.js 18+
- Word desktop (not Word Online) — macOS or Windows
- On first run, you'll be prompted to trust a locally-generated dev
  certificate (via `office-addin-dev-certs`) so Word can load the add-in
  over HTTPS from `localhost`. Accept it when prompted.

## Setup

```bash
npm install
```

## Run locally

```bash
npm run dev-server   # starts the webpack dev server on https://localhost:3100
```

In a second terminal:

```bash
npm start             # sideloads the add-in into Word and launches it
```

`npm start` uses `office-addin-debugging`, which registers the manifest
with Word and opens it for you. If it doesn't open automatically: open
Word manually, go to **Insert → Add-ins → My Add-ins → Shared Folder** (or
**Upload My Add-in** on Windows) and point it at `manifest.xml`.

To stop and unregister the sideloaded add-in:

```bash
npm run stop
```

## Acceptance check for Step 1

Open Word with the add-in sideloaded, click the Suade button on the
ribbon's Home tab. The task pane should open and show:

> **Suade**
> Task pane scaffold — Phase 1, Step 1.
> If you can see this inside Word, sideloading and the Office.js bootstrap
> are working. Cursor and selection tracking lands in Step 2.

If you see that, Step 1 is done — move to Step 2 (cursor/selection
tracking, `FR-1.1`).

## Project structure

```
manifest.xml              Dev manifest — points at https://localhost:3000
webpack.config.js         Bundles taskpane + commands entry points, dev server + HTTPS certs
src/
  taskpane/
    taskpane.html          HTML shell, loads office.js from CDN
    index.tsx               React bootstrap, waits on Office.onReady
    App.tsx                  Root component (placeholder for Step 1)
  commands/
    commands.html/.ts       Required by manifest's FunctionFile; unused in Phase 1
  types/
    index.ts                 Shared types mirroring the PRD's data model (Section 12)
  data/
    skills/                   Empty — Skill Registry lands in Step 4
    matters/                  Empty — Matter Repository CSV lands here (Step 3/9)
assets/                    Placeholder ribbon icons (16/32/64/80px)
```

## Sharing with friends (no AppSource, no local server required on their end)

This deploys the whole app -- task pane + backend, with your Anthropic key
staying server-side -- to one small always-on host, so a friend can sideload
a single manifest file and use it without running `npm start`/`npm run
server` themselves or needing your `.env`.

**This is NOT an AppSource listing.** It's a manually-sideloaded add-in, so
Word will show a normal "this add-in is not verified" style notice the
first time -- expected, not an error. Anyone with the manifest file and
the deployed URL can add documents/run Skills against your Anthropic key,
so only hand the manifest to people you actually trust, and watch your
Anthropic usage/billing.

### 1. Deploy to Render

1. Push this repo to GitHub (already done) and go to
   [dashboard.render.com](https://dashboard.render.com) -- sign up/log in.
2. **New > Blueprint**, point it at this repo. Render will read
   `render.yaml` and pre-fill the build/start commands.
3. When prompted for the `ANTHROPIC_API_KEY` env var, paste your key
   (Render will *not* commit it anywhere -- it's stored as a secret).
4. Deploy. Render gives you a URL like `https://suade-addin.onrender.com`
   (or `https://<your-chosen-name>.onrender.com` if you renamed the
   service) -- open `/api/health` on that URL and confirm you get
   `{"status":"ok"}`.

Note: on Render's free instance type the service spins down after
inactivity and takes ~30-60s to wake back up on the next request -- the
first Skill run after a quiet period may just look like it's hanging.
A paid instance type (this repo's `render.yaml` is set to `starter`) stays
always-on and avoids that.

### 2. Point the manifest at your deployed URL

Open [manifest-production.xml](manifest-production.xml) and replace every
occurrence of `https://suade-addin.onrender.com` with your actual Render
URL from step 1 (8 places: `IconUrl`, `HighResolutionIconUrl`,
`SupportUrl`, `AppDomain`, `SourceLocation`, the three icon `bt:Image`
entries, and the three `bt:Url` entries).

### 3. Give a friend the manifest

Send them just the one file, `manifest-production.xml` (not the whole
repo -- they don't need Node, npm, or your `.env`). They install it in
Word:

- **Word desktop (Mac or Windows):** **Insert tab > Add-ins > My Add-ins
  > Upload My Add-in** (Windows) or **Insert > Add-ins > My Add-ins >
  gear icon/Upload** (Mac depending on Word version) -- browse to the
  `manifest-production.xml` file they saved locally.
- They'll see an "unverified add-in" warning on first load -- expected,
  click through it.
- The Suade button then appears on the Home tab, same as your dev setup,
  but every Skill run/upload now goes to your deployed backend, not
  localhost.

### Known limitations of this setup, flagged not solved

- **Shared everything.** All friends share one Anthropic Files API
  workspace and one `skill-feedback.log` -- no per-lawyer isolation,
  matching the existing single-key architecture (see `server.js`'s
  header comment). Fine for a few trusted friends testing it, not fine
  for real client confidentiality at firm scale.
- **No auth.** Anyone with the manifest URL can use it and spend your
  API budget. There's no login, no per-user key, no usage cap.
- **Free-tier cold starts** (see above) if you drop back to a free instance type.

## Known placeholders (intentional, not bugs)

- `assets/icon-*.png` are generated placeholders (navy square, "S"). Swap
  for real branding whenever design is ready — not a Step 1 blocker.
- `manifest.xml`'s `<Id>` is a fixed dev GUID. Generate a real one before
  any shared/production manifest.
- `commands.ts` registers no ribbon functions — intentional per Phase 1
  scope (see file comment).
