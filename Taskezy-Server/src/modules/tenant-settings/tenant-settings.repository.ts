import { query } from "../../db/pool";

export interface TenantSettingsRow {
  office_lat: string;
  office_lng: string;
  geofence_radius_meters: number;
  half_day_threshold_hours: string;
  gst_rate: string;
  invoice_due_days: number;
}

/** The single tenant_settings row — real HRMS/Finance business rules (geofence, half-day threshold, GST rate, invoice due window), previously hardcoded. */
export async function getTenantSettings(): Promise<TenantSettingsRow> {
  const { rows } = await query<TenantSettingsRow>(
    `SELECT office_lat, office_lng, geofence_radius_meters, half_day_threshold_hours, gst_rate, invoice_due_days
     FROM tenant_settings WHERE id = true`
  );
  return rows[0];
}

/** Haversine distance in meters between two lat/lng points. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
