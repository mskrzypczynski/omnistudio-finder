import {
  BUILTIN_TEMPLATES,
  canCarryAppContext,
  designerUrl,
  mergeTemplates,
  needsAppSwitch,
  recordUrl,
  withAppContext,
} from "../../src/core/designer-urls.js";

const session = {
  uiOrigin: "https://acme.my.sandbox.lightning.force.com",
  uiHost: "acme.my.sandbox.lightning.force.com",
};
const osItem = { kind: "os", id: "0x1", sobject: "OmniProcess", name: "Onboarding", type: "T", subType: "S", language: "English", version: 2 };

/* ------- mergeTemplates */

describe("mergeTemplates", () => {
  it("overlays non-blank saved links over the built-ins for that flavor", () => {
    const merged = mergeTemplates("native", { osTemplate: "  /custom/{id}  ", ipTemplate: "   " });
    expect(merged.osTemplate).toBe("/custom/{id}"); // trimmed, saved wins
    expect(merged.ipTemplate).toBe(BUILTIN_TEMPLATES.native.ipTemplate); // blank ignored
  });

  it("returns an empty object for an unknown flavor", () => {
    expect(mergeTemplates("nonsense", {})).toEqual({});
  });
});

/* ------- withAppContext / canCarryAppContext */

describe("withAppContext", () => {
  it("scopes a /lightning/ path to the app", () => {
    expect(withAppContext("/lightning/r/OmniProcess/0x1/view", "06mA")).toBe(
      "/lightning/app/06mA/r/OmniProcess/0x1/view"
    );
  });

  it("leaves a path that is already /lightning/app/ alone", () => {
    expect(withAppContext("/lightning/app/06mA/r/x/view", "06mB")).toBe("/lightning/app/06mA/r/x/view");
  });

  it("leaves a non-Lightning path (the core builders) alone", () => {
    expect(withAppContext("/builder_omnistudio/omnistudioBuilder.app?id=1", "06mA")).toBe(
      "/builder_omnistudio/omnistudioBuilder.app?id=1"
    );
  });

  it("is a no-op without an app", () => {
    expect(withAppContext("/lightning/r/x/view", "")).toBe("/lightning/r/x/view");
  });
});

describe("canCarryAppContext", () => {
  it("is true only for /lightning/ URLs", () => {
    expect(canCarryAppContext("https://acme.lightning.force.com/lightning/r/x/view")).toBe(true);
    expect(canCarryAppContext("https://acme.lightning.force.com/builder_omnistudio/x")).toBe(false);
  });
});

/* ------- needsAppSwitch */

describe("needsAppSwitch", () => {
  it("is true only for a Visualforce host", () => {
    expect(needsAppSwitch("https://acme--vlocity-ins.vf.force.com/one/one.app#/x")).toBe(true);
    expect(needsAppSwitch("https://acme.lightning.force.com/lightning/r/x/view")).toBe(false);
    expect(needsAppSwitch("not a url")).toBe(false);
  });
});

/* ------- recordUrl */

describe("recordUrl", () => {
  it("builds the plain record page on the UI origin", () => {
    expect(recordUrl(session, osItem)).toBe(
      "https://acme.my.sandbox.lightning.force.com/lightning/r/OmniProcess/0x1/view"
    );
  });

  it("scopes it to a pinned app", () => {
    expect(recordUrl(session, osItem, "06mA")).toBe(
      "https://acme.my.sandbox.lightning.force.com/lightning/app/06mA/r/OmniProcess/0x1/view"
    );
  });
});

/* ------- designerUrl */

describe("designerUrl", () => {
  it("fills a relative template and prefixes the UI origin", () => {
    const { url, isDesigner } = designerUrl(session, osItem, BUILTIN_TEMPLATES.native);
    expect(isDesigner).toBe(true);
    expect(url).toBe(
      "https://acme.my.sandbox.lightning.force.com/builder_omnistudio/omnistudioBuilder.app?type=omniscript&id=0x1"
    );
  });

  it("returns an absolute template untouched, with {vfhost} and {ns} filled raw", () => {
    const { url } = designerUrl(session, { ...osItem, kind: "ip" }, BUILTIN_TEMPLATES.managed, {
      namespace: "vlocity_ins",
    });
    expect(url).toBe(
      "https://acme--vlocity-ins.my.sandbox.vf.force.com/one/one.app#/alohaRedirect/apex/vlocity_ins__integrationproceduredesigner?id=0x1"
    );
  });

  it("fills {now} with a timestamp", () => {
    const { url } = designerUrl(session, osItem, BUILTIN_TEMPLATES.managed, { namespace: "omnistudio" });
    expect(url).toMatch(/[?&]uid=\d+/);
  });

  it("falls back to the record page when the template is blank", () => {
    const { url, isDesigner } = designerUrl(session, osItem, { osTemplate: "" });
    expect(isDesigner).toBe(false);
    expect(url).toBe(
      "https://acme.my.sandbox.lightning.force.com/lightning/r/OmniProcess/0x1/view"
    );
  });
});
