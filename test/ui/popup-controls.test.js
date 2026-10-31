import { jest } from "@jest/globals";
import { clearChrome, mountPopupMarkup, stubChrome } from "./support/popup-fixture.js";

let popup;
let stub;
beforeEach(async () => {
  jest.resetModules();
  mountPopupMarkup();
  stub = stubChrome();
  popup = await import("../../src/ui/popup.js");
  popup.wireEvents();
});
afterEach(clearChrome);

const group = (kind, label) => ({
  key: label,
  kind,
  label,
  type: "T",
  subType: "S",
  language: "English",
  inputType: "",
  outputType: "",
  author: "",
  cardType: "",
  haystack: label.toLowerCase(),
  versions: [{ version: 1, isActive: true }],
  active: { version: 1, isActive: true },
  head: { version: 1, isActive: true },
});

test("clicking a segment sets the filter and re-renders to just that kind", () => {
  popup.state.groups = [group("os", "Onboarding"), group("dr", "AccountExtract")];
  popup.render();
  expect(document.querySelectorAll("#results .row")).toHaveLength(2);

  document.querySelector('.seg[data-filter="dr"]').click();

  expect(popup.state.filter).toBe("dr");
  expect(document.querySelector('.seg[data-filter="dr"]').getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector('.seg[data-filter="all"]').getAttribute("aria-pressed")).toBe("false");
  const titles = [...document.querySelectorAll("#results .row .title")].map((n) => n.textContent);
  expect(titles).toEqual(["AccountExtract"]);
});

test("the help button toggles the help panel and the results list", () => {
  const panel = document.getElementById("helpPanel");
  const results = document.getElementById("results");
  expect(panel.classList.contains("hidden")).toBe(true);

  document.getElementById("help").click();
  expect(panel.classList.contains("hidden")).toBe(false);
  expect(results.classList.contains("hidden")).toBe(true);
  expect(document.getElementById("help").getAttribute("aria-expanded")).toBe("true");

  document.getElementById("help").click();
  expect(panel.classList.contains("hidden")).toBe(true);
});

test("a managed designer link is handed to the worker, which checks where it lands", async () => {
  popup.state.session = { uiHost: "acme.lightning.force.com", uiOrigin: "https://acme.lightning.force.com" };
  popup.state.schema = { namespace: "vlocity_cmt", installedNamespace: "vlocity_cmt" };
  popup.state.prefs = { designerPref: "auto", nsOverride: "", openIn: "newTab", appContext: "" };
  const dr = { ...group("dr", "AccountExtract"), sobject: "vlocity_cmt__DRBundle__c" };
  dr.head = dr.active = { ...dr.active, id: "a1B", kind: "dr", sobject: dr.sobject };
  popup.state.groups = [dr];
  popup.render();
  const closed = jest.spyOn(window, "close").mockImplementation(() => {});

  document.querySelector("#results .open-btn").click();
  await new Promise((r) => setTimeout(r, 0));

  const { calls } = stub;
  expect(calls.tabsCreate).toHaveLength(0);
  expect(calls.messages).toEqual([
    {
      type: "openConfirmed",
      tabId: null,
      url: "https://acme--vlocity-cmt.vf.force.com/one/one.app#/alohaRedirect/apex/vlocity_cmt__drmapper?id=a1B",
    },
  ]);
  expect(closed).toHaveBeenCalled();
});

test("still opens the link when the background worker can't be reached", async () => {
  popup.state.session = { uiHost: "acme.lightning.force.com", uiOrigin: "https://acme.lightning.force.com" };
  popup.state.schema = { namespace: "vlocity_cmt", installedNamespace: "vlocity_cmt" };
  popup.state.prefs = { designerPref: "auto", nsOverride: "", openIn: "newTab", appContext: "" };
  const dr = { ...group("dr", "AccountExtract"), sobject: "vlocity_cmt__DRBundle__c" };
  dr.head = dr.active = { ...dr.active, id: "a1B", kind: "dr", sobject: dr.sobject };
  popup.state.groups = [dr];
  popup.render();
  jest.spyOn(window, "close").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  stub.chrome.runtime.sendMessage = async () => {
    throw new Error("Receiving end does not exist.");
  };

  document.querySelector("#results .open-btn").click();
  await new Promise((r) => setTimeout(r, 0));

  expect(stub.calls.tabsCreate).toEqual([
    { url: "https://acme--vlocity-cmt.vf.force.com/one/one.app#/alohaRedirect/apex/vlocity_cmt__drmapper?id=a1B" },
  ]);
});
