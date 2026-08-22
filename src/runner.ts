import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ReviewerApp } from "./app.js";
import { formatModelFlag } from "./app.js";
import { resolveOmpCommand } from "./omp-command.js";
import {
  acceptSubmitReviewFromEvents,
  accumulateMetrics,
  type OmpRunMetrics,
} from "./omp-events.js";
import { writeJsonReceipt } from "./receipts.js";
import {
  formatOmpMaxTime,
  resolveReviewTimePolicy,
  withBudgetNotice,
  workerWatchdogTimeoutMs,
  type ReviewTimePolicy,
} from "./review-budget.js";
import { parseReviewOutput } from "./review-output.js";
import type { ModelSelection, ReviewOutput, TimeWarning } from "./types.js";

const MAX_STDERR_BYTES = 128 * 1024;
const FINALIZATION_PROMPT =
  "Submit the final review now with submit_review. Do not call any other tool. Do not write the review as prose.";

export type RunReviewInput = {
  readonly app: ReviewerApp;
  readonly selection: ModelSelection;
  readonly cwd: string;
  readonly prompt: string;
  readonly persistSession?: boolean;
  readonly sessionDir?: string;
  readonly sessionReceipt?: string;
  readonly lifecycleReceipt?: string;
  readonly timeBudgetMs?: number;
  readonly timeWarnings?: readonly TimeWarning[];
  readonly finalizationGraceMs?: number;
  readonly hardFinalizationGraceMs?: number;
  readonly stderr?: NodeJS.WritableStream;
  readonly onMetrics?: (metrics: OmpRunMetrics) => void;
  readonly ompCommand?: string;
  readonly env?: NodeJS.ProcessEnv;
};

export async function runReview(input: RunReviewInput): Promise<ReviewOutput> {
  const policy = resolveReviewTimePolicy(
    input.timeBudgetMs,
    input.timeWarnings,
    input.finalizationGraceMs,
    input.hardFinalizationGraceMs,
  );
  const omp = input.ompCommand ?? (await resolveOmpCommand(input.env));
  const systemPrompt = await readFile(input.app.systemPromptPath, "utf8");
  const persistSession = input.persistSession ?? true;
  const sessionDir = input.sessionDir ?? input.app.defaultSessionDir;
  const printBase = printInput(omp, input);
  const explore = await runOmpPrint({
    ...printBase,
    timeoutMs: workerWatchdogTimeoutMs(policy),
    args: exploreArgs(input, systemPrompt, persistSession, sessionDir, policy),
  });
  let submission = acceptSubmitReviewFromEvents(explore.events, input.cwd);
  if (submission === undefined && persistSession) {
    const finalize = await runOmpPrint({
      ...printBase,
      timeoutMs: policy.finalizationGraceMs + 30_000,
      args: finalizeArgs(input, persistSession, sessionDir, policy),
    });
    submission = acceptSubmitReviewFromEvents(finalize.events, input.cwd);
  }
  if (submission === undefined) throw new Error("review completed without submit_review");
  await writeReceipts(input, sessionDir, persistSession, submission.overall_correctness);
  return parseReviewOutput(JSON.stringify(submission), input.cwd);
}

function exploreArgs(
  input: RunReviewInput,
  systemPrompt: string,
  persistSession: boolean,
  sessionDir: string,
  policy: ReviewTimePolicy,
): string[] {
  return [
    ...baseOmpArgs(input, persistSession, sessionDir),
    "--max-time",
    formatOmpMaxTime(policy.timeBudgetMs),
    "--system-prompt",
    systemPrompt,
    withBudgetNotice(input.prompt, policy),
  ];
}

function finalizeArgs(
  input: RunReviewInput,
  persistSession: boolean,
  sessionDir: string,
  policy: ReviewTimePolicy,
): string[] {
  return [
    ...baseOmpArgs(input, persistSession, sessionDir),
    "--continue",
    "--max-time",
    formatOmpMaxTime(policy.finalizationGraceMs),
    FINALIZATION_PROMPT,
  ];
}

function baseOmpArgs(input: RunReviewInput, persistSession: boolean, sessionDir: string): string[] {
  const args = [
    "-p",
    "--mode",
    "json",
    "--auto-approve",
    "--no-extensions",
    "--no-skills",
    "--no-rules",
    "--extension",
    input.app.extensionPath,
    "--tools",
    "read,grep,glob",
    "--cwd",
    input.cwd,
    "--thinking",
    input.selection.thinking,
    "--model",
    formatModelFlag(input.selection.provider, input.selection.model),
  ];
  if (persistSession) args.push("--session-dir", sessionDir);
  else args.push("--no-session");
  return args;
}

type OmpPrintResult = { readonly events: unknown[]; readonly metrics: OmpRunMetrics };

function printInput(
  omp: string,
  input: RunReviewInput,
): Pick<Parameters<typeof runOmpPrint>[0], "omp" | "cwd" | "env" | "stderr" | "onMetrics"> {
  return {
    omp,
    cwd: input.cwd,
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.stderr === undefined ? {} : { stderr: input.stderr }),
    ...(input.onMetrics === undefined ? {} : { onMetrics: input.onMetrics }),
  };
}

async function runOmpPrint(input: {
  readonly omp: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stderr?: NodeJS.WritableStream;
  readonly onMetrics?: (metrics: OmpRunMetrics) => void;
  readonly timeoutMs: number;
}): Promise<OmpPrintResult> {
  const child = spawn(input.omp, [...input.args], {
    cwd: input.cwd,
    env: input.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return await collectChild(child, input);
}

async function collectChild(
  child: ChildProcessByStdio<null, Readable, Readable>,
  input: {
    readonly stderr?: NodeJS.WritableStream;
    readonly onMetrics?: (metrics: OmpRunMetrics) => void;
    readonly timeoutMs: number;
  },
): Promise<OmpPrintResult> {
  const events: unknown[] = [];
  let metrics: OmpRunMetrics = {};
  let stderrBytes = 0;
  const lines = createJsonLineParser();
  const timer = setTimeout(() => child.kill("SIGTERM"), input.timeoutMs);
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (chunk: Buffer) => {
        for (const event of lines.push(chunk.toString("utf8"))) {
          events.push(event);
          metrics = accumulateMetrics(metrics, event);
          input.onMetrics?.(metrics);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes <= MAX_STDERR_BYTES) input.stderr?.write(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0 || events.length > 0) resolve();
        else reject(new Error(`omp review worker exited ${String(code ?? 1)}`));
      });
    });
    return { events, metrics };
  } finally {
    clearTimeout(timer);
  }
}

function createJsonLineParser(): { push(chunk: string): unknown[] } {
  let pending = "";
  return {
    push(chunk: string): unknown[] {
      const combined = `${pending}${chunk}`;
      const parts = combined.split("\n");
      pending = parts.pop() ?? "";
      return parts.flatMap(parseJsonLine);
    },
  };
}

function parseJsonLine(line: string): unknown[] {
  const trimmed = line.trim();
  if (trimmed === "") return [];
  try {
    return [JSON.parse(trimmed)];
  } catch {
    return [];
  }
}

async function writeReceipts(
  input: RunReviewInput,
  sessionDir: string,
  persistSession: boolean,
  outcome: string,
): Promise<void> {
  await writeJsonReceipt(
    input.sessionReceipt,
    persistSession
      ? { version: 1, sessionDir: path.resolve(sessionDir) }
      : { version: 1, sessionDir: null },
  );
  await writeJsonReceipt(input.lifecycleReceipt, {
    schema: "omp-reviewer.lifecycle.v1",
    outcome,
    persistSession,
    sessionDir: persistSession ? path.resolve(sessionDir) : null,
    model: formatModelFlag(input.selection.provider, input.selection.model),
  });
}
