"use client";

import { useEffect } from "react";

// App-wide: hovering any table cell text that's cut off with "…" (a
// `truncate` / text-overflow: ellipsis line, or a line-clamped block) shows
// the full text as a tooltip. Cells that already set their own title are
// left alone, and nothing is added for text that fits.
function isCutOff(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  const clamped = cs.webkitLineClamp !== "none" && cs.webkitLineClamp !== "" && el.scrollHeight > el.clientHeight + 1;
  const ellipsed = cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1;
  return clamped || ellipsed;
}

export default function TruncatedTextTooltips() {
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const start = e.target as HTMLElement | null;
      const cell = start?.closest?.("td, th");
      if (!start || !cell) return;
      // The hovered element or one of its parents inside the same cell.
      for (let el: HTMLElement | null = start; el && cell.contains(el); el = el.parentElement) {
        if (el.hasAttribute("title")) return;
        if (isCutOff(el)) {
          const text = el.innerText.trim();
          if (text) el.setAttribute("title", text);
          return;
        }
        if (el === cell) return;
      }
    };
    document.addEventListener("mouseover", onOver, true);
    return () => document.removeEventListener("mouseover", onOver, true);
  }, []);

  return null;
}
