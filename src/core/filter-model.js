// filter-model.js — every decision the results list makes about what to show:
// which groups match the search and filters, how to rank them, which version
// chips to draw, what each label says. Pure — the renderer in src/ui/popup.js
// only draws what these functions decide.

import { escapeRe } from "./text.js";

export const KIND_LABEL = { os: "OS", ip: "IP", dr: "DR", fc: "FC" };

/** Some objects have no IsActive field at all — don't imply they're inactive. */
export function tracksActivation(g) {
  return g.versions.some((v) => v.isActive === true || v.isActive === false);
}

/** Does this group pass the current kind filter, active-only toggle and search? */
export function matchesGroup(g, { filter = "all", activeOnly = false, query = "" } = {}) {
  if (filter !== "all" && g.kind !== filter) return false;
  if (activeOnly && tracksActivation(g) && !g.active) return false;
  if (!query) return true;
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((token) => g.haystack.includes(token));
}

/**
 * Lower is better. Exact name beats prefix beats substring beats no match. A
 * `Type_SubType_Language` key counts like the name, so pasting one puts that
 * script first.
 */
export function rankGroup(g, query) {
  const q = (query || "").toLowerCase();
  if (!q) return 0;
  const name = g.label.toLowerCase();
  const key = (g.scriptKey || "").toLowerCase();
  if (name === q || (key && key === q)) return -3;
  if (name.startsWith(q) || (key && key.startsWith(q))) return -2;
  if (name.includes(q)) return -1;
  return 0;
}

/** Filter then sort: rank first, then alphabetical by label. */
export function visibleGroups(groups, criteria = {}) {
  const list = groups.filter((g) => matchesGroup(g, criteria));
  list.sort((a, b) => {
    const r = rankGroup(a, criteria.query) - rankGroup(b, criteria.query);
    if (r) return r;
    return a.label.localeCompare(b.label);
  });
  return list;
}

export const COLLAPSE_AT = 8; // versions before the rail starts hiding older ones
export const NEWEST_KEPT = 4; // how many recent versions stay visible when collapsed
export const HARD_CAP = 60; // even expanded, don't render a thousand chips

/**
 * Choose which versions to show on the rail. The active one is always included,
 * however far down the history it sits — hiding it would drop the single most
 * useful thing on the row.
 */
export function visibleVersions(g, expanded) {
  const all = g.versions;
  if (expanded) return all.slice(0, HARD_CAP);
  if (all.length <= COLLAPSE_AT) return all;
  const keep = new Set(all.slice(0, NEWEST_KEPT));
  if (g.active) keep.add(g.active);
  return all.filter((v) => keep.has(v));
}

export function versionTooltip(v) {
  // Unversioned assets (managed-package DataRaptors) still need a way in.
  const parts = [v.version ? `Version ${v.version}` : "No version numbering"];
  if (v.isActive === true) parts.push("active");
  else if (v.isActive === false) parts.push("inactive");
  if (v.lastModified) parts.push("changed " + new Date(v.lastModified).toLocaleDateString());
  return parts.join(" · ") + ". Click to open.";
}

/** The label on a version chip: "v3", or "Open" when there is no numbering. */
export function versionChipLabel(v) {
  return v.version ? "v" + v.version : "Open";
}

/** The label on the row's main open button. */
export function openButtonLabel(head) {
  return head.version ? "Open v" + head.version : "Open";
}

/** The row's main open button tooltip. */
export function openButtonTitle(g) {
  return g.active
    ? `Open the active version (v${g.active.version}). Shift-click for the record page.`
    : "No active version — opens the newest. Shift-click for the record page.";
}

/** The middle "type · subtype · language" line under a row's title. */
export function metaLine(g) {
  if (g.kind === "dr") {
    return [g.type, g.inputType && g.outputType ? `${g.inputType} → ${g.outputType}` : ""]
      .filter(Boolean)
      .join("  ·  ");
  }
  if (g.kind === "fc") {
    return [g.author && "by " + g.author, g.cardType].filter(Boolean).join("  ·  ");
  }
  return [g.type, g.subType, g.language].filter(Boolean).join("  ·  ");
}

/**
 * Split `text` into `{ text, isMatch }` segments against the search tokens, so
 * the renderer can wrap the matches in <mark> without re-parsing anything.
 */
export function matchSegments(text, query) {
  const q = (query || "").trim();
  if (!q) return [{ text, isMatch: false }];

  const tokens = q.split(/\s+/).filter(Boolean).map(escapeRe);
  const re = new RegExp("(" + tokens.join("|") + ")", "ig");
  const segments = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), isMatch: false });
    segments.push({ text: m[0], isMatch: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), isMatch: false });
  return segments;
}
