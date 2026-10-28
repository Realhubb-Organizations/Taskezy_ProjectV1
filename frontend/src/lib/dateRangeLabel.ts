// "Today" / "Yesterday" / "This Week" / "This Month" / "All Time", or
// "12 Oct – 18 Oct" for a custom range — the label tables show in brackets
// next to their count so it's clear which dates the rows cover.
export function dateRangeLabel(preset: string, custom?: { start: string; end: string } | null): string {
  if (custom) {
    const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    return custom.start === custom.end ? fmt(custom.start) : `${fmt(custom.start)} – ${fmt(custom.end)}`;
  }
  return preset;
}
