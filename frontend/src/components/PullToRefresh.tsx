"use client";

import React from "react";

/**
 * Pull-to-refresh is permanently disabled. A Pointer Events implementation
 * was built and tried here (see git history — commits 47645fe, c80440a,
 * 2471e11 on feature/Inder/development), including a fix for pointer
 * capture being claimed too early. Verified live on-device via adb that
 * even with that fix, simply having pointer handlers attached to this
 * wrapper — regardless of whether they ever call preventDefault — breaks
 * native scrolling for every page in this Capacitor/Android WebView. Once
 * it was removed entirely, scrolling started working everywhere.
 *
 * If this is revisited, it needs a fundamentally different technique that
 * doesn't attach pointer/touch handlers to an ancestor of the scrollable
 * content at all — e.g. reading <main>'s own scroll/touch events passively,
 * or a native Capacitor plugin instead of a JS gesture layer.
 */
export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
