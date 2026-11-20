import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { getAdAccounts, getManagedPages, getMe, isTokenValid, subscribePageToLeadgen } from "./meta-client";
import * as repo from "./meta.repository";

/**
 * Settings → Meta Ads: which Facebook Pages are connected, and a Sync that
 * connects the missing ones using the Facebook logins Taskezy already holds
 * (the ad-account logins), so nobody has to go through Facebook's Connect
 * dialog again. Page and user tokens never leave the server.
 *
 * These run while an admin waits, so Meta calls never sit out a rate limit
 * (they fail fast instead) and the per-Page connection checks run a few at a
 * time rather than one after another.
 */

export type MetaPageState = "connected" | "connection_lost" | "ready" | "disconnected";

export interface MetaPageStatus {
  pageId: string;
  name: string;
  state: MetaPageState;
  /** Facebook people (saved logins) who manage this Page; empty = no saved login can see it. */
  managedBy: string[];
  /** A saved login manages it, so Sync / Connect / Reconnect can act on it. */
  canSync: boolean;
}

interface VisiblePage {
  name: string;
  /** One Page token per saved login that manages it; tried in turn when connecting. */
  pageTokens: string[];
  managedBy: string[];
}

interface SavedLogin {
  name: string;
  userToken: string;
}

const FAIL_FAST = { retryOnRateLimit: false };
const CHECKS_AT_ONCE = 5;

/** Runs `fn` over `items` with at most `limit` running at once, keeping the input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Every distinct saved Facebook login (one per person) and the Pages they manage. */
async function readSavedLogins(): Promise<{ logins: SavedLogin[]; visible: Map<string, VisiblePage>; loginErrors: number }> {
  const visible = new Map<string, VisiblePage>();
  const logins: SavedLogin[] = [];
  const people = new Set<string>();
  let loginErrors = 0;
  let accounts: repo.ActiveAdAccount[];
  try {
    accounts = await repo.listActiveAdAccounts();
  } catch (err) {
    // e.g. one saved login that can't be decrypted: report it, don't fail the whole page
    logger.warn({ err }, "Could not read the saved Meta logins");
    return { logins, visible, loginErrors: 1 };
  }
  for (const userToken of new Set(accounts.map(a => a.userToken))) {
    try {
      const me = await getMe(userToken, FAIL_FAST);
      if (people.has(me.id)) continue;
      people.add(me.id);
      logins.push({ name: me.name, userToken });
      for (const page of await getManagedPages(userToken, FAIL_FAST)) {
        const known = visible.get(page.id);
        visible.set(page.id, known
          ? { ...known, pageTokens: [...known.pageTokens, page.access_token], managedBy: [...known.managedBy, me.name] }
          : { name: page.name, pageTokens: [page.access_token], managedBy: [me.name] });
      }
    } catch (err) {
      loginErrors++;
      logger.warn({ err }, "Could not read the Pages of a saved Meta login");
    }
  }
  return { logins, visible, loginErrors };
}

/**
 * Whether a connected Page's saved connection still works. A saved token we
 * can't even read counts as lost (Sync re-saves it); if only asking Meta
 * fails, it counts as working, so a Page is never wrongly shown as dead.
 */
async function connectionWorks(pageId: string): Promise<boolean> {
  let pageToken: string;
  try {
    const conn = await repo.getActiveConnectionByPageId(pageId);
    if (!conn) return true;
    pageToken = conn.pageToken;
  } catch (err) {
    logger.warn({ err, pageId }, "Could not read a Meta Page's saved connection");
    return false;
  }
  try {
    return await isTokenValid(pageToken);
  } catch (err) {
    logger.warn({ err, pageId }, "Could not check a Meta Page's connection with Meta");
    return true;
  }
}

/** connectionWorks for many Pages, a few at a time. */
async function workingPages(pageIds: string[]): Promise<Set<string>> {
  const ok = await mapLimit(pageIds, CHECKS_AT_ONCE, connectionWorks);
  return new Set(pageIds.filter((_, i) => ok[i]));
}

export async function getPageStatuses(): Promise<{ pages: MetaPageStatus[]; lastSyncedAt: string | null; loginErrors: number }> {
  const { visible, loginErrors } = await readSavedLogins();
  const states = await repo.listPageConnectionStates();
  const savedNames = new Map((await repo.listConnections()).map(c => [c.page_id, c.page_name.trim()]));
  const working = await workingPages([...states].filter(([, s]) => s === "ACTIVE").map(([id]) => id));
  const pages: MetaPageStatus[] = [];
  for (const [pageId, status] of states) {
    const seen = visible.get(pageId);
    const state: MetaPageState = status === "DISCONNECTED" ? "disconnected" : working.has(pageId) ? "connected" : "connection_lost";
    pages.push({ pageId, name: seen?.name ?? savedNames.get(pageId) ?? pageId, state, managedBy: seen?.managedBy ?? [], canSync: !!seen });
  }
  for (const [pageId, page] of visible) {
    if (!states.has(pageId)) pages.push({ pageId, name: page.name, state: "ready", managedBy: page.managedBy, canSync: true });
  }
  return { pages: pages.sort((a, b) => a.name.localeCompare(b.name)), lastSyncedAt: await repo.latestPageSync(), loginErrors };
}

/** Subscribes + saves the Page with the first saved login whose access Meta accepts. */
async function connectPage(pageId: string, page: VisiblePage, adminId: string): Promise<boolean> {
  for (const pageToken of page.pageTokens) {
    try {
      await subscribePageToLeadgen(pageId, pageToken);
      await repo.upsertConnection({ pageId, pageName: page.name, pageAccessToken: pageToken, connectedBy: adminId });
      return true;
    } catch (err) {
      logger.warn({ err, pageId }, "Sync could not connect this Meta Page with one saved login; trying the next");
    }
  }
  return false;
}

// ponytail: in-process flag, enough for the single API container; a shared lock if the API ever runs on several.
let syncRunning = false;

/**
 * Without `pageIds` (Sync now): connects every Page a saved login manages that
 * isn't connected, and repairs connected Pages whose connection died; Pages an
 * admin disconnected are left alone; new ad accounts are added, ones an admin
 * turned off stay off. With `pageIds` (a row's Connect / Reconnect): exactly
 * those Pages, as long as a saved login manages them.
 */
export async function syncPages(adminId: string, pageIds?: string[]): Promise<{ connected: string[]; failed: string[]; adAccountsAdded: number; loginErrors: number }> {
  if (syncRunning) throw ApiError.conflict("A Meta sync is already running. Wait for it to finish, then refresh.");
  syncRunning = true;
  try {
    const { logins, visible, loginErrors: pageLoginErrors } = await readSavedLogins();
    let loginErrors = pageLoginErrors;
    const states = await repo.listPageConnectionStates();
    const wanted = pageIds ? new Set(pageIds) : undefined;
    const candidates = [...visible].filter(([pageId]) => !wanted || wanted.has(pageId));
    const working = await workingPages(candidates.filter(([pageId]) => states.get(pageId) === "ACTIVE").map(([pageId]) => pageId));

    const connected: string[] = [];
    const failed: string[] = [];
    for (const [pageId, page] of candidates) {
      if (working.has(pageId)) continue;
      if (!wanted && states.get(pageId) === "DISCONNECTED") continue;
      (await connectPage(pageId, page, adminId) ? connected : failed).push(page.name);
    }
    await repo.markPagesSynced([...working]);

    let adAccountsAdded = 0;
    if (!wanted) {
      for (const login of logins) {
        try {
          for (const account of await getAdAccounts(login.userToken, FAIL_FAST)) {
            if (await repo.addAdAccountIfNew({ id: account.id, name: account.name, connectedBy: adminId, userToken: login.userToken })) adAccountsAdded++;
          }
        } catch (err) {
          loginErrors++;
          logger.warn({ err }, "Sync could not read the ad accounts of a saved Meta login");
        }
      }
    }
    return { connected, failed, adAccountsAdded, loginErrors };
  } finally {
    syncRunning = false;
  }
}
