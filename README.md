# MINDS MYG EP Project — Session Calendar

A bilingual (English / 中文) read-only session calendar for the MINDS MYG EP
Project, for caregivers and volunteers to see upcoming sessions. No visitor
registration or login.

Built on [teenyapp.com](https://teenyapp.com), project slug `myg-ep-sessions`.

- **Preview:** https://myg-ep-sessions.app.teenyapp.com
- **Claim link:** https://teenyapp.com/claim/myg-ep-sessions — must be
  claimed within 12 hours of creation or the project expires.
- **Admin panel (PocketUI):** https://myg-ep-sessions.app.teenyapp.com/api/v1/pocket/
  — this is where sessions are created/edited/deleted (editor login).
  Credentials are not stored in this repo; see the project dashboard after
  claiming, or the chat where this was originally set up.

## What's here

- `teenybase.ts` — schema for the single `sessions` table (date, time,
  bilingual title/location/description/attire, vacancy, meals provided) and
  access rules (public read-only; no public write route at all — writes go
  through the PocketUI admin panel only).
- `worker.ts` — the single SSR page. Sessions are read server-side and
  embedded as JSON; a small client script handles the EN/中文 toggle,
  grouping by month, and hiding/showing past sessions, all without a reload.
  Timezone: Asia/Singapore.
- `package.json` — teenyapp project manifest.

These files mirror what's deployed on teenyapp.com. To make further changes,
either edit here and re-upload via the teenyapp file API, or continue
directly against the project using its agent link (fetch
`https://teenyapp.com/agent/<token>/agents.md` for the current API base,
auth, and workflow — ask the project owner for a fresh agent token if
needed).

## Adding sessions

Sessions are managed by the admin only, through PocketUI
(`/api/v1/pocket/`) — no custom admin page. Add more fields to the
`sessions` table in `teenybase.ts` any time; schema changes need a save +
commit against the teenyapp project to take effect.
