import { Type } from "typebox";

import { executeShellCommand, validateCheckoutPath, validateShellCommand } from "./shell-policy.ts";

const ACTIVE_TOOLS = new Set([
  "read",
  "grep",
  "glob",
  "find",
  "ls",
  "review_shell",
  "submit_review",
]);
export const REVIEW_PHASE_EVENT = "omp-reviewer:phase";

export type ReviewGuardPhase = "exploring" | "soft_finalizing" | "hard_finalizing";

type GuardApi = {
  registerTool(tool: {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    execute: (
      toolCallId: string,
      params: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<unknown>;
  }): void;
  on(
    event: string,
    handler: (
      payload: { toolName?: string; name?: string } & Record<string, unknown>,
      ctx: { cwd: string },
    ) => unknown,
  ): void;
  events?: { on(event: string, handler: (value: unknown) => void): () => void };
};

export default function reviewGuard(pi: GuardApi): void {
  const reviewPhase = listenForReviewPhase(pi.events);
  pi.on("session_shutdown", () => {
    reviewPhase.dispose();
  });
  registerReviewShell(pi);
  registerSubmitReview(pi);
  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName ?? event.name ?? "";
    const unavailable = toolUnavailableReason(toolName, reviewPhase.current());
    if (unavailable !== undefined) return { block: true, reason: unavailable };
    const inputPath = toolPath(event);
    if (inputPath === undefined) return;
    try {
      await validateCheckoutPath(inputPath, ctx.cwd);
      return undefined;
    } catch (error) {
      return { block: true, reason: error instanceof Error ? error.message : String(error) };
    }
  });
}

function registerReviewShell(pi: GuardApi): void {
  pi.registerTool({
    name: "review_shell",
    label: "Review shell",
    description: "Run one guarded read-only repository inspection command",
    parameters: Type.Object({
      command: Type.String({ description: "One read-only command without shell operators" }),
    }),
    execute: async (_toolCallId, params, signal) => {
      const cwd = process.cwd();
      const command = await validateShellCommand(shellCommand(params["command"]), cwd);
      const result = await executeShellCommand(command, cwd, signal);
      return {
        content: [
          {
            type: "text",
            text: result.output === "" ? `(exit ${String(result.exitCode)})` : result.output,
          },
        ],
        details: result,
      };
    },
  });
}

function registerSubmitReview(pi: GuardApi): void {
  pi.registerTool({
    name: "submit_review",
    label: "Submit review",
    description:
      "Submit the final code review in the required machine-readable schema and end the review. Each title, including its [P0] through [P3] prefix, must be at most 80 characters. Use this exactly once as the final action.",
    parameters: Type.Object({
      findings: Type.Array(
        Type.Object({
          title: Type.String(),
          body: Type.String(),
          confidence_score: Type.Number(),
          priority: Type.Integer(),
          code_location: Type.Object({
            absolute_file_path: Type.String(),
            line_range: Type.Object({
              start: Type.Integer(),
              end: Type.Integer(),
            }),
          }),
        }),
      ),
      overall_correctness: Type.String(),
      overall_explanation: Type.String(),
      overall_confidence_score: Type.Number(),
    }),
    execute: () =>
      Promise.resolve({
        content: [{ type: "text", text: "Final review submitted." }],
        terminate: true,
      }),
  });
}

export function listenForReviewPhase(events: GuardApi["events"]): {
  readonly current: () => ReviewGuardPhase;
  readonly dispose: () => void;
} {
  let phase: ReviewGuardPhase = "exploring";
  const dispose =
    events?.on(REVIEW_PHASE_EVENT, (value) => {
      if (isReviewGuardPhase(value)) phase = value;
    }) ?? (() => undefined);
  return { current: () => phase, dispose };
}

export function toolUnavailableReason(
  toolName: string,
  phase: ReviewGuardPhase,
): string | undefined {
  if (!ACTIVE_TOOLS.has(toolName)) {
    return `Tool ${toolName} is unavailable in read-only review mode`;
  }
  if (phase !== "exploring" && toolName !== "submit_review") {
    return `Tool ${toolName} is unavailable during review finalization`;
  }
  return undefined;
}

function isReviewGuardPhase(value: unknown): value is ReviewGuardPhase {
  return value === "exploring" || value === "soft_finalizing" || value === "hard_finalizing";
}

function toolPath(event: Record<string, unknown>): string | undefined {
  const input = firstDefined(event, ["input", "arguments", "args"]);
  if (typeof input === "string") return input;
  if (!isRecord(input)) return undefined;
  const path = firstDefined(input, ["path", "file", "absolute_file_path"]);
  return typeof path === "string" ? path : undefined;
}

function shellCommand(value: unknown): string {
  if (typeof value !== "string") throw new Error("review_shell command must be a string");
  return value;
}

function firstDefined(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
