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
    id: 'charity', day: '05', daySmall: false, month: 'SEP', year: '2026',
    title: 'Feel The Force Day — Team Meet Point', location: 'Peterborough Cathedral, Peterborough',
    url: 'https://feeltheforceday.com/',
    startTime: '[Start time TBC]',
    accessTime: '[Access time TBC]',
    organiser: '[Organiser TBC]',
    parking: 'Free public parking at the Cathedral precinct — arrive early, fills up fast.',
    floorArea: '[Pitch size TBC] — outdoor display pitch in the precinct.',
    accommodation: 'Not provided — day event, home travel expected.',
    fuel: 'Not covered — please claim mileage separately if needed.',
    description: '',
    baseDroids: [
      { name: '[Member Name]', droid: 'R2 Unit' },
      { name: '[Member Name]', droid: 'BB-8' },
      { name: '[Member Name]', droid: 'MSE-6' },
    ],
  },
  {
    id: 'conv', day: '26–27', daySmall: true, month: 'SEP', year: '2026',
    title: 'Nor-Con — Team Meet Point', location: 'Norfolk Showground Arena, Norfolk',
    url: 'https://nor-con.co.uk/',
    startTime: '[Start time TBC]',
    accessTime: '[Access time TBC]',
    organiser: '[Organiser TBC]',
    parking: 'Free exhibitor parking on-site at the Showground.',
    floorArea: '[Pitch size TBC] — indoor arena pitch, confirm with organisers.',
    accommodation: 'Not required — local event.',
    fuel: 'Not covered — local event.',
    description: '',
    baseDroids: [
      { name: '[Member Name]', droid: 'R2 Unit' },
      { name: '[Member Name]', droid: 'R2 Unit' },
      { name: '[Member Name]', droid: 'Other Build' },
    ],
  },
  {
    id: 'mildcon', day: '03', daySmall: false, month: 'OCT', year: '2026',
    title: 'Mil-D-Con — Team Meet Point', location: 'RAF Mildenhall, Suffolk',
    url: 'https://100fss.com/mil-d-con/',
    startTime: '[Start time TBC]',
    accessTime: '[Access time TBC]',
    organiser: '[Organiser TBC]',
    parking: 'On-base parking — security pass required in advance, [details TBC].',
    floorArea: '[Pitch size TBC] — indoor hangar display.',
    accommodation: 'Provided — on-base lodging for exhibitors, confirm numbers with the committee.',
    fuel: 'Covered — mileage reimbursed for this event.',
    description: '',
    baseDroids: [
      { name: '[Member Name]', droid: 'BB-8' },
      { name: '[Member Name]', droid: 'R2 Unit' },
    ],
  },
];

// Starting droid type list — only used to seed the "droidTypes" KV key the
// very first time the site runs. After that, the list lives in KV: an admin
// can add or remove types from Admin > Droids, and picking "Other Build" and
// naming a droid anywhere in the site folds that name into the list too (see
// resolveDroidType below) so it becomes a normal dropdown choice from then
// on. "Other Build" itself is never stored in this list — every dropdown
// that uses it appends that option separately, as a permanent fallback that
// can't be accidentally removed.
const DROID_OPTIONS = [
  'R2 Unit', 'R5 Unit', 'BB-8', 'MSE-6', 'K-2SO', 'Imperial Probe Droid', 'Essie',
  'Pit Droid', 'Huyang', 'Battle Droid', 'Super Battle Droid', 'IG Unit',
];
const OTHER_DROID_TYPE = 'Other Build';

async function getDroidTypes(env) {
  const raw = await env.DATA.get('droidTypes');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to reseed */ }
  }
  await env.DATA.put('droidTypes', JSON.stringify(DROID_OPTIONS));
  return DROID_OPTIONS;
}

async function saveDroidTypes(env, types) {
  await env.DATA.put('droidTypes', JSON.stringify(types));
}

// Renders every droid-type <select>'s options consistently: the current
// list, then the permanent "Other Build" fallback last.
function droidTypeOptions(droidTypes, selectedValue) {
  const listed = droidTypes.map((opt) => `<option value="${esc(opt)}" ${selectedValue === opt ? 'selected' : ''}>${esc(opt)}</option>`).join('');
  return listed + `<option value="${esc(OTHER_DROID_TYPE)}" ${selectedValue === OTHER_DROID_TYPE ? 'selected' : ''}>${esc(OTHER_DROID_TYPE)}</option>`;
}

// Called by every route that accepts a droid-type field alongside its
// companion "other" text field. If the member picked the Other Build
// fallback and actually named something, that name becomes the real stored
// value AND — if it's genuinely new — gets folded into the shared droid
// type list (case-insensitively de-duplicated) so it shows up as a normal
// dropdown choice for everyone from then on.
// The shared list grows automatically from ordinary member use, so it needs
// a ceiling — otherwise a member could script repeated submissions with a
// unique custom name each time and bloat the KV value read on nearly every
// page load. The custom name is always still used for THIS submission even
// once the list is full; it just stops being folded in for reuse.
const MAX_DROID_TYPES = 200;

async function resolveDroidType(env, submittedType, customType) {
  const custom = String(customType || '').trim().slice(0, 60);
  if (submittedType !== OTHER_DROID_TYPE || custom === '') return submittedType;
  const types = await getDroidTypes(env);
  const alreadyListed = types.some((t) => t.toLowerCase() === custom.toLowerCase());
  if (!alreadyListed && types.length < MAX_DROID_TYPES) {
    types.push(custom);
    await saveDroidTypes(env, types);
  }
  return custom;
}

// Starting build-log posts — only used to seed the "buildlogs" KV key the
// first time the site runs. After that, members add their own posts from
// the Build Logs tab, and admins can edit or remove any post from
// Admin > Build Logs.
const SEED_BUILD_LOGS = [
  { id: 'log-1', author: '[Member Name]', droid: 'BB-8', caption: 'Dome motor finally spins smoothly — took three tries to get the magnet alignment right.' },
  { id: 'log-2', author: '[Member Name]', droid: 'R2 Unit', caption: 'Leg struts primed and ready for paint ahead of next month’s convention.' },
  { id: 'log-3', author: '[Member Name]', droid: 'MSE-6', caption: 'First test drive across the workshop floor — steering needs work but it moves!' },
];

// One-time bootstrap token — used only to create the very first admin
// account. The /members/_setup route refuses to do anything once any admin
// account already exists, so this string being public in the repo is not a
// standing risk; it only ever matters for the single moment before the
// club's first admin has been created.
const SETUP_TOKEN = '9856825dfffddf49fc0139a57840850be646264818193ba5';

const TABS = ['events', 'directory', 'logs', 'gallery', 'droids'];
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
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // 1.5MB — the size a photo must fit once stored
const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024; // hard ceiling on the RAW file a member selects, before any resizing is attempted
const MAX_PHOTO_DIMENSION = 1600; // longest edge, in pixels, once resized
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Cap on a single multi-select Gallery upload. Kept deliberately low —
// resizing an oversized photo runs through a CPU-heavy WASM image library
// (see prepareUploadedPhoto/resizePhotoToFit below), and Cloudflare Workers
// enforce a hard CPU-time budget per request (as little as 10ms on the Free
// plan). A big multi-select of full-resolution phone photos, each needing a
// resize, can add up to more CPU work than a single request is allowed —
// which is exactly what "Error 1102: Worker exceeded resource limits" means.
// A small cap keeps the worst case (every file in the batch oversized) from
// multiplying that cost too far past what a single-photo upload already
// costs.
const MAX_GALLERY_PHOTOS_PER_UPLOAD = 4;

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Used for Admin > Members' "Last Login" column — a plain, unambiguous
// day/month/year + time rather than relying on locale guesses.
function formatDateTime(ms) {
  if (!ms) return 'Never';
  const d = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = MONTH_ABBREVIATIONS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

// Only http(s) links are ever stored/rendered as an event's "more details"
// URL — this is rendered as a real href on the PUBLIC site with no login,
// so a javascript:, data:, or other unexpected scheme is rejected outright
// rather than trusted just because it parses as a URL.
function sanitizeEventUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
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

// Shrinks an oversized photo down to fit MAX_PHOTO_BYTES instead of just
// rejecting it, using @cf-wasm/photon — a WASM image library built to run
// inside Cloudflare Workers directly (no R2 bucket or Cloudflare Images
// product needed, same reasoning as storing photos in KV above). Always
// re-encodes as JPEG, which keeps the output predictable and small
// regardless of the original format.
//
// Loaded with a dynamic import rather than a static one, and every failure
// path returns `skip: true` rather than throwing, so that if this library
// is ever unavailable or a particular file can't be processed for any
// reason, only the upload itself falls back to the old "please use a
// smaller photo" behavior — the rest of the site is never affected.
async function resizePhotoToFit(bytes) {
  let photon;
  try {
    photon = await import('@cf-wasm/photon');
  } catch (err) {
    return { skip: true };
  }
  const { PhotonImage, resize, SamplingFilter } = photon;

  let input;
  try {
    input = PhotonImage.new_from_byteslice(bytes);
  } catch (err) {
    return { error: "That file doesn't look like a valid image." };
  }

  const toFree = [input];
  try {
    let width = input.get_width();
    let height = input.get_height();
    let working = input;

    const longestEdge = Math.max(width, height);
    if (longestEdge > MAX_PHOTO_DIMENSION) {
      const scale = MAX_PHOTO_DIMENSION / longestEdge;
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      working = resize(input, targetWidth, targetHeight, SamplingFilter.Lanczos3);
      toFree.push(working);
      width = targetWidth;
      height = targetHeight;
    }

    // Step quality down first; if a very high-detail photo still won't fit
    // even at low quality, shrink the dimensions further as a last resort.
    let quality = 85;
    let outBytes = working.get_bytes_jpeg(quality);
    while (outBytes.length > MAX_PHOTO_BYTES && quality > 30) {
      quality -= 15;
      outBytes = working.get_bytes_jpeg(quality);
    }
    if (outBytes.length > MAX_PHOTO_BYTES) {
      const smaller = resize(working, Math.max(1, Math.round(width * 0.6)), Math.max(1, Math.round(height * 0.6)), SamplingFilter.Lanczos3);
      toFree.push(smaller);
      outBytes = smaller.get_bytes_jpeg(70);
    }
    if (outBytes.length > MAX_PHOTO_BYTES) {
      return { error: "That photo couldn't be resized to fit — please try a different image." };
    }

    return { bytes: outBytes, contentType: 'image/jpeg' };
  } catch (err) {
    return { error: "That file doesn't look like a valid image." };
  } finally {
    for (const img of toFree) {
      try { img.free(); } catch (err) { /* already freed or never fully created — fine to ignore */ }
    }
  }
}

// Runs a freshly-validated upload through resizePhotoToFit only when it's
// actually needed (already fits? leave it exactly as before). Returns
// either { bytes, contentType } to save, or { errorMessage } to show the
// member instead.
async function prepareUploadedPhoto(bytes, declaredType) {
  if (bytes.length <= MAX_PHOTO_BYTES) {
    return { bytes, contentType: declaredType };
  }
  const processed = await resizePhotoToFit(bytes);
  if (processed.skip) {
    return { errorMessage: 'That photo is too large — please use one under 1.5MB.' };
  }
  if (processed.error) {
    return { errorMessage: processed.error };
  }
  return { bytes: processed.bytes, contentType: processed.contentType };
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

// --- Public gallery -------------------------------------------------------
// Metadata (id/uploader/caption/date) lives in one small "galleryindex" list
// for fast listing; each photo's actual bytes live in their own
// "galleryphoto:<id>" key, same split as profile photos above. Unlike
// profile photos, these are served without requiring a session — the
// public Gallery page reads them directly.

async function getGalleryIndex(env) {
  const raw = await env.DATA.get('galleryindex');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveGalleryIndex(env, items) {
  await env.DATA.put('galleryindex', JSON.stringify(items));
}

async function saveGalleryPhotoBlob(env, id, contentType, base64Data) {
  await env.DATA.put(`galleryphoto:${id}`, JSON.stringify({ contentType, data: base64Data }));
}

async function getGalleryPhotoBlob(env, id) {
  const raw = await env.DATA.get(`galleryphoto:${id}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function deleteGalleryPhotoBlob(env, id) {
  await env.DATA.delete(`galleryphoto:${id}`);
}

// --- Droid showcase (members add, admin moderates) -----------------------
// Photos of members' own droids for the public homepage's "Our Droids"
// section — same index-plus-blob split as gallery photos, and also served
// without a session, since the public homepage reads them directly.

async function getDroidShowcase(env) {
  const raw = await env.DATA.get('droidshowcaseindex');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveDroidShowcase(env, items) {
  await env.DATA.put('droidshowcaseindex', JSON.stringify(items));
}

async function saveDroidShowcasePhoto(env, id, contentType, base64Data) {
  await env.DATA.put(`droidshowcasephoto:${id}`, JSON.stringify({ contentType, data: base64Data }));
}

async function getDroidShowcasePhoto(env, id) {
  const raw = await env.DATA.get(`droidshowcasephoto:${id}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function deleteDroidShowcasePhoto(env, id) {
  await env.DATA.delete(`droidshowcasephoto:${id}`);
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

// Events any member has proposed, awaiting an admin's approve/reject —
// kept entirely separate from the live "events" list so a submission never
// shows up for RSVP or on anyone's calendar until an admin has looked at it.
async function getPendingEvents(env) {
  const raw = await env.DATA.get('pendingEvents');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function savePendingEvents(env, pendingEvents) {
  await env.DATA.put('pendingEvents', JSON.stringify(pendingEvents));
}

const MONTH_ABBREVIATIONS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Events are entered through native <input type="date"> pickers (see
// eventFormFields below) but stored the same way they always were — a
// separate day/month/year, with month as a 3-letter abbreviation — so the
// rest of the app (display, RSVP, admin table) never had to change shape.

// 'YYYY-MM-DD' (what a date input submits) -> { year, month, day }, or null
// if it isn't a well-formed date.
function isoDateToDayMonthYear(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  const dayNum = parseInt(m[3], 10);
  if (!dayNum || dayNum < 1 || dayNum > 31) return null;
  return { year: m[1], month: MONTH_ABBREVIATIONS[monthIdx], day: String(dayNum).padStart(2, '0') };
}

// The reverse — day/month-abbreviation/year -> 'YYYY-MM-DD' for pre-filling
// a date input, or '' if any part can't be resolved (e.g. a day range like
// "26–27", or an older event saved before the year field existed).
function dayMonthYearToIso(day, monthAbbr, year) {
  const monthIdx = MONTH_ABBREVIATIONS.indexOf(String(monthAbbr || '').toUpperCase());
  const dayNum = parseInt(String(day || '').replace(/[^0-9]/g, ''), 10);
  if (monthIdx === -1 || !/^\d{4}$/.test(String(year || '')) || !dayNum || dayNum < 1 || dayNum > 31) return '';
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

// Best-effort values to pre-fill the two date pickers when editing an
// existing event. A day range like "26–27" splits into start/end pickers
// on the same month/year; anything that can't be parsed (no year on
// record, an unrecognised month, etc.) is left blank rather than guessed —
// the admin just picks fresh dates for that one event when they edit it.
function eventDateInputValues(e) {
  const dayStr = String(e.day || '');
  const rangeMatch = dayStr.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (rangeMatch) {
    return {
      start: dayMonthYearToIso(rangeMatch[1], e.month, e.year),
      end: dayMonthYearToIso(rangeMatch[2], e.month, e.year),
    };
  }
  return { start: dayMonthYearToIso(dayStr, e.month, e.year), end: '' };
}

// Turns the two submitted date-picker fields into { year, month, day, daySmall }
// (or { error } if the required start date is missing/invalid). If an end date
// is given, the two are swapped first if submitted backwards, and the day
// becomes a "DD–DD" range — same one-month assumption the old free-text "26–27"
// entry already made, so this isn't a new limitation, just an automated version
// of it. An end date in a different month/year from the start is unusual for
// this club's events; only the start month/year is used in that case.
function computeEventDateFields(form) {
  let dateStart = String(form.get('date_start') || '').trim();
  let dateEnd = String(form.get('date_end') || '').trim();
  if (dateEnd && dateEnd < dateStart) {
    const tmp = dateStart; dateStart = dateEnd; dateEnd = tmp;
  }
  const start = isoDateToDayMonthYear(dateStart);
  if (!start) return { error: 'Please pick a valid event date.' };
  if (dateEnd && dateEnd !== dateStart) {
    const end = isoDateToDayMonthYear(dateEnd);
    if (end) {
      return { year: start.year, month: start.month, day: `${start.day}–${end.day}`, daySmall: true };
    }
  }
  return { year: start.year, month: start.month, day: start.day, daySmall: false };
}

// Used to decide which events are still worth showing on the public Events
// page — a multi-day event (day stored as "26–27") stays listed until its
// LAST day has passed, not its first. If an event's date can't be resolved
// to a real ISO date at all (typically an older event saved before the year
// field existed), it's treated as still upcoming rather than silently
// dropped — better to show a stale-looking event than to hide a real one.
function eventIsUpcoming(e, todayIso) {
  const dayStr = String(e.day || '');
  const rangeMatch = dayStr.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  const lastDay = rangeMatch ? rangeMatch[2] : dayStr;
  const iso = dayMonthYearToIso(lastDay, e.month, e.year);
  if (!iso) return true;
  return iso >= todayIso;
}

// Sort key for the public events list — the FIRST day of the event, so
// multi-day events sort by when they start. Unresolvable dates sort last
// (after everything with a real date) rather than jumping to the front.
function eventSortIso(e) {
  const dayStr = String(e.day || '');
  const rangeMatch = dayStr.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  const firstDay = rangeMatch ? rangeMatch[1] : dayStr;
  return dayMonthYearToIso(firstDay, e.month, e.year) || '9999-99-99';
}

// Short "Title — 12 SEP 2026" label used for the event picker on the
// Gallery upload form, and options for that dropdown (most recent first,
// plus a "General Photos" choice for anything not tied to a specific event).
function eventLabel(ev) {
  const dateParts = [ev.day, ev.month, ev.year].filter(Boolean).join(' ');
  return dateParts ? `${ev.title} — ${dateParts}` : ev.title;
}

function eventPickerOptions(events, selectedEventId) {
  const sorted = [...events].sort((a, b) => (eventSortIso(b) < eventSortIso(a) ? -1 : eventSortIso(b) > eventSortIso(a) ? 1 : 0));
  const generalSelected = !selectedEventId ? ' selected' : '';
  const eventOptions = sorted.map((ev) => `<option value="${esc(ev.id)}" ${selectedEventId === ev.id ? 'selected' : ''}>${esc(eventLabel(ev))}</option>`).join('');
  return `<option value=""${generalSelected}>General Photos (not tied to an event)</option>` + eventOptions;
}

// Groups gallery items into per-event "boxes", most-recent-event first,
// with a trailing General group for anything not tied to an event (or
// tied to one that's since been deleted). Shared by the public /api/gallery
// endpoint (which additionally drops private-event groups — see the
// excludePrivate option) and the members-area Gallery tab, which shows
// every event including private ones, since members can see those anyway.
// Returns an array of { event: <event object, or null for General>, photos }.
function groupGalleryItemsByEvent(galleryItems, events, { excludePrivate = false } = {}) {
  const eventById = new Map((events || []).map((ev) => [ev.id, ev]));
  const generalPhotos = [];
  const photosByEventId = new Map();

  for (const g of galleryItems) {
    const linkedEvent = g.eventId ? eventById.get(g.eventId) : null;
    if (excludePrivate && g.eventId && linkedEvent && linkedEvent.isPrivate) continue;
    if (!g.eventId || !linkedEvent) {
      generalPhotos.push(g);
      continue;
    }
    if (!photosByEventId.has(g.eventId)) photosByEventId.set(g.eventId, []);
    photosByEventId.get(g.eventId).push(g);
  }

  const eventGroups = [...photosByEventId.entries()]
    .map(([eventId, photos]) => ({ event: eventById.get(eventId), photos }))
    .sort((a, b) => (eventSortIso(b.event) < eventSortIso(a.event) ? -1 : eventSortIso(b.event) > eventSortIso(a.event) ? 1 : 0));

  const groups = [...eventGroups];
  if (generalPhotos.length > 0) {
    groups.push({ event: null, photos: generalPhotos });
  }
  return groups;
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

// --- Build logs (members add, admin edits/removes) -----------------------

async function getBuildLogs(env) {
  const raw = await env.DATA.get('buildlogs');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to reseed */ }
  }
  await env.DATA.put('buildlogs', JSON.stringify(SEED_BUILD_LOGS));
  return SEED_BUILD_LOGS;
}

async function saveBuildLogs(env, logs) {
  await env.DATA.put('buildlogs', JSON.stringify(logs));
}

// A build log post's optional photo lives under its own key, same
// index-plus-blob split as gallery photos — but these stay members-only
// (served through a session-gated route below), same as profile photos.
async function saveBuildLogPhoto(env, logId, contentType, base64Data) {
  await env.DATA.put(`buildlogphoto:${logId}`, JSON.stringify({ contentType, data: base64Data }));
}

async function getBuildLogPhoto(env, logId) {
  const raw = await env.DATA.get(`buildlogphoto:${logId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function deleteBuildLogPhoto(env, logId) {
  await env.DATA.delete(`buildlogphoto:${logId}`);
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

// Crop/rotate photo editor — loaded only on Members Area pages that have a
// photo upload field (dashboard tabs + My Account), never on the public
// pages, which is why this is kept separate from the shared HEAD constant
// above. Pinned to a specific, well-established version of Cropper.js
// (the classic imperative API, not the newer Web Components rewrite) from
// cdnjs. If this CDN script ever fails to load — network hiccup, CDN
// outage — window.Cropper simply stays undefined and every photo input
// below quietly falls back to a plain, un-cropped upload; nothing about
// the existing upload flow depends on this library being present.
const PHOTO_EDITOR_HEAD = `
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js"></script>`;

// One shared modal, wired generically to every input[type=file][data-photo-editor]
// on the page — added once per page (see dashboardHTML / changePasswordHTML)
// rather than once per form, since a member only ever has one file picker
// open at a time.
function photoEditorMarkup() {
  return `
<div class="photo-editor-overlay" id="photoEditorOverlay" hidden>
  <div class="photo-editor-box">
    <h1 style="font-size:16px; text-align:left; margin:0;">Crop &amp; Rotate</h1>
    <div class="photo-editor-image-wrap"><img id="photoEditorImage" alt=""></div>
    <div class="photo-editor-controls">
      <button type="button" class="btn-small" id="photoEditorRotateLeft">&#8634; Rotate Left</button>
      <button type="button" class="btn-small" id="photoEditorRotateRight">&#8635; Rotate Right</button>
      <span style="flex:1;"></span>
      <button type="button" class="btn-small" id="photoEditorCancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="photoEditorApply">Use This Photo</button>
    </div>
  </div>
</div>
<script>
(function () {
  // No Cropper on window means the CDN script didn't load — every photo
  // input just behaves as a plain <input type="file"> with no editor step.
  if (!window.Cropper) return;
  var overlay = document.getElementById('photoEditorOverlay');
  var img = document.getElementById('photoEditorImage');
  var rotateLeftBtn = document.getElementById('photoEditorRotateLeft');
  var rotateRightBtn = document.getElementById('photoEditorRotateRight');
  var cancelBtn = document.getElementById('photoEditorCancel');
  var applyBtn = document.getElementById('photoEditorApply');
  var inputs = document.querySelectorAll('input[type="file"][data-photo-editor]');
  if (!overlay || !img || inputs.length === 0) return;

  var cropper = null;
  var activeInput = null;

  function extensionFor(type) {
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    return 'jpg';
  }

  function closeEditor(clearInput) {
    if (cropper) { cropper.destroy(); cropper = null; }
    overlay.hidden = true;
    img.removeAttribute('src');
    if (clearInput && activeInput) activeInput.value = '';
    activeInput = null;
  }

  function openEditor(input, file) {
    activeInput = input;
    var reader = new FileReader();
    reader.onload = function (e) {
      img.src = e.target.result;
      overlay.hidden = false;
      if (cropper) cropper.destroy();
      cropper = new Cropper(img, {
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 1,
        background: false,
        responsive: true,
      });
    };
    reader.readAsDataURL(file);
  }

  inputs.forEach(function (input) {
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file || !/^image\\//.test(file.type)) return;
      // A multi-select input (Gallery's "Photo(s)" field) only gets the
      // crop/rotate step when exactly one file was chosen — cropping only
      // ever touches files[0], so opening it on a genuine multi-file batch
      // would silently discard every other selected photo. Picking just one
      // file still gets the full crop/rotate treatment either way.
      if (input.files.length > 1) return;
      openEditor(input, file);
    });
  });

  if (rotateLeftBtn) rotateLeftBtn.addEventListener('click', function () { if (cropper) cropper.rotate(-90); });
  if (rotateRightBtn) rotateRightBtn.addEventListener('click', function () { if (cropper) cropper.rotate(90); });
  if (cancelBtn) cancelBtn.addEventListener('click', function () { closeEditor(true); });

  if (applyBtn) applyBtn.addEventListener('click', function () {
    if (!cropper || !activeInput) { closeEditor(false); return; }
    var input = activeInput;
    var originalFile = input.files && input.files[0];
    var preferredType = (originalFile && originalFile.type) || 'image/jpeg';
    cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' }).toBlob(function (blob) {
      if (blob) {
        // Use the blob's own type, not the original file's — if the browser
        // can't encode the original format it silently falls back (usually
        // to PNG), and the server's magic-byte check needs the two to match.
        var actualType = blob.type || preferredType;
        var ext = extensionFor(actualType);
        var baseName = (originalFile && originalFile.name ? originalFile.name.replace(/\\.[^.]+$/, '') : 'photo');
        var newFile = new File([blob], baseName + '.' + ext, { type: actualType });
        var dt = new DataTransfer();
        dt.items.add(newFile);
        input.files = dt.files;
      }
      closeEditor(false);
    }, preferredType, 0.92);
  });
})();
</script>`;
}

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

function eventsTabHTML(events, rsvps, addedDroids, openEventId, error, notice, droidTypes) {
  const list = events.length === 0
    ? `<p class="sub">No events on the calendar right now — an admin can add one, or suggest one yourself with the form on the right.</p>`
    : events.map((ev) => {
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
            ${ev.year ? `<div class="year">${esc(ev.year)}</div>` : ''}
          </div>
          <div class="event-info">
            <div class="title">${esc(ev.title)}${ev.isPrivate ? ' <span class="badge-private">Private</span>' : ''}</div>
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
              <div><div class="label">Start Time</div><div class="value">${esc(ev.startTime || 'TBC')}</div></div>
              <div><div class="label">Access Time</div><div class="value">${esc(ev.accessTime || 'TBC')}</div></div>
              <div><div class="label">Organiser</div><div class="value">${esc(ev.organiser || 'TBC')}</div></div>
              <div><div class="label">Parking</div><div class="value">${esc(ev.parking)}</div></div>
              <div><div class="label">Floor Area</div><div class="value">${esc(ev.floorArea)}</div></div>
              <div><div class="label">Accommodation</div><div class="value">${esc(ev.accommodation)}</div></div>
              <div><div class="label">Fuel</div><div class="value">${esc(ev.fuel)}</div></div>
            </div>

            ${ev.url ? `
            <p style="margin:0 0 18px;"><a href="${esc(ev.url)}" target="_blank" rel="noopener noreferrer" class="btn-small">Event Website &rarr;</a></p>` : ''}

            ${ev.description ? `
            <div class="event-description">
              <div class="droid-list-label">Description &amp; Other Info</div>
              <p>${esc(ev.description)}</p>
            </div>` : ''}

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
                  ${droidTypeOptions(droidTypes, '')}
                </select>
                <button type="submit">Add</button>
              </div>
              <textarea name="other_droid" rows="1" placeholder="If you picked &quot;Other Build&quot; above, name your droid here"></textarea>
            </form>
          </div>
        </details>
      </div>`;
  }).join('');

  return `
    <div class="split-layout">
      <div class="split-main">${list}</div>
      <aside class="split-sidebar">
        <div class="login-card" style="max-width:none; margin:0;">
          <h1 style="font-size:16px; text-align:left;">Suggest an Event</h1>
          ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
          ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}
          <form method="post" action="/members/events/submit?tab=events">
            <div class="field">
              <label for="sub_title">Event Title</label>
              <input type="text" id="sub_title" name="title" required>
            </div>
            <div class="field">
              <label for="sub_date_start">Event Date</label>
              <input type="date" id="sub_date_start" name="date_start" min="2000-01-01" required>
            </div>
            <div class="field">
              <label for="sub_date_end">End Date <span style="font-weight:400;">(optional)</span></label>
              <input type="date" id="sub_date_end" name="date_end" min="2000-01-01">
            </div>
            <div class="field">
              <label for="sub_location">Location</label>
              <input type="text" id="sub_location" name="location" required>
            </div>
            <div class="field">
              <label for="sub_url">Event Website <span style="font-weight:400;">(optional)</span></label>
              <input type="url" id="sub_url" name="url" placeholder="https://example.com/the-event">
            </div>
            <div class="field">
              <label for="sub_organiser">Organiser</label>
              <input type="text" id="sub_organiser" name="organiser" placeholder="e.g. Jane Smith">
            </div>
            <div class="field">
              <label for="sub_description">Description &amp; Other Info</label>
              <textarea id="sub_description" name="description" rows="3" placeholder="Anything else admins/members should know."></textarea>
            </div>
            <button type="submit" class="btn btn-primary">Submit for Approval</button>
          </form>
          <p style="font-size:12px; color:var(--muted); margin:12px 0 0;">Submitted for an admin's review — it won't show up on the calendar until it's approved.</p>
        </div>
      </aside>
    </div>`;
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

function logsTabHTML(buildLogs, currentUser, error, notice, editId, droidTypes) {
  // Members can edit only their OWN posts (ownerId, not the display-name
  // author field — an admin can rename a member later). Legacy posts from
  // before ownerId existed have none, so they simply have no Edit link;
  // an admin can still fix those up from Admin > Build Logs.
  const editingItem = editId ? buildLogs.find((p) => p.id === editId && p.ownerId === currentUser.id) : null;

  const posts = buildLogs.length === 0
    ? `<p class="sub">No build log posts yet — be the first to share progress with the form on the right.</p>`
    : `<div class="buildlog-grid">${buildLogs.map((p) => `
      <div class="buildlog-card">
        <div class="thumb">${p.hasPhoto ? `<img src="/members/buildlog-photo/${esc(p.id)}?v=${esc(p.photoUpdatedAt || 0)}" alt="${esc(p.caption)}">` : 'PHOTO'}</div>
        <div class="body">
          <div class="who">${esc(p.author)} &middot; ${esc(p.droid)}</div>
          <div class="caption">${esc(p.caption)}</div>
          ${p.ownerId === currentUser.id ? `<div style="margin-top:8px;"><a class="btn-small" href="/members/dashboard?tab=logs&edit=${encodeURIComponent(p.id)}">Edit</a></div>` : ''}
        </div>
      </div>`).join('')}</div>`;

  const formTitle = editingItem ? 'Edit Your Update' : 'Share a Build Update';
  const formAction = editingItem ? '/members/logs/update' : '/members/add-buildlog?tab=logs';
  const submitLabel = editingItem ? 'Save Changes' : 'Post Update';

  return `
    <div class="split-layout">
      <div class="split-main">${posts}</div>
      <aside class="split-sidebar">
        <div class="login-card" style="max-width:none; margin:0;">
          <h1 style="font-size:16px; text-align:left;">${formTitle}</h1>
          ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
          ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}
          <form method="post" action="${formAction}" enctype="multipart/form-data">
            ${editingItem ? `<input type="hidden" name="log_id" value="${esc(editingItem.id)}">` : ''}
            <div class="field">
              <label for="log_droid">Droid</label>
              <select id="log_droid" name="droid" required>
                ${droidTypeOptions(droidTypes, editingItem ? editingItem.droid : '')}
              </select>
            </div>
            <div class="field">
              <label for="log_other_droid">If you picked &quot;Other Build&quot; above <span style="font-weight:400; text-transform:none; letter-spacing:0;">(name it here)</span></label>
              <input type="text" id="log_other_droid" name="other_droid" maxlength="60" placeholder="e.g. Frankenbuild Astromech">
            </div>
            <div class="field">
              <label for="log_caption">What's new?</label>
              <textarea id="log_caption" name="caption" rows="3" required placeholder="e.g. Dome motor finally spins smoothly...">${editingItem ? esc(editingItem.caption) : ''}</textarea>
            </div>
            <div class="field">
              <label for="log_photo">Photo ${editingItem ? '<span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional — leave blank to keep the current photo)</span>' : '(optional)'}</label>
              <input type="file" id="log_photo" name="photo" accept="image/jpeg,image/png,image/webp" data-photo-editor>
            </div>
            <button type="submit" class="btn btn-primary">${submitLabel}</button>
            ${editingItem ? `<a href="/members/dashboard?tab=logs" class="btn-small" style="margin-left:10px;">Cancel</a>` : ''}
          </form>
          <p style="font-size:12px; color:var(--muted); margin:12px 0 0;">Posts as ${esc(currentUser.name)}. Photos are only ever shown here in the Members Area, never on the public site. You can edit your own posts any time — an admin can also edit or remove posts from Admin &gt; Build Logs.</p>
        </div>
      </aside>
    </div>`;
}

function galleryTabHTML(galleryItems, currentUser, error, notice, editId, events) {
  // Same owner-only edit rule as build logs above.
  const editingItem = editId ? galleryItems.find((g) => g.id === editId && g.ownerId === currentUser.id) : null;

  // Same per-event "boxes" the public Gallery page uses, so members see
  // their photos organised the same way visitors do — except every event
  // is shown here, private ones included, since members can already see
  // those on their Events tab.
  const photoCard = (g) => `
      <div class="card">
        <div class="thumb"><img src="/public/gallery-photo/${esc(g.id)}" alt="${esc(g.caption || g.uploaderName)}"></div>
        <div class="caption">${g.caption ? `${esc(g.caption)} &middot; ` : ''}${esc(g.uploaderName)}${g.ownerId === currentUser.id ? ` &middot; <a href="/members/dashboard?tab=gallery&edit=${encodeURIComponent(g.id)}">Edit</a>` : ''}</div>
      </div>`;

  const photos = galleryItems.length === 0
    ? `<p class="sub">No photos yet — be the first to share one with the form on the right.</p>`
    : groupGalleryItemsByEvent(galleryItems, events).map(({ event, photos: groupPhotos }) => {
      const heading = event
        ? `<div class="gallery-event-heading"><h2>${esc(event.title)}${event.isPrivate ? ' <span class="badge-private">Private</span>' : ''}</h2>${[event.day, event.month, event.year].filter(Boolean).join(' ') ? `<div class="date">${esc([event.day, event.month, event.year].filter(Boolean).join(' '))}</div>` : ''}</div>`
        : `<div class="gallery-event-heading"><h2>General Photos</h2></div>`;
      return `<section class="gallery-event-group">${heading}<div class="gallery-grid">${groupPhotos.map(photoCard).join('')}</div></section>`;
    }).join('');

  const formTitle = editingItem ? 'Edit Your Photo' : 'Add Photos';
  const formAction = editingItem ? '/members/gallery/update' : '/members/gallery/upload';
  const submitLabel = editingItem ? 'Save Changes' : 'Upload';
  // Editing always replaces exactly one photo (its own crop/rotate-capable
  // single-file input). Adding is a multi-select, but still carries
  // data-photo-editor too — the shared editor script (see
  // PHOTO_EDITOR_HEAD's comment) only actually opens it when exactly one
  // file was chosen, so picking a single photo here still gets crop/rotate,
  // while picking several skips straight to a plain multi-file upload.
  const photoField = editingItem
    ? `<input type="file" id="gallery_photo" name="photo" accept="image/jpeg,image/png,image/webp" data-photo-editor>`
    : `<input type="file" id="gallery_photo" name="photos" accept="image/jpeg,image/png,image/webp" multiple required data-photo-editor>`;

  return `
    <div class="split-layout">
      <div class="split-main">${photos}</div>
      <aside class="split-sidebar">
        <div class="login-card" style="max-width:none; margin:0;">
          <h1 style="font-size:16px; text-align:left;">${formTitle}</h1>
          ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
          ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}
          <form method="post" action="${formAction}" enctype="multipart/form-data">
            ${editingItem ? `<input type="hidden" name="photo_id" value="${esc(editingItem.id)}">` : ''}
            <div class="field">
              <label for="gallery_photo">${editingItem ? 'Photo <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional — leave blank to keep the current photo)</span>' : 'Photo(s) <span style="font-weight:400; text-transform:none; letter-spacing:0;">(pick one to crop/rotate it first, or select several to upload them together)</span>'}</label>
              ${photoField}
            </div>
            <div class="field">
              <label for="gallery_event">Event <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional — groups it on the public Gallery page)</span></label>
              <select id="gallery_event" name="event_id">
                ${eventPickerOptions(events || [], editingItem ? (editingItem.eventId || '') : '')}
              </select>
            </div>
            <div class="field">
              <label for="gallery_caption">Caption ${editingItem ? '' : '<span style="font-weight:400; text-transform:none; letter-spacing:0;">(applied to every photo in this upload)</span>'}</label>
              <input type="text" id="gallery_caption" name="caption" maxlength="140" placeholder="e.g. Nor-Con 2026 stall" value="${editingItem ? esc(editingItem.caption || '') : ''}">
            </div>
            <button type="submit" class="btn btn-primary">${submitLabel}</button>
            ${editingItem ? `<a href="/members/dashboard?tab=gallery" class="btn-small" style="margin-left:10px;">Cancel</a>` : ''}
          </form>
          <p style="font-size:12px; color:var(--muted); margin:12px 0 0;">JPEG, PNG or WEBP, up to 1.5MB each (up to ${MAX_GALLERY_PHOTOS_PER_UPLOAD} at once). Shown on the public Gallery page for everyone to see. You can edit your own photos any time — an admin can remove any photo from Admin &gt; Gallery.</p>
        </div>
      </aside>
    </div>`;
}

function droidsTabHTML(droidShowcase, currentUser, error, notice, editId, droidTypes) {
  // Same owner-only edit rule as build logs / gallery above.
  const editingItem = editId ? droidShowcase.find((d) => d.id === editId && d.ownerId === currentUser.id) : null;

  const cards = droidShowcase.length === 0
    ? `<p class="sub">No droid photos yet — be the first to add yours with the form on the right.</p>`
    : `<div class="card-grid">${droidShowcase.map((d) => `
      <div class="card">
        <div class="thumb"><img src="/public/droid-photo/${esc(d.id)}" alt="${esc(d.droidName || d.droidType)}"></div>
        <div class="body">
          <h4>${esc(d.droidName || d.droidType)}</h4>
          <p>${d.droidName ? `${esc(d.droidType)} &middot; ` : ''}Built by ${esc(d.builderName)}${d.caption ? ` &mdash; ${esc(d.caption)}` : ''}</p>
          ${d.ownerId === currentUser.id ? `<p style="margin-top:6px;"><a class="btn-small" href="/members/dashboard?tab=droids&edit=${encodeURIComponent(d.id)}">Edit</a></p>` : ''}
        </div>
      </div>`).join('')}</div>`;

  const formTitle = editingItem ? 'Edit Your Droid' : 'Add Your Droid';
  const formAction = editingItem ? '/members/droids/update' : '/members/droids/upload';
  const submitLabel = editingItem ? 'Save Changes' : 'Add Photo';

  return `
    <div class="split-layout">
      <div class="split-main">${cards}</div>
      <aside class="split-sidebar">
        <div class="login-card" style="max-width:none; margin:0;">
          <h1 style="font-size:16px; text-align:left;">${formTitle}</h1>
          ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
          ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}
          <form method="post" action="${formAction}" enctype="multipart/form-data">
            ${editingItem ? `<input type="hidden" name="droid_id" value="${esc(editingItem.id)}">` : ''}
            <div class="field">
              <label for="droid_type">Droid Type</label>
              <select id="droid_type" name="droid_type" required>
                ${droidTypeOptions(droidTypes, editingItem ? editingItem.droidType : '')}
              </select>
            </div>
            <div class="field">
              <label for="droid_other_type">If you picked &quot;Other Build&quot; above <span style="font-weight:400; text-transform:none; letter-spacing:0;">(name the type here)</span></label>
              <input type="text" id="droid_other_type" name="other_droid_type" maxlength="60" placeholder="e.g. Frankenbuild Astromech">
            </div>
            <div class="field">
              <label for="droid_name">Droid Name <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional)</span></label>
              <input type="text" id="droid_name" name="droid_name" maxlength="60" placeholder="e.g. R5-D3" value="${editingItem ? esc(editingItem.droidName || '') : ''}">
            </div>
            <div class="field">
              <label for="droid_photo">Photo ${editingItem ? '<span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional — leave blank to keep the current photo)</span>' : ''}</label>
              <input type="file" id="droid_photo" name="photo" accept="image/jpeg,image/png,image/webp" data-photo-editor ${editingItem ? '' : 'required'}>
            </div>
            <div class="field">
              <label for="droid_caption">Caption <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional)</span></label>
              <input type="text" id="droid_caption" name="caption" maxlength="140" placeholder="e.g. Fully driven, working periscope" value="${editingItem ? esc(editingItem.caption || '') : ''}">
            </div>
            <button type="submit" class="btn btn-primary">${submitLabel}</button>
            ${editingItem ? `<a href="/members/dashboard?tab=droids" class="btn-small" style="margin-left:10px;">Cancel</a>` : ''}
          </form>
          <p style="font-size:12px; color:var(--muted); margin:12px 0 0;">JPEG, PNG or WEBP, up to 1.5MB. Shown in the "Our Droids" section on the public homepage for everyone to see. You can edit your own entry any time — an admin can remove photos from Admin &gt; Droids.</p>
        </div>
      </aside>
    </div>`;
}

function dashNav(active, currentUser) {
  return `
<div class="dash-nav">
  <div class="brand"><img src="/img/logo-nav.png" alt="Norwich Droids logo"><div class="label">MEMBERS AREA</div></div>
  <div class="links">
    <a href="/members/dashboard?tab=events" class="${active === 'events' ? 'active' : ''}">Events</a>
    <a href="/members/dashboard?tab=directory" class="${active === 'directory' ? 'active' : ''}">Directory</a>
    <a href="/members/dashboard?tab=logs" class="${active === 'logs' ? 'active' : ''}">Build Logs</a>
    <a href="/members/dashboard?tab=gallery" class="${active === 'gallery' ? 'active' : ''}">Gallery</a>
    <a href="/members/dashboard?tab=droids" class="${active === 'droids' ? 'active' : ''}">Our Droids</a>
    ${currentUser.role === 'admin' ? `<a href="/members/admin" class="${active === 'admin' ? 'active' : ''}">Admin</a>` : ''}
    <a href="/members/change-password" class="${active === 'change-password' ? 'active' : ''}">My Account</a>
    <a class="view-public" href="/">View public site</a>
    <a class="logout" href="/members/logout">Log Out</a>
  </div>
</div>`;
}

function dashboardHTML({ tab, openEventId, editId, events, rsvps, addedDroids, users, buildLogs, logError, logNotice, galleryItems, galleryError, galleryNotice, droidShowcase, droidsError, droidsNotice, eventsError, eventsNotice, currentUser, droidTypes }) {
  const content = tab === 'events' ? eventsTabHTML(events, rsvps, addedDroids, openEventId, eventsError, eventsNotice, droidTypes || [])
    : tab === 'directory' ? directoryTabHTML(users)
    : tab === 'gallery' ? galleryTabHTML(galleryItems, currentUser, galleryError, galleryNotice, editId, events)
    : tab === 'droids' ? droidsTabHTML(droidShowcase || [], currentUser, droidsError, droidsNotice, editId, droidTypes || [])
    : logsTabHTML(buildLogs, currentUser, logError, logNotice, editId, droidTypes || []);

  return `<!doctype html>
<html lang="en"><head>${HEAD}${PHOTO_EDITOR_HEAD}<title>Members Dashboard — Norwich Droids</title></head>
<body>
${dashNav(tab, currentUser)}
<div class="dash-main">
  <h1>Welcome back, ${esc(currentUser.name.split(' ')[0] || currentUser.name)}.</h1>
  <p class="sub">Here's what's coming up for members.</p>
  ${content}
</div>
${photoEditorMarkup()}
</body></html>`;
}

function changePasswordHTML(currentUser, state = {}) {
  const { pwError, pwSuccess, photoError, photoSuccess, bioError, bioSuccess, nicknameError, nicknameSuccess } = state;
  return `<!doctype html>
<html lang="en"><head>${HEAD}${PHOTO_EDITOR_HEAD}<title>My Account — Norwich Droids</title></head>
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
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" data-photo-editor required>
          <button type="submit" class="btn-small" style="margin-top:8px;">Upload Photo</button>
        </form>
        ${currentUser.hasPhoto ? `
        <form method="post" action="/members/account/photo/remove" style="margin-top:8px;">
          <button type="submit" class="btn-small btn-danger">Remove Photo</button>
        </form>` : ''}
      </div>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin:14px 0 0;">JPEG, PNG or WEBP, up to 1.5MB. Shown to other logged-in members in the Directory, and on the PUBLIC About page's "Meet the Members" section alongside your name.</p>
  </div>

  <div class="login-card" style="max-width:420px; margin:0 0 28px;">
    <h1 style="font-size:16px; text-align:left;">Nickname</h1>
    ${nicknameError ? `<div class="login-error">${esc(nicknameError)}</div>` : ''}
    ${nicknameSuccess ? `<div class="admin-success">${esc(nicknameSuccess)}</div>` : ''}
    <form method="post" action="/members/account/nickname">
      <div class="field">
        <label for="nickname">What we call you</label>
        <input type="text" id="nickname" name="nickname" maxlength="40" value="${esc(currentUser.nickname || '')}" placeholder="e.g. Chewy">
      </div>
      <button type="submit" class="btn btn-primary">Save Nickname</button>
    </form>
    <p style="font-size:12.5px; color:var(--muted); margin:14px 0 0;">Shown alongside your name on the public About page's Meet the Members section, once you've saved one. Leave it blank to not show one.</p>
  </div>

  <div class="login-card" style="max-width:420px; margin:0 0 28px;">
    <h1 style="font-size:16px; text-align:left;">About You</h1>
    ${bioError ? `<div class="login-error">${esc(bioError)}</div>` : ''}
    ${bioSuccess ? `<div class="admin-success">${esc(bioSuccess)}</div>` : ''}
    <form method="post" action="/members/account/bio">
      <div class="field">
        <label for="bio">A few words for the public About page</label>
        <textarea id="bio" name="bio" rows="4" maxlength="500" placeholder="e.g. Building a background astromech, always happy to talk dome mechanisms.">${esc(currentUser.bio || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">Save Description</button>
    </form>
    <p style="font-size:12.5px; color:var(--muted); margin:14px 0 0;">Shown on the public About page alongside your name and droid, once you've saved one. Leave it blank to not show a description.</p>
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
${photoEditorMarkup()}
</body></html>`;
}

function adminSubNav(active) {
  return `
  <div class="admin-subnav">
    <a href="/members/admin" class="${active === 'members' ? 'active' : ''}">Members</a>
    <a href="/members/admin/events" class="${active === 'events' ? 'active' : ''}">Events</a>
    <a href="/members/admin/logs" class="${active === 'logs' ? 'active' : ''}">Build Logs</a>
    <a href="/members/admin/gallery" class="${active === 'gallery' ? 'active' : ''}">Gallery</a>
    <a href="/members/admin/droids" class="${active === 'droids' ? 'active' : ''}">Droids</a>
  </div>`;
}

function adminPageHTML({ currentUser, users, error, notice, generated, editingUser = null }) {
  const rows = users.map((u) => `
    <tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.droid || '—')}</td>
      <td>${u.role === 'admin' ? '<span class="role-badge">Admin</span>' : 'Member'}</td>
      <td>${esc(formatDateTime(u.lastLoginAt))}</td>
      <td class="admin-actions">
        <a class="btn-small" href="/members/admin?edit=${encodeURIComponent(u.id)}">Edit</a>
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
    <h1 style="font-size:16px; text-align:left;">${editingUser ? `Edit ${esc(editingUser.name)}` : 'Add a Member'}</h1>
    <form method="post" action="${editingUser ? '/members/admin/update' : '/members/admin/add'}">
      ${editingUser ? `<input type="hidden" name="user_id" value="${esc(editingUser.id)}">` : ''}
      <div class="field">
        <label for="new_name">Name</label>
        <input type="text" id="new_name" name="name" value="${esc(editingUser ? editingUser.name : '')}" required>
      </div>
      <div class="field">
        <label for="new_email">Email</label>
        <input type="email" id="new_email" name="email" value="${esc(editingUser ? editingUser.email : '')}" required>
      </div>
      <div class="field">
        <label for="new_droid">Droid (optional)</label>
        <input type="text" id="new_droid" name="droid" placeholder="e.g. R2 Unit" value="${esc(editingUser ? (editingUser.droid || '') : '')}">
      </div>
      <button type="submit" class="btn btn-primary">${editingUser ? 'Save Changes' : 'Add Member'}</button>
      ${editingUser ? `<a href="/members/admin" class="btn-small" style="margin-left:10px;">Cancel</a>` : ''}
    </form>
  </div>

  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Name</th><th>Email</th><th>Droid</th><th>Role</th><th>Last Login</th><th>Actions</th></tr></thead>
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
    id: '', day: '', daySmall: false, month: '', year: '', title: '', location: '', url: '',
    startTime: '', accessTime: '', organiser: '', parking: '', floorArea: '', accommodation: '', fuel: '', description: '', baseDroids: [], isPrivate: false,
  };
  const dateValues = eventDateInputValues(e);
  return `
      <div class="field">
        <label for="ev_title">Event Title</label>
        <input type="text" id="ev_title" name="title" value="${esc(e.title)}" required>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="ev_date_start">Event Date <span style="font-weight:400; text-transform:none; letter-spacing:0;">(past dates are fine too — for logging an event you're adding photos of)</span></label>
          <input type="date" id="ev_date_start" name="date_start" min="2000-01-01" value="${esc(dateValues.start)}" required>
        </div>
        <div class="field">
          <label for="ev_date_end">End Date <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional, for multi-day events)</span></label>
          <input type="date" id="ev_date_end" name="date_end" min="2000-01-01" value="${esc(dateValues.end)}">
        </div>
      </div>
      <div class="field">
        <label for="ev_location">Location</label>
        <input type="text" id="ev_location" name="location" value="${esc(e.location)}" required>
      </div>
      <div class="field">
        <label for="ev_url">Event Website <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional — shown as a "More Details" link on the public Events page)</span></label>
        <input type="url" id="ev_url" name="url" value="${esc(e.url || '')}" placeholder="https://example.com/the-event">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="ev_start_time">Start Time</label>
          <input type="text" id="ev_start_time" name="start_time" value="${esc(e.startTime || '')}" placeholder="e.g. 10:00am">
        </div>
        <div class="field">
          <label for="ev_access_time">Access Time</label>
          <input type="text" id="ev_access_time" name="access_time" value="${esc(e.accessTime || '')}" placeholder="e.g. Exhibitors from 8:00am">
        </div>
      </div>
      <div class="field">
        <label for="ev_organiser">Organiser</label>
        <input type="text" id="ev_organiser" name="organiser" value="${esc(e.organiser || '')}" placeholder="e.g. Jane Smith">
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
        <label for="ev_description">Description &amp; Other Info</label>
        <textarea id="ev_description" name="description" rows="4" placeholder="Anything else members should know about this event.">${esc(e.description || '')}</textarea>
      </div>
      <div class="field">
        <label for="ev_fuel">Fuel</label>
        <input type="text" id="ev_fuel" name="fuel" value="${esc(e.fuel)}">
      </div>
      <div class="field">
        <label for="ev_droids">Droids already confirmed &mdash; one per line, as <code>Name | Droid Type</code></label>
        <textarea id="ev_droids" name="base_droids" rows="4" placeholder="Jane Smith | R2 Unit">${esc(formatBaseDroids(e.baseDroids))}</textarea>
      </div>
      <div class="field field-checkbox">
        <label><input type="checkbox" name="is_private" ${e.isPrivate ? 'checked' : ''}> Private event &mdash; hide this from the public Events page (still visible to members here)</label>
      </div>`;
}

function adminEventsHTML({ currentUser, events, pendingEvents, error, notice, editingEvent }) {
  const rows = events.map((ev) => `
    <tr>
      <td>${esc(ev.title)}${ev.isPrivate ? ' <span class="badge-private">Private</span>' : ''}</td>
      <td>${esc(ev.day)} ${esc(ev.month)}${ev.year ? ` ${esc(ev.year)}` : ''}</td>
      <td>${esc(ev.location)}</td>
      <td class="admin-actions">
        <a class="btn-small" href="/members/admin/events?edit=${encodeURIComponent(ev.id)}">Edit</a>
        <form method="post" action="/members/admin/events/delete" onsubmit="return false;" data-event="${esc(ev.title)}">
          <input type="hidden" name="event_id" value="${esc(ev.id)}">
          <button type="submit" class="btn-small btn-danger">Delete</button>
        </form>
      </td>
    </tr>`).join('');

  const pendingRows = (pendingEvents || []).map((p) => `
    <tr>
      <td>${esc(p.title)}</td>
      <td>${esc(p.day)} ${esc(p.month)}${p.year ? ` ${esc(p.year)}` : ''}</td>
      <td>${esc(p.location)}</td>
      <td>${esc(p.submittedBy)}</td>
      <td class="admin-actions">
        <form method="post" action="/members/admin/events/approve">
          <input type="hidden" name="pending_id" value="${esc(p.pendingId)}">
          <button type="submit" class="btn-small btn-primary">Approve</button>
        </form>
        <form method="post" action="/members/admin/events/reject" onsubmit="return false;" data-event="${esc(p.title)}">
          <input type="hidden" name="pending_id" value="${esc(p.pendingId)}">
          <button type="submit" class="btn-small btn-danger">Reject</button>
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

  ${pendingRows ? `
  <div class="admin-table-wrap" style="margin-bottom:32px;">
    <h1 style="font-size:16px; margin-bottom:12px;">Pending Approval</h1>
    <table class="admin-table">
      <thead><tr><th>Title</th><th>Date</th><th>Location</th><th>Submitted By</th><th>Actions</th></tr></thead>
      <tbody>${pendingRows}</tbody>
    </table>
  </div>` : ''}

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
document.querySelectorAll('form[action="/members/admin/events/reject"]').forEach((f) => {
  f.addEventListener('submit', () => {
    if (confirm('Reject the submission \\u201c' + f.dataset.event + '\\u201d? This cannot be undone.')) {
      f.removeAttribute('onsubmit');
      HTMLFormElement.prototype.submit.call(f);
    }
  });
});
</script>
</body></html>`;
}

function adminBuildLogsHTML({ currentUser, buildLogs, error, notice, editingLog, droidTypes }) {
  const rows = buildLogs.map((p) => `
    <tr>
      <td>${p.hasPhoto ? `<div class="thumb" style="width:56px; height:56px; border-radius:4px;"><img src="/members/buildlog-photo/${esc(p.id)}?v=${esc(p.photoUpdatedAt || 0)}" alt=""></div>` : ''}</td>
      <td>${esc(p.author)}</td>
      <td>${esc(p.droid)}</td>
      <td style="white-space:normal; max-width:360px;">${esc(p.caption)}</td>
      <td class="admin-actions">
        <a class="btn-small" href="/members/admin/logs?edit=${encodeURIComponent(p.id)}">Edit</a>
        <form method="post" action="/members/admin/logs/delete" onsubmit="return false;" data-log="${esc(p.author)}">
          <input type="hidden" name="log_id" value="${esc(p.id)}">
          <button type="submit" class="btn-small btn-danger">Delete</button>
        </form>
      </td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Admin · Build Logs — Norwich Droids</title></head>
<body>
${dashNav('admin', currentUser)}
<div class="dash-main">
  <h1>Admin</h1>
  <p class="sub">Edit or remove build log posts. Members add their own from the Build Logs tab.</p>
  ${adminSubNav('logs')}

  ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
  ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}

  ${editingLog ? `
  <div class="login-card" style="max-width:520px; margin:0 0 40px;">
    <h1 style="font-size:16px; text-align:left;">Edit Post</h1>
    <form method="post" action="/members/admin/logs/update">
      <input type="hidden" name="log_id" value="${esc(editingLog.id)}">
      <div class="field">
        <label for="log_author">Author</label>
        <input type="text" id="log_author" name="author" value="${esc(editingLog.author)}" required>
      </div>
      <div class="field">
        <label for="log_droid_edit">Droid</label>
        <select id="log_droid_edit" name="droid" required>
          ${droidTypeOptions(droidTypes || [], editingLog.droid)}
        </select>
      </div>
      <div class="field">
        <label for="log_other_droid_edit">If you picked &quot;Other Build&quot; above <span style="font-weight:400; text-transform:none; letter-spacing:0;">(name it here)</span></label>
        <input type="text" id="log_other_droid_edit" name="other_droid" maxlength="60" placeholder="e.g. Frankenbuild Astromech">
      </div>
      <div class="field">
        <label for="log_caption_edit">Caption</label>
        <textarea id="log_caption_edit" name="caption" rows="3" required>${esc(editingLog.caption)}</textarea>
      </div>
      <button type="submit" class="btn btn-primary">Save Changes</button>
      <a href="/members/admin/logs" class="btn-small" style="margin-left:10px;">Cancel</a>
    </form>
  </div>` : ''}

  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Photo</th><th>Author</th><th>Droid</th><th>Caption</th><th>Actions</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">No build log posts yet.</td></tr>`}</tbody>
    </table>
  </div>
</div>
<script>
document.querySelectorAll('form[action="/members/admin/logs/delete"]').forEach((f) => {
  f.addEventListener('submit', () => {
    if (confirm('Delete this post by ' + f.dataset.log + '? This cannot be undone.')) {
      f.removeAttribute('onsubmit');
      HTMLFormElement.prototype.submit.call(f);
    }
  });
});
</script>
</body></html>`;
}

function adminGalleryHTML({ currentUser, galleryItems, error, notice, events, editingItem }) {
  const eventById = new Map((events || []).map((ev) => [ev.id, ev]));
  const rows = galleryItems.map((g) => {
    let eventCell = '<span style="color:var(--muted);">General</span>';
    if (g.eventId) {
      const linkedEvent = eventById.get(g.eventId);
      eventCell = linkedEvent ? esc(linkedEvent.title) : '<span style="color:var(--muted);">Deleted Event</span>';
    }
    return `
    <tr>
      <td><div class="thumb" style="width:64px; height:64px; border-radius:4px;"><img src="/public/gallery-photo/${esc(g.id)}" alt=""></div></td>
      <td>${esc(g.uploaderName)}</td>
      <td>${eventCell}</td>
      <td style="white-space:normal; max-width:280px;">${g.caption ? esc(g.caption) : '<span style="color:var(--muted);">&mdash;</span>'}</td>
      <td class="admin-actions">
        <a class="btn-small" href="/members/admin/gallery?edit=${encodeURIComponent(g.id)}">Edit</a>
        <form method="post" action="/members/admin/gallery/delete" onsubmit="return false;" data-photo="${esc(g.uploaderName)}">
          <input type="hidden" name="photo_id" value="${esc(g.id)}">
          <button type="submit" class="btn-small btn-danger">Delete</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Admin · Gallery — Norwich Droids</title></head>
<body>
${dashNav('admin', currentUser)}
<div class="dash-main">
  <h1>Admin</h1>
  <p class="sub">Edit the caption or event tag on any photo, or remove one from the public Gallery page. Members add their own from the Gallery tab, and can edit their own photos there too.</p>
  ${adminSubNav('gallery')}

  ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
  ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}

  ${editingItem ? `
  <div class="login-card" style="max-width:520px; margin:0 0 40px;">
    <h1 style="font-size:16px; text-align:left;">Edit Photo <span style="font-weight:400; text-transform:none; letter-spacing:0;">(uploaded by ${esc(editingItem.uploaderName)})</span></h1>
    <form method="post" action="/members/admin/gallery/update" enctype="multipart/form-data">
      <input type="hidden" name="photo_id" value="${esc(editingItem.id)}">
      <div class="field">
        <label for="admin_gallery_photo">Photo <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional — leave blank to keep the current photo)</span></label>
        <input type="file" id="admin_gallery_photo" name="photo" accept="image/jpeg,image/png,image/webp">
      </div>
      <div class="field">
        <label for="admin_gallery_event">Event</label>
        <select id="admin_gallery_event" name="event_id">
          ${eventPickerOptions(events || [], editingItem.eventId || '')}
        </select>
      </div>
      <div class="field">
        <label for="admin_gallery_caption">Caption</label>
        <input type="text" id="admin_gallery_caption" name="caption" maxlength="140" value="${esc(editingItem.caption || '')}">
      </div>
      <button type="submit" class="btn btn-primary">Save Changes</button>
      <a href="/members/admin/gallery" class="btn-small" style="margin-left:10px;">Cancel</a>
    </form>
  </div>` : ''}

  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Photo</th><th>Uploaded By</th><th>Event</th><th>Caption</th><th>Actions</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">No photos yet.</td></tr>`}</tbody>
    </table>
  </div>
</div>
<script>
document.querySelectorAll('form[action="/members/admin/gallery/delete"]').forEach((f) => {
  f.addEventListener('submit', () => {
    if (confirm('Delete this photo from ' + f.dataset.photo + '? This cannot be undone.')) {
      f.removeAttribute('onsubmit');
      HTMLFormElement.prototype.submit.call(f);
    }
  });
});
</script>
</body></html>`;
}

function adminDroidsHTML({ currentUser, droidShowcase, error, notice, droidTypes }) {
  const typeChips = (droidTypes || []).map((t) => `
    <form method="post" action="/members/admin/droid-types/delete" onsubmit="return false;" data-type="${esc(t)}" style="display:inline-flex; align-items:center; gap:6px; background:var(--cream-panel); border:1px solid var(--border); border-radius:20px; padding:4px 6px 4px 12px; margin:0 8px 8px 0;">
      <input type="hidden" name="type_name" value="${esc(t)}">
      <span style="font-size:13px;">${esc(t)}</span>
      <button type="submit" class="btn-small btn-danger" style="border-radius:50%; width:20px; height:20px; padding:0; line-height:1;" aria-label="Remove ${esc(t)}">&times;</button>
    </form>`).join('');

  const rows = droidShowcase.map((d) => `
    <tr>
      <td><div class="thumb" style="width:64px; height:64px; border-radius:4px;"><img src="/public/droid-photo/${esc(d.id)}" alt=""></div></td>
      <td>${esc(d.droidName || d.droidType)}${d.droidName ? `<div style="font-size:12px; color:var(--muted);">${esc(d.droidType)}</div>` : ''}</td>
      <td>${esc(d.builderName)}</td>
      <td style="white-space:normal; max-width:240px;">${d.caption ? esc(d.caption) : '<span style="color:var(--muted);">&mdash;</span>'}</td>
      <td class="admin-actions">
        <form method="post" action="/members/admin/droids/delete" onsubmit="return false;" data-photo="${esc(d.droidName || d.droidType)}">
          <input type="hidden" name="droid_id" value="${esc(d.id)}">
          <button type="submit" class="btn-small btn-danger">Delete</button>
        </form>
      </td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head>${HEAD}<title>Admin · Droids — Norwich Droids</title></head>
<body>
${dashNav('admin', currentUser)}
<div class="dash-main">
  <h1>Admin</h1>
  <p class="sub">Remove photos from the public homepage's "Our Droids" section. Members add their own from the Our Droids tab.</p>
  ${adminSubNav('droids')}

  ${error ? `<div class="login-error">${esc(error)}</div>` : ''}
  ${notice ? `<div class="admin-success">${esc(notice)}</div>` : ''}

  <div class="login-card" style="max-width:640px; margin:0 0 40px;">
    <h1 style="font-size:16px; text-align:left;">Manage Droid Types</h1>
    <p class="sub" style="margin-top:0;">These appear in the Droid dropdown on every member form. "Other Build" is always available and adds new types here automatically.</p>
    <div style="margin-bottom:16px;">${typeChips || '<p class="sub">No droid types yet.</p>'}</div>
    <form method="post" action="/members/admin/droid-types/add" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
      <div class="field" style="flex:1; min-width:220px; margin-bottom:0;">
        <label for="new_type_name">Add a droid type</label>
        <input type="text" id="new_type_name" name="type_name" maxlength="60" placeholder="e.g. Gonk Droid" required>
      </div>
      <button type="submit" class="btn btn-primary">Add</button>
    </form>
  </div>

  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>Photo</th><th>Droid</th><th>Builder</th><th>Caption</th><th>Actions</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">No droid photos yet.</td></tr>`}</tbody>
    </table>
  </div>
</div>
<script>
document.querySelectorAll('form[action="/members/admin/droid-types/delete"]').forEach((f) => {
  f.addEventListener('submit', () => {
    if (confirm('Remove "' + f.dataset.type + '" from the droid type list?')) {
      f.removeAttribute('onsubmit');
      HTMLFormElement.prototype.submit.call(f);
    }
  });
});
document.querySelectorAll('form[action="/members/admin/droids/delete"]').forEach((f) => {
  f.addEventListener('submit', () => {
    if (confirm('Delete this photo of ' + f.dataset.photo + '? This cannot be undone.')) {
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

    // --- Public API — no login required. Only ever returns fields a member
    // has chosen to make public (name/nickname/droid/bio/profile photo, or a
    // gallery photo they uploaded) — never email, password data, or anything
    // else account-related. `id` here is only ever used to fetch the public
    // photo route below; it's an opaque id, not otherwise sensitive.
    if (path === '/api/members' && request.method === 'GET') {
      const users = await listUsers(env);
      const publicMembers = users.map((u) => ({
        id: u.id, name: u.name, nickname: u.nickname || '', droid: u.droid || '', bio: u.bio || '',
        hasPhoto: !!u.hasPhoto, photoUpdatedAt: u.photoUpdatedAt || 0,
      }));
      return new Response(JSON.stringify(publicMembers), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    // Groups gallery photos into per-event "boxes" for the public Gallery
    // page. Uses getEvents(env) directly (not /api/events) because that
    // endpoint deliberately drops past events, and most gallery photos are
    // added after the event they were taken at has already happened. A
    // photo tagged to an event that's since been marked private, or one
    // that's since been deleted, falls back to the General Photos bucket
    // rather than disappearing — except a private event's photos, which are
    // left out of the public feed entirely so the event isn't revealed via
    // its photos.
    if (path === '/api/gallery' && request.method === 'GET') {
      const galleryItems = await getGalleryIndex(env);
      const events = await getEvents(env);
      const publicPhoto = (g) => ({ id: g.id, uploaderName: g.uploaderName, caption: g.caption || '' });

      const groups = groupGalleryItemsByEvent(galleryItems, events, { excludePrivate: true }).map(({ event, photos }) => ({
        eventId: event ? event.id : '',
        title: event ? event.title : 'General Photos',
        day: event ? (event.day || '') : '',
        month: event ? (event.month || '') : '',
        year: event ? (event.year || '') : '',
        photos: photos.map(publicPhoto),
      }));

      return new Response(JSON.stringify(groups), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    // Public, no login required — only the fields a visitor needs to see an
    // event listing (never the logistics/RSVP/droid-list fields, which stay
    // members-only). Past events drop off automatically once their last day
    // has gone by; anything with a date that can't be resolved is kept
    // rather than risk hiding a real event.
    if (path === '/api/events' && request.method === 'GET') {
      const events = await getEvents(env);
      const todayIso = new Date().toISOString().slice(0, 10);
      const publicEvents = events
        .filter((e) => eventIsUpcoming(e, todayIso) && !e.isPrivate)
        .sort((a, b) => (eventSortIso(a) < eventSortIso(b) ? -1 : eventSortIso(a) > eventSortIso(b) ? 1 : 0))
        .map((e) => ({
          day: e.day, daySmall: !!e.daySmall, month: e.month, year: e.year || '',
          title: e.title, location: e.location, url: e.url || '',
        }));
      return new Response(JSON.stringify(publicEvents), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (path.startsWith('/public/gallery-photo/') && request.method === 'GET') {
      const id = path.slice('/public/gallery-photo/'.length);
      const photo = await getGalleryPhotoBlob(env, id);
      if (!photo) return htmlResponse('Not found.', 404);
      // A photo tagged to a private event stays out of the public Gallery
      // page entirely (see /api/gallery above) — but its blob would still be
      // fetchable by anyone who has the URL unless we check for that here
      // too. Members can see the photo (and its URL) from their own Gallery
      // tab since they can see private events there; this only blocks the
      // route for a visitor with no session at all.
      const galleryItems = await getGalleryIndex(env);
      const item = galleryItems.find((g) => g.id === id);
      if (item && item.eventId) {
        const events = await getEvents(env);
        const linkedEvent = events.find((e) => e.id === item.eventId);
        if (linkedEvent && linkedEvent.isPrivate) {
          const currentUser = await getSessionUser(request, env);
          if (!currentUser) return htmlResponse('Not found.', 404);
        }
      }
      const bytes = base64ToBytes(photo.data);
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': photo.contentType,
          // Short cache: a photo's id never changes once uploaded, but an
          // admin can delete it at any time, and this route is public with
          // no way to bust a shared/cached URL — keep the caching window
          // short so a moderated-away photo stops being servable quickly.
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Public, no login required — fuels the "Our Droids" section on the
    // public homepage.
    if (path === '/api/droids' && request.method === 'GET') {
      const droidShowcase = await getDroidShowcase(env);
      const publicItems = droidShowcase.map((d) => ({
        id: d.id, droidType: d.droidType, droidName: d.droidName || '', caption: d.caption || '', builderName: d.builderName,
      }));
      return new Response(JSON.stringify(publicItems), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (path.startsWith('/public/droid-photo/') && request.method === 'GET') {
      const id = path.slice('/public/droid-photo/'.length);
      const photo = await getDroidShowcasePhoto(env, id);
      if (!photo) return htmlResponse('Not found.', 404);
      const bytes = base64ToBytes(photo.data);
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': photo.contentType,
          // Same short-cache reasoning as the gallery photo route above.
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Public, no login required — powers the public About page's "Meet the
    // Members" photos. This is deliberately a SEPARATE route from
    // /members/photo/<id> below (which stays session-gated, for the
    // members-only Directory tab) rather than loosening that one, so the
    // two surfaces can never accidentally share a caching/access policy.
    if (path.startsWith('/public/member-photo/') && request.method === 'GET') {
      const userId = path.slice('/public/member-photo/'.length);
      const photo = await getPhoto(env, userId);
      if (!photo) return htmlResponse('Not found.', 404);
      const bytes = base64ToBytes(photo.data);
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': photo.contentType,
          // Same short-cache reasoning as the gallery/droid photo routes —
          // a removed photo should stop being servable quickly.
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

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
          lastLoginAt: Date.now(), // this account creation is effectively its first login
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
        user.lastLoginAt = Date.now();
        await saveUser(env, user);
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
      const tab = pickTab(url);
      const events = await getEvents(env);
      const rsvps = await readJSON(env, 'rsvps');
      const addedDroids = await readJSON(env, 'droids');
      const users = tab === 'directory' ? await listUsers(env) : [];
      const buildLogs = tab === 'logs' ? await getBuildLogs(env) : [];
      const galleryItems = tab === 'gallery' ? await getGalleryIndex(env) : [];
      const droidShowcase = tab === 'droids' ? await getDroidShowcase(env) : [];
      const droidTypes = await getDroidTypes(env);
      return htmlResponse(dashboardHTML({
        tab, openEventId: url.searchParams.get('open') || '', editId: url.searchParams.get('edit') || '', events, rsvps, addedDroids, users, buildLogs, galleryItems, droidShowcase, droidTypes,
        eventsError: '', eventsNotice: '', droidsError: '', droidsNotice: '', currentUser,
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
      const submittedDroid = String(form.get('droid') || '');
      const otherDroid = String(form.get('other_droid') || '').trim();
      const droid = await resolveDroidType(env, submittedDroid, otherDroid);

      const events = await getEvents(env);
      if (events.some((e) => e.id === eventId) && name !== '' && droid !== '') {
        const droids = await readJSON(env, 'droids');
        if (!Array.isArray(droids[eventId])) droids[eventId] = [];
        droids[eventId].push({ name, droid, initials: initials(name) });
        await writeJSON(env, 'droids', droids);
      }
      return redirect(`/members/dashboard?tab=${pickTab(url)}&open=${encodeURIComponent(eventId)}`);
    }

    if (path === '/members/add-buildlog' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const renderWith = async (logError, logNotice) => {
        const buildLogs = await getBuildLogs(env);
        return htmlResponse(dashboardHTML({
          tab: 'logs', openEventId: '', events: [], rsvps: {}, addedDroids: {}, users: [],
          buildLogs, logError, logNotice, galleryItems: [], currentUser, droidTypes: await getDroidTypes(env),
        }));
      };

      const form = await request.formData();
      const submittedDroid = String(form.get('droid') || '').trim();
      const otherDroid = String(form.get('other_droid') || '').trim();
      const caption = String(form.get('caption') || '').trim();
      if (submittedDroid === '' || caption === '') {
        return await renderWith('Please choose a droid and describe the update.', '');
      }
      const droid = await resolveDroidType(env, submittedDroid, otherDroid);

      // The photo is optional — a plain text update with no file selected
      // skips all of this and posts exactly as it always has.
      const file = form.get('photo');
      const hasFile = file && typeof file !== 'string' && file.size;
      let photoToSave = null;
      if (hasFile) {
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
          return await renderWith('Photos must be JPEG, PNG, or WEBP.', '');
        }
        if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
          return await renderWith('That photo is too large to upload — please use a file under 8MB.', '');
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!matchesDeclaredImageType(bytes, file.type)) {
          return await renderWith("That file doesn't look like a valid image.", '');
        }
        const prepared = await prepareUploadedPhoto(bytes, file.type);
        if (prepared.errorMessage) {
          return await renderWith(prepared.errorMessage, '');
        }
        photoToSave = prepared;
      }

      const id = crypto.randomUUID();
      // Write the photo blob BEFORE the index entry that flags hasPhoto:true —
      // same order as profile photos and gallery photos elsewhere in this file.
      // If saving the blob ever fails partway through, the post simply isn't
      // created at all yet, rather than being left with hasPhoto:true pointing
      // at a blob that was never written.
      if (photoToSave) {
        await saveBuildLogPhoto(env, id, photoToSave.contentType, bytesToBase64(photoToSave.bytes));
      }
      const buildLogs = await getBuildLogs(env);
      // ownerId (as opposed to the display-name author field, which an admin
      // can change later via Admin > Members) is what lets the poster edit
      // this later from the Build Logs tab — see /members/logs/update below.
      const newLog = { id, author: currentUser.name, droid, caption, ownerId: currentUser.id };
      if (photoToSave) {
        newLog.hasPhoto = true;
        newLog.photoUpdatedAt = Date.now();
      }
      buildLogs.push(newLog);
      await saveBuildLogs(env, buildLogs);
      return await renderWith('', 'Update posted.');
    }

    // A member editing their OWN build log post (ownerId-gated — this is
    // deliberately separate from /members/admin/logs/update below, which is
    // admin-only and can edit anyone's post but can't replace the photo).
    if (path === '/members/logs/update' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const renderWith = async (logError, logNotice, editId) => {
        const buildLogs = await getBuildLogs(env);
        return htmlResponse(dashboardHTML({
          tab: 'logs', openEventId: '', editId: editId || '', events: [], rsvps: {}, addedDroids: {}, users: [],
          buildLogs, logError, logNotice, galleryItems: [], currentUser, droidTypes: await getDroidTypes(env),
        }));
      };

      const form = await request.formData();
      const logId = String(form.get('log_id') || '');
      const submittedDroid = String(form.get('droid') || '').trim();
      const otherDroid = String(form.get('other_droid') || '').trim();
      const caption = String(form.get('caption') || '').trim();

      const buildLogs = await getBuildLogs(env);
      const log = buildLogs.find((p) => p.id === logId);
      // Ownership is checked server-side, not just hidden in the UI — a
      // member can't edit another member's post by forging the log_id.
      if (!log || log.ownerId !== currentUser.id) {
        return await renderWith('You can only edit your own posts.', '');
      }

      if (submittedDroid === '' || caption === '') {
        return await renderWith('Please choose a droid and describe the update.', '', logId);
      }
      const droid = await resolveDroidType(env, submittedDroid, otherDroid);

      const file = form.get('photo');
      const hasFile = file && typeof file !== 'string' && file.size;
      if (hasFile) {
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
          return await renderWith('Photos must be JPEG, PNG, or WEBP.', '', logId);
        }
        if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
          return await renderWith('That photo is too large to upload — please use a file under 8MB.', '', logId);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!matchesDeclaredImageType(bytes, file.type)) {
          return await renderWith("That file doesn't look like a valid image.", '', logId);
        }
        const prepared = await prepareUploadedPhoto(bytes, file.type);
        if (prepared.errorMessage) {
          return await renderWith(prepared.errorMessage, '', logId);
        }
        await saveBuildLogPhoto(env, logId, prepared.contentType, bytesToBase64(prepared.bytes));
        log.hasPhoto = true;
        log.photoUpdatedAt = Date.now();
      }

      log.droid = droid;
      log.caption = caption;
      await saveBuildLogs(env, buildLogs);
      return await renderWith('', 'Update saved.');
    }

    if (path === '/members/gallery/upload' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const renderWith = async (galleryError, galleryNotice) => {
        const galleryItems = await getGalleryIndex(env);
        const events = await getEvents(env);
        return htmlResponse(dashboardHTML({
          tab: 'gallery', openEventId: '', events, rsvps: {}, addedDroids: {}, users: [], buildLogs: [],
          galleryItems, galleryError, galleryNotice, currentUser, droidTypes: await getDroidTypes(env),
        }));
      };

      const form = await request.formData();
      // "photos" (plural) — a multi-select input, so more than one photo can
      // go up in a single submission. All share the caption and event below.
      const files = form.getAll('photos').filter((f) => f && typeof f !== 'string' && f.size);
      const caption = String(form.get('caption') || '').trim().slice(0, 140);
      const events = await getEvents(env);
      const requestedEventId = String(form.get('event_id') || '').trim();
      const eventId = events.some((e) => e.id === requestedEventId) ? requestedEventId : '';

      if (files.length === 0) {
        return await renderWith('Please choose at least one photo to upload.', '');
      }
      if (files.length > MAX_GALLERY_PHOTOS_PER_UPLOAD) {
        return await renderWith(`Please upload up to ${MAX_GALLERY_PHOTOS_PER_UPLOAD} photos at a time.`, '');
      }

      // Validate EVERY file before saving ANY of them — one bad file in a
      // big multi-select rejects the whole batch rather than leaving a
      // half-uploaded mess for the member to figure out.
      const prepared = [];
      for (const file of files) {
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
          return await renderWith(`"${file.name}" isn't a JPEG, PNG, or WEBP photo.`, '');
        }
        if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
          return await renderWith(`"${file.name}" is too large to upload — please use files under 8MB.`, '');
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!matchesDeclaredImageType(bytes, file.type)) {
          return await renderWith(`"${file.name}" doesn't look like a valid image.`, '');
        }
        const result = await prepareUploadedPhoto(bytes, file.type);
        if (result.errorMessage) {
          return await renderWith(`"${file.name}": ${result.errorMessage}`, '');
        }
        prepared.push(result);
      }

      const galleryItems = await getGalleryIndex(env);
      for (const p of prepared) {
        const id = crypto.randomUUID();
        await saveGalleryPhotoBlob(env, id, p.contentType, bytesToBase64(p.bytes));
        // ownerId lets the uploader edit this later from the Gallery tab —
        // see /members/gallery/update below. uploaderName is just a display
        // label and can drift from ownerId if an admin renames the member.
        galleryItems.unshift({ id, uploaderName: currentUser.name, caption, eventId, createdAt: new Date().toISOString(), ownerId: currentUser.id });
      }
      await saveGalleryIndex(env, galleryItems);
      return htmlResponse(dashboardHTML({
        tab: 'gallery', openEventId: '', events, rsvps: {}, addedDroids: {}, users: [], buildLogs: [],
        galleryItems, galleryError: '', galleryNotice: prepared.length === 1 ? 'Photo uploaded — now visible on the public Gallery page.' : `${prepared.length} photos uploaded — now visible on the public Gallery page.`, currentUser, droidTypes: await getDroidTypes(env),
      }));
    }

    // A member editing their OWN gallery photo (ownerId-gated).
    if (path === '/members/gallery/update' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const renderWith = async (galleryError, galleryNotice, editId) => {
        const galleryItems = await getGalleryIndex(env);
        const events = await getEvents(env);
        return htmlResponse(dashboardHTML({
          tab: 'gallery', openEventId: '', editId: editId || '', events, rsvps: {}, addedDroids: {}, users: [], buildLogs: [],
          galleryItems, galleryError, galleryNotice, currentUser, droidTypes: await getDroidTypes(env),
        }));
      };

      const form = await request.formData();
      const photoId = String(form.get('photo_id') || '');
      const caption = String(form.get('caption') || '').trim().slice(0, 140);
      const events = await getEvents(env);
      const requestedEventId = String(form.get('event_id') || '').trim();
      const eventId = events.some((e) => e.id === requestedEventId) ? requestedEventId : '';

      const galleryItems = await getGalleryIndex(env);
      const item = galleryItems.find((g) => g.id === photoId);
      // Ownership is checked server-side, not just hidden in the UI — a
      // member can't edit another member's photo by forging the photo_id.
      if (!item || item.ownerId !== currentUser.id) {
        return await renderWith('You can only edit your own photos.', '');
      }

      const file = form.get('photo');
      const hasFile = file && typeof file !== 'string' && file.size;
      if (hasFile) {
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
          return await renderWith('Photos must be JPEG, PNG, or WEBP.', '', photoId);
        }
        if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
          return await renderWith('That photo is too large to upload — please use a file under 8MB.', '', photoId);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!matchesDeclaredImageType(bytes, file.type)) {
          return await renderWith("That file doesn't look like a valid image.", '', photoId);
        }
        const prepared = await prepareUploadedPhoto(bytes, file.type);
        if (prepared.errorMessage) {
          return await renderWith(prepared.errorMessage, '', photoId);
        }
        await saveGalleryPhotoBlob(env, photoId, prepared.contentType, bytesToBase64(prepared.bytes));
      }

      item.caption = caption;
      item.eventId = eventId;
      await saveGalleryIndex(env, galleryItems);
      return await renderWith('', 'Photo updated.');
    }

    if (path === '/members/droids/upload' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const renderWith = async (droidsError, droidsNotice) => {
        const droidShowcase = await getDroidShowcase(env);
        return htmlResponse(dashboardHTML({
          tab: 'droids', openEventId: '', events: [], rsvps: {}, addedDroids: {}, users: [], buildLogs: [],
          galleryItems: [], droidShowcase, droidsError, droidsNotice, currentUser, droidTypes: await getDroidTypes(env),
        }));
      };

      const form = await request.formData();
      const submittedDroidType = String(form.get('droid_type') || '').trim();
      const otherDroidType = String(form.get('other_droid_type') || '').trim();
      const droidName = String(form.get('droid_name') || '').trim().slice(0, 60);
      const caption = String(form.get('caption') || '').trim().slice(0, 140);
      const file = form.get('photo');
      if (!submittedDroidType) {
        return await renderWith('Please choose a droid type.', '');
      }
      const droidType = await resolveDroidType(env, submittedDroidType, otherDroidType);
      if (!file || typeof file === 'string' || !file.size) {
        return await renderWith('Please choose a photo to upload.', '');
      }
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        return await renderWith('Photos must be JPEG, PNG, or WEBP.', '');
      }
      if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
        return await renderWith('That photo is too large to upload — please use a file under 8MB.', '');
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesDeclaredImageType(bytes, file.type)) {
        return await renderWith("That file doesn't look like a valid image.", '');
      }
      const prepared = await prepareUploadedPhoto(bytes, file.type);
      if (prepared.errorMessage) {
        return await renderWith(prepared.errorMessage, '');
      }
      const id = crypto.randomUUID();
      await saveDroidShowcasePhoto(env, id, prepared.contentType, bytesToBase64(prepared.bytes));
      const droidShowcase = await getDroidShowcase(env);
      // ownerId lets the builder edit this entry later from the Our Droids
      // tab — see /members/droids/update below.
      droidShowcase.unshift({ id, builderName: currentUser.name, droidType, droidName, caption, createdAt: new Date().toISOString(), ownerId: currentUser.id });
      await saveDroidShowcase(env, droidShowcase);
      return htmlResponse(dashboardHTML({
        tab: 'droids', openEventId: '', events: [], rsvps: {}, addedDroids: {}, users: [], buildLogs: [],
        galleryItems: [], droidShowcase, droidsError: '', droidsNotice: 'Photo added — now visible on the public homepage.', currentUser, droidTypes: await getDroidTypes(env),
      }));
    }

    // A member editing their OWN droid showcase entry (ownerId-gated).
    if (path === '/members/droids/update' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const renderWith = async (droidsError, droidsNotice, editId) => {
        const droidShowcase = await getDroidShowcase(env);
        return htmlResponse(dashboardHTML({
          tab: 'droids', openEventId: '', editId: editId || '', events: [], rsvps: {}, addedDroids: {}, users: [], buildLogs: [],
          galleryItems: [], droidShowcase, droidsError, droidsNotice, currentUser, droidTypes: await getDroidTypes(env),
        }));
      };

      const form = await request.formData();
      const droidId = String(form.get('droid_id') || '');
      const submittedDroidType = String(form.get('droid_type') || '').trim();
      const otherDroidType = String(form.get('other_droid_type') || '').trim();
      const droidName = String(form.get('droid_name') || '').trim().slice(0, 60);
      const caption = String(form.get('caption') || '').trim().slice(0, 140);

      const droidShowcase = await getDroidShowcase(env);
      const item = droidShowcase.find((d) => d.id === droidId);
      // Ownership is checked server-side, not just hidden in the UI — a
      // member can't edit another member's entry by forging the droid_id.
      if (!item || item.ownerId !== currentUser.id) {
        return await renderWith('You can only edit your own droid entry.', '');
      }

      if (!submittedDroidType) {
        return await renderWith('Please choose a droid type.', '', droidId);
      }
      const droidType = await resolveDroidType(env, submittedDroidType, otherDroidType);

      const file = form.get('photo');
      const hasFile = file && typeof file !== 'string' && file.size;
      if (hasFile) {
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
          return await renderWith('Photos must be JPEG, PNG, or WEBP.', '', droidId);
        }
        if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
          return await renderWith('That photo is too large to upload — please use a file under 8MB.', '', droidId);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!matchesDeclaredImageType(bytes, file.type)) {
          return await renderWith("That file doesn't look like a valid image.", '', droidId);
        }
        const prepared = await prepareUploadedPhoto(bytes, file.type);
        if (prepared.errorMessage) {
          return await renderWith(prepared.errorMessage, '', droidId);
        }
        await saveDroidShowcasePhoto(env, droidId, prepared.contentType, bytesToBase64(prepared.bytes));
      }

      item.droidType = droidType;
      item.droidName = droidName;
      item.caption = caption;
      await saveDroidShowcase(env, droidShowcase);
      return await renderWith('', 'Droid entry updated.');
    }

    // Any logged-in member can propose an event; it only reaches the real
    // calendar once an admin approves it from Admin > Events.
    if (path === '/members/events/submit' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const renderWith = async (eventsError, eventsNotice) => {
        const events = await getEvents(env);
        const rsvps = await readJSON(env, 'rsvps');
        const addedDroids = await readJSON(env, 'droids');
        return htmlResponse(dashboardHTML({
          tab: 'events', openEventId: '', events, rsvps, addedDroids, users: [], buildLogs: [],
          galleryItems: [], eventsError, eventsNotice, currentUser, droidTypes: await getDroidTypes(env),
        }));
      };

      const form = await request.formData();
      const title = String(form.get('title') || '').trim();
      const location = String(form.get('location') || '').trim();
      const dateFields = computeEventDateFields(form);
      if (!title || dateFields.error || !location) {
        return await renderWith(dateFields.error || 'Please fill in the event title, date, and location.', '');
      }

      const pendingEvents = await getPendingEvents(env);
      pendingEvents.push({
        pendingId: crypto.randomUUID(),
        submittedBy: currentUser.name,
        submittedAt: new Date().toISOString(),
        day: dateFields.day, daySmall: dateFields.daySmall, month: dateFields.month, year: dateFields.year,
        title, location, url: sanitizeEventUrl(form.get('url')),
        organiser: String(form.get('organiser') || '').trim(),
        description: String(form.get('description') || '').trim(),
      });
      await savePendingEvents(env, pendingEvents);
      return await renderWith('', 'Thanks — your event has been submitted for admin approval.');
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
      if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
        return htmlResponse(changePasswordHTML(currentUser, { photoError: 'That photo is too large to upload — please use a file under 8MB.' }), 400);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesDeclaredImageType(bytes, file.type)) {
        return htmlResponse(changePasswordHTML(currentUser, { photoError: "That file doesn't look like a valid image." }), 400);
      }
      const prepared = await prepareUploadedPhoto(bytes, file.type);
      if (prepared.errorMessage) {
        return htmlResponse(changePasswordHTML(currentUser, { photoError: prepared.errorMessage }), 400);
      }
      await savePhoto(env, currentUser.id, prepared.contentType, bytesToBase64(prepared.bytes));
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

    if (path === '/members/account/bio' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const form = await request.formData();
      const bio = String(form.get('bio') || '').trim().slice(0, 500);
      currentUser.bio = bio;
      await saveUser(env, currentUser);
      return htmlResponse(changePasswordHTML(currentUser, { bioSuccess: bio ? 'Description updated.' : 'Description cleared.' }));
    }

    if (path === '/members/account/nickname' && request.method === 'POST') {
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const form = await request.formData();
      const nickname = String(form.get('nickname') || '').trim().slice(0, 40);
      currentUser.nickname = nickname;
      await saveUser(env, currentUser);
      return htmlResponse(changePasswordHTML(currentUser, { nicknameSuccess: nickname ? 'Nickname updated.' : 'Nickname cleared.' }));
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

    if (path.startsWith('/members/buildlog-photo/') && request.method === 'GET') {
      // Same reasoning as profile photos above — build log photos are only
      // ever shown inside the members-only Build Logs tab, so this is
      // session-gated too, not a public URL (unlike public gallery photos).
      const currentUser = await getSessionUser(request, env);
      if (!currentUser) return redirect('/members/login');

      const logId = path.slice('/members/buildlog-photo/'.length);
      const photo = await getBuildLogPhoto(env, logId);
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
        const editId = url.searchParams.get('edit');
        const editingUser = editId ? users.find((u) => u.id === editId) || null : null;
        return htmlResponse(adminPageHTML({ currentUser, users, error: '', notice: '', generated: null, editingUser }));
      }

      if (path === '/members/admin/update' && request.method === 'POST') {
        const form = await request.formData();
        const userId = String(form.get('user_id') || '');
        const target = await getUserById(env, userId);
        const users = await listUsers(env);
        if (!target) {
          return htmlResponse(adminPageHTML({ currentUser, users, error: 'Member not found.', notice: '', generated: null }), 400);
        }
        const name = String(form.get('name') || '').trim();
        const email = String(form.get('email') || '').trim().toLowerCase();
        const droid = String(form.get('droid') || '').trim();
        if (!name || !email) {
          return htmlResponse(adminPageHTML({ currentUser, users, error: 'Name and email are required.', notice: '', generated: null, editingUser: target }), 400);
        }
        const oldEmail = target.email.toLowerCase();
        if (email !== oldEmail) {
          const existing = await getUserByEmail(env, email);
          if (existing && existing.id !== target.id) {
            return htmlResponse(adminPageHTML({ currentUser, users, error: 'Another member already uses that email.', notice: '', generated: null, editingUser: target }), 400);
          }
        }
        target.name = name;
        target.email = email;
        target.droid = droid;
        // Write the user record + new email mapping FIRST, then drop the old
        // mapping last — if anything fails partway, the account stays
        // reachable under one email or the other rather than neither.
        await saveUser(env, target);
        if (email !== oldEmail) {
          await env.DATA.delete(`email:${oldEmail}`);
        }
        const updatedUsers = await listUsers(env);
        return htmlResponse(adminPageHTML({ currentUser, users: updatedUsers, error: '', notice: `${target.name}'s details were updated.`, generated: null }));
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
        const pendingEvents = await getPendingEvents(env);
        const editId = url.searchParams.get('edit');
        const editingEvent = editId ? events.find((e) => e.id === editId) || null : null;
        return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: '', notice: '', editingEvent }));
      }

      if (path === '/members/admin/events/add' && request.method === 'POST') {
        const form = await request.formData();
        const title = String(form.get('title') || '').trim();
        const location = String(form.get('location') || '').trim();
        const events = await getEvents(env);
        const pendingEvents = await getPendingEvents(env);
        const dateFields = computeEventDateFields(form);
        if (!title || dateFields.error || !location) {
          return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: dateFields.error || 'Title, date, and location are required.', notice: '', editingEvent: null }), 400);
        }
        const newEvent = {
          id: uniqueEventId(events, slugify(title)),
          day: dateFields.day, daySmall: dateFields.daySmall, month: dateFields.month, year: dateFields.year, title, location,
          url: sanitizeEventUrl(form.get('url')),
          startTime: String(form.get('start_time') || '').trim(),
          accessTime: String(form.get('access_time') || '').trim(),
          organiser: String(form.get('organiser') || '').trim(),
          parking: String(form.get('parking') || '').trim(),
          floorArea: String(form.get('floor_area') || '').trim(),
          accommodation: String(form.get('accommodation') || '').trim(),
          fuel: String(form.get('fuel') || '').trim(),
          description: String(form.get('description') || '').trim(),
          baseDroids: parseBaseDroids(form.get('base_droids')),
          isPrivate: form.get('is_private') === 'on',
        };
        events.push(newEvent);
        await saveEvents(env, events);
        return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: '', notice: `"${newEvent.title}" was added.`, editingEvent: null }));
      }

      if (path === '/members/admin/events/update' && request.method === 'POST') {
        const form = await request.formData();
        const eventId = String(form.get('event_id') || '');
        const events = await getEvents(env);
        const pendingEvents = await getPendingEvents(env);
        const idx = events.findIndex((e) => e.id === eventId);
        if (idx === -1) {
          return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: 'Event not found.', notice: '', editingEvent: null }), 400);
        }
        const title = String(form.get('title') || '').trim();
        const location = String(form.get('location') || '').trim();
        const dateFields = computeEventDateFields(form);
        if (!title || dateFields.error || !location) {
          return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: dateFields.error || 'Title, date, and location are required.', notice: '', editingEvent: events[idx] }), 400);
        }
        events[idx] = {
          ...events[idx],
          day: dateFields.day, daySmall: dateFields.daySmall, month: dateFields.month, year: dateFields.year, title, location,
          url: sanitizeEventUrl(form.get('url')),
          startTime: String(form.get('start_time') || '').trim(),
          accessTime: String(form.get('access_time') || '').trim(),
          organiser: String(form.get('organiser') || '').trim(),
          parking: String(form.get('parking') || '').trim(),
          floorArea: String(form.get('floor_area') || '').trim(),
          accommodation: String(form.get('accommodation') || '').trim(),
          fuel: String(form.get('fuel') || '').trim(),
          description: String(form.get('description') || '').trim(),
          baseDroids: parseBaseDroids(form.get('base_droids')),
          isPrivate: form.get('is_private') === 'on',
        };
        await saveEvents(env, events);
        return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: '', notice: `"${events[idx].title}" was updated.`, editingEvent: null }));
      }

      if (path === '/members/admin/events/delete' && request.method === 'POST') {
        const form = await request.formData();
        const eventId = String(form.get('event_id') || '');
        const events = await getEvents(env);
        const pendingEvents = await getPendingEvents(env);
        const target = events.find((e) => e.id === eventId);
        if (!target) {
          return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: 'Event not found.', notice: '', editingEvent: null }), 400);
        }
        const remaining = events.filter((e) => e.id !== eventId);
        await saveEvents(env, remaining);
        // Clean up any RSVPs / added droids that referenced the deleted event.
        const rsvps = await readJSON(env, 'rsvps');
        if (eventId in rsvps) { delete rsvps[eventId]; await writeJSON(env, 'rsvps', rsvps); }
        const droids = await readJSON(env, 'droids');
        if (eventId in droids) { delete droids[eventId]; await writeJSON(env, 'droids', droids); }
        return htmlResponse(adminEventsHTML({ currentUser, events: remaining, pendingEvents, error: '', notice: `"${target.title}" was deleted.`, editingEvent: null }));
      }

      if (path === '/members/admin/events/approve' && request.method === 'POST') {
        const form = await request.formData();
        const pendingId = String(form.get('pending_id') || '');
        const pendingEvents = await getPendingEvents(env);
        const target = pendingEvents.find((p) => p.pendingId === pendingId);
        const events = await getEvents(env);
        if (!target) {
          return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: 'Submission not found — it may have already been handled.', notice: '', editingEvent: null }), 400);
        }
        const newEvent = {
          id: uniqueEventId(events, slugify(target.title)),
          day: target.day, daySmall: target.daySmall, month: target.month, year: target.year,
          title: target.title, location: target.location, url: target.url || '',
          startTime: target.startTime || '', accessTime: target.accessTime || '', organiser: target.organiser || '',
          parking: '', floorArea: '', accommodation: '', fuel: '',
          description: target.description || '', baseDroids: [],
        };
        events.push(newEvent);
        await saveEvents(env, events);
        const remainingPending = pendingEvents.filter((p) => p.pendingId !== pendingId);
        await savePendingEvents(env, remainingPending);
        return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents: remainingPending, error: '', notice: `"${newEvent.title}" was approved and added to the calendar.`, editingEvent: null }));
      }

      if (path === '/members/admin/events/reject' && request.method === 'POST') {
        const form = await request.formData();
        const pendingId = String(form.get('pending_id') || '');
        const pendingEvents = await getPendingEvents(env);
        const target = pendingEvents.find((p) => p.pendingId === pendingId);
        const events = await getEvents(env);
        if (!target) {
          return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents, error: 'Submission not found — it may have already been handled.', notice: '', editingEvent: null }), 400);
        }
        const remainingPending = pendingEvents.filter((p) => p.pendingId !== pendingId);
        await savePendingEvents(env, remainingPending);
        return htmlResponse(adminEventsHTML({ currentUser, events, pendingEvents: remainingPending, error: '', notice: `"${target.title}" was rejected and removed from the submission queue.`, editingEvent: null }));
      }

      // --- Build log management ---------------------------------------------

      if (path === '/members/admin/logs' && request.method === 'GET') {
        const buildLogs = await getBuildLogs(env);
        const droidTypes = await getDroidTypes(env);
        const editId = url.searchParams.get('edit');
        const editingLog = editId ? buildLogs.find((p) => p.id === editId) || null : null;
        return htmlResponse(adminBuildLogsHTML({ currentUser, buildLogs, error: '', notice: '', editingLog, droidTypes }));
      }

      if (path === '/members/admin/logs/update' && request.method === 'POST') {
        const form = await request.formData();
        const logId = String(form.get('log_id') || '');
        const buildLogs = await getBuildLogs(env);
        const droidTypes = await getDroidTypes(env);
        const idx = buildLogs.findIndex((p) => p.id === logId);
        if (idx === -1) {
          return htmlResponse(adminBuildLogsHTML({ currentUser, buildLogs, error: 'Post not found.', notice: '', editingLog: null, droidTypes }), 400);
        }
        const author = String(form.get('author') || '').trim();
        const submittedDroid = String(form.get('droid') || '').trim();
        const otherDroid = String(form.get('other_droid') || '').trim();
        const caption = String(form.get('caption') || '').trim();
        if (!author || !submittedDroid || !caption) {
          return htmlResponse(adminBuildLogsHTML({ currentUser, buildLogs, error: 'Author, droid, and caption are all required.', notice: '', editingLog: buildLogs[idx], droidTypes }), 400);
        }
        const droid = await resolveDroidType(env, submittedDroid, otherDroid);
        buildLogs[idx] = { ...buildLogs[idx], author, droid, caption };
        await saveBuildLogs(env, buildLogs);
        return htmlResponse(adminBuildLogsHTML({ currentUser, buildLogs, error: '', notice: 'Post updated.', editingLog: null, droidTypes: await getDroidTypes(env) }));
      }

      if (path === '/members/admin/logs/delete' && request.method === 'POST') {
        const form = await request.formData();
        const logId = String(form.get('log_id') || '');
        const buildLogs = await getBuildLogs(env);
        const target = buildLogs.find((p) => p.id === logId);
        if (!target) {
          return htmlResponse(adminBuildLogsHTML({ currentUser, buildLogs, error: 'Post not found.', notice: '', editingLog: null, droidTypes: await getDroidTypes(env) }), 400);
        }
        const remaining = buildLogs.filter((p) => p.id !== logId);
        await saveBuildLogs(env, remaining);
        if (target.hasPhoto) {
          await deleteBuildLogPhoto(env, logId);
        }
        return htmlResponse(adminBuildLogsHTML({ currentUser, buildLogs: remaining, error: '', notice: 'Post deleted.', editingLog: null, droidTypes: await getDroidTypes(env) }));
      }

      // --- Gallery moderation -------------------------------------------

      if (path === '/members/admin/gallery' && request.method === 'GET') {
        const galleryItems = await getGalleryIndex(env);
        const events = await getEvents(env);
        const editId = url.searchParams.get('edit');
        const editingItem = editId ? galleryItems.find((g) => g.id === editId) || null : null;
        return htmlResponse(adminGalleryHTML({ currentUser, galleryItems, error: '', notice: '', events, editingItem }));
      }

      // An admin can edit ANY photo's caption/event tag (and optionally
      // replace the image itself) — unlike the member-facing
      // /members/gallery/update route above, there's no ownerId check here,
      // since this is exactly the admin-wide moderation capability members
      // don't have. Re-uses the same validate-then-save pattern as every
      // other photo route.
      if (path === '/members/admin/gallery/update' && request.method === 'POST') {
        const form = await request.formData();
        const photoId = String(form.get('photo_id') || '');
        const galleryItems = await getGalleryIndex(env);
        const events = await getEvents(env);
        const item = galleryItems.find((g) => g.id === photoId);
        if (!item) {
          return htmlResponse(adminGalleryHTML({ currentUser, galleryItems, error: 'Photo not found.', notice: '', events, editingItem: null }), 400);
        }
        const caption = String(form.get('caption') || '').trim().slice(0, 140);
        const requestedEventId = String(form.get('event_id') || '').trim();
        const eventId = events.some((e) => e.id === requestedEventId) ? requestedEventId : '';

        const file = form.get('photo');
        const hasFile = file && typeof file !== 'string' && file.size;
        if (hasFile) {
          if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
            return htmlResponse(adminGalleryHTML({ currentUser, galleryItems, error: 'Photos must be JPEG, PNG, or WEBP.', notice: '', events, editingItem: item }), 400);
          }
          if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
            return htmlResponse(adminGalleryHTML({ currentUser, galleryItems, error: 'That photo is too large to upload — please use a file under 8MB.', notice: '', events, editingItem: item }), 400);
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!matchesDeclaredImageType(bytes, file.type)) {
            return htmlResponse(adminGalleryHTML({ currentUser, galleryItems, error: "That file doesn't look like a valid image.", notice: '', events, editingItem: item }), 400);
          }
          const prepared = await prepareUploadedPhoto(bytes, file.type);
          if (prepared.errorMessage) {
            return htmlResponse(adminGalleryHTML({ currentUser, galleryItems, error: prepared.errorMessage, notice: '', events, editingItem: item }), 400);
          }
          await saveGalleryPhotoBlob(env, photoId, prepared.contentType, bytesToBase64(prepared.bytes));
        }

        item.caption = caption;
        item.eventId = eventId;
        await saveGalleryIndex(env, galleryItems);
        return htmlResponse(adminGalleryHTML({ currentUser, galleryItems, error: '', notice: 'Photo updated.', events, editingItem: null }));
      }

      if (path === '/members/admin/gallery/delete' && request.method === 'POST') {
        const form = await request.formData();
        const photoId = String(form.get('photo_id') || '');
        const galleryItems = await getGalleryIndex(env);
        const events = await getEvents(env);
        const target = galleryItems.find((g) => g.id === photoId);
        if (!target) {
          return htmlResponse(adminGalleryHTML({ currentUser, galleryItems, error: 'Photo not found.', notice: '', events, editingItem: null }), 400);
        }
        const remaining = galleryItems.filter((g) => g.id !== photoId);
        await saveGalleryIndex(env, remaining);
        await deleteGalleryPhotoBlob(env, photoId);
        return htmlResponse(adminGalleryHTML({ currentUser, galleryItems: remaining, error: '', notice: 'Photo deleted.', events, editingItem: null }));
      }

      // --- Droid showcase moderation -------------------------------------

      if (path === '/members/admin/droids' && request.method === 'GET') {
        const droidShowcase = await getDroidShowcase(env);
        const droidTypes = await getDroidTypes(env);
        return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase, error: '', notice: '', droidTypes }));
      }

      if (path === '/members/admin/droids/delete' && request.method === 'POST') {
        const form = await request.formData();
        const droidId = String(form.get('droid_id') || '');
        const droidShowcase = await getDroidShowcase(env);
        const droidTypes = await getDroidTypes(env);
        const target = droidShowcase.find((d) => d.id === droidId);
        if (!target) {
          return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase, error: 'Photo not found.', notice: '', droidTypes }), 400);
        }
        const remaining = droidShowcase.filter((d) => d.id !== droidId);
        await saveDroidShowcase(env, remaining);
        await deleteDroidShowcasePhoto(env, droidId);
        return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase: remaining, error: '', notice: 'Photo deleted.', droidTypes }));
      }

      if (path === '/members/admin/droid-types/add' && request.method === 'POST') {
        const form = await request.formData();
        const droidShowcase = await getDroidShowcase(env);
        const typeName = String(form.get('type_name') || '').trim().slice(0, 60);
        const droidTypes = await getDroidTypes(env);
        if (!typeName) {
          return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase, error: 'Enter a droid type name.', notice: '', droidTypes }), 400);
        }
        if (typeName.toLowerCase() === OTHER_DROID_TYPE.toLowerCase()) {
          return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase, error: '"Other Build" is already available on every form — no need to add it.', notice: '', droidTypes }), 400);
        }
        const alreadyListed = droidTypes.some((t) => t.toLowerCase() === typeName.toLowerCase());
        if (alreadyListed) {
          return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase, error: `"${typeName}" is already in the list.`, notice: '', droidTypes }), 400);
        }
        droidTypes.push(typeName);
        await saveDroidTypes(env, droidTypes);
        return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase, error: '', notice: `"${typeName}" was added to the droid type list.`, droidTypes }));
      }

      if (path === '/members/admin/droid-types/delete' && request.method === 'POST') {
        const form = await request.formData();
        const droidShowcase = await getDroidShowcase(env);
        const typeName = String(form.get('type_name') || '').trim();
        const droidTypes = await getDroidTypes(env);
        if (!droidTypes.includes(typeName)) {
          return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase, error: 'Droid type not found.', notice: '', droidTypes }), 400);
        }
        const remaining = droidTypes.filter((t) => t !== typeName);
        await saveDroidTypes(env, remaining);
        return htmlResponse(adminDroidsHTML({ currentUser, droidShowcase, error: '', notice: `"${typeName}" was removed from the droid type list.`, droidTypes: remaining }));
      }

      return htmlResponse('Not found.', 404);
    }

    // Anything else that didn't already match a static file in /public.
    return env.ASSETS.fetch(request);
  },
};
