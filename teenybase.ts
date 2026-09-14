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

    tableField('date', 'date', 'date', { notNull: true }),
    tableField('time', 'text', 'text', { notNull: true }),

    tableField('title_en', 'text', 'text', { notNull: true }),
    tableField('title_zh', 'text', 'text', { notNull: true }),

    tableField('location_en', 'text', 'text', { notNull: true }),
    tableField('location_zh', 'text', 'text', { notNull: true }),

    tableField('description_en', 'text', 'text', {}),
    tableField('description_zh', 'text', 'text', {}),

    tableField('attire_en', 'text', 'text', {}),
    tableField('attire_zh', 'text', 'text', {}),

    tableField('vacancy', 'integer', 'integer', {}),
    tableField('meals_provided', 'bool', 'boolean', {}),
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

export default {
  appName: 'MINDS MYG EP Sessions',
  appUrl: 'https://myg-ep-sessions.app.teenyapp.com',
  jwtSecret: '$JWT_SECRET_MAIN',
  tables: [sessions],
}
