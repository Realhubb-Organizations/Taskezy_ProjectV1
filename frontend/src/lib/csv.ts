import { apiRecordReportExport, type ReportExportFilters } from "./apiClient";

/** Saves rows as a .csv file (Excel-friendly quoting). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Reports page downloads: records who downloaded what (Reports → Download
 * History) and only then saves the file — if the record can't be saved,
 * the download doesn't happen and this throws, so every report download
 * leaves a footprint.
 */
export async function downloadReportCsv(
  report: string,
  filters: ReportExportFilters,
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][]
): Promise<void> {
  await apiRecordReportExport({ report, fileName: filename, rowCount: rows.length, filters });
  downloadCsv(filename, header, rows);
}
