import { registerPlugin, PluginListenerHandle } from "@capacitor/core";

// JS bridge for this app's own native plugin (android/app/src/main/java/
// com/realcrm/taskezy/app/CallStatePlugin.java) — not a published npm
// package, bundled directly into the Android app and registered in
// MainActivity. Only meaningful on native Android; calling these on web is
// a no-op rejection, which is fine since calling is disabled on web for the
// roles this applies to (see lib/callTrigger.ts).
export interface CallStatePlugin {
  checkPermissions(): Promise<{ phoneState: "granted" | "denied" | "prompt" }>;
  requestPermissions(): Promise<{ phoneState: "granted" | "denied" | "prompt" }>;
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
  addListener(
    eventName: "callEnded",
    listenerFunc: (data: { durationSeconds: number }) => void
  ): Promise<PluginListenerHandle>;
}

const CallState = registerPlugin<CallStatePlugin>("CallState");
export default CallState;
