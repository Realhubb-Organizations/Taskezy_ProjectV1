"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

// The app's header is light, so the phone's status bar must use dark icons
// regardless of the phone's theme. Otherwise a dark-mode phone draws white
// icons on the white header and they disappear.
export default function NativeStatusBar() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setOverlaysWebView({ overlay: true });
    StatusBar.setStyle({ style: Style.Dark });
  }, []);

  return null;
}
