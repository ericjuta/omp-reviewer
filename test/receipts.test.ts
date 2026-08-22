import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeJsonReceipt } from "../src/receipts.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("receipts", () => {
  it("writes a compact JSON receipt and ignores a missing path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omp-reviewer-receipt-"));
    cleanup.push(root);
    const file = path.join(root, "out", "receipt.json");
    await writeJsonReceipt(undefined, { skipped: true });
    await writeJsonReceipt(file, { version: 1, sessionDir: root });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ version: 1, sessionDir: root });
  });
});
