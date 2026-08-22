import { ReviewSubmissionGate, type ReviewSubmission } from "./submit-review.js";

export type OmpRunMetrics = {
  readonly provider?: string;
  readonly model?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
};

export function extractSubmitReview(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = extractSubmitReview(entry);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (isSubmitReviewCall(value)) return argumentsOf(value);
  for (const entry of Object.values(value)) {
    const found = extractSubmitReview(entry);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function acceptSubmitReviewFromEvents(
  events: readonly unknown[],
  cwd: string,
): ReviewSubmission | undefined {
  const gate = new ReviewSubmissionGate(cwd);
  for (const event of events) {
    const args = extractSubmitReview(event);
    if (args === undefined) continue;
    return gate.accept(args);
  }
  return undefined;
}

export function accumulateMetrics(current: OmpRunMetrics, event: unknown): OmpRunMetrics {
  if (!isRecord(event)) return current;
  const usage = usageFrom(event);
  return {
    ...optional("provider", stringField(event, "provider") ?? current.provider),
    ...optional("model", stringField(event, "model") ?? current.model),
    ...optional("inputTokens", add(current.inputTokens, usage?.input)),
    ...optional("outputTokens", add(current.outputTokens, usage?.output)),
  };
}

function isSubmitReviewCall(value: Record<string, unknown>): boolean {
  const name = value["name"] ?? value["toolName"] ?? value["tool"];
  return name === "submit_review";
}

function argumentsOf(value: Record<string, unknown>): unknown {
  return value["arguments"] ?? value["args"] ?? value["input"] ?? value["params"];
}

function usageFrom(
  event: Record<string, unknown>,
): { input?: number; output?: number } | undefined {
  const usage = event["usage"];
  if (!isRecord(usage)) return undefined;
  return {
    ...optional("input", numberField(usage, "input") ?? numberField(usage, "inputTokens")),
    ...optional("output", numberField(usage, "output") ?? numberField(usage, "outputTokens")),
  };
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function add(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left + right;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
