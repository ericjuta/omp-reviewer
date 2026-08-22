import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listReviewerModels, loginReviewer } from "../src/auth.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function fakeOmp(script: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "omp-reviewer-auth-"));
  cleanup.push(root);
  const file = path.join(root, "omp");
  await writeFile(file, script);
  await chmod(file, 0o755);
  return file;
}

describe("omp auth helpers", () => {
  it("runs omp login and omp models through the resolved binary", async () => {
    const omp = await fakeOmp(`#!/bin/sh
if [ "$1" = login ]; then exit 0; fi
if [ "$1" = models ]; then printf '%s\\n' "openai/gpt-review"; exit 0; fi
exit 1
`);
    const env = { OMP_REVIEWER_OMP: omp, PATH: path.dirname(omp) };
    await expect(loginReviewer(undefined, env)).resolves.toBeUndefined();
    await expect(loginReviewer("openai", env)).resolves.toBeUndefined();
    await expect(listReviewerModels(undefined, env)).resolves.toContain("openai/gpt-review");
    await expect(listReviewerModels("gpt", env)).resolves.toContain("openai/gpt-review");
  });

  it("fails when omp login or models exits nonzero", async () => {
    const omp = await fakeOmp(`#!/bin/sh
printf '%s\\n' 'nope' >&2
exit 2
`);
    const env = { OMP_REVIEWER_OMP: omp, PATH: path.dirname(omp) };
    await expect(loginReviewer(undefined, env)).rejects.toThrow("omp login failed");
    await expect(listReviewerModels(undefined, env)).rejects.toThrow("nope");
  });
});
