import {
  group,
  normaliseCard,
  normaliseDr,
  normaliseProcess,
  selectList, scriptKey } from "../../src/core/assets-model.js";

// The field-name maps are what buildSchema produces: `object` plus one entry
// per field, the value being the actual API field name (or null if absent).
const processMap = {
  object: "OmniProcess",
  name: "Name",
  type: "Type",
  subType: "SubType",
  language: "Language",
  version: "VersionNumber",
  isActive: "IsActive",
  processType: "OmniProcessType",
  isProcedure: null,
  uniqueName: "UniqueName",
  lwcEnabled: "IsWebCompEnabled",
};

/* ------- selectList */

describe("selectList", () => {
  it("drops the object key, empty strings and nulls, and dedupes", () => {
    const list = selectList({ object: "X", a: "Id", b: "Name", c: "Id", d: "", e: null });
    expect(list).toEqual(["Id", "Name"]);
  });
});

/* ------- normaliseProcess: OmniScript vs Integration Procedure */

describe("normaliseProcess", () => {
  it("classifies as IP when OmniProcessType contains 'Integration'", () => {
    const row = normaliseProcess({ Id: "a", Name: "GetAccount", OmniProcessType: "Integration Procedure" }, processMap);
    expect(row.kind).toBe("ip");
  });

  it("classifies as OS otherwise", () => {
    const row = normaliseProcess({ Id: "a", Name: "Onboarding", OmniProcessType: "OmniScript" }, processMap);
    expect(row.kind).toBe("os");
  });

  it("falls back to the IsProcedure boolean when there is no OmniProcessType field", () => {
    const map = { ...processMap, processType: null, isProcedure: "vlocity_ins__IsProcedure__c" };
    expect(normaliseProcess({ Id: "a", Name: "x", vlocity_ins__IsProcedure__c: true }, map).kind).toBe("ip");
    expect(normaliseProcess({ Id: "a", Name: "x", vlocity_ins__IsProcedure__c: false }, map).kind).toBe("os");
  });

  it("coerces version to a number and defaults missing fields", () => {
    const row = normaliseProcess({ Id: "a", Name: "x", VersionNumber: "3" }, processMap);
    expect(row.version).toBe(3);
    expect(row.type).toBe("");
    expect(row.isActive).toBe(false);
  });
});

/* ------- normaliseDr / normaliseCard */

describe("normaliseDr", () => {
  const drMap = { object: "OmniDataTransform", name: "Name", type: "Type", inputType: "InputType", outputType: "OutputType", isActive: "IsActive", version: "VersionNumber" };

  it("maps the transform fields", () => {
    const row = normaliseDr({ Id: "d1", Name: "AccountExtract", Type: "Extract", IsActive: true }, drMap);
    expect(row).toMatchObject({ kind: "dr", name: "AccountExtract", type: "Extract", isActive: true });
  });

  it("leaves isActive null only when the schema has no activation field at all", () => {
    const unversioned = { ...drMap, isActive: null };
    expect(normaliseDr({ Id: "d1", Name: "x" }, unversioned).isActive).toBeNull();
    // field mapped but value absent on the row → false, not null
    expect(normaliseDr({ Id: "d1", Name: "x" }, drMap).isActive).toBe(false);
  });
});

describe("normaliseCard", () => {
  const cardMap = { object: "OmniUiCard", name: "Name", author: "AuthorName", cardType: "OmniUiCardType", version: "VersionNumber", isActive: "IsActive" };

  it("maps the card fields", () => {
    const row = normaliseCard({ Id: "c1", Name: "AccountCard", AuthorName: "Jo", IsActive: true }, cardMap);
    expect(row).toMatchObject({ kind: "fc", name: "AccountCard", author: "Jo", isActive: true });
  });
});

/* ------- group: collapse versions into one entry */

const os = (over) => ({ kind: "os", sobject: "OmniProcess", id: "x", name: "N", type: "T", subType: "S", language: "English", version: 1, isActive: false, uniqueName: "", lastModified: "2024-01-01", ...over });

describe("group", () => {
  it("stacks OmniScript versions by type|subType|language and picks the active one as head", () => {
    const groups = group([
      os({ id: "1", version: 1, isActive: false }),
      os({ id: "2", version: 2, isActive: true }),
      os({ id: "3", version: 3, isActive: false }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].versions.map((v) => v.version)).toEqual([3, 2, 1]); // sorted desc
    expect(groups[0].active.id).toBe("2");
    expect(groups[0].head.id).toBe("2"); // active wins over newest
  });

  it("falls back to the newest version as head when none is active", () => {
    const groups = group([os({ id: "1", version: 1 }), os({ id: "2", version: 3 })]);
    expect(groups[0].head.id).toBe("2");
    expect(groups[0].active).toBeNull();
  });

  it("keys DataRaptors by name when the org versions them", () => {
    const dr = (over) => ({ kind: "dr", sobject: "OmniDataTransform", id: "x", name: "Extract", version: 0, isActive: null, lastModified: null, ...over });
    const versioned = group([dr({ id: "a", name: "Extract", version: 1 }), dr({ id: "b", name: "Extract", version: 2 })]);
    expect(versioned).toHaveLength(1);
    expect(versioned[0].versions).toHaveLength(2);
  });

  it("keys DataRaptors by id when the org does not version them", () => {
    const dr = (over) => ({ kind: "dr", sobject: "vlocity_ins__DRBundle__c", id: "x", name: "Extract", version: 0, isActive: null, lastModified: null, ...over });
    const flat = group([dr({ id: "a", name: "Extract" }), dr({ id: "b", name: "Extract" })]);
    expect(flat).toHaveLength(2); // not merged on name
  });

  it("keys FlexCards by name and author", () => {
    const fc = (over) => ({ kind: "fc", sobject: "OmniUiCard", id: "x", name: "Card", author: "", version: 1, isActive: false, lastModified: null, ...over });
    const groups = group([fc({ id: "a", author: "Jo" }), fc({ id: "b", author: "Sam" })]);
    expect(groups).toHaveLength(2);
  });

  it("builds a lowercase haystack and takes the newest lastModified across versions", () => {
    const groups = group([
      os({ id: "1", version: 1, lastModified: "2024-01-01", name: "Onboard" }),
      os({ id: "2", version: 2, lastModified: "2025-06-01", name: "Onboard" }),
    ]);
    expect(groups[0].haystack).toContain("onboard");
    expect(groups[0].lastModified).toBe("2025-06-01");
  });
});

/* ------- scriptKey: Type_SubType_Language */

describe("scriptKey", () => {
  it("joins type, subtype and language for OmniScripts and Integration Procedures", () => {
    expect(scriptKey({ kind: "os", type: "Case", subType: "Create", language: "English" })).toBe("Case_Create_English");
    expect(scriptKey({ kind: "ip", type: "Case", subType: "Fetch", language: "Procedure" })).toBe("Case_Fetch_Procedure");
    expect(scriptKey({ kind: "ip", type: "Case", subType: "Fetch", language: "" })).toBe("Case_Fetch");
  });

  it("is empty for DataRaptors and FlexCards, which go by name", () => {
    expect(scriptKey({ kind: "dr", type: "Extract" })).toBe("");
    expect(scriptKey({ kind: "fc" })).toBe("");
  });

  it("is searchable as written and run together, the way an LWC name spells it", () => {
    const [g] = group([os({ type: "Case", subType: "Create", language: "English" })]);
    expect(g.scriptKey).toBe("Case_Create_English");
    expect(g.haystack).toContain("case_create_english");
    expect(g.haystack).toContain("casecreateenglish");
  });
});
