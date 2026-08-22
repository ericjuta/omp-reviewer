import path from "node:path";

import { findPackageRoot } from "./package-root.js";

export type ReviewerApp = {
  readonly packageRoot: string;
  readonly extensionPath: string;
  readonly systemPromptPath: string;
  readonly defaultSessionDir: string;
};

export async function loadReviewerApp(packageRoot?: string): Promise<ReviewerApp> {
  const root = packageRoot ?? (await findPackageRoot());
  return {
    packageRoot: root,
    extensionPath: path.join(root, "reviewer", "extensions", "review-guard.ts"),
    systemPromptPath: path.join(root, "reviewer", "prompts", "review-system.md"),
    defaultSessionDir: defaultSessionDir(),
  };
}

export function defaultSessionDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = nonempty(env["HOME"]) ?? nonempty(process.env["HOME"]) ?? "";
  const state = nonempty(env["XDG_STATE_HOME"]) ?? path.join(home, ".local", "state");
  return path.join(state, "omp-reviewer", "sessions");
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

export function formatModelFlag(provider: string, model: string): string {
  return `${provider}/${model}`;
}
