import { registerPlugin, Capacitor } from "@capacitor/core";
import { apiSyncCallLog, ApiCallLogEntry } from "@/lib/apiClient";

// JS bridge for the native CallLogPlugin (android/app/src/main/java/.../
// CallLogPlugin.java, registered under the plugin name "CallLogReader") —
// same registerPlugin pattern as the former lib/callState.ts wrapper for
// CallState. Only meaningful on native Android; web never has a device call
// log to read (see syncDeviceCallLog's early return below).
interface CallLogReaderPlugin {
  checkPermissions(): Promise<{ callLog: "granted" | "denied" | "prompt" }>;
  requestPermissions(): Promise<{ callLog: "granted" | "denied" | "prompt" }>;
  readEntries(opts: { sinceMillis?: number }): Promise<{
    entries: Array<{ phoneNumber: string; callType: string; callDate: string; durationSeconds: number }>;
    // True when the device has more entries since sinceMillis than the
    // native layer's MAX_ROWS cap returned in one call (see
    // CallLogPlugin.java's own comment on why this exists).
    truncated: boolean;
  }>;
}

const CallLogReader = registerPlugin<CallLogReaderPlugin>("CallLogReader");

const LAST_SYNCED_KEY = "callLogLastSyncedAtMs";
const SYNC_BATCH_SIZE = 500;

/**
 * Best-effort background sync of this device's call log to the server.
 * Called opportunistically (e.g. on the Call Log page mount) — never throws,
 * never blocks the UI, and no-ops entirely on web.
 */
export async function syncDeviceCallLog(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const perm = await CallLogReader.checkPermissions();
    if (perm.callLog !== "granted") {
      const requested = await CallLogReader.requestPermissions();
      if (requested.callLog !== "granted") return; // user denied — quietly give up
    }

    const storedSince = Number(localStorage.getItem(LAST_SYNCED_KEY));
    const sinceMillis = Number.isFinite(storedSince) && storedSince > 0 ? storedSince : 0;

    const { entries, truncated } = await CallLogReader.readEntries({ sinceMillis });
    if (entries.length > 0) {
      for (let i = 0; i < entries.length; i += SYNC_BATCH_SIZE) {
        const batch = entries.slice(i, i + SYNC_BATCH_SIZE) as ApiCallLogEntry[];
        await apiSyncCallLog(batch);
      }
    }

    // "Now", not the max callDate in this batch — the next sync must pick up
    // anything since this sync actually ran, regardless of clock skew
    // between a call's recorded date and the moment we synced it.
    //
    // Only safe when NOT truncated. If the native side hit its MAX_ROWS cap,
    // there are older calls since sinceMillis that this batch never reached
    // (DATE DESC — the cap keeps the newest, drops the rest) — jumping the
    // watermark to "now" would mark that gap as caught up and permanently
    // skip it. Leaving the watermark where it is means the next sync just
    // re-requests the same newest-N window (cheap no-ops server-side via
    // ON CONFLICT DO NOTHING) rather than silently losing the older tail.
    // ponytail: a device with >MAX_ROWS new calls since its last sync never
    // drains that backlog under this scheme — only matters for a very
    // heavy-call-volume phone after a long gap without opening the app.
    // Upgrade path: an ascending (oldest-first) paginated catch-up sweep
    // instead of a single DESC-capped read.
    if (!truncated) {
      localStorage.setItem(LAST_SYNCED_KEY, String(Date.now()));
    }
  } catch (err) {
    console.warn("Could not sync device call log:", err);
  }
}
