// Shared setup for the jsdom UI tests: the real popup.html markup, and a
// minimal `chrome` stub. Prefer these over hand-rolling either — a second,
// slightly-wrong copy of the markup or the stub is worse than importing the
// real thing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const popupHtmlPath = fileURLToPath(new URL("../../../popup.html", import.meta.url));

/** The raw popup.html source, for structural assertions (script tags etc.). */
export function popupHtmlSource() {
  return readFileSync(popupHtmlPath, "utf8");
}

/** Load the real popup.html <body> into document.body, minus its <script>. */
export function mountPopupMarkup() {
  const html = popupHtmlSource();
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (body ? body[1] : "").replace(/<script[\s\S]*?<\/script>/gi, "");
}

/**
 * Install a minimal `chrome` on globalThis. Storage is backed by plain objects;
 * `tabs`/`runtime` calls are recorded on the returned handle so a test can
 * assert what the popup tried to do.
 */
export function stubChrome({ tabUrl = "https://acme.my.salesforce.com/", sync = {}, local = {} } = {}) {
  const calls = { tabsUpdate: [], tabsCreate: [], messages: [], openedOptions: 0 };
  // Listeners the code under test registers, so a test can fire the events.
  const listeners = { message: [], updated: [], removed: [] };
  const syncStore = { ...sync };
  const localStore = { ...local };
  const sessionStore = {};

  const area = (store) => ({
    get: async (keys) => {
      if (keys == null) return { ...store };
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
    },
    set: async (obj) => Object.assign(store, obj),
    remove: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
    },
  });

  const chrome = {
    tabs: {
      query: async () => [{ id: 11, url: tabUrl }],
      update: async (id, info) => calls.tabsUpdate.push({ id, info }),
      create: async (info) => {
        calls.tabsCreate.push(info);
        return { id: 99 };
      },
      get: async (id) => ({ id, url: tabUrl }),
      onUpdated: { addListener: (fn) => listeners.updated.push(fn) },
      onRemoved: { addListener: (fn) => listeners.removed.push(fn) },
    },
    runtime: {
      openOptionsPage: () => calls.openedOptions++,
      sendMessage: async (m) => {
        calls.messages.push(m);
      },
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      getManifest: () => ({ version: "test" }),
    },
    commands: { getAll: async () => [] },
    cookies: { get: async () => null, getAll: async () => [] },
    storage: { sync: area(syncStore), local: area(localStore), session: area(sessionStore) },
  };

  globalThis.chrome = chrome;
  return { chrome, calls, listeners, syncStore, localStore, sessionStore };
}

export function clearChrome() {
  delete globalThis.chrome;
}
