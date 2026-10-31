import {
  confirmEntry,
  isFragmentOnlyChange,
  isStale,
  landingState,
  navigationPlan,
  nextStep,
  pendingKey,
  routesByFragment,
} from "../../src/core/nav-model.js";

const DESIGNER =
  "https://acme--vlocity-cmt.vf.force.com/one/one.app#/alohaRedirect/apex/vlocity_cmt__drmapper?id=a1B";

/* ------- pendingKey / isStale */

describe("pendingKey", () => {
  it("namespaces a tab id", () => {
    expect(pendingKey(42)).toBe("pendingNav:42");
  });
});

describe("isStale", () => {
  it("is true once the entry is older than the TTL", () => {
    expect(isStale({ startedAt: 0 }, 30001)).toBe(true);
    expect(isStale({ startedAt: 0 }, 30000)).toBe(false);
    expect(isStale({ startedAt: 1000 }, 2000)).toBe(false);
  });
});

/* ------- navigationPlan */

describe("navigationPlan", () => {
  const base = {
    targetUrl: "https://acme.lightning.force.com/lightning/r/OmniProcess/1/view",
    openIn: "newTab",
    invertTarget: false,
    appContext: "",
    tabId: 7,
    uiOrigin: "https://acme.lightning.force.com",
  };

  it("opens a new tab by default", () => {
    expect(navigationPlan(base)).toEqual({ mode: "new-tab", url: base.targetUrl, confirm: false });
  });

  it("reuses the current tab when openIn is sameTab", () => {
    expect(navigationPlan({ ...base, openIn: "sameTab" })).toEqual({
      mode: "same-tab",
      tabId: 7,
      url: base.targetUrl,
      confirm: false,
    });
  });

  it("inverts the tab preference on a Ctrl/Cmd click", () => {
    expect(navigationPlan({ ...base, openIn: "sameTab", invertTarget: true }).mode).toBe("new-tab");
    expect(navigationPlan({ ...base, openIn: "newTab", invertTarget: true }).mode).toBe("same-tab");
  });

  it("falls back to a new tab for same-tab intent when there is no tab id", () => {
    expect(navigationPlan({ ...base, openIn: "sameTab", tabId: null }).mode).toBe("new-tab");
  });

  it("plans the two-hop app switch only for a Visualforce target with an app pinned", () => {
    const vf = { ...base, appContext: "06mA", targetUrl: "https://acme--ns.vf.force.com/one/one.app#/x" };
    expect(navigationPlan(vf)).toEqual({
      mode: "app-switch",
      tabId: null, // newTab intent → don't hand the worker a tab to reuse
      appUrl: "https://acme.lightning.force.com/lightning/app/06mA",
      targetUrl: vf.targetUrl,
    });
    expect(navigationPlan({ ...vf, openIn: "sameTab" }).tabId).toBe(7);
  });

  it("does not app-switch a Lightning target even with an app pinned", () => {
    expect(navigationPlan({ ...base, appContext: "06mA" }).mode).toBe("new-tab");
  });

  it("asks for a landing check when the link routes by fragment", () => {
    expect(navigationPlan({ ...base, targetUrl: DESIGNER })).toEqual({
      mode: "new-tab",
      url: DESIGNER,
      confirm: true,
    });
    expect(navigationPlan({ ...base, targetUrl: DESIGNER, openIn: "sameTab" }).confirm).toBe(true);
  });
});

/* ------- landing check */

describe("routesByFragment", () => {
  it("is true only for a URL with a non-empty fragment", () => {
    expect(routesByFragment(DESIGNER)).toBe(true);
    expect(routesByFragment("https://acme.lightning.force.com/lightning/r/X/1/view")).toBe(false);
    expect(routesByFragment("https://acme.lightning.force.com/one/one.app#")).toBe(false);
    expect(routesByFragment("not a url")).toBe(false);
  });
});

describe("isFragmentOnlyChange", () => {
  it("is true when only the fragment differs", () => {
    const other = DESIGNER.replace("drmapper?id=a1B", "integrationproceduredesigner?id=a2C");
    expect(isFragmentOnlyChange(DESIGNER, other)).toBe(true);
    expect(isFragmentOnlyChange("https://acme.lightning.force.com/lightning/page/home", DESIGNER)).toBe(false);
    expect(isFragmentOnlyChange("", DESIGNER)).toBe(false);
  });
});

describe("landingState", () => {
  it("is landed when the tab kept the route", () => {
    expect(landingState(DESIGNER, DESIGNER)).toBe("landed");
    // the router may add parameters after the route
    expect(landingState(DESIGNER + "&t=1", DESIGNER)).toBe("landed");
  });

  it("is lost when the tab reached the page but the route was dropped", () => {
    const bare = "https://acme--vlocity-cmt.vf.force.com/one/one.app";
    expect(landingState(bare, DESIGNER)).toBe("lost");
    expect(landingState(bare + "#/home", DESIGNER)).toBe("lost");
  });

  it("is pending anywhere else, such as a hop of the session hand-off", () => {
    expect(
      landingState("https://acme.my.salesforce.com/visualforce/session?url=x", DESIGNER)
    ).toBe("pending");
    expect(landingState("", DESIGNER)).toBe("pending");
  });
});

describe("nextStep", () => {
  const now = 1000;

  it("follows an app switch through to the designer, then checks the landing", () => {
    const step = nextStep({ targetUrl: DESIGNER, startedAt: now }, "https://x/lightning/app/06mA", now);
    expect(step).toEqual({ navigate: DESIGNER, keep: confirmEntry(DESIGNER, now) });
  });

  it("follows an app switch to a Lightning link without a landing check", () => {
    const target = "https://acme.lightning.force.com/lightning/r/X/1/view";
    expect(nextStep({ stage: "app", targetUrl: target, startedAt: now }, "", now)).toEqual({
      navigate: target,
      keep: null,
    });
  });

  it("re-sends a lost route once and then forgets the entry", () => {
    const entry = confirmEntry(DESIGNER, now);
    const bare = "https://acme--vlocity-cmt.vf.force.com/one/one.app";
    expect(nextStep(entry, bare, now)).toEqual({ navigate: DESIGNER, keep: null });
  });

  it("does nothing more once the designer has landed", () => {
    expect(nextStep(confirmEntry(DESIGNER, now), DESIGNER, now)).toEqual({ navigate: null, keep: null });
  });

  it("keeps waiting through the hand-off", () => {
    const entry = confirmEntry(DESIGNER, now);
    expect(nextStep(entry, "https://acme.my.salesforce.com/visualforce/session", now)).toEqual({
      navigate: null,
      keep: entry,
    });
  });

  it("drops a stale entry without navigating", () => {
    expect(nextStep(confirmEntry(DESIGNER, 0), DESIGNER, 60000)).toEqual({ navigate: null, keep: null });
  });
});
