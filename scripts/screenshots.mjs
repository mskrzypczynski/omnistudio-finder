#!/usr/bin/env node
// Renders the Chrome Web Store screenshots from the real popup and Settings
// page.
//
//   npm run screenshots            # all scenes
//   npm run screenshots -- key     # only scenes whose file name contains "key"
//
// Writes store/screenshots/*.png, each exactly 1280x800, 24-bit RGB (no alpha).
//
// How it works: a tiny static server (ES modules do not load from file://)
// serves this repository plus one generated page, the stage: a plain browser
// window drawn in HTML with the popup (or Settings page) in an iframe where a
// toolbar popup would open. Before any page script runs, installStub replaces
// `chrome` and `fetch` in every frame: chrome.* is backed by plain objects,
// and fetch answers the REST calls src/ui/sf-client.js makes from a fictional
// core-OmniStudio org. So the popup detects, queries and renders exactly as it
// does against a live org, and every scene is driven with real clicks and
// typing on the real element ids.
//
// All demo data below is fictional. The stage carries no Salesforce branding.
//
// Playwright is not a dependency of this project: it is resolved at run time
// (NODE_PATH, then the global npm root) and Chromium is the one already
// installed for it. If it cannot be found the script says so and stops.

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flattenPng, launch, loadPlaywright } from "./lib/store-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "store", "screenshots");
const WIDTH = 1280;
const HEIGHT = 800;
const ORG_HOST = "demo-org.lightning.force.com";

/* ---------------------------------------------------------- static server */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/__stage.html") {
      res.writeHead(200, { "content-type": MIME[".html"] });
      res.end(stageHtml(url.searchParams));
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/* ------------------------------------------------------------------ stage */

// The popup is drawn larger than life (POPUP_SCALE) so it reads at store size.
const POPUP_SCALE = 1.3;

function stageHtml(params) {
  const page = params.get("page") || "popup.html";
  const settings = page === "options.html";
  const address = settings ? "Extensions › OmniStudio Finder › Settings" : `https://${ORG_HOST}/lightning/page/home`;
  const frame = settings
    ? `<iframe id="app" class="full" src="/${page}"></iframe>`
    : `<div class="popup" style="transform:scale(${POPUP_SCALE})"><iframe id="app" src="/${page}"></iframe></div>`;
  return `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    body { background: #2b2f38; font-family: "Segoe UI", Arial, "Liberation Sans", sans-serif; }
    .window { position: absolute; inset: 0; display: flex; flex-direction: column; }
    .toolbar { height: 46px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 14px;
      background: #3a3f4b; border-bottom: 1px solid #22252c; }
    .dots { display: flex; gap: 7px; } .dots i { width: 11px; height: 11px; border-radius: 50%; background: #5b6272; }
    .address { flex: 1; height: 30px; border-radius: 15px; background: #2b2f38; color: #c9ced8;
      font-size: 14px; line-height: 30px; padding: 0 16px; white-space: nowrap; overflow: hidden; }
    .ext { width: 30px; height: 30px; border-radius: 6px; display: grid; place-items: center;
      background: ${settings ? "transparent" : "#4c5466"}; }
    .ext img { width: 18px; height: 18px; display: block; }
    .content { position: relative; flex: 1; background: ${settings ? "#15171c" : "#e9ecf1"}; overflow: hidden; }
    .ghost { position: absolute; border-radius: 8px; background: #d9dee6; }
    .popup { position: absolute; top: 4px; right: 18px; transform-origin: 100% 0;
      border-radius: 8px; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.45), 0 4px 12px rgba(0,0,0,.3); }
    .popup iframe { display: block; width: 460px; height: 600px; }
    iframe { position: relative; border: 0; }
    iframe.full { position: absolute; inset: 0; width: 100%; height: 100%; }
  </style>
  <div class="window">
    <div class="toolbar"><span class="dots"><i></i><i></i><i></i></span>
      <span class="address">${address}</span><span class="ext"><img src="/icons/icon32.png" alt=""></span></div>
    <div class="content">
      ${settings ? "" : `
      <div class="ghost" style="left:24px;top:24px;width:260px;height:600px"></div>
      <div class="ghost" style="left:304px;top:24px;width:300px;height:120px"></div>
      <div class="ghost" style="left:304px;top:164px;width:300px;height:460px"></div>`}
      ${frame}
    </div>
  </div>`;
}

/* ------------------------------------------------------------- demo data */

// A fictional core-OmniStudio org. Versions: [count, active version or 0].
const SCRIPTS = [
  ["Account Onboarding", "Account", "Onboarding", "English", 11, 9],
  ["Account Onboarding", "Account", "Onboarding", "French", 3, 3],
  ["Create Case", "Case", "Create", "English", 4, 4],
  ["Update Contact Details", "Contact", "UpdateDetails", "English", 2, 2],
  ["Change Plan", "Subscription", "ChangePlan", "English", 6, 5],
  ["Report Damage", "Claim", "ReportDamage", "English", 3, 0],
  ["Book Appointment", "Service", "BookAppointment", "English", 5, 5],
];
const PROCEDURES = [
  ["Fetch Account Summary", "Account", "FetchSummary", 7, 7],
  ["Save Application", "Onboarding", "SaveApplication", 3, 2],
  ["Validate Address", "Address", "Validate", 2, 2],
  ["Get Plans", "Subscription", "GetPlans", 14, 12],
  ["Create Case Record", "Case", "CreateRecord", 4, 4],
];
const TRANSFORMS = [
  ["DRExtract_Account", "Extract", 3, 3],
  ["DRExtract_ContactDetails", "Extract", 2, 2],
  ["DRLoad_Case", "Load", 2, 2],
  ["DRTransform_PlanPrices", "Transform", 1, 1],
  ["DRLoad_Application", "Load", 5, 4],
];
const CARDS = [
  ["AccountSummaryCard", 4, 4],
  ["CaseTimeline", 2, 1],
  ["PlanComparison", 3, 3],
];

function buildOrg() {
  let n = 0;
  const id = (prefix) => `${prefix}${String(++n).padStart(15, "0")}`;
  const date = (i) => new Date(Date.UTC(2026, 3 + (i % 6), 1 + ((i * 7) % 27), 9, 30)).toISOString();
  const versions = (count, active, make) =>
    Array.from({ length: count }, (_, i) => make(i + 1, i + 1 === active));

  const process = [
    ...SCRIPTS.flatMap(([name, type, subType, language, count, active]) =>
      versions(count, active, (v, isActive) => ({
        Id: id("0jN"), Name: name, Type: type, SubType: subType, Language: language,
        VersionNumber: v, IsActive: isActive, OmniProcessType: "OmniScript",
        IsIntegrationProcedure: false, UniqueName: `${type}_${subType}_${language}_${v}`,
        IsWebCompEnabled: true, LastModifiedDate: date(v),
      }))
    ),
    ...PROCEDURES.flatMap(([name, type, subType, count, active]) =>
      versions(count, active, (v, isActive) => ({
        Id: id("0jN"), Name: name, Type: type, SubType: subType, Language: "Procedure",
        VersionNumber: v, IsActive: isActive, OmniProcessType: "Integration Procedure",
        IsIntegrationProcedure: true, UniqueName: `${type}_${subType}_Procedure_${v}`,
        IsWebCompEnabled: false, LastModifiedDate: date(v),
      }))
    ),
  ];
  const transforms = TRANSFORMS.flatMap(([name, type, count, active]) =>
    versions(count, active, (v, isActive) => ({
      Id: id("0jP"), Name: name, Type: type, InputType: "JSON", OutputType: type === "Load" ? "SObject" : "JSON",
      IsActive: isActive, VersionNumber: v, LastModifiedDate: date(v),
    }))
  );
  const cards = CARDS.flatMap(([name, count, active]) =>
    versions(count, active, (v, isActive) => ({
      Id: id("0kZ"), Name: name, AuthorName: "Demo", OmniUiCardType: "Parent",
      VersionNumber: v, IsActive: isActive, LastModifiedDate: date(v),
    }))
  );
  const fields = (rows) => Object.keys(rows[0]).map((name) => ({ name }));
  return {
    OmniProcess: { rows: process, fields: fields(process) },
    OmniDataTransform: { rows: transforms, fields: fields(transforms) },
    OmniUiCard: { rows: cards, fields: fields(cards) },
    AppDefinition: {
      rows: [{ DurableId: "06m000000000001AAA", DeveloperName: "OmniStudio", Label: "OmniStudio" }],
      fields: [],
    },
  };
}

/* ------------------------------------------------------------ chrome stub */

// Runs in every frame before the page's modules. Self-contained on purpose:
// it is stringified into addInitScript. cfg = { org, host, sync, local }.
function installStub(cfg) {
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
  const event = { addListener() {} };

  window.chrome = {
    tabs: {
      query: async () => [{ id: 1, url: `https://${cfg.host}/lightning/page/home` }],
      update: async () => ({}),
      create: async () => ({ id: 2 }),
      get: async (id) => ({ id, url: `https://${cfg.host}/lightning/page/home` }),
      onUpdated: event,
      onRemoved: event,
    },
    runtime: {
      openOptionsPage() {},
      sendMessage: async () => ({ ok: true }),
      onMessage: event,
      getManifest: () => ({ version: cfg.version }),
    },
    commands: { getAll: async () => [{ name: "_execute_action", shortcut: "Alt+O" }] },
    cookies: {
      get: async () => ({ value: "00D000000000001!demo-session" }),
      getAll: async () => [],
    },
    storage: { sync: area({ ...cfg.sync }), local: area({ ...cfg.local }), session: area({}) },
  };
  window.close = () => {};

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  window.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const p = url.pathname;
    if (p === "/services/data/") return json([{ version: "61.0" }, { version: "62.0" }]);
    const describe = p.match(/\/sobjects\/([^/]+)\/describe\/$/);
    if (describe) {
      const object = cfg.org[describe[1]];
      return object ? json({ fields: object.fields }) : json([{ message: "Not found" }], 404);
    }
    if (p.endsWith("/query/")) {
      const q = url.searchParams.get("q");
      const object = cfg.org[q.match(/FROM\s+(\w+)/i)[1]];
      const records = object ? object.rows : [];
      return json({ done: true, totalSize: records.length, records });
    }
    return json([{ message: "Unexpected request" }], 404);
  };
}

/* ---------------------------------------------------------------- scenes */

async function parkMouse(page) {
  await page.mouse.move(4, HEIGHT - 4);
}

async function openStage(browser, port, { page = "popup.html", colorScheme = "dark", sync = {}, local = {} } = {}) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme,
    reducedMotion: "reduce",
  });
  const version = JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;
  await context.addInitScript(
    `(${installStub.toString()})(${JSON.stringify({ org: buildOrg(), host: ORG_HOST, version, sync, local })})`
  );
  const tab = await context.newPage();
  tab.on("pageerror", (error) => console.warn("  page error:", error.message));
  await tab.goto(`http://127.0.0.1:${port}/__stage.html?page=${page}`);
  const frame = tab.frameLocator("#app");
  return { context, tab, frame };
}

async function popupReady(frame) {
  await frame.locator("#results .row").first().waitFor();
}

// Chrome sizes a popup to its content, up to a cap; do the same, with the cap
// set by what fits in the stage at POPUP_SCALE.
const POPUP_MAX_HEIGHT = Math.floor((HEIGHT - 46 - 8) / POPUP_SCALE);

async function fitPopup(tab) {
  await tab.evaluate((max) => {
    const frame = document.querySelector(".popup iframe");
    if (!frame) return;
    // scrollHeight never reports less than the frame's own height, so
    // collapse the frame before measuring.
    frame.style.height = "1px";
    const content = frame.contentDocument.documentElement.scrollHeight;
    frame.style.height = Math.min(content, max) + "px";
  }, POPUP_MAX_HEIGHT);
}

async function save(tab, name) {
  await fitPopup(tab);
  await parkMouse(tab);
  await tab.waitForTimeout(200);
  const png = await tab.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  const file = path.join(OUT_DIR, name);
  writeFileSync(file, flattenPng(png, [43, 47, 56]));
  console.log(`  ${path.relative(ROOT, file)}`);
}

const SCENES = [
  {
    file: "1-all-assets.png",
    async run(browser, port) {
      const { context, tab, frame } = await openStage(browser, port);
      await popupReady(frame);
      await save(tab, this.file);
      await context.close();
    },
  },
  {
    file: "2-key-search.png",
    async run(browser, port) {
      const { context, tab, frame } = await openStage(browser, port);
      await popupReady(frame);
      await frame.locator("#q").pressSequentially("Account_Onboarding");
      await frame.locator("#results .row").first().waitFor();
      await save(tab, this.file);
      await context.close();
    },
  },
  {
    file: "3-version-history.png",
    async run(browser, port) {
      const { context, tab, frame } = await openStage(browser, port);
      await popupReady(frame);
      await frame.locator('.seg[data-filter="ip"]').click();
      await frame.locator("#results .row", { hasText: "Get Plans" }).locator(".chip.more").click();
      await frame.locator("#results .row", { hasText: "Get Plans" }).click();
      await save(tab, this.file);
      await context.close();
    },
  },
  {
    file: "4-help-light.png",
    async run(browser, port) {
      const { context, tab, frame } = await openStage(browser, port, { colorScheme: "light" });
      await popupReady(frame);
      await frame.locator("#help").click();
      await save(tab, this.file);
      await context.close();
    },
  },
  {
    file: "5-settings.png",
    async run(browser, port) {
      const { context, tab, frame } = await openStage(browser, port, {
        page: "options.html",
        local: {
          lastDetection: {
            v: 3,
            host: ORG_HOST,
            flavor: "native",
            namespace: null,
            installedNamespace: null,
            processObject: "OmniProcess",
            apps: [{ id: "06m000000000001AAA", name: "OmniStudio", label: "OmniStudio" }],
          },
        },
      });
      await frame.locator("#detected").filter({ hasText: "Detected" }).waitFor();
      await save(tab, this.file);
      await context.close();
    },
  },
];

/* ------------------------------------------------------------------ main */

async function main() {
  const only = process.argv.slice(2);
  const { chromium } = loadPlaywright();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const { server, port } = await serve();
  const browser = await launch(chromium);
  try {
    for (const scene of SCENES) {
      if (only.length && !only.some((name) => scene.file.includes(name))) continue;
      console.log(scene.file);
      await scene.run(browser, port);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
