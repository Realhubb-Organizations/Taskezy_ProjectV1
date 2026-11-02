import { Response } from "express";

// In-process pub/sub for Server-Sent Events — fine as long as the API runs
// as a single container (see Taskezy-Server/README "Scaling"). If this ever
// runs as more than one instance, a connected client only receives events
// published from the instance holding its stream, so this would need to
// move behind something shared (e.g. Redis pub/sub) at that point.
const clientsByUser = new Map<string, Set<Response>>();

// Per-device connection counts (same device-label scheme the Devices panel
// and presence heartbeat already use — see describeDevice in loginOtp.ts).
// A count, not a Set, because closing ONE of two tabs with the same label
// (e.g. two "Chrome on Windows" windows) must keep that device marked
// connected until the last one actually closes.
const connectionCountByUserDevice = new Map<string, Map<string, number>>();

/** Registers an open SSE response for a user; returns the cleanup function to call on disconnect. deviceLabel is optional — omitted for anything that doesn't need per-device presence (there is none today, but keeps this function's older callers valid). */
export function subscribe(userId: string, res: Response, deviceLabel?: string): () => void {
  let set = clientsByUser.get(userId);
  if (!set) {
    set = new Set();
    clientsByUser.set(userId, set);
  }
  set.add(res);

  if (deviceLabel) {
    let byDevice = connectionCountByUserDevice.get(userId);
    if (!byDevice) {
      byDevice = new Map();
      connectionCountByUserDevice.set(userId, byDevice);
    }
    byDevice.set(deviceLabel, (byDevice.get(deviceLabel) ?? 0) + 1);
  }

  return () => {
    set!.delete(res);
    if (set!.size === 0) clientsByUser.delete(userId);

    if (deviceLabel) {
      const byDevice = connectionCountByUserDevice.get(userId);
      const count = (byDevice?.get(deviceLabel) ?? 1) - 1;
      if (count <= 0) byDevice?.delete(deviceLabel);
      else byDevice!.set(deviceLabel, count);
      if (byDevice && byDevice.size === 0) connectionCountByUserDevice.delete(userId);
    }
  };
}

export function publishToUser(userId: string, event: string, data: unknown): void {
  const set = clientsByUser.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}

/** Same as publishToUser but fans out to every connected client, regardless of user. */
export function publishToAll(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const set of clientsByUser.values()) {
    for (const res of set) res.write(payload);
  }
}

/** Does this user have at least one open SSE connection (any tab/device) right now? The authoritative online/offline signal for presence. */
export function isConnected(userId: string): boolean {
  const set = clientsByUser.get(userId);
  return !!set && set.size > 0;
}

/** Does this user have an open SSE connection specifically from this device (by the same label describeDevice computes)? The authoritative per-device online/offline signal. */
export function isDeviceConnected(userId: string, deviceLabel: string): boolean {
  return (connectionCountByUserDevice.get(userId)?.get(deviceLabel) ?? 0) > 0;
}
