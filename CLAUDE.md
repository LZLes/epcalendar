# MINDS MYG EP Project — Session Calendar

Bilingual (EN/中文), read-only session calendar for caregivers and
volunteers. Built on [teenyapp.com](https://teenyapp.com), a config-driven
backend framework (teenybase) running on a dedicated Cloudflare Worker + D1
database + R2 bucket. No end-user registration; admin manages sessions.

## Links

- **Live site:** https://myg-ep-sessions.app.teenyapp.com
- **PocketUI (built-in admin table editor):** `/api/v1/pocket/` — username
  `editor` (write) or `viewer` (read-only). Passwords are teenyapp *system
  secrets*: not stored here, not changeable via the agent API (confirmed —
  `PUT .../secrets/POCKET_UI_EDITOR_PASSWORD` is rejected as a system
  secret). If lost, the project owner can regenerate them from the teenyapp
  project dashboard, or ask this session's user for them.
- **Custom `/admin` portal:** `/admin` — HTTP Basic Auth, password stored
  (salted SHA-256) in the `admin_settings` D1 table, changeable from the
  page itself. This is a *separate* password from PocketUI's — see
  "Admin portal" below.

## How this repo maps to teenyapp

- `teenybase.ts` — schema (`sessions`, `admin_settings` tables), row-level
  access rules. Editing this and saving regenerates `@migration.sql`
  automatically.
- `worker.ts` — the whole app: SSR page at `/`, the `/admin` portal routes,
  and `/robots.txt` / `/sitemap.xml` / `/llms.txt`.
- `assets/eastpoint-logo.png` — the project owner's original logo file
  (also embedded inline as a base64 data URI in `worker.ts`, so the page
  stays a single HTTP request).
- These files are a **mirror** of what's live on teenyapp — this git repo
  is not itself deployed anywhere. To change the live app: edit here,
  then push the changed file(s) to teenyapp's file API, then commit there
  (see "Making changes" below). Pushing to GitHub alone does nothing to
  the live site.

## Getting a fresh agent token

Requests to teenyapp's project API need `Authorization: Bearer tp_...`.
That token is short-lived and tied to the session that created the
project. If you're a fresh Claude session (after context compaction or a
new conversation) and don't have one in context:

1. Ask the user for a fresh token — teenyapp's project dashboard (they
   have this once claimed) shows it, or they can paste the original
   `https://teenyapp.com/agent/<token>/agents.md` link if they saved it.
2. Fetch `GET https://teenyapp.com/agent/<token>/agents.md` — this
   re-derives everything (API base, endpoint catalog, current
   credentials-that-are-readable) in one document. Save/re-read that
   document, not just this file, for the full up-to-date protocol —
   this file is a project-specific supplement to it, not a replacement.
3. The API base is `https://teenyapp.com/api/v1/projects/myg-ep-sessions`.

## Making changes

1. Edit `teenybase.ts` and/or `worker.ts` locally.
2. `PUT $BASE/files?path=<file>` with the new content and an `If-Match:
   <etag>` header (read the current etag via `GET $BASE/files?path=<file>`
   first). This triggers an immediate build; branch on `success`/
   `result.bundle.ok`/`result.config.ok`, not just HTTP status.
3. If the schema changed, `@migration.sql` is regenerated — **read it**
   before committing. Hand-edit it only to add data (INSERT/UPDATE), never
   to change DDL (edit `teenybase.ts` for that, which regenerates the
   file and clobbers hand-edits — that's why data seeds go in as a
   *separate* edit after the schema save, per teenyapp's own docs).
4. `POST $BASE/commit {"message": "..."}` — promotes config and runs the
   migration against the live D1 database. Nothing is live/durable until
   this step.
5. Smoke-test with curl before telling the user it's done (see below) —
   this project has already hit two real runtime-only bugs that a build
   success didn't catch (see "Known gotcha" below).
6. Mirror the same change into this git repo and push, so the repo stays
   an accurate copy of what's deployed.

## Known gotcha: backslash-escape corruption through `html()`/`c.html()`

**This cost a lot of debugging time once already — read this before
writing any more inline `<script>` content.**

Content that flows through Hono's `html`/`raw()` template tag and out via
`c.html(...)` gets backslash-escape sequences corrupted somewhere in
teenyapp's build/serve pipeline — confirmed empirically, root cause not
fully identified. Symptoms:

- A doubled escape in source (`'\\\\'`, meant to survive one cook and
  leave a single real backslash for the *browser's* parser) arrives with
  only half as many backslashes as intended, corrupting anything
  depending on exact backslash counts (regexes matching backslashes, ICS
  escaping, `\uXXXX` unicode escapes used for `<`-neutralizing).
- A single `\n`/`\r` **inside a single- or double-quoted string** arrives
  as an actual raw newline/CR byte embedded in that string literal — a
  hard `SyntaxError` (`Invalid or unexpected token`), since only
  backtick template literals tolerate raw embedded newlines.
- The same escapes inside a backtick template literal, or content served
  via `c.text()` / `c.body()` / `c.json()` (bypassing `html()`/`raw()`/
  `c.html()` entirely), are **not** affected — confirmed via
  `/robots.txt` (template literal, `c.text()`) and `/admin/export.csv`
  (`c.body()`) both working correctly with `\n`/`\r\n` in source.

**Rule of thumb:** in any string that will be embedded via `html`/`raw`/
`c.html()`, don't write `\\`, `\n`, `\r`, `\t`, or `\uXXXX` as literal
source characters. Instead:
- Build backslash/newline/CR characters at runtime with
  `String.fromCharCode(92)` / `(10)` / `(13)`, using `.split()/.join()`
  instead of a `.replace(/regex/, ...)` that needs an exact escape count.
- For arbitrary text (especially anything that could contain `<`, which
  risks breaking `</script>` out of its tag) being embedded as data:
  base64-encode it with `toBase64Utf8()` (worker side) and decode with
  `fromBase64Utf8()` (client side) — both already defined in `worker.ts`.
  Base64 text has no backslashes, angle brackets, or quotes at all, so
  it's immune regardless of the exact scope of this bug. This is how
  `window.__SESSIONS__` / `window.__I18N__` are transported.
- Routes that only need to return plain text/CSV/JSON (not part of the
  HTML page) should use `c.text()` / `c.body()` / `c.json()` directly and
  can use normal escape sequences freely — see `/admin/export.csv`.

## Admin portal (`/admin`)

Built because PocketUI's own login password can't be changed via the
agent API, and PocketUI has no export/import. `/admin` is HTTP Basic Auth
(any username, password checked against `admin_settings.password_hash`,
salted SHA-256, both columns read/written via `db.rawSQL()` since that
table's rules are all `null` — no public REST route exists for it at
all). From the page:

- **Export** — `/admin/export.csv` and `/admin/export.json`, all session
  columns including `id`.
- **Import** — `/admin/import`, multipart CSV upload. A row with a blank
  `id` is inserted as new; a row whose `id` matches an existing session
  updates it in place. **Nothing is ever deleted by import.** Both paths
  use `db.rawSQL()` (parameterized), not `$Table` methods — the
  `sessions` table's own create/update rules are `null` (public API is
  read-only by design), so `$Table.insert()/.update()` would be denied
  even from this trusted server-side route; `rawSQL()` is the documented
  way to bypass row-level rules from code you trust.
- **Change password** — updates `admin_settings` with a fresh random
  salt + hash. This password is unrelated to PocketUI's.

## Schema (sessions table)

`date`, `time` (free text, e.g. "9:30 AM – 11:30 AM"), `title_en/zh`,
`location_en/zh`, `description_en/zh` (optional), `attire_en/zh`
(optional), `vacancy` (integer, optional), `meals_provided` (bool,
optional), `emoji` (text, optional — shown before the title on the card).
To add a field: add it to `sessions.fields` in `teenybase.ts`, save
(regenerates the migration), review it, commit — then also add it to
`SESSION_COLUMNS`/`EXPORT_COLUMNS` and the CSV import mapping in
`worker.ts` if it should show up in export/import too, and to the SSR
`select` list / card renderer if it should appear on the public page.

## Frontend behavior worth knowing

- All rendering is client-side from an embedded, base64-encoded JSON
  blob (see gotcha above) — no client→server fetch after the initial
  page load. Language toggle, "show past sessions", and dark mode are
  all instant, no reload.
- "Upcoming" is computed against *today in Asia/Singapore time*
  (`Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Singapore'})`), not the
  visitor's local timezone.
- "Add to calendar" builds an all-day `.ics` client-side from the raw
  `date` field (Y/M/D calendar math via `Date.UTC`, deliberately *not*
  going through a timezone-anchored `Date` — that was a real off-by-one
  bug here once, see git history).
- Dark mode: auto-detects `prefers-color-scheme`, with a manual toggle
  that overrides and persists to `localStorage`.
