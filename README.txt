NORWICH DROIDS WEBSITE — CLOUDFLARE DEPLOYMENT NOTES
======================================================

WHAT CHANGED FROM THE FASTHOSTS VERSION
------------------------------------------
Cloudflare Workers don't run PHP, so the members area (login, RSVP,
add-a-droid) has been rebuilt in JavaScript as a Cloudflare Worker, with
Cloudflare KV replacing the two JSON files as storage. The public pages
(Home, About, Events, Gallery) are now plain static .html files — same
look, same content, just no server-side PHP needed to render them.

The members area also now gives everyone their own individual login
(name + email + password) instead of one password shared by the whole
club, with one admin account able to add members and promote others to
admin — see section 3 below for the one-time setup step.

A Cloudflare KV namespace called "norwich-droids-members" has already been
created in your account and its ID is already wired into wrangler.jsonc —
you don't need to create it yourself.


1. THE EASIEST WAY TO DEPLOY: GITHUB + CLOUDFLARE (no command line)
-----------------------------------------------------------------------
This is the recommended path — everything happens in a browser.

  a) If you don't already have a GitHub account, create a free one at
     https://github.com/signup

  b) Create a new repository (github.com -> the "+" icon -> New repository).
     Name it something like "norwich-droids-website". Keep it Private or
     Public, your choice.

  c) Upload this entire folder's contents into that repository. On the
     repo's page, use "Add file" -> "Upload files", then drag in everything
     from this folder (keeping the public/, src/ folders and the
     wrangler.jsonc / package.json files at the top level of the repo —
     don't nest them inside an extra folder). Commit the upload.

  d) In the Cloudflare dashboard (dash.cloudflare.com), go to
     Workers & Pages -> Create application -> Import a repository, and
     connect your GitHub account, then select the repository you just made.

  e) Cloudflare will detect wrangler.jsonc automatically. Confirm the
     settings it shows you and select Save and Deploy.

  f) Once deployed, you'll get a working test URL like
     norwich-droids.<something>.workers.dev — open it to check the public
     pages load.

  g) Set your real members password (see section 3 below) before telling
     anyone to log in — without it, login will always fail, which is the
     safe default.

  h) Point your real domain at it — see section 4 below.

From then on, any time you push changes to that GitHub repository,
Cloudflare automatically redeploys the site — no manual re-upload needed.


2. ALTERNATIVE: DEPLOY FROM YOUR OWN COMPUTER (command line)
------------------------------------------------------------------
If you're comfortable with a terminal and have Node.js installed:

  cd into this folder, then run:
    npm install
    npx wrangler login        (opens a browser to connect your account)
    npx wrangler deploy

Wrangler will read wrangler.jsonc and deploy the Worker plus the public/
static files together. It will print your workers.dev URL when done.


3. CREATE THE FIRST ADMIN ACCOUNT (one-time step)
------------------------------------------------------
Every member now has their own login (their own email + password) instead
of one shared password. There are no Cloudflare secrets to set up at all —
this was a deliberate change, because the old shared-password secret
turned out to be unreliable to configure. Nothing here needs the
dashboard's Variables/Secrets screen.

The very first admin account is created by visiting a special one-time
setup link in your browser, once, straight after your first deploy:

  https://<your-worker-url>/members/_setup?token=9856825dfffddf49fc0139a57840850be646264818193ba5

(replace <your-worker-url> with your actual workers.dev address, or your
real domain once that's connected). This page will ask for your name,
email and a password — fill it in and submit, and you'll be logged straight
in as the first admin.

This link only works ONCE: the moment any admin account exists, the setup
page permanently switches itself off (it will show an error if you visit
it again), so there's no way for anyone else to use it to create an extra
admin account later. You don't need to remember or protect the token in
the link above for long — it stops being useful within seconds of your
first deploy going live.

Once you're logged in as admin, everything else happens from the site
itself — no dashboard steps needed:

  - Go to "Admin" in the members-area navigation to add new members. Enter
    their name and email; the system generates a one-time starting
    password shown on screen, which you pass on to them. They can change
    it themselves afterwards from "My Account".
  - From the same Admin page you can promote a member to admin, demote an
    admin back to a regular member (you can't demote yourself if you're
    the only admin left — the site won't let the club get locked out),
    reset anyone's password if they lose it, or remove a member entirely.
  - Changing or resetting a password immediately signs that person out
    everywhere else, so a lost or shared device can't stay logged in
    after a password change.
  - From "Admin -> Events" you can add, edit, or delete the events that
    show up on every member's Events tab (date, event website link,
    location, start time, access time, organiser, parking, floor area,
    accommodation, fuel, a free-text description for anything else members
    should know, and the droids already confirmed for it). The date is
    picked from a real calendar widget rather than typed in — pick just a
    start date for a single-day event, or also fill in an end date for a
    multi-day one. Event Website, Start Time, Access Time, Organiser, and
    the description are all optional — leave any of them blank and that
    part just doesn't show. Deleting an event also clears any
    RSVPs/added-droids that were logged against it.
  - Every event added (or approved — see below) here also appears
    automatically on the PUBLIC Events page (public/events.html) — no
    separate step needed. The public page only ever shows the event's
    title, date, location, and its "More Details" link (if a website was
    given) — never the logistics fields, RSVP counts, or the confirmed
    droid list, which stay members-only. Once an event's last day has
    passed, it quietly drops off the public page on its own (it stays on
    the members-area list and in the admin table either way).
  - Members aren't limited to just watching the calendar — from their own
    Events tab there's a "Suggest an Event" form where any member can
    propose a new event (title, date, location, an optional website link,
    organiser, and a description). It doesn't show up on anyone's calendar
    (public or members-only) right away — it lands in a "Pending Approval"
    queue at the top of Admin -> Events, where an admin can Approve it
    (which adds it to the real calendar, same as if an admin had typed it
    in directly) or Reject it (which just discards the suggestion).
    Member-submitted events don't include the admin-only logistics fields
    (parking, floor area, accommodation, fuel) — an admin can fill those in
    afterwards by editing the approved event if needed.
  - Every member (not just admins) can add a profile photo from
    "My Account" — JPEG, PNG, or WEBP — which then shows next to their name
    in the Directory tab instead of their initials, AND on the PUBLIC About
    page's "Meet the Members" section (this is a deliberate, requested
    change — profile photos used to be members-only; now they're shown
    publicly, same as a member's name, droid, and description already
    were). A member who'd rather not have their photo public can just
    remove it from "My Account" — it disappears from both places at once.
    A photo over 1.5MB is automatically shrunk down to fit rather than
    rejected (a typical phone photo is resized in a fraction of a second)
    — there's no need to resize anything yourself before uploading. Only
    genuinely huge files (over 8MB) or non-photo files get turned away.
  - Any member can post a build-log update from the Build Logs tab (droid
    + a short caption — their name is added automatically), and can
    optionally attach a photo (JPEG, PNG, or WEBP; oversized photos are
    automatically shrunk to fit, same as profile and gallery photos). These
    photos are only ever shown in the members-only Build Logs tab, never on
    the public site. From "Admin -> Build Logs" you can edit or delete any
    post, in case something needs correcting or removing — deleting a post
    removes its photo too, if it had one.
  - From "Admin -> Members" there's now an "Edit" button per member to fix
    a typo in their name, email, or droid without having to remove and
    re-add them.
  - Every member can add a short "About You" description, and a nickname,
    from "My Account" (the description up to 500 characters, the nickname
    up to 40). Once saved, both show up on the PUBLIC About page's "Meet
    the Members" section — the nickname appears in brackets after the
    member's name (e.g. "Jason Harris (Chewy)"), and the description
    appears alongside their droid. Leaving either blank means that part
    just doesn't show. A member with no account created yet never appears
    on the About page at all — there are no placeholder/fake members, only
    real registered members who exist show up, and only once they exist.
  - Every member can add photos from the Gallery tab (JPEG, PNG, or WEBP)
    which then show up immediately on the PUBLIC Gallery page for anyone to
    see — no login needed to view them. Same as profile photos, an
    oversized photo is automatically shrunk to fit rather than rejected.
    From "Admin -> Gallery" any admin can remove a photo that shouldn't be
    there; members can only add, not remove (same "add vs moderate" split
    as Build Logs).
  - Every member can add a photo of their own droid from the "Our Droids"
    tab (droid type, an optional custom name like "R5-D3", an optional
    caption, and a required photo — JPEG, PNG, or WEBP, auto-shrunk if
    oversized same as everywhere else). These photos replace the old
    generic "R2 Astromechs / BB-Series / Other Builds" placeholder cards in
    the "Our Droids" section on the PUBLIC homepage — no login needed to
    view them. From "Admin -> Droids" any admin can remove a photo that
    shouldn't be there; members can only add, not remove (same pattern as
    the Gallery and Build Logs).


4. POINT norwichdroids.co.uk AT THIS SITE
-----------------------------------------------
This requires moving the domain's nameservers to Cloudflare, which also
solves the DNS/hosting-linkage issue you were hitting on Fasthosts —
Cloudflare manages the whole chain itself once this is done.

  a) In the Cloudflare dashboard, go to "Add a domain" (sometimes labelled
     "Websites" or "Add a Site") and enter norwichdroids.co.uk. Pick the
     Free plan. Cloudflare will scan your existing DNS records.

  b) Cloudflare will show you two nameservers (something like
     ns1.cloudflare.com / ns2.cloudflare.com — yours will differ). Go to
     wherever the domain itself is registered (check your Fasthosts
     account under Domains, or wherever you originally bought
     norwichdroids.co.uk) and replace the existing nameservers with the
     two Cloudflare gives you.

  c) This can take anywhere from a few minutes to 24 hours to propagate.
     Cloudflare will email you and show the domain as "Active" once it's
     done.

  d) Once Active, go to your Worker -> Settings -> Domains & Routes ->
     Add -> Custom Domain -> enter norwichdroids.co.uk -> Add Domain.
     Cloudflare provisions SSL automatically — no separate certificate
     steps needed.

Until this is done, the workers.dev URL from step 1(f) works as a fully
functional preview of the real site.


5. EDITING CONTENT
--------------------
No admin panel — content lives directly in the source files, which is
normal for a site this size:

  - Public events page:         public/events.html now loads its list of
                                 upcoming events live from "Admin -> Events"
                                 (no file to edit) — same list members see,
                                 but only title/date/location/website link,
                                 and only events that haven't happened yet
  - About page members:         public/about.html
  - Droid showcase cards:       public/index.html now loads real member
                                 droid photos live from the "Our Droids"
                                 tab/Admin (no file to edit) — the 3 old
                                 placeholder cards are gone
  - Member events + logistics:  managed from "Admin -> Events" on the live
                                 site now (no file to edit) — date, website
                                 link, location, organiser, parking, floor
                                 area, accommodation, fuel, and confirmed
                                 droids all live there
  - Droid type dropdown:        src/index.js  (the DROID_OPTIONS array)
  - Member directory:           managed from the Admin page on the live site
                                 itself now (no file to edit) — it lists
                                 whoever has an account, with their photo if
                                 they've added one
  - Build log posts:            src/index.js  (the BUILD_LOGS array)
  - Footer email/address/social: every public/*.html file, near the bottom
                                 (the footer-social links are the same 3
                                 icons/URLs repeated on every page — update
                                 all of them together if a link changes)

After editing src/index.js, redeploy (push to GitHub if using option 1, or
run `npx wrangler deploy` again if using option 2) for changes to take
effect — static .html edits under public/ redeploy the same way.

Anything in [square brackets] is a placeholder — search for "[" across the
files to find what still needs filling in (real member names, venue
details, etc.).


6. REPLACING PLACEHOLDER PHOTOS
----------------------------------
Member directory photos on the About page (public/about.html) still show a
striped "PHOTO" placeholder (defined in public/css/style.css, the .thumb
rule) — the homepage droid showcase and the Gallery page both already show
real member-uploaded photos. To use real photos elsewhere:
  - Add your image files into public/img/.
  - In the relevant .html file (or src/index.js for build logs), replace:
        <div class="thumb">PHOTO</div>
    with:
        <div class="thumb"><img src="/img/your-photo.jpg" alt="..."></div>


7. HOW DATA IS STORED NOW
-----------------------------
RSVPs, added droids, member accounts, and login sessions are all stored in
the KV namespace wired up in wrangler.jsonc — you don't need to manage this
directly, the Worker reads and writes it automatically. If you ever want to
clear all RSVPs/added droids and start fresh, you can do so from the
Cloudflare dashboard under Workers & Pages -> KV -> (your namespace) ->
delete the "rsvps" and/or "droids" keys.

Member accounts live there too, as "user:<id>" and "email:<address>" keys,
and passwords are never stored in plain text — only a salted, hashed form
that can't be reversed. There's normally no need to touch these directly;
use the Admin page on the site itself to add, promote, demote, reset, or
remove members instead.

The member-area event list lives under a single "events" key, and profile
photos live under "photo:<id>" keys (stored as the image data itself, not
a link to anywhere else) — again, no need to touch either directly; use
"Admin -> Events" and each member's own "My Account" page instead.

Each member's "About You" description is stored on their own account
record, same as their name and droid — no separate key. Gallery photos
work the same way as profile photos: a small "galleryindex" key lists
every photo (who added it, its caption), and the image data itself lives
under its own "galleryphoto:<id>" key. Add and remove these from the
Gallery tab (members) and Admin -> Gallery (admins) rather than the
dashboard directly.

Build log posts live under a single "buildlogs" key, and a post's optional
photo (if it has one) lives under its own "buildlogphoto:<id>" key, same
pattern as gallery photos — but served only to logged-in members, never
publicly. Start time, access time, organiser, description, and the event
website URL are just extra fields on each event inside the "events" key,
same as the ones that were already there — as is the event's year, now
that events are entered through a date picker rather than typed in by
hand. The public Events page reads the same "events" key through a public
API endpoint that only ever returns the title/date/location/URL fields —
nothing members-only ever reaches that endpoint.

Member-submitted event suggestions live under a separate "pendingEvents"
key — entirely separate from the live "events" key, so a suggestion never
shows up on anyone's calendar or in RSVPs until an admin approves it from
Admin -> Events. Approving one moves it into the "events" key (generating
it a proper event id, same as an admin-added event); rejecting one just
removes it from "pendingEvents" — nothing is kept.

Droid showcase photos work the same index-plus-blob pattern as gallery
photos: a "droidshowcaseindex" key lists every entry (who added it, the
droid type, an optional custom name, an optional caption), and the image
data itself lives under its own "droidshowcasephoto:<id>" key. Add and
remove these from the Our Droids tab (members) and Admin -> Droids
(admins) rather than the dashboard directly. A member's nickname is
stored on their own account record, same as their bio — no separate key.

A few small pieces of the site are deliberately public with no login at
all, because they power the public homepage, About, and Gallery pages: the
member list (name, nickname, droid, description, and profile photo only —
never email or anything else account-related), the gallery photos, and the
droid showcase photos. Nothing else in the members area is reachable
without logging in. Profile photos are served at a separate public URL
from the one the members-only Directory tab uses, so removing a photo (or
never adding one) means it's simply never reachable at all — public or
private.

Photo resizing (both profile photos and gallery photos) uses a small
package called "@cf-wasm/photon", listed in package.json. Cloudflare
installs it automatically as part of every deploy — there's nothing you
need to do. If that package were ever somehow unavailable, the site
doesn't break: uploads just go back to being rejected with a "please use
one under 1.5MB" message instead of being resized, exactly like before
this feature existed.


QUESTIONS
-----------
Cloudflare's own documentation (developers.cloudflare.com/workers) covers
the platform-specific steps in more depth if anything above doesn't quite
match what you see in the dashboard (it does change over time).
