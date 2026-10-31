// nav-model.js — the contract shared between the popup and the background
// service worker for opening an asset: the two-hop app switch the managed
// Visualforce designers need, and the landing check that follows a designer
// link through Salesforce's session hand-off. Pure: the popup and the worker
// perform the navigation; this decides what the navigation should be.
//
// The state between hops lives in chrome.storage.session keyed by tab id
// rather than a worker variable, because the service worker can be torn down
// between two page loads (see CONTRIBUTING.md).

import { needsAppSwitch } from "./designer-urls.js";

/** storage.session key prefix for a pending second-hop navigation. */
export const PENDING_PREFIX = "pendingNav:";

/** storage.session key for one tab's pending navigation. */
export function pendingKey(tabId) {
  return PENDING_PREFIX + tabId;
}

/**
 * Has a pending navigation been sitting unfinished too long? The app never
 * loaded, or the user navigated away and some unrelated page load is what
 * completed. Default TTL matches the original inline 30s.
 */
export function isStale(entry, now, ttlMs = 30000) {
  return now - entry.startedAt > ttlMs;
}

/**
 * Does this link carry its route in the URL fragment? The managed Integration
 * Procedure and DataRaptor designers do: `/one/one.app#/alohaRedirect/...`.
 */
export function routesByFragment(url) {
  try {
    return new URL(url).hash.length > 1;
  } catch {
    return false;
  }
}

/** Would going from `fromUrl` to `toUrl` only change the fragment (no page load)? */
export function isFragmentOnlyChange(fromUrl, toUrl) {
  try {
    const from = new URL(fromUrl);
    const to = new URL(toUrl);
    return from.origin + from.pathname + from.search === to.origin + to.pathname + to.search;
  } catch {
    return false;
  }
}

/**
 * Where did a page load leave the tab, relative to the designer link it was
 * sent to?
 *
 * The first visit to the Visualforce host in a browser session goes through
 * Salesforce's session hand-off (my.salesforce.com/visualforce/session and
 * back). That hop does not keep the fragment, so the tab can arrive on a bare
 * `/one/one.app` with the designer route gone, showing the Lightning home page
 * instead of the designer. Opening the link a second time worked, because the
 * session existed by then. That case is "lost".
 *
 * - `landed`:  on the target page, and the fragment still holds its route.
 * - `lost`:    on the target page, but the route was dropped on the way.
 * - `pending`: somewhere else, most likely a hop of the hand-off; keep waiting.
 */
export function landingState(currentUrl, targetUrl) {
  let current;
  let target;
  try {
    current = new URL(currentUrl);
    target = new URL(targetUrl);
  } catch {
    return "pending";
  }
  if (current.origin !== target.origin || current.pathname !== target.pathname) return "pending";
  // Compare the route only (the part before any `?`): the router may reorder
  // or add parameters, but it keeps the page it was asked for.
  const route = decodeURIComponent(target.hash.split("?")[0]);
  return decodeURIComponent(current.hash).startsWith(route) ? "landed" : "lost";
}

/**
 * A pending entry for checking where a designer link lands, or null when the
 * link has no fragment route to lose.
 */
export function confirmEntry(targetUrl, now) {
  return routesByFragment(targetUrl) ? { stage: "confirm", targetUrl, startedAt: now } : null;
}

/**
 * What the worker does when a tab with a pending entry finishes loading.
 * Returns the URL to navigate to (or null) and the entry to keep (or null to
 * clear it).
 *
 * - stage "app" (the default, and the shape older builds stored): the app has
 *   loaded, so go on to the designer, then check where that lands.
 * - stage "confirm": if the route was lost, send the tab to the link once
 *   more. The tab is already on the right page, so that only changes the
 *   fragment, which Salesforce's router follows without a reload; there is
 *   no further load to check, so the entry is cleared either way.
 */
export function nextStep(entry, tabUrl, now) {
  if (isStale(entry, now)) return { navigate: null, keep: null };
  if (entry.stage !== "confirm") {
    return { navigate: entry.targetUrl, keep: confirmEntry(entry.targetUrl, now) };
  }
  const where = landingState(tabUrl, entry.targetUrl);
  if (where === "pending") return { navigate: null, keep: entry };
  return { navigate: where === "lost" ? entry.targetUrl : null, keep: null };
}

/**
 * Decide how to open `targetUrl`.
 *
 * - `app-switch`: an app is pinned and the target is a Visualforce designer that
 *   can't carry app context in its URL, so switch to the app first and let the
 *   worker follow through. `tabId` is the tab to reuse, or null to open fresh.
 * - `same-tab`: a plain navigation in the current tab.
 * - `new-tab`: open in a new tab.
 *
 * `confirm` on a same-tab or new-tab plan means the link routes by fragment,
 * so the worker performs the navigation and checks where it lands.
 *
 * `invertTarget` is the Ctrl/Cmd-click modifier: the opposite of the saved
 * `openIn` preference.
 */
export function navigationPlan({ targetUrl, openIn, invertTarget, appContext, tabId, uiOrigin }) {
  const wantsSameTab = (openIn === "sameTab") !== Boolean(invertTarget);
  const app = (appContext || "").trim();

  if (app && needsAppSwitch(targetUrl)) {
    return {
      mode: "app-switch",
      tabId: wantsSameTab ? (tabId ?? null) : null,
      appUrl: `${uiOrigin}/lightning/app/${encodeURIComponent(app)}`,
      targetUrl,
    };
  }

  const confirm = routesByFragment(targetUrl);
  if (wantsSameTab && tabId != null) {
    return { mode: "same-tab", tabId, url: targetUrl, confirm };
  }

  return { mode: "new-tab", url: targetUrl, confirm };
}
