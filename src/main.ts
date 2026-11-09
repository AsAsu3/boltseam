/**
 * Boltseam — application entry point.
 *
 * Wires the full intake pipeline:
 *   IntakeForm → DecompositionClient → ArithmeticExtractor →
 *   CorrectionUI → freezeWorklist → Router (hand-off)
 *
 * Runs in fixture mode by default (no API key required for judges).
 */

import { mountIntakeForm } from "./intake/intakeForm.ts";
import { DecompositionClient } from "./intake/decompositionClient.ts";
import { extractArithmetic } from "./intake/arithmeticExtractor.ts";
import { mountCorrectionUI } from "./intake/correctionUI.ts";
import { freezeWorklist } from "./intake/worklistEmitter.ts";

const app = document.getElementById("app");
if (!app) throw new Error("Root #app element not found");

const client = new DecompositionClient(); // uses FixtureProvider by default

mountIntakeForm(app, {
  onSubmit: async (result) => {
    // ── Step 1: show progress ───────────────────────────────────────────
    const statusEl = document.createElement("p");
    statusEl.className = "pipeline-status";
    statusEl.textContent = "Decomposing… (fixture mode)";
    app.appendChild(statusEl);

    // ── Step 2: decompose ──────────────────────────────────────────────
    const outcome = await client.decompose(result.trimmed);

    if (!outcome.ok) {
      statusEl.textContent = `⚠ ${outcome.message}`;
      return;
    }

    statusEl.textContent =
      `✓ ${outcome.subClaims.length} sub-claims extracted` +
      (outcome.source === "fixture" ? " [fixture mode]" : "");

    // ── Step 3: arithmetic extraction pass ─────────────────────────────
    const retagged = extractArithmetic(outcome.subClaims, result.original);

    // ── Step 4: correction UI ──────────────────────────────────────────
    const correctionContainer = document.createElement("div");
    correctionContainer.id = "correction-ui-root";
    app.appendChild(correctionContainer);

    let destroyUI: (() => void) | null = null;

    destroyUI = mountCorrectionUI(
      correctionContainer,
      retagged,
      result.original,
      {
        onConfirm: (confirmedSubClaims) => {
          // ── Step 5: freeze worklist (task 7 hand-off) ───────────────
          const worklist = freezeWorklist(confirmedSubClaims, result.original);

          // Tear down the correction UI
          if (destroyUI) {
            destroyUI();
            destroyUI = null;
          }

          // Show hand-off confirmation (router would take over here)
          const handoffEl = document.createElement("section");
          handoffEl.className = "handoff-confirmation";

          const hTitle = document.createElement("h2");
          hTitle.textContent = "Audit started";

          const meta = document.createElement("p");
          meta.textContent =
            `Audit ID: ${worklist.auditId} · ` +
            `${worklist.subClaims.length} sub-claim(s) · ` +
            `Confirmed at ${worklist.createdAt}`;

          const subList = document.createElement("ul");
          for (const sc of worklist.subClaims) {
            const li = document.createElement("li");
            li.textContent = `[${sc.id}] (${sc.domain}) ${sc.text.slice(0, 80)}`;
            subList.appendChild(li);
          }

          handoffEl.append(hTitle, meta, subList);
          app.appendChild(handoffEl);

          // In the full app the router receives the frozen worklist here:
          // router.dispatch(worklist, { onStatus: ... });
        },
      },
    );
  },
});
