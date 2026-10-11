import 'server-only';
import { SiteContent } from '../schema';
import { parseSheet, TAB, type SheetTabs } from '../parse/tabs';
import { redactKey } from './redact';

/**
 * Google Sheets source (SPEC §4.5): one `values.batchGet` request for all tabs,
 * with an API key; the sheet is shared as "anyone with the link can view".
 *
 * Env: SHEETS_ID (the id in the sheet URL), SHEETS_API_KEY (restricted to the Sheets API).
 * Throws on any failure so ISR keeps serving the last good page.
 * Never put the URL in an error message (it contains the key); Google's messages go through redactKey().
 */
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TIMEOUT_MS = 10_000;

interface BatchGetResponse {
  valueRanges?: { range: string; values?: string[][] }[];
}

/** Fetch every tab the site reads (not LEIA-ME) as grids of strings, keyed by tab name. */
export async function fetchSheetTabs(id: string, key: string): Promise<SheetTabs> {
  const tabs = Object.values(TAB);
  const params = new URLSearchParams({ key, majorDimension: 'ROWS', valueRenderOption: 'FORMATTED_VALUE' });
  for (const t of tabs) params.append('ranges', t); // a bare tab name = the whole tab

  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(id)}/values:batchGet?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 300 }, // same as the pages; the "Publicar" button bypasses it via revalidatePath
    });
  } catch (e) {
    throw new Error(`Sheets: sem resposta da Google (${(e as Error).name})`);
  }
  if (!res.ok) {
    // Google's message is useful ("Unable to parse range: precos" = tab missing/renamed; 403 = not shared or bad key)
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(redactKey(`Sheets: HTTP ${res.status} — ${body?.error?.message ?? res.statusText}`, key));
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
  const id = process.env.SHEETS_ID;
  const key = process.env.SHEETS_API_KEY;
  if (!id || !key) throw new Error('CONTENT_SOURCE=sheets precisa de SHEETS_ID e SHEETS_API_KEY');

  const tabs = await fetchSheetTabs(id, key);
  const { content, warnings } = parseSheet(tabs); // throws SheetError on page-level problems
  return SiteContent.parse({
    ...content,
    meta: { source: 'sheets', fetchedAt: new Date().toISOString(), warnings },
  });
}
