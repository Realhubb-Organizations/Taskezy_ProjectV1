"use client";

import React, { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useApp } from "@/context/AppContext";

const MAX_PULL = 80; // px the indicator can be dragged down before it caps
const REFRESH_THRESHOLD = 64; // px pull required to trigger a refresh on release
const SPIN_DURATION_MS = 700; // how long the spinner shows after a triggered refresh

/**
 * Native-app-only pull-to-refresh. Rebuilt from scratch after the previous
 * Pointer-Events implementation was found (live, on-device) to break native
 * scrolling everywhere in this Capacitor/Android WebView — any non-passive
 * pointer/touch handler on an ancestor of <main>, even one that never calls
 * preventDefault, was enough to do it. See APP_UIUX_AUDIT_v2.md.
 *
 * This version listens on <main> itself (the real scroll element, not a
 * wrapper placed around it) with touch listeners explicitly marked
 * { passive: true } and never calls preventDefault anywhere — passive
 * listeners are, by spec, incapable of blocking or altering native scroll,
 * so this can't reproduce that bug by construction. The indicator below is
 * a position:fixed overlay driven purely by touch position; it doesn't
 * "drag" the page content the way the old version did (that required
 * preventDefault), it just shows/spins over whatever the WebView's own
 * native overscroll glow is already doing underneath.
 */
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { triggerManualRefresh } = useApp();
  const triggerRef = useRef(triggerManualRefresh);
  triggerRef.current = triggerManualRefresh;

  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const gesture = useRef({ startY: 0, pulling: false, refreshing: false });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const main = document.querySelector("main");
    if (!main) return;

    const onTouchStart = (e: TouchEvent) => {
      if (gesture.current.refreshing || main.scrollTop > 0) return;
      gesture.current.startY = e.touches[0].clientY;
      gesture.current.pulling = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!gesture.current.pulling) return;
      const delta = e.touches[0].clientY - gesture.current.startY;
      if (delta <= 0 || main.scrollTop > 0) {
        gesture.current.pulling = false;
        setPull(0);
        return;
      }
      setPull(Math.min(delta, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (!gesture.current.pulling) return;
      gesture.current.pulling = false;
      setPull((current) => {
        if (current >= REFRESH_THRESHOLD) {
          gesture.current.refreshing = true;
          setRefreshing(true);
          triggerRef.current();
          window.setTimeout(() => {
            gesture.current.refreshing = false;
            setRefreshing(false);
            setPull(0);
          }, SPIN_DURATION_MS);
        }
        return current >= REFRESH_THRESHOLD ? current : 0;
      });
    };

    main.addEventListener("touchstart", onTouchStart, { passive: true });
    main.addEventListener("touchmove", onTouchMove, { passive: true });
    main.addEventListener("touchend", onTouchEnd, { passive: true });
    main.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      main.removeEventListener("touchstart", onTouchStart);
      main.removeEventListener("touchmove", onTouchMove);
      main.removeEventListener("touchend", onTouchEnd);
      main.removeEventListener("touchcancel", onTouchEnd);
    };
    // Empty deps: attach once on mount, read the latest triggerManualRefresh
    // via triggerRef — AppContext redefines that function every render, and
    // tearing down/reattaching listeners mid-gesture on every context
    // update would be both wasteful and a real risk of dropping an
    // in-progress touch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!Capacitor.isNativePlatform()) {
    return <>{children}</>;
  }

  const indicatorHeight = refreshing ? REFRESH_THRESHOLD : pull;
  const settling = !gesture.current.pulling && !refreshing;

  return (
    <>
      {/* Fixed, not part of <main>'s own flow — it has to float above
          whatever <main> is doing regardless of scroll position, since it's
          no longer wrapping/transforming the content itself. top-14/top-16
          matches the sticky header's own h-14/h-16 in (app)/layout.tsx. */}
      <div
        className="fixed inset-x-0 top-14 md:top-16 z-30 flex items-center justify-center pointer-events-none"
        style={{
          height: MAX_PULL,
          transform: `translateY(${indicatorHeight - MAX_PULL}px)`,
          opacity: indicatorHeight > 0 ? 1 : 0,
          transition: settling ? "transform 200ms ease-out, opacity 200ms ease-out" : undefined
        }}
      >
        {/* Paused mid-pull (nothing to animate toward yet, same as the old
            icon just rotating with drag distance instead of spinning) —
            only actually plays once a refresh is confirmed triggered. */}
        <div className={`dot-spinner drop-shadow ${refreshing ? "" : "is-paused"}`}>
          <div className="dot-spinner__dot" /><div className="dot-spinner__dot" />
          <div className="dot-spinner__dot" /><div className="dot-spinner__dot" />
          <div className="dot-spinner__dot" /><div className="dot-spinner__dot" />
          <div className="dot-spinner__dot" /><div className="dot-spinner__dot" />
        </div>
      </div>
      {children}
    </>
  );
}
