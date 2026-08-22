import { describe, expect, it } from "vitest";

import {
  acceptSubmitReviewFromEvents,
  accumulateMetrics,
  extractSubmitReview,
} from "../src/omp-events.js";

const REVIEW = {
  findings: [],
  overall_correctness: "patch is correct",
  overall_explanation: "No defect.",
  overall_confidence_score: 0.8,
};

describe("omp event extraction", () => {
  it("finds nested submit_review arguments", () => {
    expect(
      extractSubmitReview({
        type: "tool_call",
        toolName: "submit_review",
        arguments: REVIEW,
      }),
    ).toEqual(REVIEW);
  });

  it("accepts the first valid review from a stream", () => {
    const submission = acceptSubmitReviewFromEvents(
      [{ type: "message_start" }, { name: "submit_review", args: REVIEW }],
      "/repo",
    );
    expect(submission?.overall_correctness).toBe("patch is correct");
  });

  it("walks arrays and ignores events without submit_review", () => {
    expect(
      extractSubmitReview([{ type: "message_start" }, { name: "submit_review", input: REVIEW }]),
    ).toEqual(REVIEW);
    expect(acceptSubmitReviewFromEvents([{ type: "message_start" }], "/repo")).toBeUndefined();
    expect(extractSubmitReview("ignore")).toBeUndefined();
  });

  it("accumulates provider, model, and token usage", () => {
    const first = accumulateMetrics(
      {},
      { provider: "openai", model: "gpt-review", usage: { input: 10, outputTokens: 4 } },
    );
    const second = accumulateMetrics(first, { usage: { inputTokens: 3, output: 2 } });
    expect(second).toEqual({
      provider: "openai",
      model: "gpt-review",
      inputTokens: 13,
      outputTokens: 6,
    });
    expect(accumulateMetrics(second, "ignore")).toEqual(second);
  });
});
