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

// Starting event list — only used to seed the "events" KV key the very
// first time the site runs. After that, admins manage events entirely from
// the Admin > Events page, and this array is never read again.
const SEED_EVENTS = [
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

// Profile photos are stored as base64 in the same KV namespace as everything
// else (no R2 bucket needed — one less thing to configure). Kept small on
// purpose: KV values top out at 25MB and base64 adds ~33% overhead, but the
// real reason for the cap is fast page loads for members on the go.
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // 1.5MB
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

// btoa/atob work in both the Workers runtime and Node, so this needs no
// external dependency. Chunked to avoid blowing the call stack on
// String.fromCharCode.apply for a multi-megabyte image.
function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// The browser-supplied Content-Type on a multipart upload is just a label
// the client chose — never trust it alone. Checking the file's magic bytes
// confirms it's actually the image format it claims to be, not just
// something wearing an image/* label.
function matchesDeclaredImageType(bytes, declaredType) {
  if (declaredType === 'image/png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return sig.every((b, i) => bytes[i] === b);
  }
  if (declaredType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (declaredType === 'image/webp') {
    const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    return riff && webp;
  }
  return false;
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

// --- Profile photos -----------------------------------------------------

async function savePhoto(env, userId, contentType, base64Data) {
  await env.DATA.put(`photo:${userId}`, JSON.stringify({ contentType, data: base64Data }));
}

async function getPhoto(env, userId) {
  const raw = await env.DATA.get(`photo:${userId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function deletePhoto(env, userId) {
  await env.DATA.delete(`photo:${userId}`);
}

// --- Events (admin-editable) --------------------------------------------

async function getEvents(env) {
  const raw = await env.DATA.get('events');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to reseed */ }
  }
  // First run — seed KV with the built-in defaults so nothing changes for
  // sites that were already live before events became editable.
  await env.DATA.put('events', JSON.stringify(SEED_EVENTS));
  return SEED_EVENTS;
}

async function saveEvents(env, events) {
  await env.DATA.put('events', JSON.stringify(events));
}

function slugify(str) {
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function uniqueEventId(events, base) {
  const root = base || 'event';
  let id = root;
  let n = 2;
  const existing = new Set(events.map((e) => e.id));
  while (existing.has(id)) {
    id = `${root}-${n}`;
    n += 1;
  }
  return id;
}

// Base droids are edited as plain text in the admin form, one per line,
// "Name | Droid Type" — simpler than a dynamic add/remove row UI for a
// small club committee to use.
function parseBaseDroids(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, droidPart] = line.split('|');
      const name = (namePart || '').trim();
      const droid = (droidPart || '').trim();
      return { name: name || '[Member Name]', droid: droid || 'R2 Unit' };
    });
}

function formatBaseDroids(baseDroids) {
  return (Array.isArray(baseDroids) ? baseDroids : []).map((d) => `${d.name} | ${d.droid}`).join('\n');
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

function eventsTabHTML(events, rsvps, addedDroids, openEventId) {
  if (events.length === 0) {
    return `<p class="sub">No events on the calendar right now — an admin can add one from Admin &gt; Events.</p>`;
  }
  return events.map((ev) => {
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
        ${m.hasPhoto
          ? `<img class="avatar-img" src="/members/photo/${esc(m.id)}?v=${esc(m.photoUpdatedAt || 0)}" alt="${esc(m.name)}">`
          : `<div class="avatar">${esc(initials(m.name))}</div>`}
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

function dashboardHTML({ tab, openEventId, events, rsvps, addedDroids, users, currentUser }) {
  const content = tab === 'events' ? eventsTabHTML(events, rsvps, addedDroids, openEventId)
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

function changePasswordHTML(currentUser, state = {}) {
  const { pwError, pwSuccess, photoError, photoSuccess } = state;
  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>My Account — Norwich Droids</title></head>
<body>
${dashNav('change-password', currentUser)}
<div class="dash-main">
  <h1>My Account</h1>
  <p class="sub">${esc(currentUser.name)} &middot; ${esc(currentUser.email)}${currentUser.role === 'admin' ? ' &middot; Admin' : ''}</p>

  <div class="login-card" style="max-width:420px; margin:0 0 28px;">
    <h1 style="font-size:16px; text-align:left;">Profile Photo</h1>
    ${photoError ? `<div class="login-error">${esc(photoError)}</div>` : ''}
    ${photoSuccess ? `<div class="admin-success">${esc(photoSuccess)}</div>` : ''}
    <div class="photo-row">
      ${currentUser.hasPhoto
        ? `<img class="avatar-img avatar-img-lg" src="/members/photo/${esc(currentUser.id)}?v=${esc(currentUser.photoUpdatedAt || 0)}" alt="${esc(currentUser.name)}">`
        : `<div class="avatar avatar-lg">${esc(initials(currentUser.name))}</div>`}
      <div class="photo-actions">
        <form method="post" action="/members/account/photo" enctype="multipart/form-data">
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>
          <button type="submit" class="btn-small" style="margin-top:8px;">Upload Photo</button>
        </form>
        ${currentUser.hasPhoto ? `
        <form method="post" action="/members/account/photo/remove" style="margin-top:8px;">
          <button type="submit" class="btn-small btn-danger">Remove Photo</button>
        </form>` : ''}
      </div>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin:14px 0 0;">JPEG, PNG or WEBP, up to 1.5MB. Visible to other logged-in members in the Directory.</p>
  </div>

  <div class="login-card" style="max-width:420px; margin:0;">
    <h1 style="font-size:16px; text-align:left;">Change Password</h1>
    ${pwError ? `<div class="login-error">${esc(pwError)}</div>` : ''}
    ${pwSuccess ? `<div class="admin-success">${esc(pwSuccess)}</div>` : ''}
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

function adminSubNav(active) {
  return `
  <div class="admin-subnav">
    <a href="/members/admin" class="${active === 'members' ? 'active' : ''}">Members</a>
    <a href="/members/admin/events" class="${active === 'events' ? 'active' : ''}">Events</a>
  </div>`;
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
  ${adminSubNav('members')}

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

function eventFormFields(ev) {
  const e = ev || {
    id: '', day: '', daySmall: false, month: '', title: '', location: '',
    parking: '', floorArea: '', accommodation: '', fuel: '', baseDroids: [],
  };
  return `
      <div class="field">
        <label for="ev_title">Event Title</label>
        <input type="text" id="ev_title" name="title" value="${esc(e.title)}" required>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="ev_day">Day</label>
          <input type="text" id="ev_day" name="day" value="${esc(e.day)}" placeholder="e.g. 05 or 26–27" required>
        </div>
        <div class="field">
          <label for="ev_month">Month</label>
          <input type="text" id="ev_month" name="month" value="${esc(e.month)}" placeholder="e.g. SEP" maxlength="4" required>
        </div>
      </div>
      <div class="field field-checkbox">
        <label><input type="checkbox" name="day_small" ${e.daySmall ? 'checked' : ''}> Date is a range (e.g. "26–27") — shows in smaller text</label>
      </div>
      <div class="field">
        <label for="ev_location">Location</label>
        <input type="text" id="ev_location" name="location" value="${esc(e.location)}" required>
      </div>
      <div class="field">
        <label for="ev_parking">Parking</label>
        <input type="text" id="ev_parking" name="parking" value="${esc(e.parking)}">
      </div>
      <div class="field">
        <label for="ev_floor">Floor Area</label>
        <input type="text" id="ev_floor" name="floor_area" value="${esc(e.floorArea)}">
      </div>
      <div class="field">
        <label for="ev_accom">Accommodation</label>
        <input type="text" id="ev_accom" name="accommodation" value="${esc(e.accommodation)}">
      </div>
      <div class="field">
        <label for="ev_fuel">Fuel</label>
        <input type="text" id="ev_fuel" name="fuel" value="${esc(e.fuel)}">
      </div>
      <div class="field">
        <label for="ev_droids">Droids already confirmed &mdash; one per line, as <code>Name | Droid Type</code></label>
        <textarea id="ev_droids" name="base_droids" rows="4" placeholder="Jane Smith | R2 Unit">${esc(formatBaseDroids(e.baseDroids))}</textarea>
      </div>`;
}

function adminEventsHTML({ currentUser, events, error, notice, editingEvent }) {
  const rows = events.map((ev) => `
    <tr>
      <td>${esc(ev.title)}</td>
      <td>${esc(ev.day)} ${esc(ev.month)}</td>
      <td>${esc(ev.location)}</td>
      <td class="admin-actions">
        <a class="btn-small" href="/members/admin/events?edit=${encodeURIComponent(ev.id)}">Edit</a>
        <form method="post" action="/members/admin/events/delete" onsubmit="return false;" data-event="${esc(ev.title)}">
          <input type="hidden" name="event_id" value="${esc(ev.id)}">
          <button type="submit" class="btn-small btn-danger">Delete</button>
        </form>
      </td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Admin · Events — Norwich Droids</title></head>
<body>
${dashNav('admin', currentUser)}
<div class="dash-main">
  <h1>Admin</h1>
  <p class="sub">Add, edit, or remove upcoming events and appearances.</p>
  ${adminSubNav('events')}

  ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
  ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}

  <div class="login-card" style="max-width:560px; margin:0 0 40px;">
    <h1 style="font-size:16px; text-align:left;">${editingEvent ? `Edit &ldquo;${esc(editingEvent.title)}&rdquo;` : 'Add an Event'}</h1>
    <form method="post" action="${editingEvent ? '/members/admin/events/update' : '/members/admin/events/add'}">
      ${editingEvent ? `<input type="hidden" name="event_id" value="${esc(editingEvent.id)}">` : ''}
      ${eventFormFields(editingEvent)}
      <button type="submit" class="btn btn-primary">${editingEvent ? 'Save Changes' : 'Add Event'}</button>
      ${editingEvent ? `<a href="/members/admin/events" class="btn-small" style="margin-left:10px;">Cancel</a>` : ''}
    </form>
  </div>

  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Title</th><th>Date</th><th>Location</th><th>Actions</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">No events yet.</td></tr>`}</tbody>
    </table>
  </div>
</div>
<script>
document.querySelectorAll('form[action="/members/admin/events/delete"]').forEach((f) => {
  f.addEventListener('submit', () => {
    if (confirm('Delete \\u201c' + f.dataset.event + '\\u201d? This also clears its RSVPs and added droids. This cannot be undone.')) {
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
      const events = await getEvents(env);
      const rsvps = await readJSON(env, 'rsvps');
      const addedDroids = await readJSON(env, 'droids');
      const tab = pickTab(url);
      const users = tab === 'directory' ? await listUsers(env) : [];
      return htmlResponse(dashboardHTML({
        tab, openEventId: url.searchParams.get('open') || '', events, rsvps, addedDroids, users, currentUser,
      }));
    }

    if (path === '/members/rsvp' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');
      const form = await request.formData();
      const eventId = String(form.get('event_id') || '');
      const events = await getEvents(env);
      if (events.some((e) => e.id === eventId)) {
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

      const events = await getEvents(env);
      if (events.some((e) => e.id === eventId) && name !== '' && droid !== '') {
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
        return htmlResponse(changePasswordHTML(currentUser, {}));
      }

      const form = await request.formData();
      const currentPassword = String(form.get('current_password') || '');
      const newPassword = String(form.get('new_password') || '');
      if (!(await verifyPassword(currentPassword, currentUser.passwordSalt, currentUser.passwordHash))) {
        return htmlResponse(changePasswordHTML(currentUser, { pwError: 'Your current password is not right.' }), 401);
      }
      if (newPassword.length < 8) {
        return htmlResponse(changePasswordHTML(currentUser, { pwError: 'New password must be at least 8 characters.' }), 400);
      }
      const { saltHex, hash } = await hashNewPassword(newPassword);
      currentUser.passwordSalt = saltHex;
      currentUser.passwordHash = hash;
      currentUser.sessionVersion = (currentUser.sessionVersion || 0) + 1; // invalidates any other logged-in sessions for this account
      await saveUser(env, currentUser);
      const token = await createSession(env, currentUser); // keep this browser logged in under the new session version
      return htmlResponse(changePasswordHTML(currentUser, { pwSuccess: 'Password updated.' }), 200, sessionCookieHeader(token));
    }

    if (path === '/members/account/photo' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const form = await request.formData();
      const file = form.get('photo');
      if (!file || typeof file === 'string' || !file.size) {
        return htmlResponse(changePasswordHTML(currentUser, { photoError: 'Please choose a photo to upload.' }), 400);
      }
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        return htmlResponse(changePasswordHTML(currentUser, { photoError: 'Photos must be JPEG, PNG, or WEBP.' }), 400);
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return htmlResponse(changePasswordHTML(currentUser, { photoError: 'That photo is too large — please use one under 1.5MB.' }), 400);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesDeclaredImageType(bytes, file.type)) {
        return htmlResponse(changePasswordHTML(currentUser, { photoError: "That file doesn't look like a valid image." }), 400);
      }
      await savePhoto(env, currentUser.id, file.type, bytesToBase64(bytes));
      currentUser.hasPhoto = true;
      currentUser.photoUpdatedAt = Date.now();
      await saveUser(env, currentUser);
      return htmlResponse(changePasswordHTML(currentUser, { photoSuccess: 'Photo updated.' }));
    }

    if (path === '/members/account/photo/remove' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      await deletePhoto(env, currentUser.id);
      currentUser.hasPhoto = false;
      delete currentUser.photoUpdatedAt;
      await saveUser(env, currentUser);
      return htmlResponse(changePasswordHTML(currentUser, { photoSuccess: 'Photo removed.' }));
    }

    if (path.startsWith('/members/photo/') && request.method === 'GET') {
      // Photos are only ever shown inside the members directory, so serving
      // them is gated behind a session too — not a public URL.
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const userId = path.slice('/members/photo/'.length);
      const photo = await getPhoto(env, userId);
      if (!photo) return htmlResponse('Not found.', 404);
      const bytes = base64ToBytes(photo.data);
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': photo.contentType,
          'Cache-Control': 'private, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
        },
      });
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

      // --- Event management ------------------------------------------------

      if (path === '/members/admin/events' && request.method === 'GET') {
        const events = await getEvents(env);
        const editId = url.searchParams.get('edit');
        const editingEvent = editId ? events.find((e) => e.id === editId) || null : null;
        return htmlResponse(adminEventsHTML({ currentUser, events, error: '', notice: '', editingEvent }));
      }

      if (path === '/members/admin/events/add' && request.method === 'POST') {
        const form = await request.formData();
        const title = String(form.get('title') || '').trim();
        const day = String(form.get('day') || '').trim();
        const month = String(form.get('month') || '').trim().toUpperCase();
        const location = String(form.get('location') || '').trim();
        const events = await getEvents(env);
        if (!title || !day || !month || !location) {
          return htmlResponse(adminEventsHTML({ currentUser, events, error: 'Title, day, month, and location are required.', notice: '', editingEvent: null }), 400);
        }
        const newEvent = {
          id: uniqueEventId(events, slugify(title)),
          day, daySmall: form.get('day_small') === 'on', month, title, location,
          parking: String(form.get('parking') || '').trim(),
          floorArea: String(form.get('floor_area') || '').trim(),
          accommodation: String(form.get('accommodation') || '').trim(),
          fuel: String(form.get('fuel') || '').trim(),
          baseDroids: parseBaseDroids(form.get('base_droids')),
        };
        events.push(newEvent);
        await saveEvents(env, events);
        return htmlResponse(adminEventsHTML({ currentUser, events, error: '', notice: `"${newEvent.title}" was added.`, editingEvent: null }));
      }

      if (path === '/members/admin/events/update' && request.method === 'POST') {
        const form = await request.formData();
        const eventId = String(form.get('event_id') || '');
        const events = await getEvents(env);
        const idx = events.findIndex((e) => e.id === eventId);
        if (idx === -1) {
          return htmlResponse(adminEventsHTML({ currentUser, events, error: 'Event not found.', notice: '', editingEvent: null }), 400);
        }
        const title = String(form.get('title') || '').trim();
        const day = String(form.get('day') || '').trim();
        const month = String(form.get('month') || '').trim().toUpperCase();
        const location = String(form.get('location') || '').trim();
        if (!title || !day || !month || !location) {
          return htmlResponse(adminEventsHTML({ currentUser, events, error: 'Title, day, month, and location are required.', notice: '', editingEvent: events[idx] }), 400);
        }
        events[idx] = {
          ...events[idx],
          day, daySmall: form.get('day_small') === 'on', month, title, location,
          parking: String(form.get('parking') || '').trim(),
          floorArea: String(form.get('floor_area') || '').trim(),
          accommodation: String(form.get('accommodation') || '').trim(),
          fuel: String(form.get('fuel') || '').trim(),
          baseDroids: parseBaseDroids(form.get('base_droids')),
        };
        await saveEvents(env, events);
        return htmlResponse(adminEventsHTML({ currentUser, events, error: '', notice: `"${events[idx].title}" was updated.`, editingEvent: null }));
      }

      if (path === '/members/admin/events/delete' && request.method === 'POST') {
        const form = await request.formData();
        const eventId = String(form.get('event_id') || '');
        const events = await getEvents(env);
        const target = events.find((e) => e.id === eventId);
        if (!target) {
          return htmlResponse(adminEventsHTML({ currentUser, events, error: 'Event not found.', notice: '', editingEvent: null }), 400);
        }
        const remaining = events.filter((e) => e.id !== eventId);
        await saveEvents(env, remaining);
        // Clean up any RSVPs / added droids that referenced the deleted event.
        const rsvps = await readJSON(env, 'rsvps');
        if (eventId in rsvps) { delete rsvps[eventId]; await writeJSON(env, 'rsvps', rsvps); }
        const droids = await readJSON(env, 'droids');
        if (eventId in droids) { delete droids[eventId]; await writeJSON(env, 'droids', droids); }
        return htmlResponse(adminEventsHTML({ currentUser, events: remaining, error: '', notice: `"${target.title}" was deleted.`, editingEvent: null }));
      }

      return htmlResponse('Not found.', 404);
    }

    // Anything else that didn't already match a static file in /public.
    return env.ASSETS.fetch(request);
  },
};
