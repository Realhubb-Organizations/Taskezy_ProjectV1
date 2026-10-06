"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

// Solid brand-blue status bar with its own strip above the app, so content
// never draws under the clock, signal and battery icons.
export default function NativeStatusBar() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add("native-app");
    StatusBar.setOverlaysWebView({ overlay: false });
    StatusBar.setBackgroundColor({ color: "#0077b6" });
    StatusBar.setStyle({ style: Style.Light });
  }, []);

  return null;
}
