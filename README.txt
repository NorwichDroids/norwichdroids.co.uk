NORWICH DROIDS WEBSITE — CLOUDFLARE DEPLOYMENT NOTES
======================================================

WHAT CHANGED FROM THE FASTHOSTS VERSION
------------------------------------------
Cloudflare Workers don't run PHP, so the members area (login, RSVP,
add-a-droid) has been rebuilt in JavaScript as a Cloudflare Worker, with
Cloudflare KV replacing the two JSON files as storage. The public pages
(Home, About, Events, Gallery) are now plain static .html files — same
look, same content, just no server-side PHP needed to render them.

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


3. SET THE REAL MEMBERS PASSWORD
------------------------------------
The shared password is stored as a Cloudflare "secret" — never written into
any file, so it's never at risk of being visible in the repository.

Via the dashboard:
  Workers & Pages -> your Worker -> Settings -> Variables and Secrets ->
  Add -> name it exactly  MEMBERS_PASSWORD  -> type your chosen password ->
  Encrypt -> Save and deploy.

Via the command line instead, if you used option 2 above:
  npx wrangler secret put MEMBERS_PASSWORD
  (it will prompt you to type the password)

Everyone shares this one password to reach the Members Area — there are no
individual accounts, same as before.


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

  - Public events:              public/events.html
  - About page members:         public/about.html
  - Droid showcase cards:       public/index.html
  - Member events + logistics:  src/index.js  (the EVENTS array near the top)
  - Droid type dropdown:        src/index.js  (the DROID_OPTIONS array)
  - Member directory:           src/index.js  (the MEMBERS array)
  - Build log posts:            src/index.js  (the BUILD_LOGS array)
  - Footer email/address:       every public/*.html file, near the bottom

After editing src/index.js, redeploy (push to GitHub if using option 1, or
run `npx wrangler deploy` again if using option 2) for changes to take
effect — static .html edits under public/ redeploy the same way.

Anything in [square brackets] is a placeholder — search for "[" across the
files to find what still needs filling in (real member names, venue
details, etc.).


6. REPLACING PLACEHOLDER PHOTOS
----------------------------------
Droid showcase cards, gallery tiles, and member photos currently show a
striped "PHOTO" placeholder (defined in public/css/style.css, the .thumb
rule). To use real photos:
  - Add your image files into public/img/.
  - In the relevant .html file (or src/index.js for build logs), replace:
        <div class="thumb">PHOTO</div>
    with:
        <div class="thumb"><img src="/img/your-photo.jpg" alt="..."></div>


7. HOW DATA IS STORED NOW
-----------------------------
RSVPs and added droids are stored in the "norwich-droids-members" KV
namespace instead of the old JSON files — you don't need to manage this
directly, the Worker reads and writes it automatically. If you ever want
to clear all RSVPs/added droids and start fresh, you can do so from the
Cloudflare dashboard under Workers & Pages -> KV -> norwich-droids-members
-> delete the "rsvps" and/or "droids" keys.


QUESTIONS
-----------
Cloudflare's own documentation (developers.cloudflare.com/workers) covers
the platform-specific steps in more depth if anything above doesn't quite
match what you see in the dashboard (it does change over time).
