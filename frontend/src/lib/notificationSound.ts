"use client";

// Real ringtone file, served from public/ (see frontend/public/sounds/notification.mp3).
// Falls back to a synthesized chime (Web Audio API) if that file is ever
// missing/fails to load, so sound never just silently stops working. Browsers
// block audio until the user has interacted with the page at least once
// (autoplay policy, not a bug); initUnlock() primes both playback paths on
// the first click anywhere so every subsequent live notification can play.

const SOUND_URL = "/sounds/notification.mp3";
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

/** Call once on app mount — primes the audio file + AudioContext on the user's first click so later sounds aren't silently blocked. */
export function initNotificationSoundUnlock(): () => void {
  const unlock = () => {
    unlocked = true;
    const ctx = getContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    // Muted priming play — satisfies the browser's "played after a user
    // gesture" requirement without actually being audible on this click.
    const audio = new Audio(SOUND_URL);
    audio.volume = 0;
    audio.play().then(() => audio.pause()).catch(() => {});
  };
  window.addEventListener("click", unlock, { once: true });
  return () => window.removeEventListener("click", unlock);
}

/** One "ding" — a two-tone chime with a fast attack, at `startOffset` seconds from now. Fallback only. */
function playChime(ctx: AudioContext, startOffset: number, peakGain: number): void {
  const now = ctx.currentTime + startOffset;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.012); // fast attack reads as "louder" even at the same peak
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  gain.connect(ctx.destination);

  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle"; // brighter/more piercing than sine — cuts through background noise better
    osc.frequency.value = freq;
    osc.connect(gain);
    const start = now + i * 0.09;
    osc.start(start);
    osc.stop(start + 0.35);
  });
}

function playSynthesizedFallback(): void {
  const ctx = getContext();
  if (!ctx || ctx.state === "suspended") return;
  playChime(ctx, 0, 0.5);
  playChime(ctx, 0.22, 0.5);
}

export function playNotificationSound(): void {
  if (isNotificationSoundMuted() || !unlocked) return;

  const audio = new Audio(SOUND_URL);
  audio.volume = 0.85;
  audio.play().catch(() => {
    // File missing, wrong format, or blocked — fall back rather than go silent.
    playSynthesizedFallback();
  });
}
