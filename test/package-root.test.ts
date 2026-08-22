import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { findPackageRoot } from "../src/package-root.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("package root", () => {
  it("walks up from this test file to the omp-reviewer package", async () => {
    const root = await findPackageRoot(fileURLToPath(import.meta.url));
    expect(path.basename(root)).toBe("omp-reviewer");
  });

  it("rejects a tree without this package name", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omp-reviewer-root-"));
    cleanup.push(root);
    const nested = path.join(root, "src");
    await mkdir(nested);
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "other" }));
    await expect(findPackageRoot(path.join(nested, "file.ts"))).rejects.toThrow("package root");
  });
});
