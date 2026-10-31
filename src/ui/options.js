import { BUILTIN_TEMPLATES } from "../core/designer-urls.js";
import { designerFlavor, designerNamespace } from "../core/schema-model.js";
import { appContextReach, orgDescription } from "../core/options-model.js";

const KEYS = ["osTemplate", "ipTemplate", "drTemplate", "fcTemplate"];
const PREF_KEYS = ["designerPref", "nsOverride", "openIn", "appContext"];
const saved = document.getElementById("saved");

// Bumped whenever the package is rebuilt, so you can tell at a glance whether
// Chrome is running the build you just loaded. Independent of the manifest
// version shown next to it.
const BUILD = "2026-10-31";
document.getElementById("build").textContent =
  `OmniStudio Finder ${chrome.runtime.getManifest().version} · build ${BUILD}`;

load();

async function load() {
  const stored = await chrome.storage.sync.get([...KEYS, ...PREF_KEYS]);
  document.getElementById("designerPref").value = stored.designerPref || "auto";
  document.getElementById("nsOverride").value = stored.nsOverride || "";
  document.getElementById("openIn").value = stored.openIn || "newTab";
  await fillApps(stored.appContext || "");

  const schema = await cachedSchema();
  const suite = designerFlavor(schema, stored.designerPref || "auto");
  const ns = designerNamespace(schema, stored.nsOverride || "");
  document.getElementById("detected").textContent = orgDescription(schema, suite, ns);

  // An empty box means "use the built-in link", so show that link as the
  // placeholder rather than writing it into storage.
  const defaults = BUILTIN_TEMPLATES[suite] || {};
  for (const key of KEYS) {
    const input = document.getElementById(key);
    input.value = (stored[key] || "").trim();
    input.placeholder = defaults[key] || "Opens the record page";
    input.title = defaults[key] || "";
  }
}

/**
 * Offer the OmniStudio-ish Lightning apps the popup found. This only affects
 * record pages: the designers are standalone builder apps and don't render an
 * app navigation bar at all.
 */
async function fillApps(selected) {
  const input = document.getElementById("appContext");
  const list = document.getElementById("appList");
  const hint = document.getElementById("appHint");
  const { lastDetection } = await chrome.storage.local.get("lastDetection");
  const apps = (lastDetection && lastDetection.apps) || [];

  list.replaceChildren();
  for (const app of apps) {
    const option = document.createElement("option");
    option.value = app.id;
    option.label = `${app.label} — ${app.name}`;
    list.appendChild(option);
  }
  input.value = selected;

  const found = apps.length
    ? `Found ${apps.length} app${apps.length > 1 ? "s" : ""} with "OmniStudio" in the name. `
    : 'No app with "OmniStudio" in the name — run a search first, or your profile may not be able to query AppDefinition. ';

  // Be specific about reach: it depends entirely on where each designer lives.
  const schema = await cachedSchema();
  const suite = designerFlavor(
    schema,
    (await chrome.storage.sync.get("designerPref")).designerPref || "auto"
  );

  hint.textContent =
    found +
    "You can also paste an app id from an App Launcher link: the part after /lightning/app/. " +
    appContextReach(suite);
}

/** What the popup last detected, so this page can label its controls. */
async function cachedSchema() {
  const { lastDetection } = await chrome.storage.local.get("lastDetection");
  if (!lastDetection) return { flavor: "native", namespace: null, installedNamespace: null };
  return {
    flavor: lastDetection.flavor,
    namespace: lastDetection.namespace,
    installedNamespace: lastDetection.installedNamespace,
    process: { object: lastDetection.processObject },
  };
}

/* ------------------------------------------------------------------ save */

document.getElementById("save").addEventListener("click", async () => {
  const payload = {};
  for (const key of KEYS) payload[key] = document.getElementById(key).value.trim();
  payload.designerPref = document.getElementById("designerPref").value;
  payload.nsOverride = document.getElementById("nsOverride").value.trim();
  payload.openIn = document.getElementById("openIn").value;
  payload.appContext = document.getElementById("appContext").value.trim();
  await chrome.storage.sync.set(payload);
  await load();
  flash("Saved");
});

document.getElementById("clearTemplates").addEventListener("click", async () => {
  await chrome.storage.sync.set(Object.fromEntries(KEYS.map((k) => [k, ""])));
  await load();
  flash("Built-in links restored");
});

document.getElementById("designerPref").addEventListener("change", async () => {
  await chrome.storage.sync.set({ designerPref: document.getElementById("designerPref").value });
  await load();
});

document.getElementById("appContext").addEventListener("change", async () => {
  const value = document.getElementById("appContext").value.trim();
  await chrome.storage.sync.set({ appContext: value });
  flash(value ? "Saved" : "Cleared — records open in your last app");
});

document.getElementById("openIn").addEventListener("change", async () => {
  await chrome.storage.sync.set({ openIn: document.getElementById("openIn").value });
  flash("Saved");
});

document.getElementById("nsOverride").addEventListener("change", async () => {
  await chrome.storage.sync.set({ nsOverride: document.getElementById("nsOverride").value.trim() });
  await load();
});

function flash(message, isProblem) {
  saved.textContent = message;
  saved.style.color = isProblem ? "#fb7185" : "";
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => (saved.textContent = ""), 2600);
}
