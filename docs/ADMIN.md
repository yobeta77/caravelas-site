# Internal admin panel — proposal (draft for Juanpi + Nico)

Status: **proposal**, nothing built. Written 2026-10-12 after the Google Sheet was blocked by Google ("Terms of
Service") and the owners asked for a sturdier way for the gym to change schedules, prices and contact data.

## 1. Goal
Let the gym staff (Feu, Ana) change **schedule, prices, contact data, marquee notice** (later: coaches, features,
translations) from a page that is part of the site, behind a login, without being able to break the public site.

Non-goals: member data, payments, bookings (RegyBox stays the booking tool), a general-purpose CMS, a blog.

## 2. What "sensitive" means here
The content is public; nothing in the database is confidential. The risk is **integrity**: a wrong cell, a renamed
tab, a deleted row, or a third party (Google) taking the document away. So the design optimises for: validation,
preview, history, rollback and an audit trail — not for hiding data.

## 3. Principles
1. **One contract.** The panel edits exactly what `src/content/schema.ts` describes. No parallel schema.
2. **Cannot publish something invalid.** Same zod validation as the site, plus business guards (see §6).
3. **Draft → preview → publish**, every publish is a version that can be restored in one click.
4. **The public site never depends on the panel being up.** It keeps serving the last published content (ISR).
5. **On brand** (see §7). The panel is a part of the product, not a generic back-office.
6. **Phone-friendly.** The gym will edit from a phone as often as from a laptop.
7. **Portuguese UI only** (the editors are PT speakers). Content fields still support the 7 site languages.

## 4. Architecture
```
src/app/(admin)/admin/...      route group, dynamic, noindex, not linked from the public site
src/lib/auth/                  Sign in with Google + allowlist (see 4.1)
src/content/sources/db.ts      new source: reads the *published* version (CONTENT_SOURCE=db)
src/content/sources/sheets.ts  stays: one-off import into the first draft, and as an emergency source
src/content/sources/fixture.ts stays: last-resort fallback / local dev
```
- **Public site:** unchanged. `getSiteContent()` gets one more `case 'db'`. Publishing calls the existing
  `/api/revalidate` logic server-side, so pages refresh in seconds instead of waiting for the 5-minute ISR window.
- **Admin pages** are `dynamic = 'force-dynamic'`, `robots: noindex`, excluded from `sitemap.ts`, same app and
  same Vercel project (no second deployment).

### 4.1 Authentication
- **Sign in with Google**, restricted to an explicit **allowlist of emails** (Feu, Ana, Juanpi, Nico; or the
  `@caravelas.fit` Workspace domain). No passwords to store, reset or leak.
- Candidates: Auth.js (self-contained) or Clerk (Marketplace-native). Decide in the contract PR; prefer the one
  that needs the fewest moving parts. Session = signed, httpOnly, SameSite cookie; CSRF protection on all writes.
- Roles: `editor` (edit + publish content) and `admin` (also manage the allowlist, restore versions, export).
- Rate-limit sign-in and writes; log every sign-in and every publish.

### 4.2 Storage
- A small managed Postgres from the Vercel Marketplace (e.g. Neon, free tier) — **verify current options and
  limits before committing**. Content is tiny (a few hundred rows), so one JSON document per version is enough:

| Table | Columns |
|---|---|
| `content_versions` | `id`, `created_at`, `author_email`, `status` (`draft` \| `published` \| `archived`), `note`, `content` (jsonb, an `EditableContent`), `based_on` (previous version id) |
| `site_state` | single row: `published_version_id`, `updated_at` |
| `audit_log` | `at`, `actor_email`, `action` (`sign_in`, `save_draft`, `publish`, `restore`, `allowlist_change`), `version_id`, `details` |

- **Backups:** nightly export of the published version as JSON to a private location; also exported on every publish.
- **Concurrency:** one open draft at a time per site; if two people edit, the second sees "X is editing since 10:32".
  (A lock with a timeout is enough for 2–4 editors.)

### 4.3 Contract changes (must go through a `contract:` PR)
- `meta.source` enum gains `'db'`.
- `EditableContent` = `SiteContent` without `meta` (the panel never edits `fetchedAt` / `warnings`).
- No change to the shape the UI consumes, so no UI churn on the public site.

## 5. Screens (v1)
| Route | What |
|---|---|
| `/admin` | Status: what is live (version, who, when), open draft, last 5 versions, content health (same checks as `/status`) |
| `/admin/horario` | Weekly grid editor (§5.1) |
| `/admin/precos` | Plans: name, price, featured flag, order; notes ("preços atualizados", promo) |
| `/admin/contacto` | Address, opening hours, WhatsApp, emails, Instagram/Facebook, map link |
| `/admin/marquesina` | Notices with highlight/text/link and **start/end dates** |
| `/admin/publicar` | Diff vs. live, validation result, "Pré-visualizar", **Publicar** |
| `/admin/historico` | Versions with author and note; restore as a new draft |
| `/admin/utilizadores` | Allowlist (admin only) |
Phase 2: `equipa` (coaches, photo side, Instagram), `destaques` (the 4 feature blocks), translation helper.

### 5.1 Schedule editor
- Looks like the public table (same columns, same lime/white hairlines, today highlighted) so staff edits what they
  will see. Click a cell to edit class kind, name, coach, note; "+" adds a slot; times are pickers (never free text).
- Copy a day to other days; mark a slot inactive instead of deleting (keeps history readable).

## 6. Safety rails
- **Validation = site contract** (zod) with field-level messages in Portuguese.
- **Blocking guards:** empty schedule; a weekday with no slots when it had some (needs an explicit "sim, sem aulas"
  confirmation); price missing or ≤ 0; invalid URL/phone/email; opening hours opens ≥ closes; a notice whose end
  date is before its start.
- **Warnings (not blocking):** a class without coach; a field with PT but no EN; a link that returns an error.
- **Preview** renders the real `HomePage` from the draft (`/admin/preview`, same components, noindex), in desktop
  and phone frames — what you preview is literally what ships.
- **Diff before publish** (field-by-field, in words: "Preço Drop-In: 20 € → 25 €").
- **Undo:** any version restores as a new draft; publish is never destructive.
- **Public site fail-safe:** if the DB is unreachable at revalidation time the site keeps the last good page
  (the `getSiteContent()` contract already says "throw so ISR keeps serving"), and `/status` shows the failure.

## 7. On-brand design system for the panel
The panel reuses the site's tokens and components; it must be impossible to tell it apart visually from the site.

- **Colour tokens** (from `src/styles/tokens.css`): background `moss-900 #304400`, surfaces `table-bg #232e07`
  and `band-bg #121901`, accents `lime-500 #99c82a` / `lime-400 #a4cf3d`, highlight and focus `yellow #fde00a`,
  inputs `ink #0e0f0c`, light panels `paper #ededed` (the legal pages' grey). Only add what is missing, and
  only as tokens: a muted **danger** colour (errors/destructive) and a **warning** tone, designed once.
- **Type:** Lato only (Source Sans 3 fallback for Cyrillic content). The existing scale **12 / 14 / 16 / 20 / 32**;
  no new sizes, no `text-[Npx]`. Titles 32 black, section labels 16 bold, form labels 14, helper text 12.
- **Lines and shape:** 1px lines everywhere; 0.5px hairlines only inside schedule-like tables; radii 10 (controls)
  and 16 (cards/groups), consistent top and bottom.
- **Components to reuse, not redraw:** `ScheduleTable` look for the grid editor, the gradient CTA for the primary
  action ("Publicar"), the language switch pill as the pattern for dropdowns, the legal-page "paper" layout for
  long forms and the history list, the footer for the sign-in screen's framing.
- **Interaction:** 200 ms micro-transitions, yellow focus ring, no layout shifts, `prefers-reduced-motion`
  respected. Hover/active states follow the schedule table (soft tints, never strong fills).
- **Tone:** short Portuguese, verbs first ("Guardar rascunho", "Publicar", "Restaurar versão"); confirmations say
  what will change, never "Tem a certeza?" alone.
- **Layout:** the site's 1000px column on desktop; single column on phones with sticky save/publish bar at the
  bottom; touch targets ≥ 44px.
- **Quality bar:** same rule as the site — if it looks "raro", it does not ship. Each screen gets reviewed against
  the live site at 375 / 768 / 1280 before merging.

## 8. Phases and acceptance
| Phase | Scope | Done when |
|---|---|---|
| 0 | Harden the sheet: make it private + service account, protected header rows, data validation, nightly JSON backup | The site no longer needs the sheet to be public; a deleted tab cannot take the site down |
| 1 | Auth + DB + `/admin` shell + schedule, prices, contact, marquesina + publish/history/preview + Sheets import | Feu can change a class time from his phone, preview it, publish it, and undo it; audit shows who did what |
| 2 | Coaches, features, translations helper (optional machine-draft, flagged until a human reviews), roles polish | Every field the sheet had is editable; sheet retired |
| 3 | Hardening: e2e tests on publish/restore, export, rate limits, runbook for Feu | A written one-page "how to" and a rollback drill |

## 9. Risks and open questions
- **Build/maintain cost:** a panel is a product. Phase 1 is the smallest useful cut; stop there if the gym's needs
  are met.
- **Auth bugs are the main security risk** → use a maintained library, keep the allowlist tiny, log everything,
  no self-signup.
- **Public repo:** nothing secret in code; secrets only in Vercel env (Secret type). The repo is public, so keep
  business metrics and credentials out of `docs/`.
- **Translations ×7** make forms long → PT required, other languages collapsed and optional.
- **Vendor/plan:** DB and auth providers need an owner and, if limits are exceeded, a payer (the gym).
- **Open:** Auth.js vs Clerk · Neon vs another Marketplace DB · allowlist vs whole Workspace domain · who is the
  second admin besides Nico · is machine translation wanted · do staff need a per-field "last changed by".

## 10. Ownership and PR plan
- `contract:` PR (Nico + Juanpi): `'db'` source, `EditableContent`, versioning notes in `CONTENT_CONTRACT.md`.
- `data/` (Juanpi): `db.ts` source, tables/migrations, publish + revalidate, backups, Sheets import.
- `ui/` (Nico, with Claude): auth screens, admin shell, editors, preview, diff, history, design-system pass.

## 11. Options and trade-offs (Juanpi, 2026-10-14) — for discussion with Nico
Context: in person we agreed to look at this as a **product with potential**, not only Caravelas' site.
That changes the cost/benefit of the panel: for one gym it is expensive for what it solves; for a product it
is the core. Nothing below is decided; see `docs/DECISIONS.md`.

### 11.1 Where the content lives
| Option | What | Pros | Cons | Fits the product idea? |
|---|---|---|---|---|
| **A. Google Sheet** (today) | Sheet + Apps Script menu/validation; site reads it via Sheets API | Already built and installed; free; staff know spreadsheets; Google handles access and version history | Not on-brand, no real preview; drafts/history are awkward; Google flagged it once (public link) → needs a service account + private sheet (Phase 0); one sheet per gym does not scale | Only as Caravelas' stopgap and as an import format |
| **B. Own DB + own panel** (§4–§8) | Neon Postgres + Auth.js (Google login, allowlist) + `/admin` in this app | On-brand, phone-friendly, preview/diff/history/rollback; same zod contract; multi-gym possible; no third party can take the content away | Weeks of work; auth is the main security risk; more accounts to own (Neon, Google Cloud) | **Yes** — this is the product |
| **C. Wix headless** | Next.js stays on Vercel; Wix CMS + Wix members act as the backend through Wix APIs; staff edit in Wix's dashboard | No DB/auth to build; a ready-made editor the gym may already know | Generic, not on-brand; lock-in to Wix plans/prices (not checked); each client gym would need its own Wix site/plan → we would sell "a frontend for Wix" | Weak |

### 11.2 Can the panel start before choosing A or B?
Yes. The panel never talks to storage directly; it uses an interface (repository pattern), like `getSiteContent()` does for reading:
```ts
interface ContentStore {
  getDraft(): Promise<EditableContent>
  saveDraft(content: EditableContent, author: string): Promise<void>
  publish(author: string, note?: string): Promise<void>
  listVersions(): Promise<VersionInfo[]>
  restore(versionId: string): Promise<void>
}
```
UI first against an in-memory/JSON store, then `SheetsStore` or `DbStore` without touching the UI. Caveats:
- **Writing** to the Sheet needs the service account (the current API key is read-only) → Phase 0 is a prerequisite for A.
- Drafts and history are natural in a DB and have to be emulated in a Sheet (extra tabs or Drive revisions).
- What must be agreed first is the **contract** (`contract:` PR): `EditableContent = SiteContent.omit({ meta })`,
  `VersionInfo { id, createdAt, author, status: draft|published|archived, note? }`, `meta.source` gains `'db'`,
  and the `ContentStore` interface above. ~30–40 lines; it is the common language between the UI and the storage.

### 11.3 Hosting and the domain (Wix)
- **Wix cannot host this app** in practice: Wix-managed headless hosting fully supports Astro and has no custom
  backend endpoints; we need SSR + `/api/revalidate` (+ DB/auth for the panel). "Self-managed" means hosting elsewhere.
- **We can keep the domain at Wix**: a Wix-bought domain can point to an external host without a transfer
  (Wix → Domains → Manage DNS Records: `A` for the root and `CNAME` for `www` with Vercel's values; delete old A/CNAME;
  up to 48 h to propagate). Transfer to another registrar later is optional.
- Before touching DNS: keep the **MX/SPF/DKIM** records if `@caravelas.fit` email runs through Wix or Google
  Workspace; confirm in the Wix account whether cancelling the site's Premium plan affects the domain (Wix's article does not say).

### 11.4 Costs for Caravelas alone (prices checked 2026-10-14)
| Piece | Cost | Note |
|---|---|---|
| Neon (DB) | Free | 1 GB/project, 100 CU-h/month, suspends after 5 min idle (first request after idle is slower) |
| Auth.js + Google login | Free | A library, not a service |
| Clerk (alternative) | Free up to 50k monthly retained users | No MFA on free; Pro ≈ USD 25/month |
| Google Sheets API | Free | — |
| **Vercel** | **Pro USD 20/developer/month** | **Hobby is non-commercial only**; a gym's site is commercial → needed with or without panel (is the `cravel` Pro team the one to use?) |
| Domain | a few €/year | Paid by the gym |
| Google Workspace (optional) | ≈ USD 7/user/month | Only for `@caravelas.fit` domain login; an email allowlist is free |
The real cost of the panel is **time** (build + maintenance) and **security responsibility** (login), not money.

### 11.5 Selling it to other gyms
- **Two models:** *done-for-you* (we build each box's site from the base, monthly fee for hosting + panel + support;
  can start now, scales with our hours) vs *self-serve SaaS* (sign-up, templates, payments, onboarding; scales
  without us, much more product). Suggested: done-for-you with Caravelas as pilot + one partner box, then decide.
- **Technical, if we go multi-gym — decide before Phase 1, expensive to change later:**
  - one app/deployment for all gyms, tenant resolved by domain (Vercel Pro: unlimited domains per project);
  - `gym_id` on every content table; login knows which gym a user belongs to (Clerk "organizations", or by hand with Auth.js);
  - split **template** from **brand** (colours, logo, fonts, which sections show, fixed texts) — today everything is
    Caravelas-specific (Figma, hero shader, Lottie, Capitães photo tags);
  - booking integrations (Caravelas uses RegyBox; other boxes use other systems) — importing schedules could be a differentiator; APIs to be researched;
  - legal pages per gym (each gym is the GDPR controller for its site).
- **Costs at scale:** fixed ≈ USD 20–60/month (Vercel Pro seats + usage; Neon/Auth mostly free at this size);
  per extra gym ≈ 0 + its domain. The expensive part is support time.
- **Non-technical (check with an accountant):** invoicing in Portugal (activity/company), contracts per gym
  (scope, who owns content and domain), GDPR processor role for staff accounts.
- **Validate before building:** talk to 4–5 box owners in Lisbon (what they use, what hurts, what they would pay);
  look at competitors (Wix/Squarespace templates, box-management platforms that include a website) — not researched yet.

### 11.6 Juanpi's view and questions for us
View: do **Phase 0** now (service account + private sheet: useful in every scenario); agree the **contract** and
the **multi-gym yes/no**; build the panel (option B) with Caravelas as first real user; keep Wix only as the
domain registrar (+ email if applicable).

To decide together:
1. Product model: done-for-you or SaaS? CrossFit boxes only or gyms in general?
2. Multi-gym from day one (`gym_id`, tenant by domain)?
3. Auth.js or Clerk? Allowlist or Workspace domain?
4. Which Vercel team/plan hosts production (Pro needed for commercial use)?
5. Domain: keep at Wix + DNS to Vercel now, transfer later? Who checks the email (MX) setup?
6. Who validates with other box owners, and when?

Sources: neon.com/pricing · clerk.com/articles/clerk-pricing-explained · vercel.com/docs/plans/hobby ·
support.wix.com/en/article/connecting-a-wix-domain-to-an-external-site · dev.wix.com/docs/go-headless (development paths).
