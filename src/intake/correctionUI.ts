/**
 * CorrectionUI — sub-claim review and correction panel.
 *
 * Pure DOM component; no framework. Consistent with IntakeForm code style.
 *
 * Features:
 * - Renders one card per sub-claim, with span highlighting in the original
 *   text and the original extraction preserved on user edit.
 * - Edit: text, statedValue, unit, dateExpr, domain tag.
 * - Split: one sub-claim into two (the card's text is split at a chosen point).
 * - Merge: two adjacent sub-claims into one.
 * - Delete: remove a sub-claim.
 * - Add: append a new blank sub-claim.
 * - Confirm: freeze the list as the audit's Worklist; blocks on empty list.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type { SubClaim, DomainTag, OriginalExtraction } from "./types.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CorrectionUICallbacks {
  /** Called when the user confirms the list; receives the frozen sub-claims. */
  onConfirm: (subClaims: SubClaim[]) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DOMAIN_TAGS: DomainTag[] = [
  "price",
  "fx",
  "date",
  "repo",
  "weather",
  "statistic",
  "arithmetic",
  "unrouted",
];

const EMPTY_LIST_MESSAGE =
  "The sub-claim list is empty. Add at least one sub-claim before confirming, " +
  "or go back and re-analyse the post.";

// ── ID generator ──────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `sc-${String(_idCounter).padStart(2, "0")}`;
}

/** Reset the counter (for testing) */
export function resetIdCounter(): void {
  _idCounter = 0;
}

// ── mountCorrectionUI ─────────────────────────────────────────────────────

/**
 * Renders the correction UI into `container`.
 * Returns a destroy function.
 */
export function mountCorrectionUI(
  container: HTMLElement,
  initialSubClaims: SubClaim[],
  originalText: string,
  callbacks: CorrectionUICallbacks,
): () => void {
  // Working copy — mutable until confirmed
  let subClaims: SubClaim[] = initialSubClaims.map((sc) => ({ ...sc }));

  // Root element
  const root = document.createElement("section");
  root.className = "correction-ui";
  root.setAttribute("aria-label", "Sub-claim review and correction");

  // Heading
  const heading = document.createElement("h2");
  heading.className = "correction-heading";
  heading.textContent = "Review sub-claims";
  root.appendChild(heading);

  // Original-text highlight zone
  const highlightZone = document.createElement("div");
  highlightZone.className = "correction-highlight-zone";
  highlightZone.setAttribute("aria-label", "Original post with highlighted span");
  root.appendChild(highlightZone);

  // Sub-claim cards list
  const cardList = document.createElement("ul");
  cardList.className = "correction-card-list";
  cardList.setAttribute("aria-label", "Sub-claim cards");
  root.appendChild(cardList);

  // Toolbar row
  const toolbar = document.createElement("div");
  toolbar.className = "correction-toolbar";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "＋ Add sub-claim";
  addBtn.className = "correction-btn correction-btn--add";
  addBtn.addEventListener("click", () => {
    const newSc: SubClaim = {
      id: nextId(),
      span: [0, 0],
      text: "",
      domain: "unrouted",
      statedValue: null,
      unit: null,
      entities: {},
      dateExpr: null,
      arithmeticOperands: null,
      unroutedReason: "Manually added",
      userEdited: true,
      originalExtraction: null,
    };
    subClaims = [...subClaims, newSc];
    render();
  });

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.textContent = "Confirm and start audit";
  confirmBtn.className = "correction-btn correction-btn--confirm";

  // Error banner
  const errorBanner = document.createElement("p");
  errorBanner.className = "correction-error";
  errorBanner.setAttribute("role", "alert");
  errorBanner.setAttribute("aria-live", "assertive");
  errorBanner.hidden = true;

  confirmBtn.addEventListener("click", () => {
    if (subClaims.length === 0) {
      errorBanner.textContent = EMPTY_LIST_MESSAGE;
      errorBanner.hidden = false;
      return;
    }
    errorBanner.hidden = true;
    callbacks.onConfirm(subClaims.map((sc) => ({ ...sc })));
  });

  toolbar.append(addBtn, confirmBtn);
  root.append(toolbar, errorBanner);

  container.appendChild(root);

  // ── Render helpers ──────────────────────────────────────────────────────

  function render(): void {
    cardList.innerHTML = "";
    errorBanner.hidden = true;
    for (let i = 0; i < subClaims.length; i++) {
      cardList.appendChild(buildCard(subClaims[i], i));
    }
  }

  function highlightSpan(sc: SubClaim): void {
    highlightZone.innerHTML = "";
    const [start, end] = sc.span;
    if (start === end || start < 0 || end > originalText.length) {
      const noSpan = document.createElement("em");
      noSpan.textContent = "(No span selected)";
      highlightZone.appendChild(noSpan);
      return;
    }
    const before = document.createTextNode(originalText.slice(0, start));
    const mark = document.createElement("mark");
    mark.className = "correction-span-mark";
    mark.textContent = originalText.slice(start, end);
    const after = document.createTextNode(originalText.slice(end));
    highlightZone.append(before, mark, after);
  }

  // ── Card builder ────────────────────────────────────────────────────────

  function buildCard(sc: SubClaim, idx: number): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "correction-card";
    li.setAttribute("data-id", sc.id);

    // Card header
    const header = document.createElement("div");
    header.className = "correction-card-header";

    const idBadge = document.createElement("span");
    idBadge.className = "correction-card-id";
    idBadge.textContent = sc.id;

    const domainBadge = document.createElement("span");
    domainBadge.className = `correction-card-domain correction-card-domain--${sc.domain}`;
    domainBadge.textContent = sc.domain;
    if (sc.userEdited) {
      domainBadge.title = "User-edited";
    }

    const editedFlag = document.createElement("span");
    editedFlag.className = "correction-card-edited-flag";
    editedFlag.hidden = !sc.userEdited;
    editedFlag.textContent = "✎ edited";

    header.append(idBadge, domainBadge, editedFlag);

    // Focus span highlight on hover / focus
    li.addEventListener("mouseenter", () => highlightSpan(sc));
    li.addEventListener("focusin", () => highlightSpan(sc));

    // Text display
    const textPara = document.createElement("p");
    textPara.className = "correction-card-text";
    textPara.textContent = sc.text || "(empty)";

    // Original extraction (shown when user-edited)
    let origSection: HTMLElement | null = null;
    if (sc.userEdited && sc.originalExtraction) {
      origSection = document.createElement("details");
      origSection.className = "correction-card-original";
      const summary = document.createElement("summary");
      summary.textContent = "Original extraction";
      const origText = document.createElement("p");
      origText.textContent = sc.originalExtraction.text;
      const origDomain = document.createElement("p");
      origDomain.textContent = `Domain: ${sc.originalExtraction.domain}`;
      origSection.append(summary, origText, origDomain);
    }

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "correction-card-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.className = "correction-btn correction-btn--edit";
    editBtn.setAttribute("aria-label", `Edit sub-claim ${sc.id}`);
    editBtn.addEventListener("click", () => openEditModal(sc, idx));

    const splitBtn = document.createElement("button");
    splitBtn.type = "button";
    splitBtn.textContent = "Split";
    splitBtn.className = "correction-btn correction-btn--split";
    splitBtn.setAttribute("aria-label", `Split sub-claim ${sc.id}`);
    splitBtn.addEventListener("click", () => openSplitModal(sc, idx));

    const mergeBtn = document.createElement("button");
    mergeBtn.type = "button";
    mergeBtn.textContent = "Merge ↓";
    mergeBtn.className = "correction-btn correction-btn--merge";
    mergeBtn.setAttribute(
      "aria-label",
      `Merge sub-claim ${sc.id} with next`,
    );
    mergeBtn.disabled = idx === subClaims.length - 1;
    mergeBtn.addEventListener("click", () => mergeWithNext(idx));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "correction-btn correction-btn--delete";
    deleteBtn.setAttribute("aria-label", `Delete sub-claim ${sc.id}`);
    deleteBtn.addEventListener("click", () => deleteSc(idx));

    actions.append(editBtn, splitBtn, mergeBtn, deleteBtn);

    li.append(header, textPara);
    if (origSection) li.appendChild(origSection);
    li.appendChild(actions);

    return li;
  }

  // ── Operations ──────────────────────────────────────────────────────────

  /** Edit a sub-claim (inline modal dialog). */
  function openEditModal(sc: SubClaim, idx: number): void {
    const overlay = createOverlay();

    const dialog = document.createElement("div");
    dialog.className = "correction-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", `Edit sub-claim ${sc.id}`);

    const title = document.createElement("h3");
    title.textContent = `Edit ${sc.id}`;

    // Text field
    const textLabel = makeLabel("Assertion text", "edit-text");
    const textArea = document.createElement("textarea");
    textArea.id = "edit-text";
    textArea.rows = 3;
    textArea.className = "correction-modal-textarea";
    textArea.value = sc.text;

    // Domain select
    const domainLabel = makeLabel("Domain tag", "edit-domain");
    const domainSelect = document.createElement("select");
    domainSelect.id = "edit-domain";
    domainSelect.className = "correction-modal-select";
    for (const tag of DOMAIN_TAGS) {
      const opt = document.createElement("option");
      opt.value = tag;
      opt.textContent = tag;
      opt.selected = tag === sc.domain;
      domainSelect.appendChild(opt);
    }

    // statedValue
    const valLabel = makeLabel("Stated value (number or blank)", "edit-val");
    const valInput = document.createElement("input");
    valInput.type = "text";
    valInput.id = "edit-val";
    valInput.className = "correction-modal-input";
    valInput.value = sc.statedValue !== null ? String(sc.statedValue) : "";

    // unit
    const unitLabel = makeLabel("Unit", "edit-unit");
    const unitInput = document.createElement("input");
    unitInput.type = "text";
    unitInput.id = "edit-unit";
    unitInput.className = "correction-modal-input";
    unitInput.value = sc.unit ?? "";

    // dateExpr
    const dateLabel = makeLabel("Date expression", "edit-date");
    const dateInput = document.createElement("input");
    dateInput.type = "text";
    dateInput.id = "edit-date";
    dateInput.className = "correction-modal-input";
    dateInput.value = sc.dateExpr ?? "";

    // Buttons
    const btnRow = document.createElement("div");
    btnRow.className = "correction-modal-btnrow";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.className = "correction-btn correction-btn--save";
    saveBtn.addEventListener("click", () => {
      const parsedVal = valInput.value.trim();
      const original: OriginalExtraction = sc.userEdited
        ? (sc.originalExtraction ?? snapshotOriginal(sc))
        : snapshotOriginal(sc);

      const updated: SubClaim = {
        ...sc,
        text: textArea.value,
        domain: domainSelect.value as DomainTag,
        statedValue:
          parsedVal === "" ? null : (parseFloat(parsedVal) || null),
        unit: unitInput.value.trim() || null,
        dateExpr: dateInput.value.trim() || null,
        userEdited: true,
        originalExtraction: original,
      };
      subClaims = subClaims.map((s, i) => (i === idx ? updated : s));
      document.body.removeChild(overlay);
      render();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "correction-btn correction-btn--cancel";
    cancelBtn.addEventListener("click", () => {
      document.body.removeChild(overlay);
    });

    btnRow.append(saveBtn, cancelBtn);
    dialog.append(
      title,
      textLabel,
      textArea,
      domainLabel,
      domainSelect,
      valLabel,
      valInput,
      unitLabel,
      unitInput,
      dateLabel,
      dateInput,
      btnRow,
    );
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    textArea.focus();
  }

  /** Split a sub-claim into two at a user-chosen split point. */
  function openSplitModal(sc: SubClaim, idx: number): void {
    const overlay = createOverlay();

    const dialog = document.createElement("div");
    dialog.className = "correction-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", `Split sub-claim ${sc.id}`);

    const title = document.createElement("h3");
    title.textContent = `Split ${sc.id}`;

    const instructions = document.createElement("p");
    instructions.textContent =
      "Enter the first part's text. The second part will contain the remainder.";

    const textLabel = makeLabel("First part text", "split-text");
    const textInput = document.createElement("textarea");
    textInput.id = "split-text";
    textInput.rows = 2;
    textInput.className = "correction-modal-textarea";
    textInput.value = sc.text;
    textInput.setAttribute(
      "aria-describedby",
      "split-instructions",
    );
    instructions.id = "split-instructions";

    const btnRow = document.createElement("div");
    btnRow.className = "correction-modal-btnrow";

    const splitConfirmBtn = document.createElement("button");
    splitConfirmBtn.type = "button";
    splitConfirmBtn.textContent = "Split";
    splitConfirmBtn.className = "correction-btn correction-btn--split";
    splitConfirmBtn.addEventListener("click", () => {
      const firstText = textInput.value.trim();
      const secondText = sc.text.startsWith(firstText)
        ? sc.text.slice(firstText.length).trim()
        : sc.text;

      const original: OriginalExtraction = sc.userEdited
        ? (sc.originalExtraction ?? snapshotOriginal(sc))
        : snapshotOriginal(sc);

      const first: SubClaim = {
        ...sc,
        text: firstText,
        userEdited: true,
        originalExtraction: original,
      };
      const second: SubClaim = {
        id: nextId(),
        span: sc.span,
        text: secondText,
        domain: sc.domain,
        statedValue: null,
        unit: null,
        entities: {},
        dateExpr: null,
        arithmeticOperands: null,
        unroutedReason:
          sc.domain === "unrouted"
            ? (sc.unroutedReason ?? "Split from another sub-claim")
            : null,
        userEdited: true,
        originalExtraction: original,
      };

      const next = [...subClaims];
      next.splice(idx, 1, first, second);
      subClaims = next;
      document.body.removeChild(overlay);
      render();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "correction-btn correction-btn--cancel";
    cancelBtn.addEventListener("click", () => {
      document.body.removeChild(overlay);
    });

    btnRow.append(splitConfirmBtn, cancelBtn);
    dialog.append(title, instructions, textLabel, textInput, btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    textInput.focus();
  }

  /** Merge the sub-claim at `idx` with the one at `idx+1`. */
  function mergeWithNext(idx: number): void {
    if (idx >= subClaims.length - 1) return;

    const a = subClaims[idx];
    const b = subClaims[idx + 1];

    const original: OriginalExtraction = a.userEdited
      ? (a.originalExtraction ?? snapshotOriginal(a))
      : snapshotOriginal(a);

    const merged: SubClaim = {
      ...a,
      text: `${a.text} ${b.text}`.trim(),
      span: [
        Math.min(a.span[0], b.span[0]),
        Math.max(a.span[1], b.span[1]),
      ],
      statedValue: a.statedValue ?? b.statedValue,
      unit: a.unit ?? b.unit,
      dateExpr: a.dateExpr ?? b.dateExpr,
      entities: { ...b.entities, ...a.entities },
      userEdited: true,
      originalExtraction: original,
    };

    const next = [...subClaims];
    next.splice(idx, 2, merged);
    subClaims = next;
    render();
  }

  /** Delete the sub-claim at `idx`. */
  function deleteSc(idx: number): void {
    subClaims = subClaims.filter((_, i) => i !== idx);
    render();
  }

  // ── Initial render ───────────────────────────────────────────────────────

  render();

  // Return destroy function
  return () => {
    container.removeChild(root);
  };
}

// ── Utility helpers ────────────────────────────────────────────────────────

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "correction-modal-overlay";
  overlay.setAttribute("aria-modal", "true");
  return overlay;
}

function makeLabel(text: string, forId: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.htmlFor = forId;
  label.textContent = text;
  label.className = "correction-modal-label";
  return label;
}

function snapshotOriginal(sc: SubClaim): OriginalExtraction {
  return {
    text: sc.text,
    span: sc.span,
    domain: sc.domain,
    statedValue: sc.statedValue,
    unit: sc.unit,
    entities: { ...sc.entities },
    dateExpr: sc.dateExpr,
  };
}
