import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import CallState from "./callState";

// Single shared "place a call to this lead" entry point — every tel: site
// in the app should go through this instead of its own inline
// `window.location.href = "tel:..."`, since this is also where the
// mandatory-call-feedback gate gets armed. See
// project_crm_role_based_lead_scoping memory (2026-10-10, call-feedback
// round) for the full design.
//
// Admin: works exactly as before, everywhere (web and native), no
// call-state watching, no feedback gate.
// Manager/Member: native app only — canTriggerLeadCall() below is what the
// Call button's disabled state on web should check. On native, starts the
// device call-state listener before dialing, so onCallEnded fires once the
// call actually ends (never for a declined/unanswered call, which never
// reaches the OFFHOOK state — see CallStatePlugin.java).

export function canTriggerLeadCall(isAdmin: boolean): boolean {
  return isAdmin || Capacitor.isNativePlatform();
}

// Only one call can be watched at a time (the feedback gate blocks the rest
// of the app before a second one could start) — tracked here so a stray
// earlier listener never double-fires onCallEnded.
let activeListenerHandle: { remove: () => void } | null = null;

export async function triggerLeadCall(
  lead: { id: string; phone: string; name: string },
  opts: {
    isAdmin: boolean;
    onCallEnded: (leadId: string, startedAt: string, durationSeconds: number) => void;
    toast?: (message: string, tone?: "success" | "error" | "info" | "warning") => void;
  }
): Promise<void> {
  if (!canTriggerLeadCall(opts.isAdmin)) return; // disabled Call button shouldn't even call this, but stay safe

  if (Capacitor.isNativePlatform() && !opts.isAdmin) {
    const startedAt = new Date().toISOString();
    try {
      const perm = await CallState.checkPermissions();
      if (perm.phoneState !== "granted") {
        await CallState.requestPermissions();
      }
      if (activeListenerHandle) {
        activeListenerHandle.remove();
        activeListenerHandle = null;
      }
      activeListenerHandle = await CallState.addListener("callEnded", ({ durationSeconds }) => {
        activeListenerHandle?.remove();
        activeListenerHandle = null;
        opts.onCallEnded(lead.id, startedAt, durationSeconds);
      });
      await CallState.startWatching();
    } catch (err) {
      // Permission denied, or this device has no telephony radio (tablet) —
      // fall through and dial anyway rather than blocking the call itself;
      // just no feedback gate will fire for it.
      console.warn("Could not start call-state watching:", err);
    }
  }

  opts.toast?.(`Dialing ${lead.name}...`, "info");
  window.location.href = `tel:${lead.phone}`;
}

// WhatsApp has no equivalent of CallState — no platform (web or native)
// exposes a "message was sent" signal for a third-party app, so the only
// available trigger is "the agent came back to Taskezy after wa.me opened".
// Native: @capacitor/app's appStateChange (isActive again = foregrounded).
// Web: the Page Visibility API. Either way, fires at most once per call.
function armReturnWatcher(onReturn: () => void): void {
  if (Capacitor.isNativePlatform()) {
    let handle: { remove: () => void } | null = null;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      handle?.remove();
      handle = null;
      onReturn();
    }).then((h) => {
      handle = h;
    });
  } else {
    const listener = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", listener);
      onReturn();
    };
    document.addEventListener("visibilitychange", listener);
  }
}

export function triggerLeadWhatsApp(
  lead: { id: string; phone: string; name: string },
  opts: { isAdmin: boolean; onReturn: (leadId: string) => void }
): void {
  const formattedPhone = lead.phone.replace(/[^0-9]/g, "");
  const msg = encodeURIComponent(`Hello ${lead.name}, this is Gautham from TaskEzy regarding your real estate inquiry.`);
  window.open(`https://wa.me/${formattedPhone}?text=${msg}`, "_blank");

  if (opts.isAdmin) return; // Admin: no feedback gate, unchanged from before.
  armReturnWatcher(() => opts.onReturn(lead.id));
}
