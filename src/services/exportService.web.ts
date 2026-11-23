import type { Db } from '../db/types';
import { type DateRange, today } from '../domain/dates';
import { buildReportHtml, csvContent, type CsvKind } from './reportHtml';
import { saveOrShareFile } from './webIO';

export type { CsvKind };

/** Web app: shares (iPhone: Save to Files / Mail…) or downloads the CSV. */
export async function exportCSV(db: Db, kind: CsvKind, range: DateRange = { from: null, to: null }) {
  const content = await csvContent(db, kind, range);
  await saveOrShareFile(new Blob([content], { type: 'text/csv' }), `${kind}-${today()}.csv`);
}

/**
 * Web app: opens the report in the print dialog. On iPhone choose
 * Print › share icon › Save to Files to keep it as a PDF.
 */
export async function exportPDF(db: Db, range: DateRange, periodLabel: string, businessName: string) {
  const html = await buildReportHtml(db, range, periodLabel, businessName);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    await saveOrShareFile(new Blob([html], { type: 'text/html' }), `report-${today()}.html`);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 300));
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60_000);
}
