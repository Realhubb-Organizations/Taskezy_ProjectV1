"use client";

import React, { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useApp } from "@/context/AppContext";

const MAX_PULL = 80; // px the indicator can be dragged down before it caps
const REFRESH_THRESHOLD = 64; // px pull required to trigger a refresh on release
const SPIN_DURATION_MS = 700; // how long the spinner shows after a triggered refresh

/**
 * Native-app-only pull-to-refresh. Plain Pointer Events + CSS, no library.
 * On the website build (Capacitor.isNativePlatform() === false) this renders
 * as a bare passthrough — no wrapper, no listeners — so the site is untouched.
 */
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { triggerManualRefresh } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  if (!Capacitor.isNativePlatform()) {
    return <>{children}</>;
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (refreshing) return;
    // Only start tracking when the scrollable <main> ancestor is already at
    // the top — otherwise this is just a normal scroll gesture.
    const scroller = containerRef.current?.closest("main");
    if (!scroller || scroller.scrollTop > 0) return;
    startY.current = e.clientY;
    pulling.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pulling.current || startY.current === null) return;
    const delta = e.clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    e.preventDefault();
    setPull(Math.min(delta, MAX_PULL));
  };

  const endPull = () => {
    if (!pulling.current) return;
    pulling.current = false;
    startY.current = null;
    if (pull >= REFRESH_THRESHOLD) {
      setRefreshing(true);
      triggerManualRefresh();
      window.setTimeout(() => {
        setRefreshing(false);
        setPull(0);
      }, SPIN_DURATION_MS);
    } else {
      setPull(0);
    }
  };

  const indicatorHeight = refreshing ? REFRESH_THRESHOLD : pull;
  const rotation = (pull / MAX_PULL) * 360;
  const settling = !pulling.current && !refreshing;

  return (
    <div ref={containerRef} className="relative" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPull} onPointerCancel={endPull}>
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-center pointer-events-none"
        style={{
          height: MAX_PULL,
          transform: `translateY(${indicatorHeight - MAX_PULL}px)`,
          opacity: indicatorHeight > 0 ? 1 : 0,
          transition: settling ? "transform 200ms ease-out, opacity 200ms ease-out" : undefined
        }}
      >
        <RefreshCw
          className={`h-5 w-5 text-brand-700 ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${rotation}deg)` }}
        />
      </div>
      <div
        style={{
          transform: `translateY(${indicatorHeight}px)`,
          transition: settling ? "transform 200ms ease-out" : undefined
        }}
      >
        {children}
      </div>
    </div>
  );
}
