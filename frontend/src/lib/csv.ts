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
