import { jest } from "@jest/globals";
import { clearChrome, mountPopupMarkup, stubChrome } from "./support/popup-fixture.js";

// The result list is a listbox for assistive technology: the search box keeps
// focus and the arrow keys move a selection it points at with
// aria-activedescendant. These tests pin that wiring.

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

const group = (label) => ({
  key: label,
  kind: "os",
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

const q = () => document.getElementById("q");
const options = () => [...document.querySelectorAll('#results [role="option"]')];
const selectedLabels = () =>
  options()
    .filter((o) => o.getAttribute("aria-selected") === "true")
    .map((o) => o.querySelector(".title").textContent);
const press = (key) =>
  q().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

function seed(...labels) {
  popup.state.groups = labels.map(group);
  popup.render();
}

test("rows are options with unique ids, owned by a listbox the search box controls", () => {
  seed("Alpha", "Beta", "Gamma");

  const listbox = document.getElementById("options");
  expect(listbox.getAttribute("role")).toBe("listbox");
  expect(q().getAttribute("aria-controls")).toBe("options");
  expect(q().getAttribute("aria-expanded")).toBe("true");

  const ids = options().map((o) => o.id);
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(3);
  expect(listbox.getAttribute("aria-owns").split(" ")).toEqual(ids);
});

test("an option never contains a button, so the open button and chips stay valid", () => {
  seed("Alpha", "Beta");
  expect(options()).toHaveLength(2);
  for (const option of options()) expect(option.querySelector("button, a, input")).toBeNull();
});

test("the first row starts selected and the search box points at it", () => {
  seed("Alpha", "Beta");
  expect(selectedLabels()).toEqual(["Alpha"]);
  expect(q().getAttribute("aria-activedescendant")).toBe(options()[0].id);
});

test("arrow keys move aria-selected and aria-activedescendant, wrapping at the ends", () => {
  seed("Alpha", "Beta", "Gamma");

  press("ArrowDown");
  expect(selectedLabels()).toEqual(["Beta"]);
  expect(q().getAttribute("aria-activedescendant")).toBe(options()[1].id);

  press("ArrowDown");
  press("ArrowDown");
  expect(selectedLabels()).toEqual(["Alpha"]);

  press("ArrowUp");
  expect(selectedLabels()).toEqual(["Gamma"]);
  expect(q().getAttribute("aria-activedescendant")).toBe(options()[2].id);
  // The visual highlight and the announced selection never disagree.
  expect(document.querySelector(".row.sel .title").textContent).toBe("Gamma");
});

test("clicking a row only selects it; nothing opens", () => {
  seed("Alpha", "Beta");

  document.querySelectorAll("#results .row")[1].click();

  expect(selectedLabels()).toEqual(["Beta"]);
  expect(q().getAttribute("aria-activedescendant")).toBe(options()[1].id);
  expect(stub.calls.tabsCreate).toHaveLength(0);
  expect(stub.calls.tabsUpdate).toHaveLength(0);
  expect(stub.calls.messages).toHaveLength(0);
});

test("with nothing to choose there is no listbox and no stale pointer", () => {
  seed("Alpha", "Beta");
  expect(q().hasAttribute("aria-activedescendant")).toBe(true);

  q().value = "zzzz";
  q().dispatchEvent(new Event("input", { bubbles: true }));

  const listbox = document.getElementById("options");
  expect(listbox.hasAttribute("role")).toBe(false);
  expect(listbox.hasAttribute("aria-owns")).toBe(false);
  expect(q().getAttribute("aria-expanded")).toBe("false");
  expect(q().hasAttribute("aria-activedescendant")).toBe(false);
});
