// Norwich Droids — members-area Worker.
// Static pages (home/about/events/gallery) are served straight from /public
// by the assets binding and never reach this file. Everything below only
// handles the dynamic members area: login, dashboard, RSVP, add-a-droid.

const EVENTS = [
  {
    id: 'charity', day: '05', daySmall: false, month: 'SEP',
    title: 'Feel The Force Day — Team Meet Point', location: 'Peterborough Cathedral, Peterborough',
    parking: 'Free public parking at the Cathedral precinct — arrive early, fills up fast.',
    floorArea: '[Pitch size TBC] — outdoor display pitch in the precinct.',
    accommodation: 'Not provided — day event, home travel expected.',
    fuel: 'Not covered — please claim mileage separately if needed.',
    baseDroids: [
      { name: '[Member Name]', droid: 'R2 Unit' },
      { name: '[Member Name]', droid: 'BB-8' },
      { name: '[Member Name]', droid: 'MSE-6' },
    ],
  },
  {
    id: 'conv', day: '26–27', daySmall: true, month: 'SEP',
    title: 'Nor-Con — Team Meet Point', location: 'Norfolk Showground Arena, Norfolk',
    parking: 'Free exhibitor parking on-site at the Showground.',
    floorArea: '[Pitch size TBC] — indoor arena pitch, confirm with organisers.',
    accommodation: 'Not required — local event.',
    fuel: 'Not covered — local event.',
    baseDroids: [
      { name: '[Member Name]', droid: 'R2 Unit' },
      { name: '[Member Name]', droid: 'R2 Unit' },
      { name: '[Member Name]', droid: 'Other Build' },
    ],
  },
  {
    id: 'mildcon', day: '03', daySmall: false, month: 'OCT',
    title: 'Mil-D-Con — Team Meet Point', location: 'RAF Mildenhall, Suffolk',
    parking: 'On-base parking — security pass required in advance, [details TBC].',
    floorArea: '[Pitch size TBC] — indoor hangar display.',
    accommodation: 'Provided — on-base lodging for exhibitors, confirm numbers with the committee.',
    fuel: 'Covered — mileage reimbursed for this event.',
    baseDroids: [
      { name: '[Member Name]', droid: 'BB-8' },
      { name: '[Member Name]', droid: 'R2 Unit' },
    ],
  },
];

// Edit this to add, remove, or update droid types in the "add your droid" dropdown.
const DROID_OPTIONS = [
  'R2 Unit', 'R5 Unit', 'BB-8', 'MSE-6', 'K-2SO', 'Imperial Probe Droid', 'Essie',
  'Pit Droid', 'Huyang', 'Battle Droid', 'Super Battle Droid', 'IG Unit', 'Other Build',
];

// Static sample content — replace with your real roster / posts.
const MEMBERS = [
  { name: '[Member Name]', droid: 'R2 Unit' },
  { name: '[Member Name]', droid: 'BB-8' },
  { name: '[Member Name]', droid: 'R2 Unit' },
  { name: '[Member Name]', droid: 'MSE-6' },
  { name: '[Member Name]', droid: 'BB-8' },
  { name: '[Member Name]', droid: 'Other Build' },
];

const BUILD_LOGS = [
  { author: '[Member Name]', droid: 'BB-8', caption: 'Dome motor finally spins smoothly — took three tries to get the magnet alignment right.' },
  { author: '[Member Name]', droid: 'R2 Unit', caption: 'Leg struts primed and ready for paint ahead of next month’s convention.' },
  { author: '[Member Name]', droid: 'MSE-6', caption: 'First test drive across the workshop floor — steering needs work but it moves!' },
];

const TABS = ['events', 'directory', 'logs'];
const SESSION_COOKIE = 'nd_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  let letters = '';
  for (const p of parts) {
    if (letters.length < 2) letters += p[0].toUpperCase();
  }
  return letters || 'NM';
}

function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

// Constant-time-ish string compare so login doesn't leak timing info.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length === 0) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function isLoggedIn(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return false;
  return (await env.DATA.get(`session:${token}`)) === '1';
}

async function readJSON(env, key) {
  const raw = await env.DATA.get(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeJSON(env, key, value) {
  return env.DATA.put(key, JSON.stringify(value));
}

function pickTab(url) {
  const t = url.searchParams.get('tab');
  return TABS.includes(t) ? t : 'events';
}

function htmlResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...extraHeaders } });
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, { status: 303, headers: { Location: location, ...extraHeaders } });
}

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@500;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/css/style.css">`;

function loginPageHTML(error) {
  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Members Login — Norwich Droids</title></head>
<body>
<div class="site-nav">
  <a class="brand" href="/">
    <img src="/img/logo-nav.png" alt="Norwich Droids logo">
    <div class="wordmark">NORWICH<br><span>DROIDS</span></div>
  </a>
  <div class="links">
    <a href="/">Home</a>
    <a href="/about.html">About</a>
    <a href="/events.html">Events</a>
    <a href="/gallery.html">Gallery</a>
    <a class="btn btn-primary" href="/members/login">Members Login</a>
  </div>
</div>
<main>
<div class="login-wrap">
  <div class="login-card">
    <div class="logo-row"><img src="/img/logo-nav.png" alt="Norwich Droids logo"></div>
    <h1>Members Area</h1>
    <p class="sub">Sign in to see upcoming builds, RSVP to events, and connect with other members.</p>
    ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
    <form method="post" action="/members/login">
      <div class="field">
        <label for="password">Members Password</label>
        <input type="password" id="password" name="password" placeholder="••••••••" autofocus required>
      </div>
      <button type="submit" class="btn btn-primary">Log In</button>
    </form>
    <div class="links">
      <span></span>
      <a href="/">&larr; Back to site</a>
    </div>
  </div>
</div>
</main>
<div class="site-footer">
  <div class="brand"><img src="/img/logo2-badge.png" alt="Norwich Droids emblem"><div class="text">Norwich Droids &mdash; Norfolk, UK</div></div>
  <div class="text">info@norwichdroids.co.uk</div>
</div>
</body></html>`;
}

function eventsTabHTML(rsvps, addedDroids, openEventId) {
  return EVENTS.map((ev) => {
    const status = rsvps[ev.id] || 'undecided';
    const goingClass = status === 'going' ? ' going' : '';
    const rsvpLabel = status === 'going' ? 'Going' : (status === 'not-going' ? "Can't make it" : 'RSVP');
    const droidsForEvent = [...ev.baseDroids, ...(Array.isArray(addedDroids[ev.id]) ? addedDroids[ev.id] : [])];
    const isOpen = openEventId === ev.id;

    return `
      <div class="event-card">
        <div class="row">
          <div class="event-date">
            <div class="day${ev.daySmall ? ' small' : ''}">${esc(ev.day)}</div>
            <div class="month">${esc(ev.month)}</div>
          </div>
          <div class="event-info">
            <div class="title">${esc(ev.title)}</div>
            <div class="loc">${esc(ev.location)}</div>
          </div>
          <form method="post" action="/members/rsvp?tab=events">
            <input type="hidden" name="event_id" value="${esc(ev.id)}">
            <button type="submit" class="rsvp-btn${goingClass}">${esc(rsvpLabel)}</button>
          </form>
        </div>

        <details${isOpen ? ' open' : ''}>
          <summary class="details-toggle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3f6b4a" stroke-width="2.2"><path d="M6 9 L12 15 L18 9"/></svg>
            <span>Show / hide details</span>
          </summary>

          <div class="event-details">
            <div class="detail-grid">
              <div><div class="label">Parking</div><div class="value">${esc(ev.parking)}</div></div>
              <div><div class="label">Floor Area</div><div class="value">${esc(ev.floorArea)}</div></div>
              <div><div class="label">Accommodation</div><div class="value">${esc(ev.accommodation)}</div></div>
              <div><div class="label">Fuel</div><div class="value">${esc(ev.fuel)}</div></div>
            </div>

            <div class="droid-list-label">Droids Attending</div>
            <div class="droid-list">
              ${droidsForEvent.map((da) => `
                <div class="droid-item">
                  <div class="avatar">${esc(initials(da.name))}</div>
                  <div><strong>${esc(da.name)}</strong> &mdash; ${esc(da.droid)}</div>
                </div>`).join('')}
            </div>

            <form class="add-droid-form" method="post" action="/members/add-droid?tab=events">
              <input type="hidden" name="event_id" value="${esc(ev.id)}">
              <div class="row">
                <input type="text" name="name" placeholder="Your name" required>
                <select name="droid">
                  ${DROID_OPTIONS.map((opt) => `<option value="${esc(opt)}">${esc(opt)}</option>`).join('')}
                </select>
                <button type="submit">Add</button>
              </div>
              <textarea name="other_droid" rows="1" placeholder="If you picked &quot;Other Build&quot; above, name your droid here"></textarea>
            </form>
          </div>
        </details>
      </div>`;
  }).join('');
}

function directoryTabHTML() {
  return `<div class="directory-grid">${MEMBERS.map((m) => `
      <div class="directory-card">
        <div class="avatar">${esc(initials(m.name))}</div>
        <div>
          <div class="name">${esc(m.name)}</div>
          <div class="droid">Building: ${esc(m.droid)}</div>
        </div>
      </div>`).join('')}</div>`;
}

function logsTabHTML() {
  return `<div class="buildlog-grid">${BUILD_LOGS.map((p) => `
      <div class="buildlog-card">
        <div class="thumb">PHOTO</div>
        <div class="body">
          <div class="who">${esc(p.author)} &middot; ${esc(p.droid)}</div>
          <div class="caption">${esc(p.caption)}</div>
        </div>
      </div>`).join('')}</div>`;
}

function dashboardHTML({ tab, openEventId, rsvps, addedDroids }) {
  const link = (t) => `/members/dashboard?tab=${t}`;
  const content = tab === 'events' ? eventsTabHTML(rsvps, addedDroids, openEventId)
    : tab === 'directory' ? directoryTabHTML()
    : logsTabHTML();

  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Members Dashboard — Norwich Droids</title></head>
<body>
<div class="dash-nav">
  <div class="brand"><img src="/img/logo-nav.png" alt="Norwich Droids logo"><div class="label">MEMBERS AREA</div></div>
  <div class="links">
    <a href="${link('events')}" class="${tab === 'events' ? 'active' : ''}">Events</a>
    <a href="${link('directory')}" class="${tab === 'directory' ? 'active' : ''}">Directory</a>
    <a href="${link('logs')}" class="${tab === 'logs' ? 'active' : ''}">Build Logs</a>
    <a class="view-public" href="/">View public site</a>
    <a class="logout" href="/members/logout">Log Out</a>
  </div>
</div>

<div class="dash-main">
  <h1>Welcome back.</h1>
  <p class="sub">Here's what's coming up for members.</p>
  ${content}
</div>
</body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/members/login' && request.method === 'GET') {
      if (await isLoggedIn(request, env)) return redirect('/members/dashboard');
      return htmlResponse(loginPageHTML(''));
    }

    if (path === '/members/login' && request.method === 'POST') {
      const form = await request.formData();
      const password = String(form.get('password') || '');
      const expected = env.MEMBERS_PASSWORD || '';
      if (expected && safeEqual(password, expected)) {
        const token = crypto.randomUUID();
        await env.DATA.put(`session:${token}`, '1', { expirationTtl: SESSION_TTL_SECONDS });
        return redirect('/members/dashboard', {
          'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
        });
      }
      return htmlResponse(loginPageHTML('That password is not right. Please try again.'), 401);
    }

    if (path === '/members/logout') {
      const token = parseCookies(request)[SESSION_COOKIE];
      if (token) await env.DATA.delete(`session:${token}`);
      return redirect('/members/login', {
        'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      });
    }

    if (path === '/members/dashboard') {
      if (!(await isLoggedIn(request, env))) return redirect('/members/login');
      const rsvps = await readJSON(env, 'rsvps');
      const addedDroids = await readJSON(env, 'droids');
      return htmlResponse(dashboardHTML({
        tab: pickTab(url),
        openEventId: url.searchParams.get('open') || '',
        rsvps,
        addedDroids,
      }));
    }

    if (path === '/members/rsvp' && request.method === 'POST') {
      if (!(await isLoggedIn(request, env))) return redirect('/members/login');
      const form = await request.formData();
      const eventId = String(form.get('event_id') || '');
      if (EVENTS.some((e) => e.id === eventId)) {
        const rsvps = await readJSON(env, 'rsvps');
        const current = rsvps[eventId] || 'undecided';
        rsvps[eventId] = current === 'going' ? 'not-going' : 'going';
        await writeJSON(env, 'rsvps', rsvps);
      }
      return redirect(`/members/dashboard?tab=${pickTab(url)}&open=${encodeURIComponent(eventId)}`);
    }

    if (path === '/members/add-droid' && request.method === 'POST') {
      if (!(await isLoggedIn(request, env))) return redirect('/members/login');
      const form = await request.formData();
      const eventId = String(form.get('event_id') || '');
      const name = String(form.get('name') || '').trim();
      let droid = String(form.get('droid') || '');
      const otherDroid = String(form.get('other_droid') || '').trim();
      if (droid === 'Other Build' && otherDroid !== '') droid = otherDroid;

      if (EVENTS.some((e) => e.id === eventId) && name !== '' && droid !== '') {
        const droids = await readJSON(env, 'droids');
        if (!Array.isArray(droids[eventId])) droids[eventId] = [];
        droids[eventId].push({ name, droid, initials: initials(name) });
        await writeJSON(env, 'droids', droids);
      }
      return redirect(`/members/dashboard?tab=${pickTab(url)}&open=${encodeURIComponent(eventId)}`);
    }

    // Anything else that didn't already match a static file in /public.
    return env.ASSETS.fetch(request);
  },
};
