"use client";

// Real ringtone files, served from public/sounds/ (see frontend/public/sounds/).
// Each "kind" falls back to its own synthesized chime (Web Audio API, a
// different pitch per kind) if its file is missing/fails to load, so sound
// never just silently stops working. Browsers block audio until the user has
// interacted with the page at least once (autoplay policy, not a bug);
// initUnlock() primes every sound file + the AudioContext on the first click
// anywhere so subsequent live notifications can actually play.

export type NotificationSoundKind = "leads" | "reminder" | "activity" | "hrms" | "finance";

const SOUND_FILES: Record<NotificationSoundKind, string> = {
  leads: "/sounds/leads.mp3",
  reminder: "/sounds/reminder.mp3",
  activity: "/sounds/activity.mp3",
  hrms: "/sounds/hrms.mp3",
  finance: "/sounds/finance.mp3"
};

// Distinct fallback pitch per kind — keeps sounds differentiable even before
// (or if) a real file for that kind is dropped in.
const FALLBACK_TONES: Record<NotificationSoundKind, [number, number]> = {
  leads: [880, 1320],
  reminder: [660, 990],
  activity: [740, 1100],
  hrms: [520, 780],
  finance: [990, 1480]
};

/**
 * Maps a notification's category/system to which "purpose" sound it should
 * play. New Lead and Reminder get their own tone since they're the two
 * highest-frequency, most time-sensitive CRM events; everything else CRM
 * (reassignment, KYC, missed-SLA, general) shares one "activity" tone,
 * matching NotificationBell's own "Activity Alerts" catch-all group.
 * HRMS/FINANCE-system notifications get their own tone regardless of category.
 */
export function resolveNotificationSoundKind(category: string, system: string): NotificationSoundKind {
  if (category === "NEW_LEAD") return "leads";
  if (category === "REMINDER") return "reminder";
  if (system === "HRMS") return "hrms";
  if (system === "FINANCE") return "finance";
  return "activity";
}

const MUTE_KEY = "taskezy_notif_sound_muted";

let sharedContext: AudioContext | null = null;
let unlocked = false;

export function isNotificationSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}

export function setNotificationSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

/**
 * Call once on app mount — primes every sound file + the AudioContext on the
 * user's first interaction so later sounds aren't blocked. Listens for
 * pointerdown/keydown/touchstart, not just "click" — a login form submitted
 * by pressing Enter, for example, never fires a click event, so a
 * click-only listener misses that interaction entirely and leaves audio
 * locked even though the user has genuinely engaged with the page.
 */
export function initNotificationSoundUnlock(): () => void {
  const unlock = () => {
    unlocked = true;
    const ctx = getContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    // Muted priming play per file — satisfies the browser's "played after a
    // user gesture" requirement without being audible on this interaction.
    Object.values(SOUND_FILES).forEach(url => {
      const audio = new Audio(url);
      audio.volume = 0;
      audio.play().then(() => audio.pause()).catch(() => {});
    });
    events.forEach(evt => window.removeEventListener(evt, unlock));
  };
  const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
  events.forEach(evt => window.addEventListener(evt, unlock));
  return () => events.forEach(evt => window.removeEventListener(evt, unlock));
}

/** One "ding" — a two-tone chime with a fast attack, at `startOffset` seconds from now. Fallback only. */
function playChime(ctx: AudioContext, startOffset: number, peakGain: number, tones: [number, number]): void {
  const now = ctx.currentTime + startOffset;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.012); // fast attack reads as "louder" even at the same peak
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  gain.connect(ctx.destination);

  tones.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle"; // brighter/more piercing than sine — cuts through background noise better
    osc.frequency.value = freq;
    osc.connect(gain);
    const start = now + i * 0.09;
    osc.start(start);
    osc.stop(start + 0.35);
  });
}

function playSynthesizedFallback(kind: NotificationSoundKind): void {
  const ctx = getContext();
  if (!ctx || ctx.state === "suspended") return;
  const tones = FALLBACK_TONES[kind];
  playChime(ctx, 0, 0.5, tones);
  playChime(ctx, 0.22, 0.5, tones);
}

export function playNotificationSound(category: string, system: string): void {
  if (isNotificationSoundMuted()) return;

  // Always attempt playback, even if our own `unlocked` tracking somehow
  // missed the user's first interaction (see initNotificationSoundUnlock) —
  // the browser is the actual source of truth on whether audio is allowed,
  // not this flag. Worst case here is a silently-caught rejection, same as
  // before; best case, it plays even when our own tracking was wrong.
  const kind = resolveNotificationSoundKind(category, system);
  const audio = new Audio(SOUND_FILES[kind]);
  audio.volume = 0.85;
  audio.play().catch(() => {
    // File missing, wrong format, or genuinely still autoplay-blocked —
    // fall back to the synthesized chime, which only needs the
    // AudioContext (not <audio> element autoplay) to have been unlocked.
    if (unlocked) playSynthesizedFallback(kind);
  });
}
