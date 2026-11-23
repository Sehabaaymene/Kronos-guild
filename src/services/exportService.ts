import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Db } from '../db/types';
import { type DateRange, today } from '../domain/dates';
import { buildReportHtml, csvContent, type CsvKind } from './reportHtml';

export type { CsvKind };

/** Writes a CSV (opens in Excel / Numbers / Google Sheets) and opens the share sheet. */
export async function exportCSV(db: Db, kind: CsvKind, range: DateRange = { from: null, to: null }) {
  const content = await csvContent(db, kind, range);
  const file = new File(Paths.cache, `${kind}-${today()}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: `Export ${kind}` });
}

/** Generates a printable PDF financial report for the period and opens the share sheet. */
export async function exportPDF(db: Db, range: DateRange, periodLabel: string, businessName: string) {
  const html = await buildReportHtml(db, range, periodLabel, businessName);
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Financial report' });
}
