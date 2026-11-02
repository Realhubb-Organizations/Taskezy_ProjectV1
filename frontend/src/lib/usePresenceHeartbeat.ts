import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { apiSendPresenceHeartbeat } from "./apiClient";

// Runs for every signed-in user (not just Admins who can view the roster
// built on top of this) — reports this session's own active/idle state so
// Admin's Team Activity page has something to show. Mirrors Slack/Discord/
// Teams: green = real interaction within the last 5 minutes and the tab is
// in the foreground; yellow = open but idle or backgrounded; red (offline)
// is derived server-side from whether the SSE connection is open at all,
// not from this hook.
const IDLE_THRESHOLD_MS = 5 * 60_000;
const SAFETY_NET_INTERVAL_MS = 60_000;

export function usePresenceHeartbeat(enabled: boolean): void {
  const activeRef = useRef(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Web's label is derived server-side from User-Agent (fine — a browser's
  // UA reliably says "Chrome on Windows"). A WebView's UA can't tell two
  // phones apart, so on native this holds the same `${manufacturer}
  // ${model}` string already captured for push registration (layout.tsx) —
  // resolved once, async, so the first heartbeat or two may go out without
  // it (harmless, the backend just falls back to its UA guess until then).
  const nativeDeviceLabelRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    if (Capacitor.isNativePlatform()) {
      Device.getInfo()
        .then((info) => { nativeDeviceLabelRef.current = `${info.manufacturer} ${info.model}`.trim(); })
        .catch(() => { /* heartbeat just falls back to the UA guess */ });
    }

    const send = (active: boolean) => {
      activeRef.current = active;
      apiSendPresenceHeartbeat(active, nativeDeviceLabelRef.current).catch(() => { /* best-effort — next heartbeat or safety-net tick will catch up */ });
    };

    const resetIdleTimer = () => {
      if (document.visibilityState !== "visible") return;
      if (!activeRef.current) send(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => send(false), IDLE_THRESHOLD_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        send(false);
      } else {
        resetIdleTimer();
      }
    };

    const activityEvents = ["mousemove", "keydown", "touchstart", "scroll"] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);

    send(document.visibilityState === "visible");
    resetIdleTimer();
    const safetyNet = setInterval(() => send(activeRef.current), SAFETY_NET_INTERVAL_MS);

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
      document.removeEventListener("visibilitychange", onVisibility);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      clearInterval(safetyNet);
    };
  }, [enabled]);
}
