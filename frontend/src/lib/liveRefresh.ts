"use client";

import { useEffect, useRef } from "react";

// Live screen refresh. The server sends a small `data-changed` SSE event
// ({ topics }) whenever something in one of these areas changes
// (Taskezy-Server/src/utils/dataChanged.ts); AppContext turns each into a
// version bump, and every page lists the areas it shows in its fetch deps.
export type DataTopic = "leads" | "followups" | "tasks" | "calllog" | "properties" | "users" | "calendar";
export type DataVersion = Record<DataTopic, number>;

export const ALL_DATA_TOPICS: DataTopic[] = ["leads", "followups", "tasks", "calllog", "properties", "users", "calendar"];
export const EMPTY_DATA_VERSION: DataVersion = { leads: 0, followups: 0, tasks: 0, calllog: 0, properties: 0, users: 0, calendar: 0 };

/** Sum of the given areas' versions — one number to put in a fetch effect's deps. */
export function liveVersionOf(version: DataVersion, topics: DataTopic[]): number {
  return topics.reduce((sum, t) => sum + version[t], 0);
}

/**
 * For a fetch effect that includes a live version in its deps: call
 * `isBackground()` once at the top of the effect. It's true when this run was
 * caused only by a live update — then keep showing the current rows (no
 * skeleton / spinner) and just swap the data in when it arrives.
 */
export function useBackgroundRefresh(liveVersion: number) {
  const seenRef = useRef(liveVersion);
  return {
    isBackground: () => {
      const background = seenRef.current !== liveVersion;
      seenRef.current = liveVersion;
      return background;
    }
  };
}

/**
 * Runs `run` whenever `trigger` changes, but at most once per `minIntervalMs`
 * (a change inside the window is run once at the end of it). Skips the first
 * render — initial loads are done elsewhere.
 */
export function useThrottledOnChange(trigger: number, minIntervalMs: number, run: () => void) {
  const runRef = useRef(run);
  runRef.current = run;
  const lastRunRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    if (timerRef.current) return; // already queued for the end of the window
    const fire = () => { timerRef.current = null; lastRunRef.current = Date.now(); runRef.current(); };
    const wait = lastRunRef.current + minIntervalMs - Date.now();
    if (wait <= 0) fire();
    else timerRef.current = setTimeout(fire, wait);
  }, [trigger, minIntervalMs]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
}
