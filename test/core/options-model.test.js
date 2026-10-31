import { appContextReach, orgDescription } from "../../src/core/options-model.js";

describe("orgDescription", () => {
  it("asks for a search when there is no detection yet", () => {
    expect(orgDescription(null, "native", "")).toMatch(/Run a search first/);
    expect(orgDescription({ process: null }, "native", "")).toMatch(/Run a search first/);
  });

  it("names the record object, the package and the designer suite", () => {
    const line = orgDescription(
      { process: { object: "OmniProcess" }, installedNamespace: "omnistudio" },
      "managed",
      "omnistudio"
    );
    expect(line).toBe(
      "Detected: records in OmniProcess, omnistudio package installed. Opening in the omnistudio designers."
    );
  });

  it("says 'no managed package' and 'core builders' for a bare native org", () => {
    const line = orgDescription({ process: { object: "OmniProcess" }, installedNamespace: null }, "native", "");
    expect(line).toBe(
      "Detected: records in OmniProcess, no managed package. Opening in the core builders."
    );
  });
});

describe("appContextReach", () => {
  it("explains the Visualforce two-hop for managed orgs", () => {
    expect(appContextReach("managed")).toMatch(/switch to the app first/);
  });

  it("explains record-pages-only for native orgs", () => {
    expect(appContextReach("native")).toMatch(/record pages only/);
  });
});
