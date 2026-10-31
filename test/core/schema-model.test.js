import {
  buildSchema,
  designerFlavor,
  designerNamespace,
  pick,
  resolveSchemaObjects,
} from "../../src/core/schema-model.js";
import { SfError } from "../../src/core/errors.js";

/* ------- pick: first candidate field name that exists */

describe("pick", () => {
  const fields = new Set(["Name", "vlocity_ins__Type__c"]);

  it("returns the first candidate present on the object", () => {
    expect(pick(fields, "Type", "vlocity_ins__Type__c")).toBe("vlocity_ins__Type__c");
  });

  it("skips falsy candidates (a namespaced name that was `ns && ...` with ns null)", () => {
    expect(pick(fields, "Type", null, "Name")).toBe("Name");
  });

  it("returns null when nothing matches", () => {
    expect(pick(fields, "Type", "SubType")).toBeNull();
  });
});

/* ------- resolveSchemaObjects: where the records live */

describe("resolveSchemaObjects", () => {
  it("uses the standard objects when OmniProcess exists, even with a package installed", () => {
    const o = resolveSchemaObjects({ nativeExists: true, installedNamespace: "vlocity_ins" });
    expect(o).toMatchObject({
      ns: null,
      flavor: "native",
      processObject: "OmniProcess",
      drObject: "OmniDataTransform",
      cardObject: "OmniUiCard",
    });
  });

  it("uses namespaced objects when only the managed package is present", () => {
    const o = resolveSchemaObjects({ nativeExists: false, installedNamespace: "omnistudio" });
    expect(o).toMatchObject({
      ns: "omnistudio",
      flavor: "managed",
      processObject: "omnistudio__OmniScript__c",
      drObject: "omnistudio__DRBundle__c",
      cardObject: "omnistudio__VlocityCard__c",
    });
  });

  it("throws NO_OMNISTUDIO when neither is present", () => {
    try {
      resolveSchemaObjects({ nativeExists: false, installedNamespace: null });
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfError);
      expect(err.code).toBe("NO_OMNISTUDIO");
    }
  });
});

/* ------- buildSchema: turn field-name Sets into the schema */

const nativeObjects = resolveSchemaObjects({ nativeExists: true, installedNamespace: null });

describe("buildSchema", () => {
  it("resolves standard field names on the native process object", () => {
    const schema = buildSchema({
      objects: nativeObjects,
      installedNamespace: null,
      processFields: new Set(["Type", "SubType", "Language", "IsActive", "OmniProcessType"]),
      drFields: null,
      cardFields: null,
    });
    expect(schema.flavor).toBe("native");
    expect(schema.namespace).toBeNull();
    expect(schema.process.type).toBe("Type");
    expect(schema.process.isProcedure).toBeNull();
  });

  it("returns null DataRaptor / FlexCard sub-schemas when those objects are absent", () => {
    const schema = buildSchema({
      objects: nativeObjects,
      installedNamespace: null,
      processFields: new Set(["Type"]),
      drFields: null,
      cardFields: null,
    });
    expect(schema.dataRaptor).toBeNull();
    expect(schema.flexCard).toBeNull();
  });

  it("falls back to namespaced field names for a managed package", () => {
    const objects = resolveSchemaObjects({ nativeExists: false, installedNamespace: "vlocity_ins" });
    const schema = buildSchema({
      objects,
      installedNamespace: "vlocity_ins",
      processFields: new Set(["vlocity_ins__Type__c", "vlocity_ins__IsProcedure__c"]),
      drFields: new Set(["vlocity_ins__Type__c"]),
      cardFields: new Set(["vlocity_ins__Author__c"]),
    });
    expect(schema.flavor).toBe("managed");
    expect(schema.namespace).toBe("vlocity_ins");
    expect(schema.process.type).toBe("vlocity_ins__Type__c");
    expect(schema.process.isProcedure).toBe("vlocity_ins__IsProcedure__c");
    expect(schema.dataRaptor.type).toBe("vlocity_ins__Type__c");
    expect(schema.flexCard.author).toBe("vlocity_ins__Author__c");
  });

  it("keeps installedNamespace even when records are native (package installed, data standard)", () => {
    const schema = buildSchema({
      objects: nativeObjects,
      installedNamespace: "omnistudio",
      processFields: new Set(["Type"]),
      drFields: null,
      cardFields: null,
    });
    expect(schema.namespace).toBeNull();
    expect(schema.installedNamespace).toBe("omnistudio");
  });
});

/* ------- designerFlavor / designerNamespace */

describe("designerFlavor", () => {
  it("honours an explicit preference", () => {
    expect(designerFlavor({ installedNamespace: null }, "managed")).toBe("managed");
    expect(designerFlavor({ installedNamespace: "omnistudio" }, "native")).toBe("native");
  });

  it("auto-prefers managed whenever a package is installed", () => {
    expect(designerFlavor({ installedNamespace: "omnistudio" }, "auto")).toBe("managed");
    expect(designerFlavor({ installedNamespace: null }, "auto")).toBe("native");
  });
});

describe("designerNamespace", () => {
  it("prefers a non-blank override", () => {
    expect(designerNamespace({ namespace: "omnistudio" }, "  vlocity_cmt ")).toBe("vlocity_cmt");
  });

  it("falls through namespace, then installedNamespace, then empty string", () => {
    expect(designerNamespace({ namespace: "omnistudio", installedNamespace: "x" }, "")).toBe(
      "omnistudio"
    );
    expect(designerNamespace({ namespace: null, installedNamespace: "vlocity_ins" }, "")).toBe(
      "vlocity_ins"
    );
    expect(designerNamespace(null, "")).toBe("");
  });
});
