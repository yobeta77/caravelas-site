# Google Sheet — content source (Juanpi)

The gym edits the site's content in a Google Sheet. The site reads it with the
Sheets API (`values.batchGet`, one request for all tabs) when `CONTENT_SOURCE=sheets`.
Code: `src/content/sources/sheets.ts` (fetch) → `src/content/parse/tabs.ts` (tabs → content)
→ `src/content/parse/values.ts` (tolerant cell parsers) → `SiteContent.parse()` (contract).

## Access
- Owner: the site's dedicated Google account (not a personal one; ask Juanpi). The Google Cloud
  project (`caravelas-site`) lives in the same account.
- **The site reads the sheet with a service account** (since 2026-10, branch `data/service-account`):
  a Google identity of the Cloud project, with its own email (`…@caravelas-site.iam.gserviceaccount.com`).
  The sheet is **private**: shared with that email as **viewer**, plus the human editors (gym staff,
  Juanpi, Nico). Nobody else, and no "anyone with the link".
  - Why: on 2026-10-11 Google suspended the project and flagged the sheet; a public-by-link sheet
    with phone numbers and emails was the most likely trigger (HANDOFF → *Incident*). It is also
    what a future admin panel needs to *write* to the sheet (an API key can only read public sheets).
  - How: `sources/google-auth.ts` signs a JWT (RS256) with the service account's private key and
    trades it for a 1-hour OAuth token (`spreadsheets.readonly` scope), cached in memory; `sheets.ts`
    sends it as `Authorization: Bearer` to the same `values.batchGet`. No Google SDK.
  - **Legacy:** if no `SHEETS_SA_*` var is set, the site falls back to `SHEETS_API_KEY` (only works
    while the sheet is public by link). This exists only for the switch-over; once production uses the
    service account, delete the API key in Google Cloud and the var everywhere.
- Env (`.env.local` locally, Vercel → Settings → Environment Variables in production, type *Sensitive*):

| Var | Value |
|---|---|
| `CONTENT_SOURCE` | `sheets` (`fixture` = the JSON in the repo) |
| `SHEETS_ID` | the part of the sheet URL between `/d/` and `/edit` |
| `SHEETS_SA_EMAIL` | `client_email` from the service account's JSON key file |
| `SHEETS_SA_PRIVATE_KEY` | `private_key` from the same file, from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----`. Pasted with real line breaks or with the literal `\n` of the JSON, both work. Secret: never commit it |
| `SHEETS_API_KEY` | legacy, see above |

### Setting up the service account (once, as the site's Google account)
1. <https://console.cloud.google.com> → project **caravelas-site** → *APIs & Services → Library*:
   check **Google Sheets API** is enabled (it is, for the API key).
2. *IAM & Admin → Service Accounts → Create service account*: name `site-reader`, description
   "Lê a folha de conteúdos do site". **No roles** (skip "Grant access"): access comes from sharing
   the sheet, not from IAM.
3. Open it → *Keys → Add key → Create new key → JSON*. A file downloads: it is the only copy of the
   private key. Keep it in a password manager, never in the repo, a chat or an email; delete the
   download once the vars are set.
4. In the sheet: *Share* → add the service account's email as **Viewer**, untick "Notify people".
5. Set `SHEETS_SA_EMAIL` and `SHEETS_SA_PRIVATE_KEY` in `.env.local` (the key on one line, in double
   quotes, exactly as it appears in the JSON with its `\n`), run `pnpm dev`, open `/status`:
   `source: sheets` and today's `fetchedAt` = it works.
6. Vercel (Production): add the same two vars (*Sensitive*), redeploy, check `/status` on the live URL.
7. Only then: sheet → *Share → General access → Restricted*. Check `/status` again (and that the
   staff can still open the sheet: they must be listed as editors by email). Then delete the API key
   (*APIs & Services → Credentials*) and `SHEETS_API_KEY` from Vercel and `.env.local`.
- Rotating: create a new key on the service account, update both places, delete the old key.
- If a key leaks: delete it in *Service Accounts → Keys* at once (the site stops reading until the new
  one is set; ISR keeps serving the last good page meanwhile).

## Tabs and columns
Header row = first non-empty row. Headers and dropdown values are matched ignoring case,
accents, spaces and hyphens (`Destaque PT` = `destaque_pt`, `Sábado` = `sabado`).
Unknown columns are ignored. Translatable fields have one column per language:
`_pt` (required), `_en`, `_es`, `_fr`, `_de`, `_ru`, `_uk` (optional; fallback lang → en → pt).

| Tab | Columns |
|---|---|
| `config` | `chave` \| `pt` \| `en` \| `es` \| `fr` \| `de` \| `ru` \| `uk` — key/value; non-translatable values go in `pt` (a `valor` column also works) |
| `marquesina` | `ativo` \| `destaque_*` \| `texto_*` \| `link` \| `inicio` \| `fim` \| `ordem` |
| `horario` | `ativo` \| `dia` \| `hora` \| `tipo` \| `aula_*` \| `coach` \| `nota_*` — **one row per class** |
| `precos` | `ativo` \| `plano_*` \| `preco` \| `destaque` \| `ordem` |
| `equipa` | `ativo` \| `nome` \| `bio_*` \| `instagram` \| `foto_lado` \| `ordem` |
| `destaques` | `ativo` \| `icone` \| `titulo_*` \| `texto_*` \| `ordem` |
| `LEIA-ME` | instructions for the gym; not read by the site |

`config` keys — required: `hero_titulo`, `cta_texto`, `cta_badge`, `cta_link`, `morada_rua`,
`morada_cp`, `morada_cidade`, `maps_link`, `horario_seg_sex`, `horario_sab`, `horario_dom`
(the three hours keys must exist; an empty value = closed). Optional: `precos_atualizados`,
`precos_promo`, `precos_promo_link`, `email` (several, separated by `,` or `;`), `whatsapp`,
`instagram`, `facebook`, `equipa_foto`, `politica_privacidade_link`, `politica_cookies_link`,
`crossfit_afiliado_link`.

Differences from the SPEC §4.3 proposal: `config` has all 7 language columns; `equipa` has
`instagram` (handle `@x` or URL), `foto_lado` (esquerda/direita) and `ordem` (contract v3/v5).

## Row rules
- `ativo`: unchecked/FALSE hides the row (use it for the grey example row); blank = active.
- `ordem`: blank = the row's position in the sheet.
- Accepted formats — times `7h`, `07h00`, `7.30`, `19:30`, `7:30 PM`; hours `07:00-21:00`,
  `7h às 21h`; dates `dd/mm/yyyy`, `d/m/yy`, `yyyy-mm-dd` (day first); prices `€20`, `20,00`,
  `20 €`; booleans TRUE/FALSE, sim/não, 1/0; WhatsApp `+351 912 849 143` or `912 849 143`.
- IDs are a hash of each row's content (never the row number), so reordering rows is safe.
  Two identical classes → the second is dropped with a warning.

## When something is wrong
| Problem | Result |
|---|---|
| Bad optional cell (link, email, instagram…) | warning; that field is left out |
| Bad required cell (class time, price…) | warning; **the row is skipped** |
| Missing tab, missing/bad required `config` key, no valid class or price, API error | **throws**: ISR keeps serving the last good page |

Warnings (in Portuguese, e.g. `horario linha 14: hora inválida '7.3O' (linha ignorada)`) are
listed on **`/status`** (noindex, unlinked), with the source, fetch time and counts per section.

API errors seen in the `pnpm dev` / Vercel logs:
- `HTTP 403 — The caller does not have permission (a folha está partilhada com …?)`: the sheet isn't
  shared with the service account's email, or the Sheets API is off in the project.
- `a Google recusou a conta de serviço (HTTP 400 — invalid_grant: Invalid JWT Signature.)`: the key was
  deleted/rotated, or the email and key belong to different service accounts.
- `invalid_grant: Invalid JWT: Token must be a short-lived token…`: the machine's clock is off.
- `a chave da conta de serviço não é válida`: `SHEETS_SA_PRIVATE_KEY` isn't the `private_key` field
  (e.g. the whole JSON, or the `-----BEGIN`/`-----END` lines are missing).
- Legacy API key: `HTTP 403` = sheet not public by link, or key without the Sheets API; `HTTP 400 — API key not valid` = wrong key.
- `HTTP 400 — Unable to parse range: precos`: a tab was renamed or deleted.

## Freshness
Pages revalidate every 300 s (ISR). The "Site → Publicar alterações" menu (Apps Script, below)
calls `POST /api/revalidate` with `x-revalidate-secret` for near-instant updates (it also refreshes
`/status`). Answers: 200 ok · 401 wrong secret · 429 too many tries (5 wrong secrets per IP per 15 min,
or 10 requests per minute; `Retry-After` says how long) · 503 `REVALIDATE_SECRET` missing, under 16
chars or still `change-me`.
In `pnpm dev` the sheet is read on every reload.

## Apps Script (`apps-script/`)
Bound to the sheet. Adds a **Site** menu:
- **Publicar alterações**: runs the same checks as "Verificar", asks before publishing if there are
  problems, then `POST {SITE_URL}/api/revalidate`.
- **Verificar folha**: lists the active rows the site would skip (missing required cell, value not in
  the list, bad time/price/date/link/ordem), missing `config` keys and bad `config` values (opening
  hours, links, `whatsapp`, `email`, `instagram`), saying whether the site stops publishing (required
  keys) or just ignores the value. In `config`, "Configurar folha" also adds validation that rejects
  bad values in those cells and paints an already-invalid value red.
- **Ver avisos do site**: link to `{SITE_URL}/status`.
- **Admin → Configurar folha** (idempotent, run it as the sheet owner): checkboxes for `ativo` and
  `precos.destaque` (existing TRUE/sim/blank values converted), dropdowns for `dia`, `tipo`, `icone`,
  `foto_lado` (existing values normalized: `Terca` → `Terça`), validation that **rejects** bad times,
  prices, dates, links, Instagram handles and `ordem`, plain-text format for `hora`/`preco`/`ordem`,
  red cells for empty required fields in active rows, grey rows when `ativo` is unchecked, frozen and
  protected header row (+ the `config.chave` column), one grey example row per tab (unchecked, marked
  with a `[site]` note) and the `LEIA-ME` tab in Portuguese. Prepares 200 rows below each header.
  Table look: dark green header (lighter for the optional translation columns), borders, per-column
  widths, alternating rows; `horario` is tinted per day instead (no merged cells: the API only reads
  the first cell of a merge, so the other rows would lose their day).
- Hidden **`listas`** tab (not read by the site): A `horas` (05:00–22:30 every 15 min + any time
  already used; the owner can add more), B `outros_coaches` (e.g. `Dinâmico`, owner-only), C coaches
  = `equipa.nome` + B, rebuilt by the `onEdit` simple trigger (warning-only protection so it can
  write when staff edit `equipa`). `horario.hora` and `horario.coach` are dropdowns over A and C.
  Day/kind/icon/side lists stay fixed in the script on purpose: they are the values the site's code
  understands, so they must not be editable.
- **Admin → Configurar publicação**: stores `SITE_URL` and `REVALIDATE_SECRET` in Script Properties
  (never in the code: the repo is public). Sheet editors can technically read them; the worst they
  can do with the secret is trigger a revalidation.

The rules mirror `src/content/parse/{values,tabs}.ts`; change both together. The checks were run
against the seed CSVs: 0 problems.

Install / update:
1. Make a copy of the sheet first (File → Make a copy) or note the version history point.
2. With the sheet owner account: Extensions → Apps Script. Replace `Code.gs` with `apps-script/Code.gs`.
   Project settings → "Show appsscript.json" → paste `apps-script/appsscript.json`. Save.
3. Reload the sheet → **Site** menu → Admin → Configurar folha (authorize once).
4. Site → Admin → Configurar publicação: `https://caravelas-site.vercel.app/testsite/caravelas` and the
   `REVALIDATE_SECRET` from Vercel. Then try Site → Publicar alterações.

Each person who clicks Publicar authorizes once (Google shows an "unverified app" screen: Advanced →
continue). Without publishing, edits still appear within 5 minutes.

## Seeding
The sheet was created by importing one CSV per tab generated from the fixture
(`File → Import → Upload → Insert new sheet(s)`, with "Convert text to numbers, dates and
formulas" **unchecked**, otherwise `1200-607` becomes a date and `+351…` a formula).
A round-trip check (CSV → `parseSheet` → `SiteContent`) matched the fixture exactly.
