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

- `teenybase.ts` — schema (`sessions`, `admin_settings`, `icon_settings`
  tables), row-level access rules. Editing this and saving regenerates
  `@migration.sql` automatically.
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
   before committing.
   **Do not hand-edit `@migration.sql` to add data.** This was tried and
   confirmed *not* to work: `@migration.sql` is recomputed from scratch
   (pure DDL, from a live-schema vs. `teenybase.ts` diff) on *every* file
   save, including a save of `@migration.sql` itself — whatever you PUT
   to it is discarded and replaced by the regenerated version before the
   response even comes back. There is no way to persist a hand-added
   `INSERT`/`UPDATE` through this endpoint. If a new column or table
   needs an initial value, do one of:
   - Give the column a **DB-level default** in `teenybase.ts` — but only
     with `default: sql\`...\`` (a raw SQL expression/keyword, e.g.
     `CURRENT_TIMESTAMP`). **`default: 'some string'` is broken**: this
     teenyapp version emits it unquoted into the generated DDL (e.g.
     `DEFAULT in_house`, `DEFAULT admin` — invalid SQL, fails the
     `commit`). Confirmed by reading the raw `@migration.sql` bytes via
     `GET $BASE/files?path=@migration.sql` (the JSON-embedded preview in
     a PUT response can look fine at a glance — always check the raw
     file). Leave a text column nullable instead and handle the default
     in `worker.ts`.
   - Or (used throughout this app): leave the column nullable, and have
     `worker.ts` **self-heal** — read with a fallback default
     (`row.field || DEFAULT_X`), and have the write path `INSERT ...
     VALUES (...) ON CONFLICT(id) DO UPDATE SET ...` (upsert) so the row
     is created correctly the first time anyone saves through the admin
     UI, no pre-seeding needed at all. See `icon_settings` / `getIconRow`
     / `POST /admin/icons` for the full pattern.
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

**A slash-delimited regex literal in `CLIENT_SCRIPT` contains backslashes
too, and is affected the same way — this actually shipped a broken
security check once.** `/^https?:\/\//i.test(url)` (checking `venue_map_url` is
`http(s)://` before rendering it as a clickable link) got served with
its `\/\/ ` corrupted down to `//`, which — because a bare `//` starts a
JS line comment — silently turned `/^https?:/` + `/i.test(url) ...` into
"assign a regex literal to `mapOk`, then comment out the rest of the
line". A regex object is always truthy, so the "check" passed for every
value including `javascript:alert(1)`. Fixed by dropping the regex
entirely in favor of `url.indexOf('https://') === 0 ||
url.indexOf('http://') === 0` (see the venue-map-link render code) — no
backslashes, so nothing for the pipeline to corrupt. **Any client-side
regex literal with an unescaped-looking `/` in its pattern (which needs
`\/` to not end the literal early) is a landmine here — prefer
`new RegExp('...')` from a string, or (usually simpler) a plain
`indexOf`/`slice`/`split` check instead**, same as the newline/backslash
advice above. This bug is easy to miss in testing because the corrupted
regex doesn't throw — it just silently stops checking anything.

## Admin portal (`/admin`)

Built because PocketUI's own login password can't be changed via the
agent API, and PocketUI has no export/import. Covers full session CRUD,
so PocketUI is optional (kept as an alternate link on the page, not
removed). `/admin` is HTTP Basic Auth checked against
`admin_settings.username`/`password_hash` (salted SHA-256), both columns
read/written via `db.rawSQL()` since that table's rules are all `null` —
no public REST route exists for it at all. A blank/`NULL` username in
the DB is treated as `'admin'` (see `requireAdmin()`). From the page:

Native `<input type=date>`/`<input type=time>` fields render at a
slightly different intrinsic height once they hold a value vs. an empty
placeholder state, which without an explicit height looked like the box
"grows"/shifts the moment a date or time is picked. `ADMIN_STYLE` pins
`height:38px` (plus `appearance:none` and a normalized picker-icon style)
on both, verified with Playwright (`getBoundingClientRect()` identical
before/after filling `#date`) — if a future field adds either input type,
it needs the same treatment or it'll drift from the rest of the form.

- **Sessions list** — every session, soonest first, with a `Draft` tag
  on draft rows (dimmed row, italic title), an `Outing` tag on outing
  rows, and a red `Closed` tag on cancelled ones, Edit/Delete per row,
  and an "+ Add session" button. `GET /admin`.
- **Add / edit** — `GET /admin/sessions/new` and
  `GET /admin/sessions/:id/edit` render a form (shared `sessionFormPage()`
  in `worker.ts`) with an In-house/Outing radio toggle that shows/hides
  the relevant field groups (`[data-type-group]`, toggled by a small
  inline script with no backslash escapes at all — sidesteps the gotcha
  below entirely rather than working around it), and two submit buttons —
  "Save as draft" (`name="intent" value="draft"`) and "Publish"
  (`value="publish"`) — read in `sessionValuesFromForm()` into
  `status: 'draft' | 'published'`. `POST` to the same paths validates
  (`validateSessionValues()`, which requires only a date + title for a
  draft, and additionally the type-specific fields — location/time or
  gather/dismissal — before it can be published) and writes via
  `db.rawSQL()` using `insertSessionSQL()`/`updateSessionSQL()` (built
  from `SESSION_COLUMNS` so new columns only need to be added in one
  place). A validation failure re-renders the form with what was typed
  and a 400.
- **Delete** — `POST /admin/sessions/:id/delete`, confirmed client-side
  with a plain `confirm()` (uses HTML-entity-escaped quotes in the
  `onsubmit` attribute, not backslash escapes — see the gotcha below for
  why that distinction matters here).
- **Export** — `/admin/export.csv` and `/admin/export.json`, all session
  columns including `id`.
- **Import** — `/admin/import`, multipart CSV upload. A row with a blank
  `id` is inserted as new; a row whose `id` matches an existing session
  updates it in place. **Nothing is ever deleted by import.**
- **Sync from Google Sheet** — `POST /admin/sheet-sync-url` saves a
  published-CSV URL (`admin_settings.sheet_sync_url`; must start with
  `https://`) and `POST /admin/sync-sheet` fetches it and runs it through
  `importCsvRows()` — the exact same row-mapping/insert-or-update logic as
  a manual CSV upload (both routes now call this one shared function), so
  behavior can't drift between them. One-way only (Sheet → calendar);
  nothing on the Sheet side is ever changed, and nothing is ever deleted
  from the calendar by a sync. Meant for a Google Sheet published via
  **File → Share → Publish to web → Comma-separated values (.csv)** —
  that URL re-serves the current sheet content on every fetch, so
  "Sync now" pulls whatever is in the Sheet *right now*, not a snapshot
  from when the URL was saved. See `docs/sample-import-template.csv` for
  the expected column headers (same as the CSV export).
- **Default gather/dismissal points** — `POST /admin/location-presets`
  saves `admin_settings.location_presets` as newline-separated `EN|ZH`
  pairs (parsed by `parseLocationPresets()`; read by `getLocationPresetsRaw()`
  for the management textarea and by the 4 session-form routes for the
  dropdown itself). The session form renders a "Quick fill" `<select>`
  above the gather-point and above the dismissal-point field pairs
  (`presetSelect()` in `sessionFormPage()`) — each `<option>` carries the
  Chinese half in a `data-zh` attribute since a `<select>` only has one
  value; a small inline script (no backslash escapes, see the gotcha
  above) fills both EN/ZH inputs on `change` and resets the dropdown back
  to its placeholder. Purely a form-filling convenience — doesn't touch
  validation or storage, and CSV import/Google Sheet sync are unaffected
  (they write `gather_point_en/zh`/`dismissal_point_en/zh` directly).
- **Time pickers** — `time_start`/`time_end` (in-house), `gather_time_picker`,
  `dismissal_time_picker` (outings) are native `<input type="time">`
  fields (24-hour `HH:MM`), formatted into the existing free-text
  `time`/`gather_time`/`dismissal_time` columns via `formatTime12()` in
  `sessionValuesFromForm()` (e.g. `13:40` → `1:40 PM`; the in-house
  `time` column stays a single "start – end" string, joined from the two
  pickers). Each also has a manual fallback text input (`time_manual`,
  `gather_time_manual`, `dismissal_time_manual`) used only when its
  picker is left blank — for a legacy/non-standard value a picker can't
  express (e.g. "TBC", "All day"). Editing an existing session
  reverse-parses the stored free text back into the picker via
  `parseTimePoint()`/`parseTimeRange()` (best-effort regex, accepts a
  colon *or period* separator — real data has both, e.g. "9:00 AM" and
  "1.40 PM"); when it doesn't parse, the picker is left blank and the
  original text is preserved in the manual field instead, so nothing is
  ever silently dropped. A validation-failure redisplay (`session ===`
  the raw POST body) shows exactly what was just submitted rather than
  re-parsing, via the `pick()` helper in `sessionFormPage()`. These
  parse/format helpers are plain server-side functions (never themselves
  embedded as page text via `html()`/`c.html()`), so their normal
  regex/backslash usage is unaffected by the gotcha above — unlike the
  client-side `mapOk` regex that broke.
- **Customize icons** — `POST /admin/icons`, upserts the single
  `icon_settings` row (`id = 'main'`) with the emoji shown next to the
  add-to-calendar button, location, attire, meals, gather point, and
  dismissal point on the public page. A blank field falls back to
  `DEFAULT_ICONS` (mirrored in `worker.ts` server-side and in
  `CLIENT_SCRIPT` client-side — the two can't share a module). This
  upsert is also what *creates* the row the first time — no migration
  seeding needed (see the "Making changes" note on why that doesn't
  work here).
- **Cancelling a session** — a `closed` checkbox on the session form
  (with an optional EN/中文 reason shown/hidden by a `[data-closed-group]`
  toggle, same no-backslash inline-script pattern as the type-radio
  toggle) marks that one date's row as called off *without deleting it*
  — the row stays in `/admin` and on the public page (so caregivers see
  it was cancelled, not just silently missing) but with a red "Cancelled"
  banner and its reason instead of the normal detail lines, and no
  "Add to calendar" button. `session_type`/`status` are unaffected —
  a closed session can still be a draft or published, in-house or an
  outing.
- **Review Chinese translations** — `GET /admin/translations` (linked
  from a card on `/admin`) lists every session's EN/ZH field pairs
  side by side — only the fields that actually apply to that session
  (`translationRows()` skips a pair entirely when its English text is
  blank, so an in-house session shows no Venue row, an outing shows no
  Location row, etc.). English is plain reference text; only the 中文
  box is editable. A session with any blank 中文 field where English is
  present is tagged "Needs review" and sorted to the top. **Leaving a
  box blank and saving is a supported, first-class outcome** — the
  public card already falls back to the English text for any blank
  Chinese field, so nothing breaks; it's how an admin unsure of a
  translation defers it instead of guessing. `POST
  /admin/translations/:id` re-reads that one session's current row,
  recomputes the same `translationRows()` list server-side, and only
  updates the `_zh` columns that list actually contains — so a field
  that isn't shown for that session (e.g. `venue_zh` on an in-house
  session) is never touched, even though the submitted form has no
  input for it. `title_zh` still can't be saved blank (same notNull
  constraint as the main form).
- **Admin login** — `POST /admin/change-username` (3–40 chars,
  `[A-Za-z0-9_.@-]`) and `POST /admin/change-password` (updates
  `admin_settings` with a fresh random salt + hash). Both are unrelated
  to PocketUI's own login. Changing either invalidates the browser's
  cached Basic Auth credentials immediately — same as before for the
  password alone.

All writes (add/edit/delete/import) go through `db.rawSQL()`
(parameterized), not `$Table` methods — the `sessions` table's own
create/update/delete rules are `null` (public API is read-only by
design), so `$Table.insert()/.update()/.delete()` would be denied even
from these trusted server-side routes; `rawSQL()` is the documented way
to bypass row-level rules from code you trust. Reads (the list, exports)
use `$Table.select()` instead, since `listRule`/`viewRule` are `'true'`
(public) so there's no need to bypass anything for those.

Session field values rendered into admin HTML (the list, form values) are
escaped by hand with `escHtml()` — Hono's `html` tag only auto-escapes
`${}` substitutions that aren't wrapped in `raw()`, and the session list
is built via `raw(rows.map(...).join(''))` for the loop, so each value
needs escaping itself rather than relying on the tag.

## Schema (sessions table)

- `session_type` — `'in_house'` (default when blank/null) or `'outing'`.
  Drives which fields are required (`validateSessionValues()`) and how
  the card renders client-side.
- `status` — `'published'` (default when blank/null) or `'draft'`.
  Drafts are only visible/editable in `/admin`; the public `/` route
  filters them out **server-side** (a `WHERE status IS NULL OR status !=
  'draft'` in raw SQL, not a client-side hide) since the whole page is
  rendered from an embedded JSON blob a draft must never reach in the
  first place. See "Admin portal" above for how a session becomes a
  draft or gets published.
- `date`, `title_en/zh` — always required, even for a draft.
- **In-house fields:** `location_en/zh`, `time` (free text, e.g.
  "9:30 AM – 11:30 AM"). Required when `session_type` is `'in_house'`.
- **Outing fields:** `venue_en/zh` (the destination itself, e.g. "Singapore
  Zoo" — optional, not required to publish), `venue_map_url` (optional;
  must start with `http://` or `https://` — enforced server-side in
  `validateSessionValues()`, and re-checked client-side before rendering
  as a link, see the gotcha note below), `gather_point_en/zh`,
  `gather_time`, `dismissal_point_en/zh`, `dismissal_time` (all free
  text, required when `session_type` is `'outing'`). The public card
  shows a venue line (linked to `venue_map_url` when it passes the scheme
  check, plain text otherwise) plus gather/dismissal lines instead of a
  location line, an "Outing" label, and derives its date-row time range
  as `gather_time – dismissal_time`.
- `description_en/zh` (optional), `schedule_en/zh` (optional, free-form
  multi-line — a programme/itinerary, e.g. "9:00 AM - Gather\n9:30 AM -
  Depart\n..."; applies to either session type, not just outings; shown
  on the public card behind a `<details>`/`<summary>` disclosure toggle
  rather than always-visible, since it's usually the longest text on a
  card — no JS needed, the browser handles open/closed state), `attire_en/zh`
  (optional), `vacancy` (integer, optional), `meals_provided` (bool,
  optional), `emoji` (text, optional — shown before the title on the
  card).
- `closed` (bool, optional) + `closed_reason_en/zh` (optional) — a
  specific date's session called off (public holiday, no facilitator,
  etc.) without deleting the row. Independent of `status`: a closed
  session can be a draft or published, in-house or an outing. The public
  card still shows it (unlike a draft) with a red "Cancelled" banner and
  the reason instead of its normal detail lines, and no "Add to
  calendar" button — see "Admin portal" above for how it's set.

To add a field: add it to `sessions.fields` in `teenybase.ts` (nullable,
**not** a plain string `default:` — see the "Making changes" note above),
save (regenerates the migration), review it, commit — then also add it to
`SESSION_COLUMNS` in `worker.ts` (this alone covers `EXPORT_COLUMNS`,
the insert/update SQL, and the SSR `select` list, since all three are
derived from it) and to the CSV import mapping and the card renderer in
`CLIENT_SCRIPT` if it should appear on the public page.

## Icon customization (`icon_settings` table)

Single-row (`id = 'main'`) table of the emoji shown for each recurring
category: `icon_date`, `icon_location`, `icon_attire`, `icon_meals`,
`icon_gather`, `icon_dismissal`. Public read (`listRule`/`viewRule:
'true'`, same as `sessions`) so the SSR `/` route can pass them to the
client via `window.__ICONS_B64__`; no public write (writes go through
`POST /admin/icons`, an upsert — see "Admin portal" above). A blank
field or a missing row both fall back to `DEFAULT_ICONS`.

## Frontend behavior worth knowing

- All rendering is client-side from an embedded, base64-encoded JSON
  blob (see gotcha below) — no client→server fetch after the initial
  page load. Language toggle, "show past sessions", month filter, dark
  mode, font size, and the outing/in-house card layout are all instant,
  no reload.
- Month filter: a `<select id="monthFilter">` next to "Show past
  sessions", rebuilt every `render()` call from whatever `groups` the
  current past/future filter produced (so it only ever offers months
  that actually have a visible session — a past month simply isn't in
  the list while "Show past sessions" is off). `state.monthFilter`
  resets to `'all'` if the previously-selected key stops being valid
  (e.g. toggling "Show past sessions" off hides the only session in a
  past month) — see `render()` in `CLIENT_SCRIPT`.
- A closed/cancelled session (`r.closed`) still renders — it isn't
  filtered out of `visible`/`groups` like a draft is — but with
  `.card.is-closed` (red border), a `.cancelled-label` banner above the
  normal detail lines (location/venue/gather/dismissal still show, so
  caregivers can see what was planned), and no "Add to calendar" button
  (`isPast || r.closed` both suppress it). See `render()` in
  `CLIENT_SCRIPT`.
- "Upcoming" is computed against *today in Asia/Singapore time*
  (`Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Singapore'})`), not the
  visitor's local timezone.
- "Add to calendar" builds an all-day `.ics` client-side from the raw
  `date` field (Y/M/D calendar math via `Date.UTC`, deliberately *not*
  going through a timezone-anchored `Date` — that was a real off-by-one
  bug here once, see git history).
- Dark mode: auto-detects `prefers-color-scheme`, with a manual toggle
  that overrides and persists to `localStorage`.
- Font size: an "A−"/"A+" control cycles through `FS_STEPS` (currently
  `[0.85, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2]` — defined identically in
  `CLIENT_SCRIPT` and in the pre-paint script in `layout()`, to avoid a
  flash/jump on load; keep both in sync if this ever changes), applied
  via the `--fs` CSS custom property — text sizes in `PAGE_STYLE` are
  `calc(Npx * var(--fs))` rather than plain `px` so they scale together.
  Persisted to `localStorage` as an index, not a raw scale value.
- Sticky month headers: `.month-label` is `position: sticky` with
  `top: var(--header-h)`, where `--header-h` is the live height of the
  sticky top `header.top` (which itself changes with font size,
  language, and narrow-screen wrapping) — kept in sync by a
  `ResizeObserver` on the header in `CLIENT_SCRIPT`, not a fixed value.
