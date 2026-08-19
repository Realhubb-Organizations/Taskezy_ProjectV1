"use client";

// A short two-tone chime synthesized via the Web Audio API — no external
// asset to manage/miss. Browsers block audio until the user has interacted
// with the page at least once (autoplay policy, not a bug); initUnlock()
// creates/resumes the shared AudioContext on the first click anywhere so
// every subsequent live notification can actually play.

const MUTE_KEY = "taskezy_notif_sound_muted";
let sharedContext: AudioContext | null = null;

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

/** Call once on app mount — resumes the AudioContext on the user's first click so later sounds aren't silently blocked. */
export function initNotificationSoundUnlock(): () => void {
  const unlock = () => {
    const ctx = getContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  window.addEventListener("click", unlock, { once: true });
  return () => window.removeEventListener("click", unlock);
}

export function playNotificationSound(): void {
  if (isNotificationSoundMuted()) return;
  const ctx = getContext();
  if (!ctx || ctx.state === "suspended") return; // not unlocked yet — skip silently, not an error

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  gain.connect(ctx.destination);

  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    const start = now + i * 0.09;
    osc.start(start);
    osc.stop(start + 0.3);
  });
}
