import 'server-only';
import { SiteContent } from '../schema';
import { parseSheet, TAB, type SheetTabs } from '../parse/tabs';
import { getAccessToken, sheetsAuthFromEnv, SHEETS_READONLY, type SheetsAuth } from './google-auth';
import { redactKey } from './redact';

/**
 * Google Sheets source (SPEC §4.5): one `values.batchGet` request for all tabs.
 *
 * Auth (docs/SHEET.md → Access):
 * - **Service account** (preferred): SHEETS_SA_EMAIL + SHEETS_SA_PRIVATE_KEY. The sheet stays private,
 *   shared only with the service account's email (viewer). Bearer token from google-auth.ts.
 * - **API key** (legacy, until the service account is set everywhere): SHEETS_API_KEY; only works
 *   while the sheet is shared as "anyone with the link can view".
 * If both are set, the service account wins. Env: SHEETS_ID (the id in the sheet URL).
 * Throws on any failure so ISR keeps serving the last good page.
 * Never put the URL in an error message (with an API key it contains the key); Google's messages go through redactKey().
 */
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TIMEOUT_MS = 10_000;

interface BatchGetResponse {
  valueRanges?: { range: string; values?: string[][] }[];
}

/** Fetch every tab the site reads (not LEIA-ME) as grids of strings, keyed by tab name. */
export async function fetchSheetTabs(id: string, auth: SheetsAuth): Promise<SheetTabs> {
  const tabs = Object.values(TAB);
  const params = new URLSearchParams({ majorDimension: 'ROWS', valueRenderOption: 'FORMATTED_VALUE' });
  if (auth.kind === 'api-key') params.set('key', auth.key);
  for (const t of tabs) params.append('ranges', t); // a bare tab name = the whole tab

  const headers: Record<string, string> = {};
  if (auth.kind === 'service-account') {
    headers.authorization = `Bearer ${await getAccessToken(auth.account, SHEETS_READONLY)}`;
  }
  const secret = auth.kind === 'api-key' ? auth.key : undefined;

  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(id)}/values:batchGet?${params}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 300 }, // same as the pages; the "Publicar" button bypasses it via revalidatePath
    });
  } catch (e) {
    throw new Error(`Sheets: sem resposta da Google (${(e as Error).name})`);
  }
  if (!res.ok) {
    // Google's message is useful ("Unable to parse range: precos" = tab missing/renamed; 403 = not shared or bad key)
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const hint =
      res.status === 403 && auth.kind === 'service-account'
        ? ` (a folha está partilhada com ${auth.account.email}? A Google Sheets API está ativa no projeto?)`
        : '';
    throw new Error(redactKey(`Sheets: HTTP ${res.status} — ${body?.error?.message ?? res.statusText}${hint}`, secret));
  }
  const data = (await res.json()) as BatchGetResponse;
  const ranges = data.valueRanges ?? [];
  if (ranges.length !== tabs.length) throw new Error(`Sheets: esperados ${tabs.length} separadores, recebidos ${ranges.length}`);

  // valueRanges come back in request order
  const out: SheetTabs = {};
  tabs.forEach((t, i) => {
    out[t] = (ranges[i]!.values ?? []).map((row) => row.map((c) => (c == null ? '' : String(c))));
  });
  return out;
}

export async function loadSheets(): Promise<SiteContent> {
  const id = process.env.SHEETS_ID?.trim();
  if (!id) throw new Error('CONTENT_SOURCE=sheets precisa de SHEETS_ID');

  const tabs = await fetchSheetTabs(id, sheetsAuthFromEnv());
  const { content, warnings } = parseSheet(tabs); // throws SheetError on page-level problems
  return SiteContent.parse({
    ...content,
    meta: { source: 'sheets', fetchedAt: new Date().toISOString(), warnings },
  });
}
