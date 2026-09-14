# MINDS MYG EP Project — Session Calendar

A bilingual (English / 中文) read-only session calendar for the MINDS MYG EP
Project, for caregivers and volunteers to see upcoming sessions. No visitor
registration or login.

Built on [teenyapp.com](https://teenyapp.com), project slug `myg-ep-sessions`.

- **Live site:** https://myg-ep-sessions.app.teenyapp.com
- **Admin portal:** `/admin` — add/edit/delete sessions (in-house or
  outing), bulk export/import (CSV + JSON), customizable calendar icons,
  and its own changeable username + password. The main way to manage
  sessions day to day. See `CLAUDE.md` for details.
- **PocketUI (optional):** `/api/v1/pocket/` — the built-in raw table
  editor, still there as a fallback. Credentials aren't stored in this
  repo — see the project dashboard, or the chat this was set up in.

**For a full technical write-up (architecture, how to make changes, a
platform quirk worth knowing about before editing `worker.ts`), see
[`CLAUDE.md`](./CLAUDE.md).**

## What's here

- `teenybase.ts` — schema (`sessions`, `admin_settings` tables) and access
  rules. Public read-only; no public write route at all.
- `worker.ts` — the whole app: the public SSR page (bilingual toggle,
  dark mode, add-to-calendar, grouped by month, past sessions hidden by
  default) and the password-gated `/admin` portal (export/import/change
  password).
- `assets/eastpoint-logo.png` — the project's logo, also embedded inline
  in `worker.ts`.
- `package.json` — teenyapp project manifest.

These files mirror what's deployed on teenyapp.com — this repo isn't
itself hosted anywhere. To make further changes, either edit here and
re-upload via the teenyapp file API (see `CLAUDE.md`), or continue
directly against the project using its agent link (fetch
`https://teenyapp.com/agent/<token>/agents.md` for the current API base,
auth, and workflow — ask the project owner for a fresh agent token if
needed).

## Managing sessions

- **One at a time:** the `/admin` portal's session list — add, edit, or
  delete a single session with a plain form. No PocketUI needed.
- **In bulk:** also from `/admin` — export everything to CSV, edit in a
  spreadsheet, re-import (rows with a blank `id` are added, rows whose
  `id` matches an existing session update it — nothing is ever deleted by
  import).
- **PocketUI** (`/api/v1/pocket/`) still works too, if you prefer its raw
  table view for something the portal doesn't cover.

Add more fields to the `sessions` table any time — see "Schema" in
`CLAUDE.md` for the full checklist (it touches more than just
`teenybase.ts` if the field should show up in export/import too).
