# Handoff

## State (2026-10-11)
Phases 0–3 first pass done with fixture content. Phase 4 (Sheets): source + parsers + Apps Script + hardened `/api/revalidate` done on `data/sheets` (Juanpi, 6 commits on top of `f42007c`, pushed to Juanpi's fork, to be merged into `main` via PR). The script is installed in the real sheet. Production still runs on the fixture until Nico sets the Vercel env vars (Requests). See the updates below.
- Build with `CONTENT_SOURCE=sheets` reads the real sheet at build time: an invalid required value (e.g. a bad opening-hours cell in `config`) fails `pnpm build` on purpose, with the reason in the log. To build without Google: `CONTENT_SOURCE=fixture pnpm build` (PowerShell: `$env:CONTENT_SOURCE='fixture'; pnpm build`).
- `pnpm typecheck`, `pnpm test` (10 selector tests) and `pnpm build` pass, also with `BASE_PATH=/testsite/caravelas` (assets, hreflang, noindex meta + header verified in the build output).
- Hero: poster → lazy WebGL2 zigzag refraction on `public/video/hero.{webm,mp4}` (≈2 MB each, 960×540, 24 fps), with green tint overlays. Falls back to the poster on no WebGL2 / reduced motion / saveData / context lost. Pauses off-screen and on hidden tab. Shader params are in `src/components/Hero/refraction.ts` (tuned by eye against Figma `1:10`, not pixel-matched).
- Marquee, feature rotator (4 real features from Figma), schedule (table + day tabs, "today" in Europe/Lisbon), price band with squiggle, Capitães, footer, mobile menu, PT `/` + EN `/en`, JSON-LD, OG image, `/status`, `/api/revalidate`.
- Assets from Figma in `public/assets/` (logo, feature icons, team photo, map, CrossFit logos, squiggles). Raw downloads and reference screenshots are in `source/` (git-ignored).
- Fixture content mirrors the Figma desktop frame. Placeholders: RegyBox CTA link, Instagram/Facebook URLs of the gym, footer opening hours, JSON-LD geo. Confirmed: WhatsApp +351 912 849 143; emails feu.ferreira@ and ana.lima@caravelas.fit.

## Update — fidelity pass + languages (2026-10-09)
- Layout re-done from Figma `get_design_context` per section (colors and sizes are the Figma values; text sizes follow Figma, e.g. cell names 12px, coach line 8px, bios 12px — deliberate, the user asked to follow Figma over the legibility deviations in SPEC §12.1). Geometry measured at 1728px matches Figma: header 147, hero 667, column 1000, table 143/32/43, price items at 303/485/683/881, team 502 with the 931px photo at x=864, map 374×301.
- Languages: PT (`/`), EN, ES, FR, DE, RU, UK (`/en`, `/es`, `/fr`, `/de`, `/ru`, `/uk` via `src/app/(intl)/[lang]`). Language menu is a dropdown with inline SVG flags (replaces the `PT · EN` toggle, SPEC D5). UI strings in `src/i18n/*.ts` (machine-written translations: ask native speakers to review). Cyrillic uses Source Sans 3 as a per-glyph fallback (Lato has none).
- Hero title is never translated. Map: real Google Maps iframe (lazy), loaded as soon as the visitor accepts the cookie notice (the only third-party cookies on the site; choice in localStorage, reopenable from the footer; until then a placeholder with an "open in Google Maps" link). **Before launch:** write the real Cookie/Privacy policy pages the footer links to.
- Inter Bold is used for the schedule section title (as in Figma).

- Legal: **ported** (owner decision: use the old site's texts, literally). `/politica-de-privacidade` and `/politica-de-cookies` (Portuguese, grey page like the team section) with the verbatim text of the old Wix pages, kept in `src/content/legal/`; footer + cookie bar link to them (`config.privacyHref/cookiesHref` only override). This resolves SPEC §3.5 step 4 for the policies; the old Wix URLs can be redirected to these when the Wix site closes. Known limits of the old text: it does not mention Google Maps, has no date, PT only. `docs/COOKIES_ADDENDUM.md` (Maps paragraph) is parked, not used.

## Update — Google Sheet source (Juanpi, 2026-10-09)
Branch `data/sheets`. Details for both of us in **`docs/SHEET.md`** (tabs, columns, formats, errors).
- `src/content/parse/values.ts`: tolerant cell parsers (SPEC §4.4) — times, opening hours, dates, prices, booleans, weekday/kind/icon/side dropdowns, phone → E.164, email lists, URLs, stable row ids. Never throw; `null` = not understood.
- `src/content/parse/tabs.ts`: `parseSheet(tabs)` → content + Portuguese warnings per tab/row (shown on `/status`). Bad optional cell → field dropped; bad required cell → row skipped; missing tab / bad required `config` key / no valid class or price → `SheetError` (ISR keeps the last good page).
- `src/content/sources/sheets.ts`: one `values.batchGet` (API key, sheet shared by link as viewer), 10 s timeout; Google's error messages can echo the key, so they go through `redactKey()` (`sources/redact.ts`, tested) before being thrown/logged. `index.ts`: `CONTENT_SOURCE=sheets` → `loadSheets()`. `.env.example` documents `SHEETS_ID` / `SHEETS_API_KEY`.
- Tests: `values.test.ts` (95 cases) and `tabs.test.ts` (a deliberately messy sample sheet; output validated against `SiteContent`).
- The real sheet exists, owned by the site's dedicated Google account (ask Juanpi), seeded from the fixture via CSV; round-trip CSV → `parseSheet` matched the fixture exactly (after Nico's translated bios too). Sheet UX (checkboxes, dropdowns, protected header, example rows, LEIA-ME, "Publicar" menu): done 2026-10-11, see "Apps Script for the sheet" below.
- No schema change. Sheet-layout differences from SPEC §4.3 (all 7 languages in `config`, `equipa.instagram/foto_lado/ordem`) are listed in `docs/SHEET.md`.

## Deploy (2026-10-09)
- Repo: https://github.com/nic0lino/caravelas-site (public). Vercel project `caravelas-site` (scope `nicods9302-4882s-projects`), GitHub-connected: every push to `main` deploys to production. Env vars are set in Vercel (Production only), incl. a random `REVALIDATE_SECRET`.
- Live: https://caravelas-site.vercel.app/testsite/caravelas and https://nicolino.zip/testsite/caravelas (rewrite in the portfolio's `vercel.json` + `testsite` excluded from its `proxy.ts` matcher; the portfolio is deployed with `vercel deploy --prod`, it has no git remote).
- Behind that rewrite Next's segment prefetches 404, so header/language `Link`s use `prefetch={false}`.
- Hobby plan: Juanpi can't be added to the Vercel project; to work on it he needs the `cravel` team (Pro) or his own Vercel + GitHub collaborator access.

- Team photo tags (`src/components/Team/PhotoTags.tsx`): Instagram tags for each coach + the gym (`config.instagram`, pointing at the rack bars). The triangle aims at the tagged spot; if a tag would be cut by the edge of the visible photo or hit another tag it swings to the other side of its spot (never off the margins). Touch: all appear ~1.2s after the photo is seen. Pointer (desktop): hovering a person's face/chest shows only their tag (zones in `zoneAt`: her half, his half, rack bars = gym); the tag follows the cursor, its triangle points at the cursor, it swings to the other side near the edges, and clicking the person opens their Instagram. Keyboard focus on a tag also shows it. Handles are shown without the @. Spot coordinates are fractions of the cut-out (`public/assets/team-people.webp`) — re-tune `SPOTS` if it changes. Real handles in the fixture: @feu_ferreira, @_ana.lima_; gym handle (@crossfitcaravelas) still to confirm.

- Team section follows the Figma frame **"Os capitaes"** (`24:7062`, page `page`), which supersedes SPEC §6.5: gym photo (`team-bg.jpg`, 1200×800 offset -149) faded into the card (#ededed gradient 32%→100% + 65% veil) behind the cut-out coaches (`team-people.webp`, 628×586, standing on the card floor, card 586 high). Mobile (< lg) uses the same recipe in a 255-high window with Ana first, then Feu (Frame 56 `24:7090`). Desktop composition from `lg` (1024+).

- Type scale (2026-10-09): only 12/14/16/20/32 + fluid `display` (+ `2xs` 10px for the cookie bar), defined in `globals.css`. Table: class names 14px, coach line 12px, times 20px, rows 48. Marquee 20px (14 mobile). Hero stacks below `lg`. Cookie notice is a slim bottom bar. Mobile team: the cut-out rises 40px over the section above (schedule section's bottom padding is 12px). Schedule table + pricing band are one card (table rounds only the top).

- Floating CTA (`src/components/Hero/CtaButton.tsx`): a copy of the trial-class button fixed to the screen appears (fade + 14px slide, 260ms) once the hero's own has scrolled out above the viewport, and leaves when it is back. Same X as the original (same column/gutters/alignment per breakpoint), Y fixed 72px from the bottom (above the cookie bar when it is open). Rendered in `<body>` via a portal. The button's hard shadow is its own layer with `mix-blend-multiply` (a drop-shadow can't blend; the floating copy needs a second fixed layer because `fixed` is its own stacking context). Button hover turns the label white.

## Update — Apps Script for the sheet (Juanpi, 2026-10-11)
`apps-script/Code.gs` + `appsscript.json` (bound to the sheet). Details and install steps in `docs/SHEET.md`.
- **Installed and run in the real sheet** ("Configurar folha" OK on all 6 tabs). "Configurar publicação" not done yet: needs the `REVALIDATE_SECRET` from Vercel (Nico).
- Menu **Site**: Publicar alterações (checks the sheet, then `POST /api/revalidate`), Verificar folha (rows the site would skip), Ver avisos do site (`/status`), Admin → Configurar folha / Configurar publicação. `SITE_URL` + secret live in Script Properties, never in the repo.
- Configurar folha (idempotent): checkboxes (`ativo`, `precos.destaque`), dropdowns (`dia`, `tipo`, `icone`, `foto_lado` fixed in the script — they are the values the site's code understands; `hora` and `coach` from the hidden `listas` tab), validation that rejects bad prices/dates/links/instagram/`ordem`, red = required cell empty in an active row, grey = `ativo` unchecked, frozen + protected header (and `config.chave`), one grey example row per tab (unchecked, `[site]` note), `LEIA-ME` tab in PT.
- Table look: dark green header (lighter for translation columns), borders, per-column widths, banded rows; `horario` tinted per day instead. **No merged cells**: the API returns only the first cell of a merge, so the other rows would lose their value.
- Hidden `listas` tab (not read by the site): `horas` 05:00–22:30 every 15 min (+ times already used; owner can add), `outros_coaches` (e.g. `Dinâmico`), `coaches` = `equipa.nome` + extras, rebuilt by the `onEdit` simple trigger.
- Lessons: the sheet's locale (PT/ES) needs `;` as the argument separator in validation/conditional-format formulas — the script detects it with a probe and flushes inside `try` (Sheets throws on flush, not on the call). Google won't hide the active tab, so `listas` is hidden at the end with `LEIA-ME` active.
- Checks: the rules were run against the seed CSVs (0 false problems) and the parser's test inputs.
- 2026-10-11: `config` values are now checked too (Verificar/Publicar + validation + red): a test value `asfsa` in `horario_sab` had passed the sheet and broke `pnpm build`. `hoursRange`/`phoneE164`/`badEmails`/URL rule were compared against `parseTimeRange`/`parsePhone`/`parseEmails`/`parseUrl` on edge cases: identical, and the sheet regexes never reject a value the site accepts. Re-paste `Code.gs` in the sheet and run Configurar folha again.
- Cleanup in the real sheet: done 2026-10-11 (empty `marquesina` rows 3–4 deleted; `precos` "2 Aulas por semana" back to 60).

## Update — `/api/revalidate` hardened (Juanpi, 2026-10-11)
- `src/app/api/revalidate/guard.ts` (+ `guard.test.ts`): constant-time secret check (`timingSafeEqual` over SHA-256 of both sides, so length doesn't leak), client IP from `x-forwarded-for`, in-memory fixed-window limiter.
- `route.ts`: 503 if `REVALIDATE_SECRET` is missing, shorter than 16 chars or `change-me`; 429 + `Retry-After` after 5 wrong secrets per IP in 15 min or 10 requests per IP in 1 min; 401 wrong secret (logged with the IP); 200 revalidates every language's home **and `/status`** and returns the paths. Responses are `no-store`.
- The limiter lives in each serverless instance's memory: a speed bump against brute force and click loops, not a global guarantee. The real protection is a long random secret.
- `apps-script/Code.gs` "Publicar" now explains 429 (wait N minutes) and 503 (secret not configured on Vercel).
- **Nico:** check that the Vercel `REVALIDATE_SECRET` is ≥ 16 chars (e.g. `openssl rand -hex 24`), or Publicar gets 503.

## Incident — Google suspension (2026-10-11)
- Google's automated checks suspended the Cloud project `caravelas-site` (so the API key returned `403 Consumer 'api_key:…' has been suspended`) and Drive showed the sheet as violating the Terms of Service. Most likely a false positive: brand-new account + sheet public by link with emails/phone + an Apps Script that prompts for a "Segredo" and calls an external URL.
- Same day: project **reactivated** after Google's review ("currently complies with our policies"). The API key was **rotated** (the old one had been pasted in a chat; it was never committed). The sheet is readable again through the API.
- Code fix: Google's error message echoed the full key into the build log → `redactKey()` (`src/content/sources/redact.ts`).
- If it happens again: don't create copies or new accounts in a hurry (repeat flags can escalate to the account); request a review (sheet → Share → Request a review; Cloud: the reactivation form in the notice email).
- Option to remove the trigger: read the sheet with a **service account** instead of an API key, so the sheet stays private (shared only with the service account's email). Only `sources/sheets.ts` changes (JWT → OAuth token → same `batchGet`); parsers, tests and Apps Script stay. Not urgent.

## Next steps
- Compare against Figma at 1728 / 440 widths (only checked by eye at 1200, 599 and 375); Playwright smoke test; Lighthouse on the deployed URL (not run).
- Hero: separate portrait video crop for mobile if needed; the source video is a split-screen of two clips, so check the crop on phones. Poster is a plain frame, not a pre-rendered shader frame.
- Marquee: verify no jump after font load / resize on a real device; reduced-motion CSS is untested.
- Privacy / Cookies pages (footer links are `#`) and Livro de Reclamações logo (text link for now).
- Deploy: Vercel project + rewrite in nicolino.zip (Nico, separate PR).
- Sheet: Site → Admin → Configurar publicação once Nico shares `REVALIDATE_SECRET`, then test Publicar (Juanpi).
- ~~Sheet: latest `apps-script/Code.gs` in the real sheet + Configurar folha again~~ done 2026-10-11.
- Sheet (optional): switch from API key + public link to a service account + private sheet (see Incident).

## Hero credential badges
- `src/components/Hero/Badges.tsx`: CrossFit Affiliates (→ `config.affiliateHref`), Google rating (→ maps.app.goo.gl link), Wodily Top 1 Lisboa (→ wodily.com/city/pt/lisbon). SVGs in `public/assets/badge-*.svg` (Wodily's embedded PNG downsampled to 700px).
- The Google rating (4.9, "more than 100 reviews") is baked into the SVG artwork: re-export it when the number changes.
- The Wodily and Google URLs are constants in `Badges.tsx`, not in the contract (see Requests).

## Feature animations (Lottie)
- Sources: Nico's `animacion1-4.json` (red strokes) → recoloured white and minified into `public/assets/anim/feature-{lifebuoy,anchor,ship-a,ship-b}.json` (only the red was swapped; the blue/brown layers are track mattes). 300 frames @ 60fps = 5s = how long each feature stays on screen.
- Mapping (by content, not by file number): lifebuoy→anim1, anchor→anim3, 1st `ship`→anim2, 2nd `ship`→anim4 (by `order`). Done in `Hero.tsx`; a new feature icon needs a new animation + entry in `FeatureAnimation.tsx` or it falls back to the static icon.
- `FeatureRotator.tsx` is now timed by a remaining-time clock (hover/focus/offscreen freezes animation and countdown together). `FeatureAnimation.tsx` lazy-loads `lottie-web` (light SVG build, ~47KB gz, new dependency) + the JSON for the visible and next feature; static icon is the fallback (SSR, reduced motion, failed load).
- Budget note: that chunk is lazy, like the shader one.

## Open questions
- Real RegyBox link, WhatsApp, email, social URLs, opening hours; 3×/sem price (desktop €70 vs mobile).
- Museo Sans licence (D4). The 4th feature reuses the ship icon.
- Coach copy/bios are taken from the Figma frame; confirm they are final.

## Requests
- ~~Juanpi: implement `src/content/sources/sheets.ts` (+ parsers)~~ done on `data/sheets`. ~~Apps Script~~ done. ~~Harden `/api/revalidate`~~ done 2026-10-11 (see below).
- Nico: send Juanpi the `REVALIDATE_SECRET` (privately) so the sheet's "Publicar" menu can be configured.
- Nico: add Juanpi as a GitHub collaborator (he works from a fork until then).
- Nico (Vercel, Production): add `SHEETS_ID` and `SHEETS_API_KEY` (Juanpi sends them privately; the key was rotated on 2026-10-11, use the new one), then switch `CONTENT_SOURCE` to `sheets`. Until then production stays on the fixture, so merging `data/sheets` changes nothing live.
- Nico: pin pnpm in `package.json` (`"packageManager": "pnpm@10.28.0"`): without it corepack picks pnpm 12, which Node 22's corepack can't start (`Cannot find module …pnpm.cjs`); the lockfile is v9.0.
- Contract (Nico/Juanpi, `contract:` PR): optionally add `wodilyHref` and `googleReviewsHref` to `SiteConfig` so the badge links can be edited from the sheet.

## Wix inventory (Juanpi, 2026-10-12)
Looked at the old site's Wix dashboard (Juanpi is Admin/Co-Owner) + public sitemap + DNS. No personal data copied here.

**Plan & domain**
- Wix Premium "Core", 2-year cycle, paid until **Nov 21 2027**. Domain `caravelas.fit` is **registered at Wix**, renews **2029**. No hurry on billing; cancel the plan before the Nov 2027 renewal.
- DNS is hosted by Wix (`ns0/ns1.wixdns.net`). Apex A → Wix IPs, `www` CNAME → `cdn3.wixdns.net`.
- **Email is Google Workspace** (`MX 1 aspmx.l.google.com`), not Wix. When pointing the domain at Vercel: change only A/`www`, keep MX. (Or move DNS elsewhere copying MX first.)
- No SPF and no DMARC TXT records exist → gym email may land in spam. Worth adding (`v=spf1 include:_spf.google.com ~all` + a DMARC record) at launch.

**Live lead capture on Wix (not in our SPEC)**
- Forms with recent submissions (Oct 2026): **"Aula Experimental"** (trial class, since 2019), **"Contato"**, "Inscrição Teaser"; plus "Fitness Match XP" (19 submissions, Jun–Jul 2026, landing `/fitnessmatch`).
- Two custom automations (by Feu) fire on "Aula Experimental" and "Contato" submissions.
- Contacts: ~1,900, ~1,500 email subscribers. Exportable as CSV (Contacts → Import/Export) — personal data, GDPR.
- Decision needed with Feu: the new site has no form (SPEC non-goal). Either accept WhatsApp-only for trial classes, or add a small trial-class form (e.g. → Google Form / Apps Script → the gym's email).

**Not in use**
- Wix Stores / Bookings / Payments: 0 orders in last 30 days; Wix Payments has an unresolved verification issue. Other installed apps: Multilingual, Pro Gallery, Events Calendar, AdSense, WhatsApp chat.

**Content facts (resolve Open questions)**
- Address: R. Arco do Chafariz das Terras, 13A, 1200-607 Lisboa.
- Instagram `@crossfitcaravelas` confirmed; Facebook `facebook.com/crossfitcaravelas`.
- Opening hours (old site): Mon–Fri 7h–21h, Sat 9h–12h, Sun closed.
- Prices (old site): drop-in €20, 2×/sem €60, 3×/sem **€70**, trânsito livre €80.
- **Phone mismatch:** old site's WhatsApp/trial CTA and Wix business info use **+351 912 423 080**; footer shows +351 912 849 143 (the one in our fixture). Ask Feu which is the WhatsApp.
- Old site has no RegyBox link either.
- Search (Google, Sep–Oct): top queries "crossfit caravelas", "caravelas crossfit", "crossfit carcavelos". ~250 sessions / 30 days.

**301 map (SPEC §3.5 step 5)**
| Old URL | New |
|---|---|
| `/planos`, `/book-online`, `/service-page/*`, `/product-page/*` | `/#horarios` (schedule + pricing band) |
| `/teaser-politica-de-privacidade` | `/politica-de-privacidade` |
| `/copia-politica-de-privacidade` | `/politica-de-cookies` |
| `/fitnessmatch`, `/fitnessmatch-thanks`, `/obrigado`, `/temp-2` | `/` (unless the Fitness Match landing must stay) |
