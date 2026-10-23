import { Capacitor } from "@capacitor/core";

/**
 * True on a phone-sized screen or inside the Android app. Used to pick
 * lighter default table columns (Lead Name, Status, Actions, Notes) — users
 * can still turn the rest on from each table's Filter panel.
 */
export function isPhoneLayout(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform() || window.matchMedia("(max-width: 767px)").matches;
}
