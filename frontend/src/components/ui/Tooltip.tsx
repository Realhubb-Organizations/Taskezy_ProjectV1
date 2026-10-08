"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";

// Positioned via a portal straight into <body>, not pure CSS, because this
// is used inside scroll-clipped containers (e.g. the admin leads table's
// `overflow-auto` wrapper) where a CSS-absolute bubble gets cut off/hidden
// instead of floating above everything — same containing-block problem
// LeadDetailDrawer already solves the same way.
export default function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.top, left: rect.left + rect.width / 2 });
  };
  const hide = () => setCoords(null);

  return (
    <>
      <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} className="inline-flex">
        {children}
      </span>
      {coords &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[#0B1E6E] px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-lg"
            style={{ top: coords.top - 8, left: coords.left }}
          >
            {text}
            <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-4 border-t-[#0B1E6E] border-x-transparent border-b-transparent" />
          </span>,
          document.body
        )}
    </>
  );
}
