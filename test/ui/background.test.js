// The background worker's navigations, driven through the chrome events it
// listens to. Each test imports a fresh copy so its listeners bind to a fresh
// stub.

import { jest } from "@jest/globals";
import { clearChrome, stubChrome } from "./support/popup-fixture.js";

const HOME = "https://acme.lightning.force.com/lightning/page/home";
const DESIGNER =
  "https://acme--vlocity-cmt.vf.force.com/one/one.app#/alohaRedirect/apex/vlocity_cmt__drmapper?id=a1B";
const BARE = "https://acme--vlocity-cmt.vf.force.com/one/one.app";

let stub;
beforeEach(async () => {
  jest.resetModules();
  stub = stubChrome({ tabUrl: HOME });
  await import("../../src/ui/background.js");
});
afterEach(clearChrome);

/** Deliver a message the way chrome does, and wait for the worker's answer. */
function send(message) {
  return new Promise((resolve) => {
    const async = stub.listeners.message.some((fn) => fn(message, {}, resolve) === true);
    if (!async) resolve(undefined);
  });
}

async function complete(tabId, url) {
  for (const fn of stub.listeners.updated) await fn(tabId, { status: "complete" }, { id: tabId, url });
}

test("re-sends the designer link when the first load lost its route", async () => {
  expect(await send({ type: "openConfirmed", tabId: null, url: DESIGNER })).toEqual({ ok: true });
  expect(stub.calls.tabsCreate).toEqual([{ url: DESIGNER }]);

  // The session hand-off: still on its way, nothing to do yet.
  await complete(99, "https://acme.my.salesforce.com/visualforce/session?url=x");
  expect(stub.calls.tabsUpdate).toHaveLength(0);

  // Arrived on one.app without the route: the Lightning home page, not the designer.
  await complete(99, BARE);
  expect(stub.calls.tabsUpdate).toEqual([{ id: 99, info: { url: DESIGNER } }]);

  // Only once.
  await complete(99, BARE);
  expect(stub.calls.tabsUpdate).toHaveLength(1);
});

test("leaves the tab alone when the designer landed first time", async () => {
  await send({ type: "openConfirmed", tabId: 11, url: DESIGNER });
  expect(stub.calls.tabsUpdate).toEqual([{ id: 11, info: { url: DESIGNER } }]);

  await complete(11, DESIGNER);
  expect(stub.calls.tabsUpdate).toHaveLength(1);
  expect(stub.sessionStore).toEqual({});
});

test("checks the landing after an app switch too", async () => {
  await send({
    type: "openViaApp",
    tabId: 11,
    appUrl: "https://acme.lightning.force.com/lightning/app/06mA",
    targetUrl: DESIGNER,
  });
  expect(stub.calls.tabsUpdate.map((c) => c.info.url)).toEqual([
    "https://acme.lightning.force.com/lightning/app/06mA",
  ]);

  await complete(11, "https://acme.lightning.force.com/lightning/app/06mA");
  await complete(11, BARE);
  expect(stub.calls.tabsUpdate.map((c) => c.info.url)).toEqual([
    "https://acme.lightning.force.com/lightning/app/06mA",
    DESIGNER,
    DESIGNER,
  ]);
});
