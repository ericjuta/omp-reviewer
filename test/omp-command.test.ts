import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ompLookupPaths, resolveOmpCommand } from "../src/omp-command.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("omp command lookup", () => {
  it("prefers OMP_REVIEWER_OMP when it exists", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omp-reviewer-cmd-"));
    cleanup.push(root);
    const file = path.join(root, "omp");
    await writeFile(file, "#!/bin/sh\n");
    await chmod(file, 0o755);
    await expect(resolveOmpCommand({ OMP_REVIEWER_OMP: file, PATH: "" })).resolves.toBe(file);
  });

  it("searches PATH and login-style bins", () => {
    const paths = ompLookupPaths({ HOME: "/home/reviewer", PATH: "/usr/bin" });
    expect(paths[0]).toBe(path.join("/usr/bin", "omp"));
    expect(paths).toContain(path.join("/home/reviewer", ".bun", "bin", "omp"));
    expect(paths).toContain(path.join("/home/reviewer", ".local", "bin", "omp"));
  });

  it("fails when omp is missing", async () => {
    await expect(resolveOmpCommand({ PATH: "", HOME: "" })).rejects.toThrow("omp was not found");
  });

  it("rejects a non-executable OMP_REVIEWER_OMP override", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omp-reviewer-cmd-"));
    cleanup.push(root);
    const file = path.join(root, "missing-omp");
    await expect(resolveOmpCommand({ OMP_REVIEWER_OMP: file, PATH: "" })).rejects.toThrow(
      "OMP_REVIEWER_OMP is not executable",
    );
    expect(ompLookupPaths({ HOME: "", PATH: "" })).toEqual([]);
  });
});
