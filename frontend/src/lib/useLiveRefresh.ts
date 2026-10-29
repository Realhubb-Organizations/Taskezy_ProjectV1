"use client";

import { useApp } from "@/context/AppContext";
import { liveVersionOf, useBackgroundRefresh, type DataTopic } from "./liveRefresh";

/**
 * Live refresh for one page fetch: put `liveVersion` in the fetch effect's
 * deps so it refetches when any of `topics` changes on the server, and call
 * `isBackground()` at the top of that effect to skip the loading state for
 * those silent refreshes. See lib/liveRefresh.ts.
 */
export function useLiveRefresh(...topics: DataTopic[]) {
  const { dataVersion } = useApp();
  const liveVersion = liveVersionOf(dataVersion, topics);
  const { isBackground } = useBackgroundRefresh(liveVersion);
  return { liveVersion, isBackground };
}
