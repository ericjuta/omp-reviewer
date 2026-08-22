import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runReview } from "../src/runner.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("omp review runner", () => {
  it("accepts submit_review from mocked omp json events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omp-reviewer-run-"));
    cleanup.push(root);
    const omp = path.join(root, "omp");
    await writeFile(
      omp,
      `#!/bin/sh
printf '%s\\n' '{"type":"tool_call","name":"submit_review","arguments":{"findings":[],"overall_correctness":"patch is correct","overall_explanation":"No defect.","overall_confidence_score":0.8}}'
`,
    );
    await chmod(omp, 0o755);
    await mkdir(path.join(root, "reviewer", "prompts"), { recursive: true });
    await writeFile(path.join(root, "reviewer", "prompts", "review-system.md"), "guidelines\n");
    const output = await runReview({
      app: {
        packageRoot: root,
        extensionPath: path.join(root, "reviewer", "extensions", "review-guard.ts"),
        systemPromptPath: path.join(root, "reviewer", "prompts", "review-system.md"),
        defaultSessionDir: path.join(root, "sessions"),
      },
      selection: { provider: "openai", model: "review", thinking: "high" },
      cwd: root,
      prompt: "review this",
      persistSession: false,
      ompCommand: omp,
      env: { PATH: root, HOME: root },
    });
    expect(output.overallCorrectness).toBe("patch is correct");
    expect(output.findings).toEqual([]);
  });

  it("resumes with --continue when the first print has no submit_review", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omp-reviewer-run-"));
    cleanup.push(root);
    const log = path.join(root, "args.log");
    const omp = path.join(root, "omp");
    const countFile = path.join(root, "count");
    await writeFile(
      omp,
      `#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
if [ -f "${countFile}" ]; then
  printf '%s\\n' '{"type":"tool_call","name":"submit_review","arguments":{"findings":[],"overall_correctness":"patch is correct","overall_explanation":"No defect.","overall_confidence_score":0.8}}'
  exit 0
fi
printf '%s\\n' "1" > "${countFile}"
printf '%s\\n' '{"type":"message_start"}'
exit 0
`,
    );
    await chmod(omp, 0o755);
    await mkdir(path.join(root, "reviewer", "prompts"), { recursive: true });
    await writeFile(path.join(root, "reviewer", "prompts", "review-system.md"), "guidelines\n");
    const sessionReceipt = path.join(root, "session.json");
    const lifecycleReceipt = path.join(root, "lifecycle.json");
    const metrics: { provider?: string }[] = [];
    const output = await runReview({
      app: {
        packageRoot: root,
        extensionPath: path.join(root, "reviewer", "extensions", "review-guard.ts"),
        systemPromptPath: path.join(root, "reviewer", "prompts", "review-system.md"),
        defaultSessionDir: path.join(root, "sessions"),
      },
      selection: { provider: "openai", model: "review", thinking: "high" },
      cwd: root,
      prompt: "review this",
      persistSession: true,
      sessionReceipt,
      lifecycleReceipt,
      ompCommand: omp,
      env: { PATH: root, HOME: root },
      onMetrics: (value) => metrics.push(value),
    });
    expect(output.overallCorrectness).toBe("patch is correct");
    const recorded = await readFile(log, "utf8");
    expect(recorded).toContain("--continue");
    expect(recorded).toContain("--session-dir");
    expect(JSON.parse(await readFile(sessionReceipt, "utf8"))).toEqual({
      version: 1,
      sessionDir: path.resolve(root, "sessions"),
    });
    expect(metrics.length).toBeGreaterThan(0);
  });

  it("fails closed when omp never calls submit_review", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omp-reviewer-run-"));
    cleanup.push(root);
    const omp = path.join(root, "omp");
    await writeFile(
      omp,
      `#!/bin/sh
printf '%s\\n' 'not json'
printf '%s\\n' '{"type":"message_start"}'
exit 1
`,
    );
    await chmod(omp, 0o755);
    await mkdir(path.join(root, "reviewer", "prompts"), { recursive: true });
    await writeFile(path.join(root, "reviewer", "prompts", "review-system.md"), "guidelines\n");
    await expect(
      runReview({
        app: {
          packageRoot: root,
          extensionPath: path.join(root, "reviewer", "extensions", "review-guard.ts"),
          systemPromptPath: path.join(root, "reviewer", "prompts", "review-system.md"),
          defaultSessionDir: path.join(root, "sessions"),
        },
        selection: { provider: "openai", model: "review", thinking: "high" },
        cwd: root,
        prompt: "review this",
        persistSession: false,
        ompCommand: omp,
        env: { PATH: root, HOME: root },
      }),
    ).rejects.toThrow("without submit_review");
  });
});
