import {
  COLLAPSE_AT,
  HARD_CAP,
  matchSegments,
  matchesGroup,
  metaLine,
  openButtonLabel,
  rankGroup,
  tracksActivation,
  versionChipLabel,
  versionTooltip,
  visibleGroups,
  visibleVersions,
} from "../../src/core/filter-model.js";

// A group is what assets-model#group produces. Only the fields each function
// reads are set here.
const grp = (over) => ({
  key: "os|T|S|English",
  kind: "os",
  label: "Create Case",
  type: "T",
  subType: "S",
  language: "English",
  haystack: "create case t s english",
  versions: [{ version: 2, isActive: true }, { version: 1, isActive: false }],
  active: { version: 2, isActive: true },
  ...over,
});

/* ------- matchesGroup */

describe("matchesGroup", () => {
  it("filters by kind unless the filter is 'all'", () => {
    expect(matchesGroup(grp(), { filter: "os" })).toBe(true);
    expect(matchesGroup(grp(), { filter: "dr" })).toBe(false);
    expect(matchesGroup(grp(), { filter: "all" })).toBe(true);
  });

  it("requires every whitespace-separated token to be in the haystack, in any order", () => {
    expect(matchesGroup(grp(), { query: "case create" })).toBe(true);
    expect(matchesGroup(grp(), { query: "case delete" })).toBe(false);
  });

  it("matches a pasted Type_SubType_Language key", () => {
    const g = grp({ haystack: "create case case create english case_create_english casecreateenglish" });
    expect(matchesGroup(g, { query: "Case_Create_English" })).toBe(true);
    expect(matchesGroup(g, { query: "Case_Create_Spanish" })).toBe(false);
  });

  it("hides a group with no active version under activeOnly — but only if it tracks activation", () => {
    const noActive = grp({ active: null, versions: [{ version: 1, isActive: false }] });
    expect(matchesGroup(noActive, { activeOnly: true })).toBe(false);

    const untracked = grp({ active: null, versions: [{ version: 0, isActive: null }] });
    expect(matchesGroup(untracked, { activeOnly: true })).toBe(true);
  });
});

/* ------- tracksActivation */

describe("tracksActivation", () => {
  it("is true when any version has a real boolean isActive", () => {
    expect(tracksActivation({ versions: [{ isActive: false }] })).toBe(true);
    expect(tracksActivation({ versions: [{ isActive: null }] })).toBe(false);
  });
});

/* ------- rankGroup / visibleGroups */

describe("rankGroup", () => {
  it("scores exact < prefix < substring < miss", () => {
    expect(rankGroup({ label: "Case" }, "case")).toBe(-3);
    expect(rankGroup({ label: "Case Create" }, "case")).toBe(-2);
    expect(rankGroup({ label: "Create Case" }, "case")).toBe(-1);
    expect(rankGroup({ label: "Onboarding" }, "case")).toBe(0);
    expect(rankGroup({ label: "Onboarding" }, "")).toBe(0);
  });

  it("ranks a Type_SubType_Language key like the name", () => {
    const g = { label: "New case", scriptKey: "Case_Create_English" };
    expect(rankGroup(g, "case_create_english")).toBe(-3);
    expect(rankGroup(g, "case_create")).toBe(-2);
  });
});

describe("visibleGroups", () => {
  it("filters then orders by rank, then alphabetically", () => {
    const groups = [
      grp({ key: "a", label: "Update Case", haystack: "update case" }),
      grp({ key: "b", label: "Case", haystack: "case" }),
      grp({ key: "c", label: "Case Escalation", haystack: "case escalation" }),
    ];
    const ordered = visibleGroups(groups, { query: "case" }).map((g) => g.label);
    expect(ordered).toEqual(["Case", "Case Escalation", "Update Case"]);
  });
});

/* ------- visibleVersions */

describe("visibleVersions", () => {
  const many = (n) => ({
    versions: Array.from({ length: n }, (_, i) => ({ version: n - i })),
    active: null,
  });

  it("returns everything when the history is short", () => {
    const g = many(COLLAPSE_AT);
    expect(visibleVersions(g, false)).toHaveLength(COLLAPSE_AT);
  });

  it("collapses a long history to the newest few", () => {
    const g = many(20);
    expect(visibleVersions(g, false)).toHaveLength(4); // NEWEST_KEPT
  });

  it("always keeps the active version however far down it sits", () => {
    const g = many(20);
    g.active = g.versions[15];
    const shown = visibleVersions(g, false);
    expect(shown).toContain(g.active);
    expect(shown).toHaveLength(5); // 4 newest + the buried active one
  });

  it("caps an expanded rail at HARD_CAP", () => {
    expect(visibleVersions(many(200), true)).toHaveLength(HARD_CAP);
  });
});

/* ------- labels */

describe("labels", () => {
  it("versionChipLabel shows the number, or 'Open' when unversioned", () => {
    expect(versionChipLabel({ version: 3 })).toBe("v3");
    expect(versionChipLabel({ version: 0 })).toBe("Open");
  });

  it("openButtonLabel matches", () => {
    expect(openButtonLabel({ version: 3 })).toBe("Open v3");
    expect(openButtonLabel({ version: 0 })).toBe("Open");
  });

  it("versionTooltip states the version and activation without asserting a locale date", () => {
    expect(versionTooltip({ version: 2, isActive: true })).toContain("Version 2");
    expect(versionTooltip({ version: 2, isActive: true })).toContain("active");
    expect(versionTooltip({ version: 0, isActive: null })).toContain("No version numbering");
  });

  it("metaLine composes per kind", () => {
    expect(metaLine({ kind: "os", type: "Type", subType: "Sub", language: "English" })).toBe(
      "Type  ·  Sub  ·  English"
    );
    expect(metaLine({ kind: "dr", type: "Extract", inputType: "JSON", outputType: "SObject" })).toBe(
      "Extract  ·  JSON → SObject"
    );
    expect(metaLine({ kind: "fc", author: "Jo", cardType: "Flex" })).toBe("by Jo  ·  Flex");
  });
});

/* ------- matchSegments */

describe("matchSegments", () => {
  it("returns one plain segment when there is no query", () => {
    expect(matchSegments("Create Case", "")).toEqual([{ text: "Create Case", isMatch: false }]);
  });

  it("marks each case-insensitive token hit and leaves the gaps plain", () => {
    expect(matchSegments("Create Case", "case")).toEqual([
      { text: "Create ", isMatch: false },
      { text: "Case", isMatch: true },
    ]);
  });

  it("treats regex metacharacters in the query as literals", () => {
    expect(matchSegments("a.b.c", ".")).toEqual([
      { text: "a", isMatch: false },
      { text: ".", isMatch: true },
      { text: "b", isMatch: false },
      { text: ".", isMatch: true },
      { text: "c", isMatch: false },
    ]);
  });
});
