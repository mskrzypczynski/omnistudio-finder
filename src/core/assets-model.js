// assets-model.js — turning raw SOQL rows into the asset objects the popup
// groups and renders. Pure: the client runs the query, this decides what a row
// means. Best-effort by design — an unexpected shape yields empty fields, never
// a throw.

/**
 * The field-name map carries the object name alongside the field names — drop
 * it here, or it lands in the SELECT clause as a bogus column.
 */
export function selectList({ object, ...fields }) {
  return [...new Set(Object.values(fields).filter((v) => typeof v === "string" && v !== ""))];
}

export function normaliseProcess(raw, m) {
  const isProc = m.processType
    ? String(raw[m.processType] || "")
        .toLowerCase()
        .includes("integration")
    : m.isProcedure
      ? raw[m.isProcedure] === true
      : false;
  return {
    kind: isProc ? "ip" : "os",
    sobject: m.object,
    id: raw.Id,
    name: raw[m.name] || "",
    type: m.type ? raw[m.type] || "" : "",
    subType: m.subType ? raw[m.subType] || "" : "",
    language: m.language ? raw[m.language] || "" : "",
    version: m.version ? Number(raw[m.version]) || 0 : 0,
    isActive: m.isActive ? raw[m.isActive] === true : false,
    uniqueName: m.uniqueName ? raw[m.uniqueName] || "" : "",
    lwc: m.lwcEnabled ? raw[m.lwcEnabled] === true : null,
    lastModified: raw.LastModifiedDate || null,
  };
}

export function normaliseDr(raw, m) {
  return {
    kind: "dr",
    sobject: m.object,
    id: raw.Id,
    name: raw[m.name] || "",
    type: m.type ? raw[m.type] || "" : "",
    inputType: m.inputType ? raw[m.inputType] || "" : "",
    outputType: m.outputType ? raw[m.outputType] || "" : "",
    isActive: m.isActive ? raw[m.isActive] === true : null,
    version: m.version ? Number(raw[m.version]) || 0 : 0,
    lastModified: raw.LastModifiedDate || null,
  };
}

export function normaliseCard(raw, m) {
  return {
    kind: "fc",
    sobject: m.object,
    id: raw.Id,
    name: raw[m.name] || "",
    author: m.author ? raw[m.author] || "" : "",
    cardType: m.cardType ? raw[m.cardType] || "" : "",
    version: m.version ? Number(raw[m.version]) || 0 : 0,
    isActive: m.isActive ? raw[m.isActive] === true : false,
    lastModified: raw.LastModifiedDate || null,
  };
}

/**
 * The key an OmniScript or Integration Procedure is referred to by elsewhere:
 * `Type_SubType_Language`, the form that element names, LWC names and logs use.
 * Procedures are usually called by `Type_SubType`, which is a prefix of this,
 * so a search for either finds them. DataRaptors and FlexCards are referred
 * to by name, so they have none.
 */
export function scriptKey({ kind, type, subType, language }) {
  if (kind !== "os" && kind !== "ip") return "";
  return [type, subType, language].filter(Boolean).join("_");
}

/** Collapse versions of the same asset into one entry with a version list. */
export function group(items) {
  // Core OmniDataTransform carries version numbers; managed DRBundle doesn't.
  // Only collapse DataRaptors into version stacks when the org actually
  // versions them, otherwise every record would merge on name alone.
  const drVersioned = items.some((i) => i.kind === "dr" && i.version > 0);

  const buckets = new Map();
  for (const it of items) {
    let key;
    if (it.kind === "dr") key = drVersioned ? `dr|${it.name}` : `dr|${it.id}`;
    else if (it.kind === "fc") key = `fc|${it.name}|${it.author || ""}`;
    else key = `${it.kind}|${it.type}|${it.subType}|${it.language}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }

  const groups = [];
  for (const [key, versions] of buckets) {
    versions.sort((a, b) => b.version - a.version);
    const active = versions.find((v) => v.isActive) || null;
    const head = active || versions[0];
    const asKey = scriptKey(head);
    groups.push({
      key,
      kind: head.kind,
      sobject: head.sobject,
      label: head.name,
      type: head.type,
      subType: head.subType,
      language: head.language,
      inputType: head.inputType || "",
      outputType: head.outputType || "",
      author: head.author || "",
      cardType: head.cardType || "",
      scriptKey: asKey,
      versions,
      active,
      head,
      lastModified: versions.reduce(
        (max, v) => (v.lastModified > max ? v.lastModified : max),
        versions[0].lastModified || ""
      ),
      // The key goes in twice: as written, and run together the way a
      // generated LWC name spells it (caseCreateEnglish).
      haystack: [
        head.name,
        head.type,
        head.subType,
        head.language,
        head.uniqueName,
        head.author,
        asKey,
        asKey.replace(/_/g, ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    });
  }
  return groups;
}
