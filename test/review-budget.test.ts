import { describe, expect, it } from "vitest";

import {
  formatOmpMaxTime,
  resolveReviewTimePolicy,
  withBudgetNotice,
  workerWatchdogTimeoutMs,
} from "../src/review-budget.js";

describe("review time policy", () => {
  it("gives exploration, soft finalization, and hard finalization separate budgets", () => {
    const policy = resolveReviewTimePolicy(
      30 * 60_000,
      [
        { kind: "percentage", percentage: 50 },
        { kind: "duration", milliseconds: 10 * 60_000 },
      ],
      10 * 60_000,
      2 * 60_000,
    );
    expect(policy).toEqual({
      timeBudgetMs: 30 * 60_000,
      warningRemainingMs: [15 * 60_000, 10 * 60_000],
      finalizationGraceMs: 10 * 60_000,
      hardFinalizationGraceMs: 2 * 60_000,
    });
    const defaults = resolveReviewTimePolicy();
    expect(defaults).toEqual({
      timeBudgetMs: 10 * 60_000,
      warningRemainingMs: [5 * 60_000, 150_000],
      finalizationGraceMs: 2 * 60_000,
      hardFinalizationGraceMs: 2 * 60_000,
    });
    expect(workerWatchdogTimeoutMs(defaults)).toBe(17 * 60_000);
    expect(formatOmpMaxTime(defaults.timeBudgetMs)).toBe("10m");
    expect(formatOmpMaxTime(3_600_000)).toBe("1h");
    expect(formatOmpMaxTime(1_500)).toBe("1500ms");
  });

  it("rejects duplicate and invalid phase budgets", () => {
    expect(() =>
      resolveReviewTimePolicy(60_000, [
        { kind: "percentage", percentage: 50 },
        { kind: "duration", milliseconds: 30_000 },
      ]),
    ).toThrow("unique");
    expect(() => resolveReviewTimePolicy(60_000, [], 2_000, 999)).toThrow(
      "hard finalization grace",
    );
  });

  it("describes exploration and one resume finalization in the prompt", () => {
    const prompt = withBudgetNotice("Review", resolveReviewTimePolicy());
    expect(prompt).toContain("10m for investigation");
    expect(prompt).toContain("submit_review-only prompt for up to 2m");
  });
});
