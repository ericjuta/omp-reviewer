import type { TimeWarning } from "./types.js";

export const DEFAULT_TIME_BUDGET_MS = 10 * 60_000;
export const DEFAULT_FINALIZATION_GRACE_MS = 2 * 60_000;
export const DEFAULT_HARD_FINALIZATION_GRACE_MS = 2 * 60_000;
export const REVIEW_QUIESCENCE_ALLOWANCE_MS = 60_000;
export const HARD_CANCELLATION_ALLOWANCE_MS = 30_000;
export const WORKER_SHUTDOWN_ALLOWANCE_MS = 30_000;
const DEFAULT_WARNING_PERCENTAGES = [50, 25] as const;

export type ReviewTimePolicy = {
  readonly timeBudgetMs: number;
  readonly warningRemainingMs: readonly number[];
  readonly finalizationGraceMs: number;
  readonly hardFinalizationGraceMs: number;
};

export function resolveReviewTimePolicy(
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  warnings?: readonly TimeWarning[],
  finalizationGraceMs = DEFAULT_FINALIZATION_GRACE_MS,
  hardFinalizationGraceMs = DEFAULT_HARD_FINALIZATION_GRACE_MS,
): ReviewTimePolicy {
  validatePolicyDuration(timeBudgetMs, "time budget");
  validatePolicyDuration(finalizationGraceMs, "finalization grace");
  validatePolicyDuration(hardFinalizationGraceMs, "hard finalization grace");
  const selectedWarnings =
    warnings ??
    DEFAULT_WARNING_PERCENTAGES.map((percentage) => ({
      kind: "percentage" as const,
      percentage,
    }));
  const remaining = selectedWarnings.map((warning) => remainingMs(warning, timeBudgetMs));
  if (new Set(remaining).size !== remaining.length) throw new Error("time warnings must be unique");
  return {
    timeBudgetMs,
    warningRemainingMs: [...remaining].sort((left, right) => right - left),
    finalizationGraceMs,
    hardFinalizationGraceMs,
  };
}

function remainingMs(warning: TimeWarning, timeBudgetMs: number): number {
  const value =
    warning.kind === "duration"
      ? warning.milliseconds
      : Math.round((timeBudgetMs * warning.percentage) / 100);
  if (!Number.isSafeInteger(value) || value <= 0 || value >= timeBudgetMs) {
    throw new Error("time warnings must occur after review start and before the time budget ends");
  }
  return value;
}

export function workerWatchdogTimeoutMs(policy: ReviewTimePolicy): number {
  return (
    policy.timeBudgetMs +
    REVIEW_QUIESCENCE_ALLOWANCE_MS +
    policy.finalizationGraceMs +
    REVIEW_QUIESCENCE_ALLOWANCE_MS +
    policy.hardFinalizationGraceMs +
    HARD_CANCELLATION_ALLOWANCE_MS +
    WORKER_SHUTDOWN_ALLOWANCE_MS
  );
}

export function withBudgetNotice(prompt: string, policy: ReviewTimePolicy): string {
  return `${prompt}\n\nReview time budget: ${formatDuration(policy.timeBudgetMs)} for investigation. If you have not submitted by then, the same OMP session resumes with a submit_review-only prompt for up to ${formatDuration(policy.finalizationGraceMs)}. Submit early when further investigation is unlikely to change the result.`;
}

export function formatOmpMaxTime(milliseconds: number): string {
  return formatDuration(milliseconds);
}

function validatePolicyDuration(milliseconds: number, label: string): void {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1_000 || milliseconds > 86_400_000) {
    throw new Error(`${label} must be between 1s and 24h`);
  }
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds % 3_600_000 === 0) return `${String(milliseconds / 3_600_000)}h`;
  if (milliseconds % 60_000 === 0) return `${String(milliseconds / 60_000)}m`;
  if (milliseconds % 1_000 === 0) return `${String(milliseconds / 1_000)}s`;
  return `${String(milliseconds)}ms`;
}
