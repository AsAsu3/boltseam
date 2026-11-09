/**
 * Unit tests for CorrectionUI operations.
 *
 * Tests: edit, split, merge, delete, freeze (confirm → freezeWorklist),
 * and the empty-worklist block.
 *
 * Uses happy-dom environment for DOM APIs.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  mountCorrectionUI,
  resetIdCounter,
} from "../../../src/intake/correctionUI.ts";
import { freezeWorklist } from "../../../src/intake/worklistEmitter.ts";
import type { SubClaim } from "../../../src/intake/types.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSc(id: string, text: string, domain: SubClaim["domain"] = "price"): SubClaim {
  return {
    id,
    span: [0, text.length],
    text,
    domain,
    statedValue: null,
    unit: null,
    entities: {},
    dateExpr: null,
    arithmeticOperands: null,
    unroutedReason: domain === "unrouted" ? "test" : null,
    userEdited: false,
    originalExtraction: null,
  };
}

function makeContainer(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

// ── freezeWorklist unit tests (no DOM needed) ─────────────────────────────

describe("freezeWorklist", () => {
  it("returns a Worklist with auditId, createdAt, originalText, and subClaims", () => {
    const scs: SubClaim[] = [makeSc("sc-01", "BTC was $61,200")];
    const wl = freezeWorklist(scs, "original post text");
    expect(wl.auditId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(wl.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(wl.originalText).toBe("original post text");
    expect(wl.subClaims).toHaveLength(1);
  });

  it("re-numbers sub-claims sequentially (sc-01, sc-02, …)", () => {
    const scs: SubClaim[] = [
      makeSc("sc-99", "first"),
      makeSc("sc-07", "second"),
      makeSc("sc-05", "third"),
    ];
    const wl = freezeWorklist(scs, "text");
    expect(wl.subClaims.map((sc) => sc.id)).toEqual(["sc-01", "sc-02", "sc-03"]);
  });

  it("returns a frozen object (no mutations allowed)", () => {
    const wl = freezeWorklist([makeSc("sc-01", "text")], "text");
    expect(Object.isFrozen(wl)).toBe(true);
  });

  it("preserves all sub-claim fields", () => {
    const sc = makeSc("sc-01", "BTC was $61,200");
    sc.statedValue = 61200;
    sc.unit = "USD";
    const wl = freezeWorklist([sc], "post");
    expect(wl.subClaims[0].statedValue).toBe(61200);
    expect(wl.subClaims[0].unit).toBe("USD");
  });
});

// ── CorrectionUI mount / confirm ───────────────────────────────────────────

describe("CorrectionUI — mount and basic rendering", () => {
  beforeEach(() => {
    resetIdCounter();
    document.body.innerHTML = "";
  });

  it("renders one card per sub-claim", () => {
    const container = makeContainer();
    const subClaims = [
      makeSc("sc-01", "first claim"),
      makeSc("sc-02", "second claim"),
    ];
    mountCorrectionUI(container, subClaims, "first claim second claim", {
      onConfirm: () => {},
    });
    const cards = container.querySelectorAll(".correction-card");
    expect(cards).toHaveLength(2);
  });

  it("destroy function removes the UI from the container", () => {
    const container = makeContainer();
    const destroy = mountCorrectionUI(
      container,
      [makeSc("sc-01", "claim")],
      "claim",
      { onConfirm: () => {} },
    );
    expect(container.querySelector(".correction-ui")).not.toBeNull();
    destroy();
    expect(container.querySelector(".correction-ui")).toBeNull();
  });
});

// ── Confirm and empty-worklist block ──────────────────────────────────────

describe("CorrectionUI — confirm", () => {
  beforeEach(() => {
    resetIdCounter();
    document.body.innerHTML = "";
  });

  it("calls onConfirm with the sub-claims when list is non-empty", () => {
    const container = makeContainer();
    let confirmed: SubClaim[] | null = null;

    mountCorrectionUI(
      container,
      [makeSc("sc-01", "BTC was $61,200")],
      "BTC was $61,200",
      {
        onConfirm: (scs) => {
          confirmed = scs;
        },
      },
    );

    const confirmBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--confirm",
    );
    expect(confirmBtn).not.toBeNull();
    confirmBtn!.click();
    expect(confirmed).not.toBeNull();
    expect(confirmed!).toHaveLength(1);
  });

  it("blocks confirm and shows error when list is empty", () => {
    const container = makeContainer();
    let called = false;

    mountCorrectionUI(container, [], "some text", {
      onConfirm: () => {
        called = true;
      },
    });

    const confirmBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--confirm",
    );
    confirmBtn!.click();
    expect(called).toBe(false);

    const errorEl = container.querySelector<HTMLElement>(".correction-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl!.hidden).toBe(false);
    expect(errorEl!.textContent).toContain("empty");
  });
});

// ── Delete ────────────────────────────────────────────────────────────────

describe("CorrectionUI — delete", () => {
  beforeEach(() => {
    resetIdCounter();
    document.body.innerHTML = "";
  });

  it("removes a card when the delete button is clicked", () => {
    const container = makeContainer();
    mountCorrectionUI(
      container,
      [makeSc("sc-01", "first"), makeSc("sc-02", "second")],
      "first second",
      { onConfirm: () => {} },
    );

    const deleteBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--delete",
    );
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();

    const cards = container.querySelectorAll(".correction-card");
    expect(cards).toHaveLength(1);
  });

  it("after delete, confirming passes remaining sub-claims", () => {
    const container = makeContainer();
    let confirmed: SubClaim[] | null = null;

    mountCorrectionUI(
      container,
      [makeSc("sc-01", "first"), makeSc("sc-02", "second")],
      "first second",
      {
        onConfirm: (scs) => {
          confirmed = scs;
        },
      },
    );

    // Delete first card
    const deleteBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--delete",
    );
    deleteBtn!.click();

    // Confirm
    const confirmBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--confirm",
    );
    confirmBtn!.click();

    expect(confirmed).toHaveLength(1);
    expect(confirmed![0].text).toBe("second");
  });
});

// ── Merge ─────────────────────────────────────────────────────────────────

describe("CorrectionUI — merge", () => {
  beforeEach(() => {
    resetIdCounter();
    document.body.innerHTML = "";
  });

  it("merges two adjacent sub-claims when Merge button is clicked", () => {
    const container = makeContainer();
    let confirmed: SubClaim[] | null = null;

    mountCorrectionUI(
      container,
      [makeSc("sc-01", "first part"), makeSc("sc-02", "second part")],
      "first part second part",
      {
        onConfirm: (scs) => {
          confirmed = scs;
        },
      },
    );

    const mergeBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--merge",
    );
    expect(mergeBtn).not.toBeNull();
    expect(mergeBtn!.disabled).toBe(false);
    mergeBtn!.click();

    // Now only one card
    expect(container.querySelectorAll(".correction-card")).toHaveLength(1);

    // Confirm and check merged text
    const confirmBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--confirm",
    );
    confirmBtn!.click();

    expect(confirmed).toHaveLength(1);
    expect(confirmed![0].text).toContain("first part");
    expect(confirmed![0].text).toContain("second part");
    expect(confirmed![0].userEdited).toBe(true);
    expect(confirmed![0].originalExtraction).not.toBeNull();
  });

  it("last card Merge button is disabled", () => {
    const container = makeContainer();
    mountCorrectionUI(
      container,
      [makeSc("sc-01", "only one")],
      "only one",
      { onConfirm: () => {} },
    );

    const mergeBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--merge",
    );
    expect(mergeBtn!.disabled).toBe(true);
  });
});

// ── Add ───────────────────────────────────────────────────────────────────

describe("CorrectionUI — add", () => {
  beforeEach(() => {
    resetIdCounter();
    document.body.innerHTML = "";
  });

  it("adds a new blank sub-claim card when Add button is clicked", () => {
    const container = makeContainer();
    mountCorrectionUI(
      container,
      [makeSc("sc-01", "existing")],
      "existing",
      { onConfirm: () => {} },
    );

    const addBtn = container.querySelector<HTMLButtonElement>(
      ".correction-btn--add",
    );
    addBtn!.click();

    expect(container.querySelectorAll(".correction-card")).toHaveLength(2);
  });
});
