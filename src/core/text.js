// text.js — string escaping shared by the renderers. Pure.

/** Escape a string for literal use inside a RegExp. */
export function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape the five characters that matter when building an HTML fragment by hand. */
export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
  );
}
