import { parseReviewOutput } from "./review-output.js";
import { MAX_FINDING_TITLE_CHARACTERS } from "./types.js";

export type ReviewSubmissionNormalization = {
  readonly titleTruncationCount: number;
  readonly priorityInferenceCount: number;
};

type PreparedReviewSubmission = {
  readonly value: unknown;
  readonly normalization: ReviewSubmissionNormalization;
};

type MutableReviewSubmissionNormalization = {
  titleTruncationCount: number;
  priorityInferenceCount: number;
};

export type ReviewSubmission = {
  readonly findings: {
    readonly title: string;
    readonly body: string;
    readonly confidence_score: number;
    readonly priority: number;
    readonly code_location: {
      readonly absolute_file_path: string;
      readonly line_range: { readonly start: number; readonly end: number };
    };
  }[];
  readonly overall_correctness: "patch is correct" | "patch is incorrect";
  readonly overall_explanation: string;
  readonly overall_confidence_score: number;
};

export function prepareReviewSubmission(value: unknown): PreparedReviewSubmission {
  const prepared: unknown = structuredClone(value);
  const normalization = { titleTruncationCount: 0, priorityInferenceCount: 0 };
  if (!isRecord(prepared)) return { value: prepared, normalization };
  delete prepared["i"];
  if (!Array.isArray(prepared["findings"])) {
    return { value: prepared, normalization };
  }
  coerceConfidence(prepared, "overall_confidence_score");
  for (const finding of prepared["findings"]) prepareFinding(finding, normalization);
  return { value: prepared, normalization };
}

export class ReviewSubmissionGate {
  private acceptedValue: ReviewSubmission | undefined;
  private resolveAcceptance: (submission: ReviewSubmission) => void = () => undefined;
  readonly accepted: Promise<ReviewSubmission>;

  constructor(private readonly cwd: string) {
    this.accepted = new Promise<ReviewSubmission>((resolve) => {
      this.resolveAcceptance = resolve;
    });
  }

  get submission(): ReviewSubmission | undefined {
    return this.acceptedValue;
  }

  get acceptedCallCount(): number {
    return this.acceptedValue === undefined ? 0 : 1;
  }

  accept(value: unknown): ReviewSubmission {
    if (this.acceptedValue !== undefined) throw new Error("submit_review may be called only once");
    const prepared = prepareReviewSubmission(value).value;
    const parsed = parseReviewOutput(JSON.stringify(prepared), this.cwd);
    const normalized: ReviewSubmission = {
      findings: parsed.findings.map((entry) => ({
        title: entry.title,
        body: entry.body,
        confidence_score: entry.confidenceScore,
        priority: entry.priority,
        code_location: {
          absolute_file_path: entry.codeLocation.absoluteFilePath,
          line_range: {
            start: entry.codeLocation.lineRange.start,
            end: entry.codeLocation.lineRange.end,
          },
        },
      })),
      overall_correctness: parsed.overallCorrectness,
      overall_explanation: parsed.overallExplanation,
      overall_confidence_score: parsed.overallConfidenceScore,
    };
    this.acceptedValue = normalized;
    this.resolveAcceptance(normalized);
    return normalized;
  }
}

function prepareFinding(value: unknown, normalization: MutableReviewSubmissionNormalization): void {
  if (!isRecord(value)) return;
  coerceConfidence(value, "confidence_score");
  coerceInteger(value, "priority");
  const location = value["code_location"];
  if (isRecord(location) && isRecord(location["line_range"])) {
    coerceInteger(location["line_range"], "start");
    coerceInteger(location["line_range"], "end");
  }
  if (typeof value["title"] !== "string") return;
  const title = value["title"];
  inferMissingPriority(value, title, normalization);
  const characters = Array.from(title);
  if (characters.length <= MAX_FINDING_TITLE_CHARACTERS) return;
  value["title"] = `${characters.slice(0, MAX_FINDING_TITLE_CHARACTERS - 1).join("")}…`;
  normalization.titleTruncationCount += 1;
}

function inferMissingPriority(
  finding: Record<string, unknown>,
  title: string,
  normalization: MutableReviewSubmissionNormalization,
): void {
  if (finding["priority"] !== undefined && finding["priority"] !== null) return;
  const titlePriority = /^\[P([0-3])\]\s/u.exec(title);
  if (titlePriority === null) {
    throw new Error("finding priority is required when the title has no [P0] through [P3] prefix");
  }
  finding["priority"] = Number(titlePriority[1]);
  normalization.priorityInferenceCount += 1;
}

function coerceConfidence(record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (typeof value !== "string") return;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) record[key] = parsed;
}

function coerceInteger(record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (typeof value !== "string") return;
  const parsed = Number(value);
  if (Number.isInteger(parsed)) record[key] = parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
