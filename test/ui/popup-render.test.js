import { jest } from "@jest/globals";
import { clearChrome, mountPopupMarkup, stubChrome } from "./support/popup-fixture.js";

// popup.js builds its `el` cache at import time, so the markup and chrome stub
// have to be in place before the dynamic import. Reset between tests because the
// module keeps `state` at the top level.
let popup;
beforeEach(async () => {
  jest.resetModules();
  mountPopupMarkup();
  stubChrome();
  popup = await import("../../src/ui/popup.js");
});
afterEach(clearChrome);

const group = (over) => ({
  key: over.label,
  kind: "os",
  label: "Onboarding",
  type: "T",
  subType: "S",
  language: "English",
  inputType: "",
  outputType: "",
  author: "",
  cardType: "",
  haystack: (over.label || "Onboarding").toLowerCase() + " t s english",
  versions: [
    { version: 2, isActive: true },
    { version: 1, isActive: false },
  ],
  active: { version: 2, isActive: true },
  head: { version: 2, isActive: true },
  ...over,
});

test("renders one row per visible group, each with its kind badge", () => {
  popup.state.groups = [
    group({ label: "Onboarding", kind: "os" }),
    group({ label: "AccountExtract", kind: "dr" }),
  ];
  popup.render();

  const rows = document.querySelectorAll("#results .row");
  expect(rows).toHaveLength(2);
  expect(document.querySelector("#results .badge.os")).not.toBeNull();
  expect(document.querySelector("#results .badge.dr")).not.toBeNull();
  expect(document.getElementById("count").textContent).toBe("2/2");
});

test("shows the empty state when the search matches nothing", () => {
  popup.state.groups = [group({ label: "Onboarding" })];
  popup.state.query = "zzz";
  popup.render();

  expect(document.querySelector("#results .empty")).not.toBeNull();
  expect(document.querySelectorAll("#results .row")).toHaveLength(0);
});

test("activeOnly hides a group that tracks activation but has no active version", () => {
  popup.state.groups = [
    group({
      label: "Stale",
      active: null,
      versions: [{ version: 1, isActive: false }],
    }),
    group({ label: "Live" }),
  ];
  popup.state.activeOnly = true;
  popup.render();

  const titles = [...document.querySelectorAll("#results .row .title")].map((n) => n.textContent);
  expect(titles).toEqual(["Live"]);
});

test("marks the search hit inside the row title", () => {
  popup.state.groups = [group({ label: "Create Case" })];
  popup.state.query = "case";
  popup.render();

  const mark = document.querySelector("#results .title mark");
  expect(mark).not.toBeNull();
  expect(mark.textContent).toBe("Case");
});
