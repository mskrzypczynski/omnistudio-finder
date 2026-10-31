// designer-urls.js — building the URL that opens an asset in the right place.
// Pure: it takes a session's host strings and an asset, and returns a URL. The
// UI performs the navigation.

import { DESIGNER_TEMPLATES } from "../kit/core/designer-routes.js";
import { vfHostFor } from "../kit/core/org-hosts.js";

// The storage keys Settings saves a custom template under, per asset kind.
export const TEMPLATE_KEYS = {
  os: "osTemplate",
  ip: "ipTemplate",
  dr: "drTemplate",
  fc: "fcTemplate",
};

function keyedByTemplateKey(templates) {
  return Object.fromEntries(
    Object.entries(TEMPLATE_KEYS).map(([kind, key]) => [key, templates[kind]])
  );
}

// Confirmed designer links, from the kit, under the keys Settings uses.
export const BUILTIN_TEMPLATES = {
  native: keyedByTemplateKey(DESIGNER_TEMPLATES.native),
  managed: keyedByTemplateKey(DESIGNER_TEMPLATES.managed),
};

/** Saved links win over built-in ones; blank saved values don't count. */
export function mergeTemplates(flavor, saved) {
  const merged = { ...(BUILTIN_TEMPLATES[flavor] || {}) };
  for (const [key, value] of Object.entries(saved || {})) {
    if (typeof value === "string" && value.trim()) merged[key] = value.trim();
  }
  return merged;
}

/**
 * Scope a Lightning path to an app, so it opens inside that app's navigation.
 * Only `/lightning/...` paths can carry app context: the core builders live at
 * `/builder_omnistudio/...` and the managed Visualforce designers on another
 * host entirely, and neither sits inside the Lightning shell.
 */
export function withAppContext(path, appContext) {
  const app = (appContext || "").trim();
  if (!app) return path;
  if (!path.startsWith("/lightning/") || path.startsWith("/lightning/app/")) return path;
  return `/lightning/app/${encodeURIComponent(app)}` + path.slice("/lightning".length);
}

/** Can this designer link carry an app navigation bar in the URL itself? */
export function canCarryAppContext(url) {
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  return path.startsWith("/lightning/");
}

/**
 * Would switching Lightning app before opening this link actually change where
 * it lands? Only true for the Visualforce designers, whose shell takes the app
 * from the user's server-side current-app state.
 *
 * Deliberately narrow. The core builders are standalone Aura apps with no app
 * chrome at all, so switching app first would cost an extra page load and
 * change nothing — this must not fire for them.
 */
export function needsAppSwitch(url) {
  try {
    return new URL(url).hostname.endsWith(".vf.force.com");
  } catch {
    return false;
  }
}

/**
 * Record page URL. Given a Lightning app id — the `06m…` or `standard__…` value
 * the App Launcher puts in its links — scope the URL to that app so the record
 * opens with that app's navigation bar, rather than whichever app the user
 * happened to be in last.
 */
export function recordUrl(session, item, appContext) {
  return (
    session.uiOrigin + withAppContext(`/lightning/r/${item.sobject}/${item.id}/view`, appContext)
  );
}

/** Fill a saved designer template. Falls back to the plain record page. */
export function designerUrl(session, item, templates, context = {}) {
  const template = (templates && templates[TEMPLATE_KEYS[item.kind]]) || "";
  if (!template.trim()) return { url: recordUrl(session, item), isDesigner: false };

  const namespace = context.namespace || "";
  const vfHost = vfHostFor(session.uiHost || "", namespace) || session.uiHost || "";

  const filled = template
    .replace(/\{id\}/gi, encodeURIComponent(item.id))
    .replace(/\{name\}/gi, encodeURIComponent(item.name || ""))
    .replace(/\{type\}/gi, encodeURIComponent(item.type || ""))
    .replace(/\{subtype\}/gi, encodeURIComponent(item.subType || ""))
    .replace(/\{language\}/gi, encodeURIComponent(item.language || ""))
    .replace(/\{version\}/gi, encodeURIComponent(String(item.version || "")))
    .replace(/\{sobject\}/gi, encodeURIComponent(item.sobject || ""))
    .replace(/\{app\}/gi, encodeURIComponent(context.appContext || ""))
    // Structural placeholders: these build the URL itself, so they go in raw.
    .replace(/\{ns\}/gi, namespace)
    .replace(/\{vfhost\}/gi, vfHost)
    .replace(/\{now\}/gi, String(Date.now()));

  if (/^https?:\/\//i.test(filled)) return { url: filled, isDesigner: true };

  const path = filled.startsWith("/") ? filled : "/" + filled;
  return { url: session.uiOrigin + withAppContext(path, context.appContext), isDesigner: true };
}
