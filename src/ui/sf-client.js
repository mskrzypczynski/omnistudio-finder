// sf-client.js — the impure half of talking to a Salesforce org: reading the
// session cookie, making REST calls, paging queries, running describes. Every
// decision about what the responses mean lives in src/core/; this module only
// orchestrates the round trips and hands the raw answers over.

import { SfError } from "../core/errors.js";
import { apiHostFor, isSalesforceUrl, lightningHostFor } from "../kit/core/org-hosts.js";
import {
  NAMESPACES,
  buildSchema,
  resolveSchemaObjects,
} from "../core/schema-model.js";
import {
  normaliseCard,
  normaliseDr,
  normaliseProcess,
  selectList,
} from "../core/assets-model.js";

/* ---------------------------------------------------------------- session */

async function readSid(host) {
  try {
    const c = await chrome.cookies.get({ url: "https://" + host, name: "sid" });
    return c && c.value && c.value.includes("!") ? c.value : null;
  } catch {
    return null;
  }
}

/**
 * Find a usable API session for the org shown in the given tab URL.
 * Strategy: derive the my.salesforce.com host and read its `sid`. If that
 * cookie isn't there, fall back to matching any salesforce.com `sid` that
 * carries the same org id as the cookie on the tab's own domain.
 */
export async function getSession(tabUrl) {
  if (!isSalesforceUrl(tabUrl)) {
    throw new SfError(
      "NOT_SALESFORCE",
      "Open a Salesforce tab first.",
      "OmniStudio Finder reads the org from the tab you're on."
    );
  }
  const tabHost = new URL(tabUrl).hostname;
  // Build links against the Lightning host even if the tab drifted to Visualforce.
  const uiHost = lightningHostFor(tabHost);
  const uiOrigin = "https://" + uiHost;
  const guess = apiHostFor(uiHost);

  let host = guess;
  let sid = guess ? await readSid(guess) : null;

  if (!sid) {
    const own = (await readSid(uiHost)) || (await readSid(tabHost));
    const orgId = own ? own.split("!")[0] : null;
    const all = await chrome.cookies.getAll({ name: "sid" });
    const usable = all.filter(
      (c) => c.value.includes("!") && /salesforce\.com$/.test(c.domain.replace(/^\./, ""))
    );
    // Only accept a cookie carrying the same org id. Falling back to whatever
    // Salesforce session happens to exist would silently list a different org's
    // assets while the header still showed this one.
    const match = orgId ? usable.find((c) => c.value.startsWith(orgId + "!")) : null;
    if (!match) {
      throw new SfError(
        "NO_SESSION",
        orgId ? "No API session for this org." : "No Salesforce session found.",
        orgId
          ? "Open this org's Lightning or Setup domain in the tab, then reopen."
          : "Log in to the org in this browser, then reopen OmniStudio Finder."
      );
    }
    host = match.domain.replace(/^\./, "");
    sid = match.value;
  }

  const session = { host, sid, uiHost, uiOrigin, apiVersion: null };
  session.apiVersion = await latestApiVersion(session);
  return session;
}

/* -------------------------------------------------------------------- api */

export async function sfFetch(session, path) {
  const res = await fetch("https://" + session.host + path, {
    headers: { Authorization: "Bearer " + session.sid, Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    throw new SfError(
      "UNAUTHORIZED",
      "The org rejected the session.",
      "Refresh the Salesforce tab and try again. If it keeps failing, your org may restrict API access for your profile."
    );
  }
  if (res.status === 404) {
    const e = new SfError("NOT_FOUND", "Not found: " + path);
    e.status = 404;
    throw e;
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = Array.isArray(body) && body[0] ? body[0].message : "";
    } catch {
      // No JSON body — the status line is all we have.
    }
    throw new SfError("HTTP_" + res.status, detail || "Request failed (" + res.status + ").");
  }
  return res.json();
}

async function latestApiVersion(session) {
  try {
    const versions = await sfFetch(session, "/services/data/");
    const last = versions[versions.length - 1];
    return "v" + last.version;
  } catch {
    return "v59.0";
  }
}

// A ceiling, not a page size: the query pages through nextRecordsUrl until the
// org runs out of records or this many have been read. Reaching it is reported
// rather than silently swallowed, so a large org can't show a partial list that
// looks complete.
export const MAX_RECORDS = 20000;

export async function soql(session, query, maxRecords = MAX_RECORDS) {
  let path = `/services/data/${session.apiVersion}/query/?q=${encodeURIComponent(query)}`;
  const records = [];
  let truncated = false;
  while (path) {
    const page = await sfFetch(session, path);
    records.push(...page.records);
    if (records.length >= maxRecords) {
      truncated = !page.done;
      break;
    }
    path = page.done ? null : page.nextRecordsUrl;
  }
  return { records, truncated };
}

/**
 * Describes are memoised per session: detection tests an object exists and then
 * reads its fields, which was two identical round trips per object.
 */
async function describe(session, sobject) {
  if (!session.describes) session.describes = new Map();
  if (session.describes.has(sobject)) {
    const cached = session.describes.get(sobject);
    if (cached instanceof Error) throw cached;
    return cached;
  }
  try {
    const result = await sfFetch(
      session,
      `/services/data/${session.apiVersion}/sobjects/${sobject}/describe/`
    );
    session.describes.set(sobject, result);
    return result;
  } catch (err) {
    session.describes.set(sobject, err);
    throw err;
  }
}

async function fieldNames(session, sobject) {
  const d = await describe(session, sobject);
  return new Set(d.fields.map((f) => f.name));
}

/** Does this object exist in the org? Uses the memoised describe. */
async function exists(session, sobject) {
  try {
    await describe(session, sobject);
    return true;
  } catch (e) {
    if (e.status === 404) return false;
    throw e;
  }
}

/* ----------------------------------------------------------------- schema */

/**
 * Work out where the records live and which designer suite is installed. The
 * `exists` probes run as one parallel wave, then the field lists as a second,
 * so the whole thing costs two round trips rather than ten sequential ones.
 * The pure decisions are in src/core/schema-model.js.
 */
export async function detectSchema(session) {
  const [nativeExists, ...packageExists] = await Promise.all([
    exists(session, "OmniProcess"),
    ...NAMESPACES.map((n) => exists(session, `${n}__OmniScript__c`)),
  ]);

  const installedNamespace = NAMESPACES.find((n, i) => packageExists[i]) || null;
  const objects = resolveSchemaObjects({ nativeExists, installedNamespace });

  const optional = (obj) =>
    fieldNames(session, obj).catch((e) => {
      if (e.status === 404) return null;
      throw e;
    });

  const [processFields, drFields, cardFields] = await Promise.all([
    fieldNames(session, objects.processObject),
    optional(objects.drObject),
    optional(objects.cardObject),
  ]);

  return buildSchema({ objects, installedNamespace, processFields, drFields, cardFields });
}

/* ------------------------------------------------------------------- load */

/** Pull every OmniScript, Integration Procedure, DataRaptor and FlexCard. */
export async function loadAll(session, schema) {
  async function collect(map, normalise) {
    if (!map) return { rows: [], object: null };
    const query = `SELECT ${selectList(map).join(", ")} FROM ${map.object} ORDER BY ${map.name}`;
    const { records, truncated } = await soql(session, query);
    return {
      rows: records.map((r) => normalise(r, map)),
      object: truncated ? map.object : null,
    };
  }

  // Three independent queries — no reason to wait for one before starting the next.
  const results = await Promise.all([
    collect(schema.process, normaliseProcess),
    collect(schema.dataRaptor, normaliseDr),
    collect(schema.flexCard, normaliseCard),
  ]);

  return {
    items: results.flatMap((r) => r.rows),
    truncatedObjects: results.map((r) => r.object).filter(Boolean),
  };
}

/**
 * Lightning apps whose developer name or label contains "omnistudio", case
 * insensitive. Used to offer a navigation context in settings; anything else can
 * still be pasted in by hand. AppDefinition isn't queryable for every profile,
 * so this degrades to an empty list rather than failing the load.
 */
export async function loadApps(session) {
  try {
    const { records } = await soql(
      session,
      "SELECT DurableId, DeveloperName, Label FROM AppDefinition ORDER BY Label",
      500
    );
    // DurableId is what the URL takes — a 06m id for custom apps, or a name
    // like standard__Sales for standard ones. DeveloperName is not a valid
    // URL segment for custom apps, which is what the App Launcher shows.
    return records
      .filter((r) => /omnistudio/i.test(`${r.DeveloperName} ${r.Label}`))
      .map((r) => ({ id: r.DurableId, name: r.DeveloperName, label: r.Label }));
  } catch {
    return [];
  }
}
