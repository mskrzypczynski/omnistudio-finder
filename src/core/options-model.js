// options-model.js — the sentences the Settings page shows about the detected
// org. Pure: options.js reads the hint from storage and writes these strings
// into the DOM.

/**
 * One line describing what the popup last detected. `schema` is the shrunken
 * hint from storage.local, not a live schema — it may have no `process`.
 */
export function orgDescription(schema, suite, ns) {
  if (!schema || !schema.process) {
    return "Run a search first so OmniStudio Finder can detect this org.";
  }
  const pkg = schema.installedNamespace
    ? `${schema.installedNamespace} package installed`
    : "no managed package";
  const opening = suite === "managed" ? `${ns || "managed"} designers` : "core builders";
  return `Detected: records in ${schema.process.object}, ${pkg}. Opening in the ${opening}.`;
}

/** How far a pinned Lightning app reaches, which depends on the designer suite. */
export function appContextReach(suite) {
  return suite === "managed"
    ? "Record pages, FlexCards and the OmniScript designer carry the app in the URL. " +
        "The Integration Procedure and DataRaptor designers are Visualforce pages that can't, " +
        "so those switch to the app first and then follow through — one extra page load."
    : "Applies to record pages only (Shift-click). The core builders live at " +
        "/builder_omnistudio/… outside the Lightning shell, so no app navigation can wrap " +
        "them — the same as Flow Builder.";
}
