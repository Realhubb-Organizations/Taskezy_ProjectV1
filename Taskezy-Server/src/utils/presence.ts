import { isConnected, isDeviceConnected } from "./sseHub";

// Live presence state — ephemeral by nature (doesn't need to survive a
// restart or be queried historically), so it's an in-memory map right
// next to sseHub's own, with the same single-instance caveat: if this API
// ever runs as more than one container, this needs to move behind
// something shared (e.g. Redis) to stay correct across instances.
const heartbeats = new Map<string, { active: boolean; lastHeartbeatAt: number; lastActiveAt: number }>();

// Best-effort per-device breakdown, keyed by the same device-label string
// login_history/the Devices panel already uses (see describeDevice in
// loginOtp.ts) — lets a web device row show its own live dot. The native
// app's one row has no equivalent label to key by here, so it just falls
// back to the user's overall status (see users.routes.ts's /:id/devices).
//
// deviceLabel is caller-supplied (see presence.routes.ts) and nothing ever
// evicted an entry here — any authenticated user could send a new random
// label on every heartbeat and grow this map forever (unbounded in-memory
// DoS, no special privilege needed). MAX_DEVICES_PER_USER bounds it: no
// real person has more than a handful of devices, so capping well above
// that and evicting the least-recently-updated entry when exceeded can
// never affect genuine use, only an attacker trying to flood it.
const MAX_DEVICES_PER_USER = 20;
const deviceHeartbeats = new Map<string, Map<string, { active: boolean; lastHeartbeatAt: number }>>();

// A heartbeat older than this is ignored (treated as idle) even if it last
// said "active" — covers a tab whose JS stalled but whose SSE socket is
// technically still open.
const HEARTBEAT_STALE_MS = 90_000;

export function recordHeartbeat(userId: string, active: boolean, deviceLabel?: string): void {
  const now = Date.now();
  const prev = heartbeats.get(userId);
  heartbeats.set(userId, {
    active,
    lastHeartbeatAt: now,
    lastActiveAt: active ? now : (prev?.lastActiveAt ?? now)
  });

  if (deviceLabel) {
    let byDevice = deviceHeartbeats.get(userId);
    if (!byDevice) {
      byDevice = new Map();
      deviceHeartbeats.set(userId, byDevice);
    }
    // Map iteration order is insertion order, and re-setting an existing
    // key doesn't change its position — so the first key is genuinely the
    // least-recently-updated one, not just the oldest-inserted.
    if (!byDevice.has(deviceLabel) && byDevice.size >= MAX_DEVICES_PER_USER) {
      const oldest = byDevice.keys().next().value;
      if (oldest !== undefined) byDevice.delete(oldest);
    }
    byDevice.delete(deviceLabel); // re-insert at the end so it's treated as most-recently-updated
    byDevice.set(deviceLabel, { active, lastHeartbeatAt: now });
  }
}

export type PresenceStatus = "active" | "idle" | "offline";

export function getPresence(userId: string): { status: PresenceStatus; lastActiveAt: number | null } {
  // The connection is the authoritative gate — a stale "active" flag
  // never overrides a closed connection.
  if (!isConnected(userId)) {
    return { status: "offline", lastActiveAt: heartbeats.get(userId)?.lastActiveAt ?? null };
  }
  const hb = heartbeats.get(userId);
  if (!hb || Date.now() - hb.lastHeartbeatAt > HEARTBEAT_STALE_MS) {
    return { status: "idle", lastActiveAt: hb?.lastActiveAt ?? null };
  }
  return { status: hb.active ? "active" : "idle", lastActiveAt: hb.lastActiveAt };
}

/** Best-effort per-device status for a web device row (see deviceHeartbeats above) — returns null when there's no device-level data yet, so the caller can fall back to getPresence's overall status. */
export function getDevicePresence(userId: string, deviceLabel: string): PresenceStatus | null {
  // This device's OWN connection, not just "is the user connected
  // anywhere" — closing this one tab must show offline even while other
  // tabs/devices of the same user stay connected.
  if (!isDeviceConnected(userId, deviceLabel)) return "offline";
  const hb = deviceHeartbeats.get(userId)?.get(deviceLabel);
  if (!hb) return null;
  if (Date.now() - hb.lastHeartbeatAt > HEARTBEAT_STALE_MS) return "idle";
  return hb.active ? "active" : "idle";
}
