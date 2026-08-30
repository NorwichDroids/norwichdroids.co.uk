// Norwich Droids — members-area Worker.
// Static pages (home/about/events/gallery) are served straight from /public
// by the assets binding and never reach this file. Everything below handles
// the dynamic members area: per-member accounts, login, admin management,
// dashboard, RSVP, add-a-droid.
//
// Accounts are stored in the DATA KV namespace — no Cloudflare "secret" is
// needed for auth any more (that was the source of a lot of grief). The
// very first admin account is created once, automatically, by visiting the
// one-time setup link described in README.txt.

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

const BUILD_LOGS = [
  { author: '[Member Name]', droid: 'BB-8', caption: 'Dome motor finally spins smoothly — took three tries to get the magnet alignment right.' },
  { author: '[Member Name]', droid: 'R2 Unit', caption: 'Leg struts primed and ready for paint ahead of next month’s convention.' },
  { author: '[Member Name]', droid: 'MSE-6', caption: 'First test drive across the workshop floor — steering needs work but it moves!' },
];

// One-time bootstrap token — used only to create the very first admin
// account. The /members/_setup route refuses to do anything once any admin
// account already exists, so this string being public in the repo is not a
// standing risk; it only ever matters for the single moment before the
// club's first admin has been created.
const SETUP_TOKEN = '9856825dfffddf49fc0139a57840850be646264818193ba5';

const TABS = ['events', 'directory', 'logs'];
const SESSION_COOKIE = 'nd_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const PBKDF2_ITERATIONS = 100000;
// Fixed decoy values so a login attempt against an unregistered email still
// does a real PBKDF2 derivation (same cost as a real check), rather than
// returning faster and letting response time reveal which emails exist.
const UNKNOWN_EMAIL_DUMMY_SALT = 'a'.repeat(32);
const UNKNOWN_EMAIL_DUMMY_HASH = 'b'.repeat(64);

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

// Constant-time-ish compare — used on fixed-length hex hashes, so it never
// leaks information about password length either.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length === 0) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function randomHex(byteLen) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLen)));
}

// Passwords are hashed with PBKDF2-SHA256 via the platform's native Web
// Crypto API — no external dependency needed, and no plaintext password is
// ever stored.
async function derivePasswordHash(password, saltHex) {
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, keyMaterial, 256);
  return bytesToHex(new Uint8Array(bits));
}

async function hashNewPassword(password) {
  const saltHex = randomHex(16);
  const hash = await derivePasswordHash(password, saltHex);
  return { saltHex, hash };
}

async function verifyPassword(password, saltHex, expectedHash) {
  const hash = await derivePasswordHash(password, saltHex);
  return safeEqual(hash, expectedHash);
}

function generateTempPassword() {
  // Avoids visually-ambiguous characters (0/O, 1/l/I).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// --- User storage -----------------------------------------------------

async function getUserById(env, id) {
  if (!id) return null;
  const raw = await env.DATA.get(`user:${id}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function getUserByEmail(env, email) {
  const id = await env.DATA.get(`email:${email.toLowerCase()}`);
  if (!id) return null;
  return getUserById(env, id);
}

async function saveUser(env, user) {
  await env.DATA.put(`user:${user.id}`, JSON.stringify(user));
  await env.DATA.put(`email:${user.email.toLowerCase()}`, user.id);
}

async function deleteUser(env, user) {
  await env.DATA.delete(`user:${user.id}`);
  await env.DATA.delete(`email:${user.email.toLowerCase()}`);
}

async function listUsers(env) {
  const { keys } = await env.DATA.list({ prefix: 'user:' });
  const users = await Promise.all(keys.map((k) => env.DATA.get(k.name)));
  return users
    .map((raw) => { try { return JSON.parse(raw); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function anyAdminExists(env) {
  const users = await listUsers(env);
  return users.some((u) => u.role === 'admin');
}

// Session values carry the user's sessionVersion at login time, so that
// changing a password (which bumps sessionVersion) immediately invalidates
// every other session for that account — not just the current one.
async function getSessionUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const raw = await env.DATA.get(`session:${token}`);
  if (!raw) return null;
  let sessionData;
  try { sessionData = JSON.parse(raw); } catch { return null; }
  const user = await getUserById(env, sessionData.userId);
  if (!user) return null;
  if ((user.sessionVersion || 0) !== sessionData.v) return null; // stale session — password changed since
  return user;
}

async function createSession(env, user) {
  const token = crypto.randomUUID();
  await env.DATA.put(`session:${token}`, JSON.stringify({ userId: user.id, v: user.sessionVersion || 0 }), { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

// --- Misc helpers -------------------------------------------------------

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

function sessionCookieHeader(token) {
  return { 'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}` };
}

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@500;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/css/style.css">`;

function publicHead() {
  return `
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
</div>`;
}

function publicFoot() {
  return `
<div class="site-footer">
  <div class="brand"><img src="/img/logo2-badge.png" alt="Norwich Droids emblem"><div class="text">Norwich Droids &mdash; Norfolk, UK</div></div>
  <div class="text">info@norwichdroids.co.uk</div>
</div>`;
}

function loginPageHTML(error) {
  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Members Login — Norwich Droids</title></head>
<body>
${publicHead()}
<main>
<div class="login-wrap">
  <div class="login-card">
    <div class="logo-row"><img src="/img/logo-nav.png" alt="Norwich Droids logo"></div>
    <h1>Members Area</h1>
    <p class="sub">Sign in to see upcoming builds, RSVP to events, and connect with other members.</p>
    ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
    <form method="post" action="/members/login">
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" placeholder="you@example.com" autofocus required>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="••••••••" required>
      </div>
      <button type="submit" class="btn btn-primary">Log In</button>
    </form>
    <div class="links">
      <span>Forgotten your password? Ask an admin to reset it.</span>
      <a href="/">&larr; Back to site</a>
    </div>
  </div>
</div>
</main>
${publicFoot()}
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

function directoryTabHTML(users) {
  if (users.length === 0) {
    return `<p class="sub">No members yet — an admin can add them from the Admin tab.</p>`;
  }
  return `<div class="directory-grid">${users.map((m) => `
      <div class="directory-card">
        <div class="avatar">${esc(initials(m.name))}</div>
        <div>
          <div class="name">${esc(m.name)}${m.role === 'admin' ? ' <span class="role-badge">Admin</span>' : ''}</div>
          <div class="droid">${m.droid ? `Building: ${esc(m.droid)}` : 'No build listed yet'}</div>
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

function dashNav(active, currentUser) {
  return `
<div class="dash-nav">
  <div class="brand"><img src="/img/logo-nav.png" alt="Norwich Droids logo"><div class="label">MEMBERS AREA</div></div>
  <div class="links">
    <a href="/members/dashboard?tab=events" class="${active === 'events' ? 'active' : ''}">Events</a>
    <a href="/members/dashboard?tab=directory" class="${active === 'directory' ? 'active' : ''}">Directory</a>
    <a href="/members/dashboard?tab=logs" class="${active === 'logs' ? 'active' : ''}">Build Logs</a>
    ${currentUser.role === 'admin' ? `<a href="/members/admin" class="${active === 'admin' ? 'active' : ''}">Admin</a>` : ''}
    <a href="/members/change-password" class="${active === 'change-password' ? 'active' : ''}">My Account</a>
    <a class="view-public" href="/">View public site</a>
    <a class="logout" href="/members/logout">Log Out</a>
  </div>
</div>`;
}

function dashboardHTML({ tab, openEventId, rsvps, addedDroids, users, currentUser }) {
  const content = tab === 'events' ? eventsTabHTML(rsvps, addedDroids, openEventId)
    : tab === 'directory' ? directoryTabHTML(users)
    : logsTabHTML();

  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Members Dashboard — Norwich Droids</title></head>
<body>
${dashNav(tab, currentUser)}
<div class="dash-main">
  <h1>Welcome back, ${esc(currentUser.name.split(' ')[0] || currentUser.name)}.</h1>
  <p class="sub">Here's what's coming up for members.</p>
  ${content}
</div>
</body></html>`;
}

function changePasswordHTML(currentUser, error, success) {
  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>My Account — Norwich Droids</title></head>
<body>
${dashNav('change-password', currentUser)}
<div class="dash-main">
  <h1>My Account</h1>
  <p class="sub">${esc(currentUser.name)} &middot; ${esc(currentUser.email)}${currentUser.role === 'admin' ? ' &middot; Admin' : ''}</p>

  <div class="login-card" style="max-width:420px; margin:0;">
    <h1 style="font-size:16px; text-align:left;">Change Password</h1>
    ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
    ${success ? `<div class="admin-success">${esc(success)}</div>` : ''}
    <form method="post" action="/members/change-password">
      <div class="field">
        <label for="current_password">Current password</label>
        <input type="password" id="current_password" name="current_password" required>
      </div>
      <div class="field">
        <label for="new_password">New password</label>
        <input type="password" id="new_password" name="new_password" minlength="8" required>
      </div>
      <button type="submit" class="btn btn-primary">Update Password</button>
    </form>
  </div>
</div>
</body></html>`;
}

function adminPageHTML({ currentUser, users, error, notice, generated }) {
  const rows = users.map((u) => `
    <tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.droid || '—')}</td>
      <td>${u.role === 'admin' ? '<span class="role-badge">Admin</span>' : 'Member'}</td>
      <td class="admin-actions">
        <form method="post" action="/members/admin/set-role">
          <input type="hidden" name="user_id" value="${esc(u.id)}">
          <input type="hidden" name="role" value="${u.role === 'admin' ? 'member' : 'admin'}">
          <button type="submit" class="btn-small">${u.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}</button>
        </form>
        <form method="post" action="/members/admin/reset-password">
          <input type="hidden" name="user_id" value="${esc(u.id)}">
          <button type="submit" class="btn-small">Reset Password</button>
        </form>
        <form method="post" action="/members/admin/delete" onsubmit="return false;" data-user="${esc(u.name)}">
          <input type="hidden" name="user_id" value="${esc(u.id)}">
          <button type="submit" class="btn-small btn-danger">Remove</button>
        </form>
      </td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Admin — Norwich Droids</title></head>
<body>
${dashNav('admin', currentUser)}
<div class="dash-main">
  <h1>Admin</h1>
  <p class="sub">Add members, reset passwords, and manage admin access.</p>

  ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
  ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}
  ${generated ? `
    <div class="generated-password-box">
      <strong>${esc(generated.name)}</strong>'s temporary password: <code>${esc(generated.password)}</code>
      <p>Share this with them directly — it won't be shown again. They can change it from My Account after logging in.</p>
    </div>` : ''}

  <div class="login-card" style="max-width:520px; margin:0 0 40px;">
    <h1 style="font-size:16px; text-align:left;">Add a Member</h1>
    <form method="post" action="/members/admin/add">
      <div class="field">
        <label for="new_name">Name</label>
        <input type="text" id="new_name" name="name" required>
      </div>
      <div class="field">
        <label for="new_email">Email</label>
        <input type="email" id="new_email" name="email" required>
      </div>
      <div class="field">
        <label for="new_droid">Droid (optional)</label>
        <input type="text" id="new_droid" name="droid" placeholder="e.g. R2 Unit">
      </div>
      <button type="submit" class="btn btn-primary">Add Member</button>
    </form>
  </div>

  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Name</th><th>Email</th><th>Droid</th><th>Role</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>
<script>
document.querySelectorAll('form[action="/members/admin/delete"]').forEach((f) => {
  f.addEventListener('submit', () => {
    if (confirm('Remove ' + f.dataset.user + '\\'s account? This cannot be undone.')) {
      f.removeAttribute('onsubmit');
      HTMLFormElement.prototype.submit.call(f);
    }
  });
});
</script>
</body></html>`;
}

function setupPageHTML(error) {
  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>First-time Setup — Norwich Droids</title></head>
<body>
${publicHead()}
<main>
<div class="login-wrap">
  <div class="login-card">
    <h1>Create the First Admin Account</h1>
    <p class="sub">This one-time page creates the club's first administrator. It will stop working the moment an admin account exists.</p>
    ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
    <form method="post" action="${'/members/_setup?token=' + encodeURIComponent(SETUP_TOKEN)}">
      <div class="field">
        <label for="name">Name</label>
        <input type="text" id="name" name="name" required autofocus>
      </div>
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" minlength="8" required>
      </div>
      <button type="submit" class="btn btn-primary">Create Admin Account</button>
    </form>
  </div>
</div>
</main>
${publicFoot()}
</body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- One-time bootstrap: create the first admin account -------------
    if (path === '/members/_setup') {
      if (await anyAdminExists(env)) {
        return htmlResponse('<p>Setup has already been completed.</p>', 403);
      }
      if (url.searchParams.get('token') !== SETUP_TOKEN) {
        return htmlResponse('Not found.', 404);
      }
      if (request.method === 'GET') {
        return htmlResponse(setupPageHTML(''));
      }
      if (request.method === 'POST') {
        const form = await request.formData();
        const name = String(form.get('name') || '').trim();
        const email = String(form.get('email') || '').trim().toLowerCase();
        const password = String(form.get('password') || '');
        if (!name || !email || password.length < 8) {
          return htmlResponse(setupPageHTML('Please fill in every field — password must be at least 8 characters.'), 400);
        }
        const { saltHex, hash } = await hashNewPassword(password);
        const user = {
          id: crypto.randomUUID(), name, email, droid: '', role: 'admin', sessionVersion: 0,
          passwordSalt: saltHex, passwordHash: hash, createdAt: new Date().toISOString(),
        };
        await saveUser(env, user);
        const token = await createSession(env, user);
        return redirect('/members/dashboard', sessionCookieHeader(token));
      }
    }

    if (path === '/members/login' && request.method === 'GET') {
      if (await getSessionUser(request, env)) return redirect('/members/dashboard');
      return htmlResponse(loginPageHTML(''));
    }

    if (path === '/members/login' && request.method === 'POST') {
      const form = await request.formData();
      const email = String(form.get('email') || '').trim().toLowerCase();
      const password = String(form.get('password') || '');
      const user = email ? await getUserByEmail(env, email) : null;
      // Always run a PBKDF2 derivation, even for an unknown email, so a
      // response-time difference can't be used to probe which emails have
      // accounts.
      const passwordOk = user
        ? await verifyPassword(password, user.passwordSalt, user.passwordHash)
        : await verifyPassword(password, UNKNOWN_EMAIL_DUMMY_SALT, UNKNOWN_EMAIL_DUMMY_HASH);
      if (user && password && passwordOk) {
        const token = await createSession(env, user);
        return redirect('/members/dashboard', sessionCookieHeader(token));
      }
      return htmlResponse(loginPageHTML('That email and password combination is not right. Please try again.'), 401);
    }

    if (path === '/members/logout') {
      const token = parseCookies(request)[SESSION_COOKIE];
      if (token) await env.DATA.delete(`session:${token}`);
      return redirect('/members/login', {
        'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      });
    }

    if (path === '/members/dashboard') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');
      const rsvps = await readJSON(env, 'rsvps');
      const addedDroids = await readJSON(env, 'droids');
      const tab = pickTab(url);
      const users = tab === 'directory' ? await listUsers(env) : [];
      return htmlResponse(dashboardHTML({
        tab, openEventId: url.searchParams.get('open') || '', rsvps, addedDroids, users, currentUser,
      }));
    }

    if (path === '/members/rsvp' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');
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
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');
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

    if (path === '/members/change-password') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      if (request.method === 'GET') {
        return htmlResponse(changePasswordHTML(currentUser, '', ''));
      }

      const form = await request.formData();
      const currentPassword = String(form.get('current_password') || '');
      const newPassword = String(form.get('new_password') || '');
      if (!(await verifyPassword(currentPassword, currentUser.passwordSalt, currentUser.passwordHash))) {
        return htmlResponse(changePasswordHTML(currentUser, 'Your current password is not right.', ''), 401);
      }
      if (newPassword.length < 8) {
        return htmlResponse(changePasswordHTML(currentUser, 'New password must be at least 8 characters.', ''), 400);
      }
      const { saltHex, hash } = await hashNewPassword(newPassword);
      currentUser.passwordSalt = saltHex;
      currentUser.passwordHash = hash;
      currentUser.sessionVersion = (currentUser.sessionVersion || 0) + 1; // invalidates any other logged-in sessions for this account
      await saveUser(env, currentUser);
      const token = await createSession(env, currentUser); // keep this browser logged in under the new session version
      return htmlResponse(changePasswordHTML(currentUser, '', 'Password updated.'), 200, sessionCookieHeader(token));
    }

    // --- Admin-only routes ------------------------------------------------
    if (path.startsWith('/members/admin')) {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');
      if (currentUser.role !== 'admin') return htmlResponse('<p>Admins only.</p>', 403);

      if (path === '/members/admin' && request.method === 'GET') {
        const users = await listUsers(env);
        return htmlResponse(adminPageHTML({ currentUser, users, error: '', notice: '', generated: null }));
      }

      if (path === '/members/admin/add' && request.method === 'POST') {
        const form = await request.formData();
        const name = String(form.get('name') || '').trim();
        const email = String(form.get('email') || '').trim().toLowerCase();
        const droid = String(form.get('droid') || '').trim();
        const users = await listUsers(env);
        if (!name || !email) {
          return htmlResponse(adminPageHTML({ currentUser, users, error: 'Name and email are required.', notice: '', generated: null }), 400);
        }
        if (await getUserByEmail(env, email)) {
          return htmlResponse(adminPageHTML({ currentUser, users, error: 'A member with that email already exists.', notice: '', generated: null }), 400);
        }
        const tempPassword = generateTempPassword();
        const { saltHex, hash } = await hashNewPassword(tempPassword);
        const newUser = {
          id: crypto.randomUUID(), name, email, droid, role: 'member', sessionVersion: 0,
          passwordSalt: saltHex, passwordHash: hash, createdAt: new Date().toISOString(),
        };
        await saveUser(env, newUser);
        const updatedUsers = await listUsers(env);
        return htmlResponse(adminPageHTML({
          currentUser, users: updatedUsers, error: '', notice: '',
          generated: { name: newUser.name, password: tempPassword },
        }));
      }

      if (path === '/members/admin/set-role' && request.method === 'POST') {
        const form = await request.formData();
        const userId = String(form.get('user_id') || '');
        const role = String(form.get('role') || '');
        const target = await getUserById(env, userId);
        const users = await listUsers(env);
        if (!target || !['admin', 'member'].includes(role)) {
          return htmlResponse(adminPageHTML({ currentUser, users, error: 'Member not found.', notice: '', generated: null }), 400);
        }
        if (target.id === currentUser.id && role === 'member') {
          const adminCount = users.filter((u) => u.role === 'admin').length;
          if (adminCount <= 1) {
            return htmlResponse(adminPageHTML({ currentUser, users, error: "You're the only admin — promote someone else first.", notice: '', generated: null }), 400);
          }
        }
        target.role = role;
        await saveUser(env, target);
        const updatedUsers = await listUsers(env);
        return htmlResponse(adminPageHTML({ currentUser, users: updatedUsers, error: '', notice: `${target.name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`, generated: null }));
      }

      if (path === '/members/admin/reset-password' && request.method === 'POST') {
        const form = await request.formData();
        const userId = String(form.get('user_id') || '');
        const target = await getUserById(env, userId);
        const users = await listUsers(env);
        if (!target) {
          return htmlResponse(adminPageHTML({ currentUser, users, error: 'Member not found.', notice: '', generated: null }), 400);
        }
        const tempPassword = generateTempPassword();
        const { saltHex, hash } = await hashNewPassword(tempPassword);
        target.passwordSalt = saltHex;
        target.passwordHash = hash;
        target.sessionVersion = (target.sessionVersion || 0) + 1; // logs the member out of any device using the old password
        await saveUser(env, target);
        const updatedUsers = await listUsers(env);
        return htmlResponse(adminPageHTML({
          currentUser, users: updatedUsers, error: '', notice: '',
          generated: { name: target.name, password: tempPassword },
        }));
      }

      if (path === '/members/admin/delete' && request.method === 'POST') {
        const form = await request.formData();
        const userId = String(form.get('user_id') || '');
        const target = await getUserById(env, userId);
        const users = await listUsers(env);
        if (!target) {
          return htmlResponse(adminPageHTML({ currentUser, users, error: 'Member not found.', notice: '', generated: null }), 400);
        }
        if (target.id === currentUser.id) {
          return htmlResponse(adminPageHTML({ currentUser, users, error: 'You cannot remove your own account.', notice: '', generated: null }), 400);
        }
        await deleteUser(env, target);
        const updatedUsers = await listUsers(env);
        return htmlResponse(adminPageHTML({ currentUser, users: updatedUsers, error: '', notice: `${target.name}'s account was removed.`, generated: null }));
      }

      return htmlResponse('Not found.', 404);
    }

    // Anything else that didn't already match a static file in /public.
    return env.ASSETS.fetch(request);
  },
};
