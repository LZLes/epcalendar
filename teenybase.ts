// teenybase config — MINDS MYG EP Project session calendar.
// One public table: `sessions`. Read-only to everyone, no public writes.
// The admin manages sessions through the built-in PocketUI admin panel
// (editor login), which uses project-level credentials and bypasses
// these row-level rules — so there is intentionally no public
// insert/update/delete route and no sign-up/login flow.

import { sql, tableField, baseFields, createdTrigger, updatedTrigger } from 'teenybase'

const sessions = {
  name: 'sessions',
  autoSetUid: true,
  fields: [
    ...baseFields, // id, created, updated

    // 'in_house' (a session at the usual venue, shown with a location +
    // a single start–end time) or 'outing' (shown with a separate gather
    // point/time and dismissal point/time instead). Left nullable at the
    // DB level — worker.ts treats a blank value as 'in_house' — because
    // this platform's schema builder emits unquoted (invalid) SQL for a
    // plain string `default:`, unlike `sql`-tagged raw defaults.
    tableField('session_type', 'text', 'text', {}),

    tableField('date', 'date', 'date', { notNull: true }),
    // In-house sessions only (free text, e.g. "9:30 AM – 11:30 AM").
    tableField('time', 'text', 'text', {}),

    tableField('title_en', 'text', 'text', { notNull: true }),
    tableField('title_zh', 'text', 'text', { notNull: true }),

    // In-house sessions only, e.g. "Towner Gardens School".
    tableField('location_en', 'text', 'text', {}),
    tableField('location_zh', 'text', 'text', {}),

    // Outings only.
    tableField('gather_point_en', 'text', 'text', {}),
    tableField('gather_point_zh', 'text', 'text', {}),
    tableField('gather_time', 'text', 'text', {}),
    tableField('dismissal_point_en', 'text', 'text', {}),
    tableField('dismissal_point_zh', 'text', 'text', {}),
    tableField('dismissal_time', 'text', 'text', {}),

    tableField('description_en', 'text', 'text', {}),
    tableField('description_zh', 'text', 'text', {}),

    tableField('attire_en', 'text', 'text', {}),
    tableField('attire_zh', 'text', 'text', {}),

    tableField('vacancy', 'integer', 'integer', {}),
    tableField('meals_provided', 'bool', 'boolean', {}),
    tableField('emoji', 'text', 'text', {}), // optional icon shown on the card, e.g. "🎉" or "🧩"
  ],
  indexes: [{ fields: ['date'] }],
  extensions: [
    {
      name: 'rules',
      // Public, read-only. No public create/update/delete — admin writes
      // go through PocketUI (project-level auth), which bypasses these
      // row-level rules entirely.
      listRule: 'true',
      viewRule: 'true',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  ],
  triggers: [createdTrigger, updatedTrigger],
}

// Single-row settings store for the custom /admin portal (export / import /
// change-password). Deliberately locked to `null` (deny) on every rule so
// it has NO public API at all — worker.ts talks to it only via
// db.rawSQL(), which bypasses these rules on purpose (see worker.ts).
const adminSettings = {
  name: 'admin_settings',
  fields: [
    tableField('id', 'text', 'text', { primary: true, notNull: true }),
    // Nullable at the DB level (see the note on sessions.session_type
    // above re: string `default:` values) — seeded to 'admin' via a
    // hand-edited migration data statement instead; worker.ts also falls
    // back to 'admin' if this is ever blank.
    tableField('username', 'text', 'text', {}),
    tableField('password_hash', 'text', 'text', { notNull: true }),
    tableField('password_salt', 'text', 'text', { notNull: true }),
    tableField('updated', 'date', 'timestamp', { notNull: true, default: sql`CURRENT_TIMESTAMP` }),
  ],
  extensions: [
    {
      name: 'rules',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  ],
}

// Single-row store of the emoji used for each recurring category on the
// public page (date, location, attire, meals, gather, dismissal). Public
// read (so the page can render them) but no public write — same
// db.rawSQL() pattern as admin_settings for the /admin "Customize icons"
// card.
const iconSettings = {
  name: 'icon_settings',
  fields: [
    tableField('id', 'text', 'text', { primary: true, notNull: true }),
    // Nullable at the DB level (see the note on sessions.session_type
    // above) — seeded via a hand-edited migration INSERT with the
    // defaults below as quoted literals; worker.ts also falls back to
    // these same defaults client-side if a value is ever blank.
    tableField('icon_date', 'text', 'text', {}), // default 📅
    tableField('icon_location', 'text', 'text', {}), // default 📍
    tableField('icon_attire', 'text', 'text', {}), // default 👕
    tableField('icon_meals', 'text', 'text', {}), // default 🍽️
    tableField('icon_gather', 'text', 'text', {}), // default 🚏
    tableField('icon_dismissal', 'text', 'text', {}), // default 🏁
    tableField('updated', 'date', 'timestamp', { notNull: true, default: sql`CURRENT_TIMESTAMP` }),
  ],
  extensions: [
    {
      name: 'rules',
      listRule: 'true',
      viewRule: 'true',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  ],
}

export default {
  appName: 'MINDS MYG EP Sessions',
  appUrl: 'https://myg-ep-sessions.app.teenyapp.com',
  jwtSecret: '$JWT_SECRET_MAIN',
  tables: [sessions, adminSettings, iconSettings],
}
