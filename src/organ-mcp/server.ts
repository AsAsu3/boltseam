/**
 * organ-mcp — development-time MCP server.
 *
 * Exposes the implemented organs (market, fx, calendar, abacus, repo) as MCP
 * tools so that Kiro can call their verify() functions directly while building
 * and debugging. This is NOT part of the production runtime; it runs locally
 * via `npx tsx src/organ-mcp/server.ts`.
 *
 * MCP protocol: JSON-RPC 2.0 over stdio (stdin/stdout).
 *
 * Tools exposed:
 *   market_verify   — MarketOrgan.verify()
 *   fx_verify       — FxOrgan.verify()
 *   calendar_verify — CalendarOrgan.verify()
 *   abacus_verify   — AbacusOrgan.verify()
 *   repo_verify     — RepoOrgan.verify()
 *
 * Each tool accepts:
 *   subClaim   (object, required) — a SubClaim JSON object
 *   anchorDate (string, optional) — ISO-8601 date, defaults to today UTC
 *
 * Returns the EvidencePacket as a JSON string in the tool result content.
 *
 * Requirements: 2.1 (contract reuse — organs are called through the same
 * Organ interface used by the router)
 */

import { MarketOrgan } from "../organs/market/index.ts";
import { FxOrgan } from "../organs/fx/index.ts";
import { CalendarOrgan } from "../organs/calendar/index.ts";
import { AbacusOrgan } from "../organs/abacus/index.ts";
import { RepoOrgan } from "../organs/repo/index.ts";
import { SessionCache } from "../organs/contract/index.ts";
import type { Organ, EvidencePacket } from "../organs/contract/index.ts";
import type { SubClaim } from "../intake/types.ts";

// ── Organ registry ─────────────────────────────────────────────────────────

const ORGANS: Record<string, Organ> = {
  market: new MarketOrgan(),
  fx: new FxOrgan(),
  calendar: new CalendarOrgan(),
  abacus: new AbacusOrgan(),
  repo: new RepoOrgan(),
};

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "market_verify",
    description:
      "Run the Market Organ (Kraken primary, Binance cross-check) on a price sub-claim. " +
      "Returns an EvidencePacket with the verdict, claimed/observed values, and provenance.",
    inputSchema: {
      type: "object",
      properties: {
        subClaim: {
          type: "object",
          description: "A SubClaim JSON object with domain='price'.",
        },
        anchorDate: {
          type: "string",
          description: "UTC ISO-8601 date string (e.g. '2024-10-15T00:00:00Z'). Defaults to today.",
        },
      },
      required: ["subClaim"],
    },
  },
  {
    name: "fx_verify",
    description:
      "Run the FX Organ (Frankfurter primary, open.er-api.com fallback) on an fx sub-claim. " +
      "Returns an EvidencePacket with the verdict and provenance.",
    inputSchema: {
      type: "object",
      properties: {
        subClaim: {
          type: "object",
          description: "A SubClaim JSON object with domain='fx'.",
        },
        anchorDate: {
          type: "string",
          description: "UTC ISO-8601 date string. Defaults to today.",
        },
      },
      required: ["subClaim"],
    },
  },
  {
    name: "calendar_verify",
    description:
      "Run the Calendar Organ (local arithmetic + Nager.Date) on a date sub-claim. " +
      "Returns an EvidencePacket with the verdict and resolved dates.",
    inputSchema: {
      type: "object",
      properties: {
        subClaim: {
          type: "object",
          description: "A SubClaim JSON object with domain='date'.",
        },
        anchorDate: {
          type: "string",
          description: "UTC ISO-8601 date string. Defaults to today.",
        },
      },
      required: ["subClaim"],
    },
  },
  {
    name: "abacus_verify",
    description:
      "Run Abacus (deterministic arithmetic recomputation) on an arithmetic sub-claim. " +
      "No network calls. Returns an EvidencePacket with step-by-step working in rawExcerpt.",
    inputSchema: {
      type: "object",
      properties: {
        subClaim: {
          type: "object",
          description: "A SubClaim JSON object with domain='arithmetic' and arithmeticOperands set.",
        },
        anchorDate: {
          type: "string",
          description: "UTC ISO-8601 date string. Defaults to today (not used by Abacus).",
        },
      },
      required: ["subClaim"],
    },
  },
  {
    name: "repo_verify",
    description:
      "Run the Repo Organ (GitHub REST API) on a repository sub-claim. " +
      "Verifies existence, star count, fork count, creation date, language, and archived status. " +
      "Returns an EvidencePacket. Growth/history claims return unverifiable/no_star_history by design.",
    inputSchema: {
      type: "object",
      properties: {
        subClaim: {
          type: "object",
          description:
            "A SubClaim JSON object with domain='repo'. " +
            "entities.repo should be 'owner/repo'. " +
            "entities.claimType should be one of: 'existence', 'stars', 'forks', 'created', 'language', 'archived', 'star_history'.",
        },
        anchorDate: {
          type: "string",
          description: "UTC ISO-8601 date string. Defaults to today.",
        },
      },
      required: ["subClaim"],
    },
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function todayAnchor(): string {
  return new Date().toISOString().slice(0, 10) + "T00:00:00Z";
}

/** Call the organ identified by tool name and return an EvidencePacket. */
async function callOrgan(
  toolName: string,
  subClaim: SubClaim,
  anchorDate: string,
): Promise<EvidencePacket> {
  const organKey = toolName.replace("_verify", "");
  const organ = ORGANS[organKey];
  if (organ === undefined) {
    throw new Error(`Unknown organ: ${organKey}`);
  }

  const cache = new SessionCache();
  const controller = new AbortController();
  // 30-second timeout for MCP tool calls (generous — dev-time only)
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    return await organ.verify(subClaim, {
      anchorDate,
      cache,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── MCP JSON-RPC message types ─────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function respond(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

// ── MCP method handlers ────────────────────────────────────────────────────

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { method, id, params } = req;

  if (method === "initialize") {
    return respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "organ-mcp", version: "0.1.0" },
    });
  }

  if (method === "notifications/initialized") {
    // Notification — no response needed (handled by returning void, caller skips)
    return respond(id, null);
  }

  if (method === "tools/list") {
    return respond(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const p = params as {
      name?: string;
      arguments?: { subClaim?: unknown; anchorDate?: unknown };
    };
    const toolName = p?.name ?? "";
    const args = p?.arguments ?? {};

    if (!TOOLS.some((t) => t.name === toolName)) {
      return errorResponse(id, -32601, `Unknown tool: ${toolName}`);
    }

    const subClaim = args.subClaim as SubClaim | undefined;
    if (!subClaim || typeof subClaim !== "object") {
      return errorResponse(id, -32602, "subClaim parameter is required and must be an object");
    }

    const anchorDate =
      typeof args.anchorDate === "string" ? args.anchorDate : todayAnchor();

    try {
      const packet = await callOrgan(toolName, subClaim, anchorDate);
      return respond(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(packet, null, 2),
          },
        ],
      });
    } catch (err) {
      return errorResponse(
        id,
        -32000,
        "Organ call failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ping, resources/list, prompts/list, etc. — return empty/not-found
  if (method === "ping") {
    return respond(id, {});
  }

  return errorResponse(id, -32601, `Method not found: ${method}`);
}

// ── Stdio transport ────────────────────────────────────────────────────────

let inputBuffer = "";

process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk: string) => {
  inputBuffer += chunk;
  // MCP messages are newline-delimited JSON
  const lines = inputBuffer.split("\n");
  // Keep the last (possibly incomplete) fragment
  inputBuffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      // Malformed JSON — send parse error
      const errMsg = JSON.stringify(
        errorResponse(null, -32700, "Parse error"),
      );
      process.stdout.write(errMsg + "\n");
      continue;
    }

    // Handle notification methods (no id or null id means no response expected)
    const isNotification = req.id === undefined || req.id === null;

    handleRequest(req)
      .then((response) => {
        // Don't respond to pure notifications
        if (isNotification && req.method.startsWith("notifications/")) return;
        process.stdout.write(JSON.stringify(response) + "\n");
      })
      .catch((err) => {
        const errMsg = JSON.stringify(
          errorResponse(
            req.id ?? null,
            -32603,
            "Internal error",
            err instanceof Error ? err.message : String(err),
          ),
        );
        process.stdout.write(errMsg + "\n");
      });
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});

// Suppress unhandled rejections from abort signals in organ calls
process.on("unhandledRejection", () => undefined);
