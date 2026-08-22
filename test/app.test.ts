import path from "node:path";

import { describe, expect, it } from "vitest";

import { defaultSessionDir, formatModelFlag, loadReviewerApp } from "../src/app.js";

describe("reviewer app", () => {
  it("resolves package reviewer assets and the default session directory", async () => {
    const app = await loadReviewerApp();
    expect(app.extensionPath).toBe(
      path.join(app.packageRoot, "reviewer", "extensions", "review-guard.ts"),
    );
    expect(app.systemPromptPath).toBe(
      path.join(app.packageRoot, "reviewer", "prompts", "review-system.md"),
    );
    expect(app.defaultSessionDir).toBe(
      defaultSessionDir({
        HOME: process.env["HOME"],
        XDG_STATE_HOME: process.env["XDG_STATE_HOME"],
      }),
    );
    expect(formatModelFlag("openai", "gpt-review")).toBe("openai/gpt-review");
  });

  it("honors XDG_STATE_HOME for session storage", () => {
    expect(defaultSessionDir({ HOME: "/home/reviewer", XDG_STATE_HOME: "/var/state" })).toBe(
      path.join("/var/state", "omp-reviewer", "sessions"),
    );
    expect(defaultSessionDir({ HOME: "/home/reviewer" })).toBe(
      path.join("/home/reviewer", ".local", "state", "omp-reviewer", "sessions"),
    );
  });
});
