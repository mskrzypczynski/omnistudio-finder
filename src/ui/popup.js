// popup.js — the toolbar popup surface: the DOM cache, the mutable view state,
// the event wiring and the rendering. Every decision it draws (which groups
// match, which version chips to show, what a label says, how to navigate) comes
// from src/core/; this file only reads the org, writes the DOM and calls
// chrome.*.

import { getSession, detectSchema, loadAll, loadApps, MAX_RECORDS } from "./sf-client.js";
import { group } from "../core/assets-model.js";
import { SfError } from "../core/errors.js";
import { escapeHtml } from "../core/text.js";
import {
  designerFlavor,
  designerNamespace,
  SCHEMA_VERSION,
} from "../core/schema-model.js";
import {
  designerUrl,
  mergeTemplates,
  recordUrl,
} from "../core/designer-urls.js";
import { navigationPlan } from "../core/nav-model.js";
import {
  KIND_LABEL,
  matchSegments,
  metaLine,
  openButtonLabel,
  openButtonTitle,
  tracksActivation,
  versionChipLabel,
  versionTooltip,
  visibleGroups,
  visibleVersions,
} from "../core/filter-model.js";

const el = {
  dot: document.getElementById("statusDot"),
  host: document.getElementById("orgHost"),
  refresh: document.getElementById("refresh"),
  settings: document.getElementById("settings"),
  help: document.getElementById("help"),
  helpPanel: document.getElementById("helpPanel"),
  shortcutKeys: document.getElementById("shortcutKeys"),
  shortcutSetup: document.getElementById("shortcutSetup"),
  q: document.getElementById("q"),
  count: document.getElementById("count"),
  segments: document.getElementById("segments"),
  activeOnly: document.getElementById("activeOnly"),
  notice: document.getElementById("notice"),
  results: document.getElementById("results"),
  options: document.getElementById("options"),
};

// `state`, `render` and `wireEvents` are exported for the jsdom UI tests, which
// seed `state` and assert on the DOM `render` writes. Nothing else imports them.
export const state = {
  session: null,
  schema: null,
  groups: [],
  templates: {},
  prefs: {},
  filter: "all",
  activeOnly: false,
  query: "",
  selected: 0,
  visible: [],
  expanded: new Set(),
  truncatedObjects: [],
  tabId: null,
  apps: [],
};

const TEMPLATE_SETTING_KEYS = ["osTemplate", "ipTemplate", "drTemplate", "fcTemplate"];

/* ------------------------------------------------------------------ boot */

export async function boot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab ? tab.id : null;
  const settings = await chrome.storage.sync.get([
    ...TEMPLATE_SETTING_KEYS,
    "designerPref",
    "nsOverride",
    "openIn",
    "appContext",
  ]);
  state.templates = Object.fromEntries(
    TEMPLATE_SETTING_KEYS.map((k) => [k, settings[k] || ""])
  );
  state.prefs = {
    designerPref: settings.designerPref || "auto",
    nsOverride: settings.nsOverride || "",
    openIn: settings.openIn || "newTab",
    appContext: settings.appContext || "",
  };

  el.q.focus();
  wireEvents();
  showShortcut();
  discardOldCaches();

  try {
    setStatus("busy", "Connecting…");
    state.session = await getSession(tab ? tab.url : "");
    el.host.textContent = state.session.uiHost;
    await refresh();
  } catch (err) {
    fail(err);
  }
}

/**
 * Report the shortcut Chrome has actually bound, rather than the one the
 * manifest suggested — the suggestion is often rejected as conflicting, which
 * is common on macOS where Option+letter types a special character.
 */
async function showShortcut() {
  if (!el.shortcutKeys) return;
  try {
    const commands = await chrome.commands.getAll();
    const action = commands.find((c) => c.name === "_execute_action");
    const keys = action && action.shortcut ? action.shortcut : "";
    el.shortcutKeys.textContent = keys || "not set";
    el.shortcutKeys.classList.toggle("unset", !keys);
  } catch {
    el.shortcutKeys.textContent = "not set";
  }
}

function setHelp(show) {
  el.helpPanel.classList.toggle("hidden", !show);
  el.results.classList.toggle("hidden", show);
  el.help.classList.toggle("on", show);
  el.help.setAttribute("aria-expanded", String(show));
  if (!show) el.q.focus();
}

export function wireEvents() {
  el.q.addEventListener("input", () => {
    state.query = el.q.value.trim();
    state.selected = 0;
    render();
  });

  el.q.addEventListener("keydown", onKeyDown);
  el.results.addEventListener("keydown", onKeyDown);

  el.segments.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg");
    if (!btn) return;
    state.filter = btn.dataset.filter;
    state.selected = 0;
    [...el.segments.children].forEach((b) => {
      b.classList.toggle("on", b === btn);
      b.setAttribute("aria-pressed", String(b === btn));
    });
    render();
    el.q.focus();
  });

  el.activeOnly.addEventListener("change", () => {
    state.activeOnly = el.activeOnly.checked;
    state.selected = 0;
    render();
  });

  el.refresh.addEventListener("click", () => refresh());
  el.settings.addEventListener("click", () => chrome.runtime.openOptionsPage());

  el.help.addEventListener("click", () => setHelp(el.helpPanel.classList.contains("hidden")));

  el.shortcutSetup.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    window.close();
  });

  // Typing is a signal the user is back to searching.
  el.q.addEventListener("focus", () => setHelp(false));
}

/* ------------------------------------------------------------------ data */

/**
 * Always read live. Asset lists are small and the queries run in parallel, so
 * caching them only bought staleness — a version activated in another tab would
 * still show as inactive until a manual reload.
 */
async function refresh() {
  if (!state.session) return;
  setStatus("busy", "Loading from " + state.session.uiHost + "…");
  try {
    state.schema = await detectSchema(state.session);
    const [{ items, truncatedObjects }, apps] = await Promise.all([
      loadAll(state.session, state.schema),
      loadApps(state.session),
    ]);
    state.apps = apps;
    state.truncatedObjects = truncatedObjects;
    state.groups = group(items);
    await rememberDetection();
    setStatus("ok", state.session.uiHost);
    render();
    maybeSuggestTemplates();
  } catch (err) {
    fail(err);
  }
}

/**
 * Builds before caching was removed wrote a `cache:<host>` entry per org, which
 * can run to megabytes. Nothing reads them now, so clear them out once.
 */
async function discardOldCaches() {
  try {
    const all = await chrome.storage.local.get(null);
    const stale = Object.keys(all).filter((k) => k.startsWith("cache:"));
    if (stale.length) await chrome.storage.local.remove(stale);
  } catch {
    // Not worth surfacing — it's housekeeping.
  }
}

/**
 * The settings page has no Salesforce session of its own, so it can't detect
 * anything. Leave it a note about what was last seen — object names and a
 * namespace, no org data — purely so it can label its controls.
 */
async function rememberDetection() {
  try {
    await chrome.storage.local.set({
      lastDetection: {
        v: SCHEMA_VERSION,
        host: state.session.uiHost,
        flavor: state.schema.flavor,
        namespace: state.schema.namespace,
        installedNamespace: state.schema.installedNamespace,
        processObject: state.schema.process.object,
        apps: state.apps,
      },
    });
  } catch (err) {
    console.warn("OmniStudio Finder: could not store detection hint —", err);
  }
}

/* -------------------------------------------------------------- rendering */

function criteria() {
  return { filter: state.filter, activeOnly: state.activeOnly, query: state.query };
}

export function render() {
  state.visible = visibleGroups(state.groups, criteria());
  el.count.textContent = state.visible.length
    ? state.visible.length + (state.groups.length ? "/" + state.groups.length : "")
    : "";

  if (!state.groups.length) {
    el.results.innerHTML = "";
    setListbox([]);
    return;
  }

  if (!state.visible.length) {
    el.results.innerHTML =
      '<div class="empty"><strong>Nothing matches</strong>Try a shorter search, or switch the filter above.</div>';
    setListbox([]);
    return;
  }

  state.selected = Math.min(state.selected, state.visible.length - 1);
  const frag = document.createDocumentFragment();
  state.visible.forEach((g, i) => frag.appendChild(rowFor(g, i)));
  el.results.replaceChildren(frag);
  setListbox([...el.results.querySelectorAll('[role="option"]')].map((o) => o.id));
  paintSelection();
  scrollSelectedIntoView();
}

/**
 * The rows hold real buttons (open, version chips), and a listbox may not
 * contain those, so the listbox is a separate, empty element that *owns* the
 * rows' option parts by id instead of containing them. The search box owns the
 * keyboard and points at the selected option (see paintSelection), so a screen
 * reader hears the arrow keys move through the list while focus stays put.
 * With no rows there is nothing to own, and an empty listbox is invalid ARIA.
 */
function setListbox(optionIds) {
  const on = optionIds.length > 0;
  if (on) {
    el.options.setAttribute("role", "listbox");
    el.options.setAttribute("aria-label", "Results");
    el.options.setAttribute("aria-owns", optionIds.join(" "));
  } else {
    for (const attr of ["role", "aria-label", "aria-owns"]) el.options.removeAttribute(attr);
    el.q.removeAttribute("aria-activedescendant");
  }
  el.q.setAttribute("aria-expanded", String(on));
}

/** Show the selection: the visual highlight, aria-selected and the search box's pointer. */
function paintSelection() {
  [...el.results.children].forEach((row, i) => {
    const on = i === state.selected;
    row.classList.toggle("sel", on);
    const option = row.querySelector('[role="option"]');
    if (option) option.setAttribute("aria-selected", String(on));
  });
  const row = el.results.children[state.selected];
  const option = row && row.querySelector('[role="option"]');
  if (option) el.q.setAttribute("aria-activedescendant", option.id);
}

function rowFor(g, index) {
  const row = document.createElement("div");
  row.className = "row" + (index === state.selected ? " sel" : "");
  row.dataset.index = String(index);

  const top = document.createElement("div");
  top.className = "row-top";

  // The option is only the asset's name part of the row. The open button and
  // version chips are real buttons, and an option may not contain focusable
  // controls, so they sit beside it rather than inside it.
  const option = document.createElement("span");
  option.className = "row-id";
  option.id = "row-" + index;
  option.setAttribute("role", "option");
  option.setAttribute("aria-describedby", "row-" + index + "-meta");
  option.setAttribute("aria-selected", String(index === state.selected));

  const badge = document.createElement("span");
  badge.className = "badge " + g.kind;
  badge.textContent = KIND_LABEL[g.kind];
  option.appendChild(badge);

  const title = document.createElement("span");
  title.className = "title";
  title.appendChild(highlight(g.label));
  option.appendChild(title);
  top.appendChild(option);

  const head = g.active || g.head;
  const openBtn = document.createElement("button");
  openBtn.className = "open-btn";
  openBtn.type = "button";
  openBtn.textContent = openButtonLabel(head);
  openBtn.title = openButtonTitle(g);
  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.selected = index;
    void open(head, e.shiftKey, e.ctrlKey || e.metaKey);
  });
  top.appendChild(openBtn);

  row.appendChild(top);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.id = "row-" + index + "-meta";
  meta.textContent = metaLine(g);
  if (g.scriptKey) meta.title = g.scriptKey;
  if (g.versions.length > 1) {
    const tail = document.createElement("span");
    tail.className = "sep";
    tail.textContent = (meta.textContent ? "  ·  " : "") + g.versions.length + " versions";
    meta.appendChild(tail);
  }
  row.appendChild(meta);

  row.appendChild(railFor(g, index));

  // Clicking the row only moves the selection — opening is always a deliberate
  // click on a version chip, so a stray click can't launch a designer.
  row.addEventListener("click", () => {
    state.selected = index;
    paintSelection();
    // Hand the keyboard back to the search box, which owns the arrow keys.
    el.q.focus();
  });

  return row;
}

function railFor(g, index) {
  const rail = document.createElement("div");
  rail.className = "rail";

  const expanded = state.expanded.has(g.key);
  const shown = visibleVersions(g, expanded);

  let previous = null;
  for (const v of shown) {
    // Mark where the collapsed rail skipped over versions.
    if (previous && g.versions.indexOf(v) !== g.versions.indexOf(previous) + 1) {
      const gap = document.createElement("span");
      gap.className = "rail-gap";
      gap.textContent = "…";
      gap.title = "older versions hidden";
      rail.appendChild(gap);
    }
    previous = v;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (v.isActive ? " live" : "");
    chip.textContent = versionChipLabel(v);
    chip.title = versionTooltip(v);
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      void open(v, e.shiftKey, e.ctrlKey || e.metaKey);
    });
    rail.appendChild(chip);
  }

  const hidden = g.versions.length - shown.length;
  if (hidden > 0 || expanded) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "chip more";
    toggle.textContent = expanded ? "show fewer" : `+${hidden} older`;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.title = expanded
      ? "Collapse the version history"
      : `Show all ${g.versions.length} versions`;
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selected = index;
      if (expanded) state.expanded.delete(g.key);
      else state.expanded.add(g.key);
      const scroll = el.results.scrollTop;
      render();
      el.results.scrollTop = scroll;
    });
    rail.appendChild(toggle);
  }

  if (tracksActivation(g) && !g.active) {
    const none = document.createElement("span");
    none.className = "rail-note none";
    none.textContent = "no active version";
    rail.appendChild(none);
  }

  return rail;
}

/** Turn the pure match segments into a fragment with <mark> around the hits. */
function highlight(text) {
  const frag = document.createDocumentFragment();
  for (const seg of matchSegments(text, state.query)) {
    if (seg.isMatch) {
      const mark = document.createElement("mark");
      mark.textContent = seg.text;
      frag.appendChild(mark);
    } else {
      frag.appendChild(document.createTextNode(seg.text));
    }
  }
  return frag;
}

/* ---------------------------------------------------------------- opening */

/** Built-in designer links for the resolved designer suite, overridden by saved ones. */
function effectiveTemplates() {
  return mergeTemplates(designerFlavor(state.schema, state.prefs.designerPref), state.templates);
}

/**
 * @param recordPageOnly  Shift-click: the plain record page instead of the designer.
 * @param invertTarget    Ctrl/Cmd-click: the opposite of the saved tab preference.
 */
async function open(item, recordPageOnly, invertTarget) {
  const context = {
    namespace: designerNamespace(state.schema, state.prefs.nsOverride),
    appContext: state.prefs.appContext,
  };
  const target = recordPageOnly
    ? { url: recordUrl(state.session, item, state.prefs.appContext) }
    : designerUrl(state.session, item, effectiveTemplates(), context);

  const plan = navigationPlan({
    targetUrl: target.url,
    openIn: state.prefs.openIn,
    invertTarget,
    appContext: state.prefs.appContext,
    tabId: state.tabId,
    uiOrigin: state.session.uiOrigin,
  });

  let handedOver = false;
  if (plan.mode === "app-switch") {
    // A Visualforce designer can't carry app context in its URL, so switch to
    // the app first and let the background worker follow through once it loads.
    handedOver = await tellWorker({
      type: "openViaApp",
      tabId: plan.tabId,
      appUrl: plan.appUrl,
      targetUrl: plan.targetUrl,
    });
  } else if (plan.confirm) {
    // The link keeps its route in the fragment, which Salesforce's session
    // hand-off can drop; the worker opens it and checks where it lands.
    handedOver = await tellWorker({
      type: "openConfirmed",
      tabId: plan.mode === "same-tab" ? plan.tabId : null,
      url: plan.url,
    });
  }
  // Without the worker, still open the link: a plain navigation beats none.
  if (!handedOver) {
    const url = plan.url || plan.targetUrl;
    if (plan.tabId != null) chrome.tabs.update(plan.tabId, { url });
    else chrome.tabs.create({ url });
  }
  window.close();
}

/**
 * Hand a navigation to the background worker and wait for it to answer, so
 * the popup can't close before the message is delivered. False if the worker
 * couldn't be reached.
 */
async function tellWorker(message) {
  try {
    await chrome.runtime.sendMessage(message);
    return true;
  } catch (err) {
    console.warn("OmniStudio Finder: could not reach the background worker —", err);
    return false;
  }
}

/* -------------------------------------------------------------- keyboard */

function onKeyDown(e) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    move(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const g = state.visible[state.selected];
    if (g) void open(g.active || g.head, e.shiftKey, e.ctrlKey || e.metaKey);
  } else if (e.key === "Escape") {
    if (el.q.value) {
      el.q.value = "";
      state.query = "";
      state.selected = 0;
      render();
      e.preventDefault();
    }
  }
}

function move(delta) {
  if (!state.visible.length) return;
  state.selected = (state.selected + delta + state.visible.length) % state.visible.length;
  paintSelection();
  scrollSelectedIntoView();
}

function scrollSelectedIntoView() {
  const node = el.results.children[state.selected];
  if (node && node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
}

/* ---------------------------------------------------------------- status */

function setStatus(kind, text) {
  el.dot.className = "dot " + kind;
  if (text) el.host.textContent = text;
}

function showNotice(html, bad) {
  el.notice.className = "notice" + (bad ? " bad" : "");
  el.notice.innerHTML = html;
  el.notice.classList.remove("hidden");
}

function maybeSuggestTemplates() {
  if (state.truncatedObjects.length) {
    showNotice(
      `<strong>Showing the first ${MAX_RECORDS.toLocaleString()} records</strong> of ` +
        escapeHtml(state.truncatedObjects.join(" and ")) +
        ". This org has more than OmniStudio Finder reads, so the list is incomplete.",
      true
    );
    return;
  }

  if (TEMPLATE_SETTING_KEYS.some((k) => (state.templates[k] || "").trim())) return;

  const suite = designerFlavor(state.schema, state.prefs.designerPref);
  const ns = designerNamespace(state.schema, state.prefs.nsOverride);
  const label = suite === "managed" ? `${ns || "managed package"} designers` : "core builders";
  // Keep the trailing punctuation glued to the link so it can't wrap alone.
  showNotice(
    `Opening in the <strong>${escapeHtml(label)}</strong> ` +
      "<span class='nowrap'>&middot; <button class='link' id='setup'>change</button></span>"
  );
  const link = document.getElementById("setup");
  if (link) link.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

function fail(err) {
  setStatus("bad", state.session ? state.session.uiHost : "Not connected");
  const message = err instanceof SfError ? err.message : "Something went wrong.";
  const hint = err instanceof SfError && err.hint ? err.hint : String(err.message || err);
  showNotice(`<strong>${escapeHtml(message)}</strong><br>${escapeHtml(hint)}`, true);
  el.results.innerHTML = "";
  setListbox([]);
}
