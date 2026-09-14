// Worker entry — MINDS MYG EP Project session calendar.
//
// Single bilingual (EN / 中文) agenda-style page at "/". Sessions are
// read directly from D1 (SSR) and embedded as JSON; a small client
// script handles language toggling, grouping by month, and hiding/
// showing past sessions — all without a page reload or extra API call.
//
// Writes are not exposed on this worker at all — the admin manages
// sessions through the built-in PocketUI admin panel (see teenybase.ts).

import { $Database, teenyHono, OpenApiExtension, PocketUIExtension, Hono, html, raw } from 'teenybase'
import config from 'virtual:teenybase'

const userApp = new Hono()

const description = 'Upcoming MINDS MYG EP Project sessions for caregivers and volunteers.'

function layout(c, pageTitle, pageDesc, bodyHtml) {
  const url = new URL(c.req.url)
  const site = `${url.protocol}//${url.host}`
  const canonical = `${site}${url.pathname}`
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: pageTitle,
    url: site,
    description: pageDesc,
  })
  return html`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${pageTitle}</title>
<meta name="description" content="${pageDesc}"/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:title" content="${pageTitle}"/>
<meta property="og:description" content="${pageDesc}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canonical}"/>
<meta name="twitter:card" content="summary_large_image"/>
<script type="application/ld+json">${raw(jsonLd)}</script>
</head><body>
${bodyHtml}
<!-- teenyapp: keep this ribbon (or add another link to /agents.md) when project visibility is public, so AI agents and visitors can discover and clone this app easily. -->
<a class="tb-ribbon" href="/agents.md" data-ribbon="⚡ Make your own" title="Clone or edit this teenyapp">Make your own</a>
</body></html>`
}

const PAGE_STYLE = raw(`<style>
:root{
  --bg:#f7f7f5; --card:#ffffff; --ink:#1f2328; --ink-soft:#57606a;
  --accent:#2f6f4f; --accent-soft:#e6f2ea; --border:#e6e6e2; --danger:#a34;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg); color:var(--ink); line-height:1.5;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  padding-bottom:64px;
}
.wrap{max-width:640px;margin:0 auto;padding:20px 16px 40px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand .logo-slot{width:40px;height:40px;border-radius:10px;background:var(--accent-soft);color:var(--accent);
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0}
.brand h1{font-size:17px;margin:0;font-weight:700;line-height:1.25}
.brand p{margin:0;font-size:12px;color:var(--ink-soft)}
.lang-toggle{display:inline-flex;border:1px solid var(--border);border-radius:999px;background:var(--card);padding:3px;flex-shrink:0}
.lang-toggle button{border:none;background:transparent;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;
  color:var(--ink-soft);cursor:pointer}
.lang-toggle button.active{background:var(--accent);color:#fff}
.subhead{margin:16px 0 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.subhead h2{font-size:14px;margin:0;color:var(--ink-soft);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.past-toggle{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-soft);cursor:pointer;user-select:none}
.past-toggle input{width:16px;height:16px;accent-color:var(--accent);cursor:pointer}
.month-group{margin-bottom:22px}
.month-label{font-size:13px;font-weight:700;color:var(--accent);margin:0 0 10px;padding-left:2px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:12px;
  box-shadow:0 1px 2px rgba(20,20,20,.03)}
.card.is-past{opacity:.6}
.card .date-row{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:6px}
.card .date-line{font-size:12.5px;font-weight:700;color:var(--accent)}
.card .time-line{font-size:12.5px;color:var(--ink-soft);white-space:nowrap}
.card h3{margin:0 0 8px;font-size:16.5px;font-weight:700;line-height:1.3}
.card .meta-row{display:flex;flex-wrap:wrap;gap:6px 10px;margin-bottom:8px}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--ink-soft);background:#f1f1ee;
  border-radius:999px;padding:4px 10px}
.pill.vacancy-low{color:#a34;background:#fbe9e7}
.card p.desc{margin:6px 0 0;font-size:13.5px;color:var(--ink-soft);white-space:pre-line}
.empty-state{text-align:center;padding:48px 16px;color:var(--ink-soft)}
.empty-state .big{font-size:28px;margin-bottom:8px}
footer.note{max-width:640px;margin:8px auto 0;padding:0 16px;font-size:11.5px;color:#9aa1a8;text-align:center}
.tb-ribbon{width:12.1em;height:12.1em;position:fixed;overflow:hidden;bottom:0;right:0;z-index:9999;pointer-events:none;font-size:13px;text-decoration:none;text-indent:-999999px}
.tb-ribbon:active,.tb-ribbon:hover{background-color:transparent}
.tb-ribbon:after,.tb-ribbon:before{position:absolute;display:block;width:15.38em;height:1.54em;bottom:3.23em;right:-3.23em;box-sizing:content-box;transform:rotate(-45deg)}
.tb-ribbon:before{content:"";padding:.38em 0;background-color:#0f172a;background-image:linear-gradient(to bottom,rgba(0,0,0,0),rgba(0,0,0,.15));box-shadow:0 .15em .23em 0 rgba(0,0,0,.5);pointer-events:auto;opacity:.45;transition:opacity .2s}
.tb-ribbon:hover:before{opacity:.9}
.tb-ribbon:after{content:attr(data-ribbon);color:#f8fafc;font:500 1em system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.54em;text-decoration:none;text-shadow:0 -.08em rgba(0,0,0,.5);text-align:center;text-indent:0;padding:.15em 0;margin:.15em 0;border-width:.08em 0;border-style:dotted;border-color:rgba(255,255,255,.7)}
@media(max-width:360px){.brand h1{font-size:15px}}
</style>`)

const I18N = {
  en: {
    title: 'MINDS MYG EP Project',
    subtitle: 'Session calendar',
    upcoming: 'Upcoming sessions',
    showPast: 'Show past sessions',
    vacancy: (n) => `${n} spot${n === 1 ? '' : 's'} left`,
    vacancyFull: 'Fully booked',
    meals: 'Meals provided',
    attire: 'Attire',
    emptyTitle: 'No sessions scheduled',
    emptyBody: 'Check back soon — new sessions will appear here as they are added.',
    emptyPastBody: 'No sessions to show yet.',
    footer: 'All times are Singapore time (SGT).',
  },
  zh: {
    title: 'MINDS MYG EP 计划',
    subtitle: '活动日历',
    upcoming: '即将举行的场次',
    showPast: '显示已过去的场次',
    vacancy: (n) => `剩余 ${n} 个名额`,
    vacancyFull: '名额已满',
    meals: '提供餐点',
    attire: '服装要求',
    emptyTitle: '暂无场次安排',
    emptyBody: '请稍后再查看，新的场次会在这里显示。',
    emptyPastBody: '暂无可显示的场次。',
    footer: '所有时间均为新加坡时间 (SGT)。',
  },
}

// Renders the initial (server-side) HTML shell. All actual list
// rendering happens client-side from window.__SESSIONS__ so the
// language toggle and "show past" toggle need no reload / re-fetch.
function renderPage(sessionsJson) {
  const dataScript = raw(
    `<script>window.__SESSIONS__ = ${JSON.stringify(sessionsJson).replace(/</g, '\\u003c')};` +
    `window.__I18N__ = ${JSON.stringify(I18N).replace(/</g, '\\u003c')};</script>`
  )

  return html`${PAGE_STYLE}
<div class="wrap">
  <header class="top">
    <div class="brand">
      <div class="logo-slot" aria-hidden="true">EP</div>
      <div>
        <h1 data-i18n="title">MINDS MYG EP Project</h1>
        <p data-i18n="subtitle">Session calendar</p>
      </div>
    </div>
    <div class="lang-toggle" role="group" aria-label="Language">
      <button type="button" data-lang="en" class="active" aria-pressed="true">EN</button>
      <button type="button" data-lang="zh" aria-pressed="false">中文</button>
    </div>
  </header>

  <div class="subhead">
    <h2 data-i18n="upcoming">Upcoming sessions</h2>
    <label class="past-toggle">
      <input type="checkbox" id="showPastToggle" />
      <span data-i18n="showPast">Show past sessions</span>
    </label>
  </div>

  <div id="list"></div>
</div>
<footer class="note" data-i18n="footer">All times are Singapore time (SGT).</footer>
${dataScript}
<script>
(function () {
  var TZ = 'Asia/Singapore';
  var state = { lang: 'en', showPast: false };

  function todayISO() {
    // YYYY-MM-DD in Singapore time, robust across browsers via en-CA locale.
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  }

  function monthLabel(dateStr, lang) {
    var d = new Date(dateStr + 'T00:00:00+08:00');
    var locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, { timeZone: TZ, year: 'numeric', month: 'long' }).format(d);
  }

  function dateLabel(dateStr, lang) {
    var d = new Date(dateStr + 'T00:00:00+08:00');
    var locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
    }).format(d);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function applyStaticI18n() {
    var t = window.__I18N__[state.lang];
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (t[key]) el.textContent = t[key];
    });
    document.getElementById('showPastToggle').nextElementSibling; // no-op guard
    document.documentElement.lang = state.lang === 'zh' ? 'zh' : 'en';
  }

  function render() {
    var t = window.__I18N__[state.lang];
    var today = todayISO();
    var rows = (window.__SESSIONS__ || []).slice().sort(function (a, b) {
      return (a.date + ' ' + (a.time || '')).localeCompare(b.date + ' ' + (b.time || ''));
    });

    var visible = rows.filter(function (r) { return state.showPast || r.date >= today; });

    var listEl = document.getElementById('list');
    applyStaticI18n();

    if (visible.length === 0) {
      listEl.innerHTML =
        '<div class="empty-state"><div class="big">🗓️</div>' +
        '<div><strong>' + esc(t.emptyTitle) + '</strong></div>' +
        '<p>' + esc(state.showPast ? t.emptyPastBody : t.emptyBody) + '</p></div>';
      return;
    }

    var groups = [];
    var groupsByKey = {};
    visible.forEach(function (r) {
      var key = r.date.slice(0, 7); // YYYY-MM
      if (!groupsByKey[key]) {
        groupsByKey[key] = { key: key, label: monthLabel(r.date, state.lang), items: [] };
        groups.push(groupsByKey[key]);
      }
      groupsByKey[key].items.push(r);
    });

    var htmlOut = groups.map(function (g) {
      var cards = g.items.map(function (r) {
        var isPast = r.date < today;
        var title = state.lang === 'zh' ? (r.title_zh || r.title_en) : (r.title_en || r.title_zh);
        var location = state.lang === 'zh' ? (r.location_zh || r.location_en) : (r.location_en || r.location_zh);
        var desc = state.lang === 'zh' ? r.description_zh : r.description_en;
        var attire = state.lang === 'zh' ? r.attire_zh : r.attire_en;

        var pills = '';
        if (typeof r.vacancy === 'number') {
          var low = r.vacancy <= 0;
          pills += '<span class="pill' + (low ? ' vacancy-low' : '') + '">' +
            esc(low ? t.vacancyFull : t.vacancy(r.vacancy)) + '</span>';
        }
        if (r.meals_provided) {
          pills += '<span class="pill">' + esc(t.meals) + '</span>';
        }
        if (attire) {
          pills += '<span class="pill">' + esc(t.attire) + ': ' + esc(attire) + '</span>';
        }

        return (
          '<div class="card' + (isPast ? ' is-past' : '') + '">' +
            '<div class="date-row">' +
              '<span class="date-line">' + esc(dateLabel(r.date, state.lang)) + '</span>' +
              '<span class="time-line">' + esc(r.time || '') + '</span>' +
            '</div>' +
            '<h3>' + esc(title) + '</h3>' +
            (location ? '<div class="meta-row"><span class="pill">📍 ' + esc(location) + '</span></div>' : '') +
            (pills ? '<div class="meta-row">' + pills + '</div>' : '') +
            (desc ? '<p class="desc">' + esc(desc) + '</p>' : '') +
          '</div>'
        );
      }).join('');

      return '<div class="month-group"><h3 class="month-label">' + esc(g.label) + '</h3>' + cards + '</div>';
    }).join('');

    listEl.innerHTML = htmlOut;
  }

  document.querySelectorAll('.lang-toggle button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.lang = btn.getAttribute('data-lang');
      document.querySelectorAll('.lang-toggle button').forEach(function (b) {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      render();
    });
  });

  document.getElementById('showPastToggle').addEventListener('change', function (e) {
    state.showPast = !!e.target.checked;
    render();
  });

  render();
})();
</script>
`
}

userApp.get('/', async (c) => {
  const db = c.get('$db')
  const result = await db.table('sessions').select({
    select: [
      'date', 'time', 'title_en', 'title_zh', 'location_en', 'location_zh',
      'description_en', 'description_zh', 'attire_en', 'attire_zh',
      'vacancy', 'meals_provided',
    ],
    order: 'date',
    sort: 'asc',
    limit: 1000,
  })
  const items = Array.isArray(result) ? result : result.items || result.results || []
  const rows = items.map((r) => ({
    ...r,
    meals_provided: !!r.meals_provided,
    vacancy: r.vacancy === null || r.vacancy === undefined ? null : Number(r.vacancy),
  }))

  return c.html(layout(c, 'MINDS MYG EP Project — Session Calendar', description, renderPage(rows)))
})

userApp.get('/robots.txt', (c) => {
  const url = new URL(c.req.url)
  return c.text(`User-agent: *\nAllow: /\n\nSitemap: ${url.protocol}//${url.host}/sitemap.xml\n`, 200, { 'cache-control': 'public, max-age=3600' })
})

userApp.get('/sitemap.xml', (c) => {
  const url = new URL(c.req.url)
  const site = `${url.protocol}//${url.host}`
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`, 200, { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' })
})

userApp.get('/llms.txt', (c) => {
  return c.text(`# ${config.appName || 'MINDS MYG EP Project'}\n\n${description}\n\n## Routes\n\n- /  bilingual session calendar\n`, 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' })
})

const app = teenyHono(async (c) => {
  const db = new $Database(c, config, c.env.TEENY_PRIMARY_DB, c.env.TEENY_PRIMARY_R2)
  await db.registerExtension(new OpenApiExtension(db, true))
  await db.registerExtension(new PocketUIExtension(db))
  return db
})

app.route('/', userApp)

export default app
