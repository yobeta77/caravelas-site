# Decisions log

Things we agree (often in person) end up here, so every session — ours and Claude's — starts from the same context.
One line per decision, newest first. Status: **proposed** (written, not agreed yet) · **agreed** · **reverted**.

| Date | Decision | Status | Who |
|---|---|---|---|
| 2026-10-14 | Domain stays registered at Wix; DNS (`A` + `CNAME`) points to Vercel; keep MX/SPF/DKIM for email. Wix is not used to host the app. (ADMIN.md §11.3) | proposed | Juanpi |
| 2026-10-14 | Panel built against a `ContentStore` interface, so storage (Sheet vs DB) can be decided later; contract first via a `contract:` PR. (ADMIN.md §11.2) | proposed | Juanpi |
| 2026-10-14 | Content storage for the product: own DB + own panel (option B); the Sheet stays as Caravelas' interim source and as an import format. (ADMIN.md §11.1) | proposed | Juanpi |
| ≤ 2026-10-14 | We look at this as a product with potential (possibly for other gyms), not only Caravelas' site; the admin panel is a serious direction. | agreed (in person) | Nico + Juanpi |
| 2026-10-11 | Keep the Google Sheet as Caravelas' content source for now, hardened with the Apps Script (validation, publish menu). | agreed | Juanpi |
