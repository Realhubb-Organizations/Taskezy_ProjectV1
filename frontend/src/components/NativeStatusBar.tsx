"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

// White status bar with dark icons, in its own strip above the app: it
// blends with the white login page and app header (no coloured band), the
// clock/signal/battery stay readable, and content never draws under them.
// Style.Light = dark icons, meant for a light background.
export default function NativeStatusBar() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add("native-app");
    StatusBar.setOverlaysWebView({ overlay: false });
    StatusBar.setBackgroundColor({ color: "#FFFFFF" });
    StatusBar.setStyle({ style: Style.Light });
  }, []);

  return null;
}
