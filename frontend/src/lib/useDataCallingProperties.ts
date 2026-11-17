"use client";

import { useEffect, useState } from "react";
import { apiListPropertiesPage } from "./apiClient";
import { useLiveRefresh } from "./useLiveRefresh";

export interface DataCallingPropertyOption {
  id: string;
  name: string;
}

/**
 * Data Calling's own property list (Properties page → Data Calling
 * Properties), refreshed whenever properties change on the server. Fetches
 * nothing while `enabled` is false.
 */
export function useDataCallingProperties(enabled = true): DataCallingPropertyOption[] {
  const [list, setList] = useState<DataCallingPropertyOption[]>([]);
  const { liveVersion } = useLiveRefresh("properties");
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiListPropertiesPage(1, 500, { kind: "DATA_CALLING", sortDir: "asc" })
      .then(r => {
        if (!cancelled) setList(r.rows.map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => { /* keep the last list on a transient failure */ });
    return () => { cancelled = true; };
  }, [liveVersion, enabled]);
  return list;
}
