"use client";

import React, { useEffect, useRef, useState } from "react";
import { isPhoneLayout } from "@/lib/viewport";

// One app-wide helper for wide tables: when a horizontally scrolling box
// (any `.overflow-x-auto`) is taller than the screen, its own scrollbar sits
// below the fold (or behind the sticky pagination footer) and you'd have to
// scroll to the end of the table to reach it. This draws a scrollbar pinned
// right above that footer — or the bottom of the window when there's none —
// kept in sync with the table both ways, and hides it once the real one is on
// screen. Drawn as plain divs (not a native scrollbar) so it's always visible
// whatever the browser's or the Mac's scrollbar setting.
// Desktop only — phones scroll tables with a swipe.

// The table's pagination footer, if any: the nearest wrapper that holds one.
function footerFor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  for (let i = 0; node && i < 4; i++, node = node.parentElement) {
    const f = node.querySelector<HTMLElement>("[data-table-footer]");
    if (f && !el.contains(f)) return f;
  }
  return null;
}

interface Geom {
  left: number;
  width: number;
  bottom: number;
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}

export default function StickyHorizontalScrollbar() {
  const targetRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ startX: number; startScroll: number } | null>(null);
  const [geom, setGeom] = useState<Geom | null>(null);

  useEffect(() => {
    let frame = 0;

    const pick = () => {
      frame = 0;
      if (isPhoneLayout()) { targetRef.current = null; setGeom(null); return; }
      const vh = window.innerHeight;
      let best: { el: HTMLElement; limit: number } | null = null;
      let bestVisible = 0;
      document.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach(el => {
        if (el.scrollWidth <= el.clientWidth + 1) return;
        const r = el.getBoundingClientRect();
        // Where its own scrollbar would need to be: just above its footer,
        // or the bottom of the window.
        const footer = footerFor(el);
        const limit = Math.min(vh, footer ? footer.getBoundingClientRect().top : vh);
        // Its own scrollbar is hidden (below the window or behind the
        // sticky footer), but the box is on screen.
        if (r.bottom <= limit + 1 || r.top >= limit - 60 || r.width === 0) return;
        const visible = Math.min(r.bottom, limit) - Math.max(r.top, 0);
        if (visible > bestVisible) { best = { el, limit }; bestVisible = visible; }
      });
      const found = best as { el: HTMLElement; limit: number } | null;
      targetRef.current = found?.el ?? null;
      if (!found) { setGeom(null); return; }
      const el = found.el;
      const r = el.getBoundingClientRect();
      const next: Geom = {
        left: Math.round(r.left),
        width: Math.round(r.width),
        bottom: Math.max(0, Math.round(vh - found.limit)),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollLeft: el.scrollLeft
      };
      setGeom(prev => (prev && (Object.keys(next) as (keyof Geom)[]).every(k => prev[k] === next[k]) ? prev : next));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(pick); };

    // Capture-phase scroll catches <main>, the page and the tables themselves.
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, []);

  if (!geom) return null;

  const trackWidth = geom.width - 16; // px-2 inset on each side
  const maxScroll = Math.max(1, geom.scrollWidth - geom.clientWidth);
  const thumbWidth = Math.max(40, Math.round((geom.clientWidth / geom.scrollWidth) * trackWidth));
  const travel = Math.max(1, trackWidth - thumbWidth);
  const thumbLeft = Math.round((geom.scrollLeft / maxScroll) * travel);
  const scrollTo = (left: number) => { if (targetRef.current) targetRef.current.scrollLeft = Math.min(maxScroll, Math.max(0, left)); };

  return (
    <div
      aria-hidden="true"
      style={{ left: geom.left, width: geom.width, bottom: geom.bottom }}
      className="fixed z-40 px-2 py-1.5 bg-white border-t border-slate-200"
    >
      {/* Track — clicking it jumps the table to that point. */}
      <div
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left - thumbWidth / 2;
          scrollTo((x / travel) * maxScroll);
        }}
        className="relative h-2.5 rounded-full bg-slate-200 cursor-pointer"
      >
        {/* Thumb — drag to scroll. */}
        <div
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { startX: e.clientX, startScroll: targetRef.current?.scrollLeft ?? 0 };
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            scrollTo(dragRef.current.startScroll + ((e.clientX - dragRef.current.startX) / travel) * maxScroll);
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          style={{ width: thumbWidth, transform: `translateX(${thumbLeft}px)` }}
          className="absolute inset-y-0 left-0 rounded-full bg-[#0B1E6E]/50 hover:bg-[#0B1E6E]/75 active:bg-[#0B1E6E]/80 cursor-grab active:cursor-grabbing touch-none"
        />
      </div>
    </div>
  );
}
