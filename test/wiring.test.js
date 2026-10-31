import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { jest } from "@jest/globals";
import { clearChrome, mountPopupMarkup, popupHtmlSource, stubChrome } from "./ui/support/popup-fixture.js";

const optionsHtml = readFileSync(
  fileURLToPath(new URL("../options.html", import.meta.url)),
  "utf8"
);

/* ------- the entry script boots without throwing */

test("popup-entry boots against the real markup with chrome stubbed", async () => {
  jest.resetModules();
  mountPopupMarkup();
  const { calls } = stubChrome({ tabUrl: "https://not-salesforce.example/" });

  await import("../src/ui/popup-entry.js");
  await new Promise((r) => setTimeout(r, 0)); // let boot()'s promise settle

  // No session on a non-Salesforce tab → the popup shows an error, not a blank
  // panel or an unhandled rejection.
  expect(document.getElementById("notice").classList.contains("hidden")).toBe(false);
  expect(document.getElementById("results")).not.toBeNull();
  expect(calls.tabsCreate).toHaveLength(0);

  clearChrome();
});

/* ------- the HTML loads exactly one module entry and no legacy scripts */

describe.each([
  ["popup.html", () => popupHtmlSource()],
  ["options.html", () => optionsHtml],
])("%s script tags", (_name, read) => {
  it("has exactly one <script type=\"module\"> and no untyped <script src>", () => {
    const html = read();
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/type="module"/);
    expect(scripts[0]).toMatch(/src="src\/ui\//);
  });
});

/* ------- external links open in a new tab and can't reach back to the page */

it("options.html external links open in a new tab with rel=noopener", () => {
  const links = [...optionsHtml.matchAll(/<a\b[^>]*href="https?:[^>]*>/gi)].map((m) => m[0]);
  expect(links.length).toBeGreaterThan(0);
  for (const a of links) {
    expect(a).toMatch(/target="_blank"/);
    expect(a).toMatch(/rel="noopener"/);
  }
});
