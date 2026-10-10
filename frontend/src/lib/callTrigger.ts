import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

// Single shared "place a call to this lead" entry point — every tel: site
// in the app should go through this instead of its own inline
// `window.location.href = "tel:..."`, since this is also where the
// mandatory-call-feedback gate gets armed. See
// project_crm_role_based_lead_scoping memory (2026-10-10, call-feedback
// round) for the full design.
//
// Admin: works exactly as before, everywhere (web and native), no
// return-watching, no feedback gate.
// Manager/Member: native app only — canTriggerLeadCall() below is what the
// Call button's disabled state on web should check.
//
// This used to watch real device call state (idle/offhook) via a native
// TelephonyManager plugin for precise "was it actually answered"
// detection. Dropped (2026-10-10) after on-device logcat proved it
// structurally can't work on this device: placing a call makes Android
// aggressively kill the whole backgrounded app process within seconds (to
// free memory for the call) — confirmed via a live `Process
// com.realcrm.taskezy.app has died` a few seconds after backgrounding —
// which destroys the native listener along with the process, so it can
// never fire no matter how correct its own logic is. Now uses the exact
// same "ask when you return to the app" pattern as triggerLeadWhatsApp
// below, which has no listener to kill in the first place. Trade-off:
// can't tell a connected call from a declined/unanswered one — the
// feedback prompt fires from returning to the app after any dial attempt,
// same ambiguity WhatsApp's version already has.
//
// That process-death problem doesn't stop at the native listener, though —
// it kills ANY in-memory JS state too, including armReturnWatcher's own
// listener below. A quick call (process survives) resolves in-memory, no
// problem. A longer call (process gets killed, confirmed common on this
// app) comes back to a cold-restarted app with zero memory of "I was
// expecting a return for lead X" — so the gate silently never appeared,
// same bug in a new place. PENDING_CALL_KEY closes that: written to
// localStorage (survives process death, unlike anything in JS memory)
// right before dialing, consumed from two places — the in-memory
// return-watcher below (fires immediately, the common case), and
// AppContext.tsx's session-restore mount effect (fires on every fresh app
// load, catching the cold-restart case the in-memory path can't).

export function canTriggerLeadCall(isAdmin: boolean): boolean {
  return isAdmin || Capacitor.isNativePlatform();
}

const PENDING_CALL_KEY = "pendingCallDial";

/** Reads and clears the pending-dial marker, if one exists. Called once per real check — the first caller to see it "wins". */
export function consumePendingCallDial(): { leadId: string; startedAt: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_CALL_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_CALL_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function triggerLeadCall(
  lead: { id: string; phone: string; name: string },
  opts: {
    isAdmin: boolean;
    onCallEnded: (leadId: string, startedAt: string, durationSeconds: number) => void;
    toast?: (message: string, tone?: "success" | "error" | "info" | "warning") => void;
  }
): void {
  if (!canTriggerLeadCall(opts.isAdmin)) return; // disabled Call button shouldn't even call this, but stay safe

  const startedAt = new Date().toISOString();
  opts.toast?.(`Dialing ${lead.name}...`, "info");

  if (!opts.isAdmin) {
    try {
      localStorage.setItem(PENDING_CALL_KEY, JSON.stringify({ leadId: lead.id, startedAt }));
    } catch {
      // Private browsing / storage disabled — falls back to the in-memory-only
      // behavior this already had, which is the pre-existing trade-off, not a new one.
    }
  }

  window.location.href = `tel:${lead.phone}`;

  if (opts.isAdmin) return; // Admin: no feedback gate, unchanged from before.
  armReturnWatcher(() => {
    const pending = consumePendingCallDial();
    if (!pending || pending.leadId !== lead.id) return; // already handled by the mount-time check after a cold restart
    const durationSeconds = Math.max(0, Math.round((Date.now() - new Date(pending.startedAt).getTime()) / 1000));
    opts.onCallEnded(lead.id, pending.startedAt, durationSeconds);
  });
}

// Shared by both triggerLeadCall and triggerLeadWhatsApp: no platform (web
// or native) exposes a "the call ended" / "the message was sent" signal
// for a third-party app, so the only available trigger for either is "the
// agent came back to Taskezy after tel:/wa.me opened". Native:
// @capacitor/app's appStateChange (isActive again = foregrounded). Web:
// the Page Visibility API. Either way, fires at most once per call.
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
