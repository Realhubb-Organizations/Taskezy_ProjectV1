import React from "react";
import Skeleton from "react-loading-skeleton";

// Shared loading placeholders for anywhere the app is waiting on data from
// the server — built once here so every page's "still loading" state looks
// and feels the same, instead of each page inventing its own spinner/blank
// state. Colors/border-radius come from the SkeletonTheme wrapping the
// whole app (see app/layout.tsx) — never pass baseColor/highlightColor
// here, so a future palette change only has one place to happen.
//
// These are layout-only: they mimic the real content's shape (a stat
// card's label+number, a table's rows/columns) so nothing jumps or
// reflows when the real data swaps in.

/** One stat card's placeholder content — same label-then-big-number shape used across every summary bar in the app. Render this in place of the real {label, value} block; keep the caller's own card/border wrapper. */
export function StatCardSkeleton() {
  return (
    <div>
      <Skeleton width="60%" height={11} />
      <div className="mt-2">
        <Skeleton width={48} height={22} />
      </div>
    </div>
  );
}

/** `count` stat cards' worth of placeholder content, for a page's initial render before isDataLoading clears. Callers still own the grid/divide wrapper — this only fills in what would otherwise be several empty <StatCardSkeleton />s written out by hand. */
export function StatCardsSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </>
  );
}

/**
 * `rows` × `columns` of skeleton `<td>`s, for dropping straight into an
 * existing `<tbody>` while a table's real rows are still loading — keeps
 * every table's own <thead>/column-visibility logic untouched, this just
 * stands in for the <tr> rows underneath it.
 */
export function TableRowsSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-slate-100 last:border-b-0">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-5 py-3.5">
              <Skeleton width={c === 0 ? "80%" : "60%"} height={12} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A handful of skeleton "cards" for list layouts that aren't a <table> (activity feeds, notification lists, kanban-style cards). */
export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-4">
          <Skeleton width="40%" height={12} />
          <div className="mt-2">
            <Skeleton width="90%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** One generic inline text-line placeholder, for a single value/field that isn't part of a table or stat card (a detail-drawer field, a chart's title, etc.). */
export function LineSkeleton({ width = "100%", height = 12 }: { width?: number | string; height?: number }) {
  return <Skeleton width={width} height={height} />;
}
