// background.js — the navigations the popup can't finish itself, because it
// closes as soon as it starts one.
//
// Two jobs, both driven by the pending entries in src/core/nav-model.js:
//
// - App switch. The managed Integration Procedure and DataRaptor designers are
//   reached through `/one/one.app#/alohaRedirect/apex/...` on the Visualforce
//   host. That URL can't carry app context the way a `/lightning/...` path can:
//   the shell it lands in uses whichever Lightning app the user is currently
//   in, which Salesforce tracks server-side. So to land inside a particular app
//   we switch to that app first, let it load, and only then follow through.
//
// - Landing check. Those designer links keep their route in the URL fragment,
//   and the first visit to the Visualforce host in a session can drop it on
//   the way through Salesforce's session hand-off, leaving the tab on the
//   Lightning home page. When a load completes on the right page without the
//   route, the worker sends the tab to the link once more.
//
// State goes in session storage rather than a variable, because a service
// worker can be torn down between two page loads; a tab event wakes it back up.

import { confirmEntry, isFragmentOnlyChange, nextStep, pendingKey } from "../core/nav-model.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;
  // Answer once the navigation has started, so the popup knows the message
  // arrived before it closes.
  const done = () => sendResponse({ ok: true });
  if (message.type === "openViaApp") {
    startAppSwitch(message).finally(done);
    return true;
  }
  if (message.type === "openConfirmed") {
    startConfirmed(message).finally(done);
    return true;
  }
  return false;
});

async function remember(tabId, entry) {
  if (tabId == null) return;
  if (entry) await chrome.storage.session.set({ [pendingKey(tabId)]: entry });
  else await chrome.storage.session.remove(pendingKey(tabId));
}

async function currentUrl(tabId) {
  try {
    return (await chrome.tabs.get(tabId)).url || "";
  } catch {
    return "";
  }
}

async function startAppSwitch({ tabId, appUrl, targetUrl }) {
  if (tabId != null) {
    // If the tab is already sitting in this app, hopping to the app URL again
    // would just reload a page we're about to leave. The current-app state is
    // already what we want, so go straight to the designer.
    const url = await currentUrl(tabId);
    if (url.startsWith(appUrl)) {
      await startConfirmed({ tabId, url: targetUrl });
      return;
    }
    // Store first: the app page can finish loading before an await returns.
    await remember(tabId, { stage: "app", targetUrl, startedAt: Date.now() });
    await chrome.tabs.update(tabId, { url: appUrl });
  } else {
    const tab = await chrome.tabs.create({ url: appUrl });
    await remember(tab.id, { stage: "app", targetUrl, startedAt: Date.now() });
  }
}

async function startConfirmed({ tabId, url }) {
  if (tabId != null) {
    // Moving between two designers on the same one.app page only changes the
    // fragment: nothing loads, so there is nothing to check.
    const from = await currentUrl(tabId);
    await remember(tabId, isFragmentOnlyChange(from, url) ? null : confirmEntry(url, Date.now()));
    await chrome.tabs.update(tabId, { url });
  } else {
    const tab = await chrome.tabs.create({ url });
    await remember(tab.id, confirmEntry(url, Date.now()));
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;

  const key = pendingKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const pending = stored[key];
  if (!pending) return;

  const url = (tab && tab.url) || (await currentUrl(tabId));
  const { navigate, keep } = nextStep(pending, url, Date.now());
  // Update the entry before navigating, so a redirect chain on the target
  // can't act on the old one.
  await remember(tabId, keep);
  if (navigate) await chrome.tabs.update(tabId, { url: navigate });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(pendingKey(tabId));
});
