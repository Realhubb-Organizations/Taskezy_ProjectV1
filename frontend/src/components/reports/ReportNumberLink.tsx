"use client";

import Link from "next/link";
import { rememberReportScroll, reportDetailHref, type ReportDetail, type ReportTab } from "@/lib/reportDetail";

/**
 * A number on the Reports page that opens its detail page (the leads/tasks
 * behind it). Zero stays plain text — there's nothing to open.
 */
export default function ReportNumberLink({ tab, value, detail, children }: {
  tab: ReportTab;
  value: number;
  detail: ReportDetail;
  /** What to show instead of the bare number (e.g. a formatted one). */
  children?: React.ReactNode;
}) {
  if (!value) return <>{children ?? value}</>;
  return (
    <Link
      href={reportDetailHref(tab, detail)}
      scroll={false}
      onClick={rememberReportScroll}
      className="text-[#0B1E6E] underline-offset-2 hover:underline focus-visible:underline"
      title={`See ${detail.title}`}
    >
      {children ?? value.toLocaleString("en-IN")}
    </Link>
  );
}
