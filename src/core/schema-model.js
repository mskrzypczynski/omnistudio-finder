// schema-model.js — turning "which objects and fields exist" into a schema the
// rest of the code can read from. Pure: the client (src/ui/sf-client.js) does the
// describe round trips and hands the answers here.

import { SfError } from "./errors.js";

// Namespaces the Vlocity / OmniStudio managed packages ship under, newest-style
// first. Order matters: the first one whose OmniScript object exists wins.
export const NAMESPACES = ["vlocity_cmt", "vlocity_ins", "vlocity_ps", "omnistudio", "vlocity_hins"];

// Bump when the shape of a detected schema changes, so stale hints re-detect.
export const SCHEMA_VERSION = 3;

/** Pick the first candidate field name that actually exists on the object. */
export function pick(available, ...candidates) {
  return candidates.find((c) => c && available.has(c)) || null;
}

/**
 * Work out where the records live and which designer suite is installed, from
 * two facts the client established with `exists()` probes.
 *
 * A managed package can be installed while the records still live in the
 * standard objects, so `nativeExists` and `installedNamespace` are deliberately
 * independent inputs.
 */
export function resolveSchemaObjects({ nativeExists, installedNamespace }) {
  const ns = nativeExists ? null : installedNamespace || null;
  const processObject = nativeExists ? "OmniProcess" : ns ? `${ns}__OmniScript__c` : null;

  if (!processObject) {
    throw new SfError(
      "NO_OMNISTUDIO",
      "No OmniStudio objects in this org.",
      "OmniStudio Finder looks for OmniProcess or <namespace>__OmniScript__c."
    );
  }

  return {
    ns,
    flavor: ns ? "managed" : "native",
    processObject,
    drObject: ns ? `${ns}__DRBundle__c` : "OmniDataTransform",
    cardObject: ns ? `${ns}__VlocityCard__c` : "OmniUiCard",
  };
}

/**
 * Build the schema object from the resolved object names plus the field-name
 * Sets the client read. `drFields` / `cardFields` are `null` when that object
 * does not exist in the org — the matching sub-schema then comes back `null`.
 */
export function buildSchema({ objects, installedNamespace, processFields, drFields, cardFields }) {
  const { ns, flavor, processObject, drObject, cardObject } = objects;
  const p = processFields;
  const d = drFields;
  const c = cardFields;

  const process = {
    object: processObject,
    id: "Id",
    name: "Name",
    type: pick(p, "Type", ns && `${ns}__Type__c`),
    subType: pick(p, "SubType", ns && `${ns}__SubType__c`),
    language: pick(p, "Language", ns && `${ns}__Language__c`),
    version: pick(p, "VersionNumber", ns && `${ns}__Version__c`),
    isActive: pick(p, "IsActive", ns && `${ns}__IsActive__c`),
    processType: pick(p, "OmniProcessType"),
    isProcedure: pick(p, "IsIntegrationProcedure", ns && `${ns}__IsProcedure__c`),
    uniqueName: pick(p, "UniqueName", ns && `${ns}__ProcedureKey__c`),
    lwcEnabled: pick(p, "IsWebCompEnabled", ns && `${ns}__IsLwcEnabled__c`),
    lastModified: "LastModifiedDate",
  };

  const dataRaptor = d && {
    object: drObject,
    id: "Id",
    name: "Name",
    type: pick(d, "Type", ns && `${ns}__Type__c`),
    inputType: pick(d, "InputType", ns && `${ns}__InputType__c`),
    outputType: pick(d, "OutputType", ns && `${ns}__OutputType__c`),
    isActive: pick(d, "IsActive", ns && `${ns}__IsActive__c`),
    version: pick(d, "VersionNumber", ns && `${ns}__VersionNumber__c`),
    lastModified: "LastModifiedDate",
  };

  const flexCard = c && {
    object: cardObject,
    id: "Id",
    name: "Name",
    author: pick(c, "AuthorName", ns && `${ns}__Author__c`),
    cardType: pick(c, "OmniUiCardType", ns && `${ns}__CardType__c`),
    version: pick(c, "VersionNumber", ns && `${ns}__Version__c`),
    isActive: pick(c, "IsActive", ns && `${ns}__Active__c`, ns && `${ns}__IsActive__c`),
    lastModified: "LastModifiedDate",
  };

  return {
    v: SCHEMA_VERSION,
    flavor,
    namespace: ns,
    installedNamespace: installedNamespace || null,
    process,
    dataRaptor,
    flexCard,
  };
}

/**
 * Which designer suite to open. Independent of the data objects, because an org
 * can store records in OmniProcess and still have the Managed Package Designer
 * setting switched on. "auto" prefers the managed designers whenever the
 * package is installed; the user can force either in Settings.
 */
export function designerFlavor(schema, preference) {
  if (preference === "native" || preference === "managed") return preference;
  return schema && schema.installedNamespace ? "managed" : "native";
}

/** Namespace used to build managed designer links. */
export function designerNamespace(schema, override) {
  if (override && override.trim()) return override.trim();
  if (!schema) return "";
  return schema.namespace || schema.installedNamespace || "";
}
