import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PACKAGE_NAME } from "./version.js";

export async function findPackageRoot(start = fileURLToPath(import.meta.url)): Promise<string> {
  let current = path.dirname(start);
  for (;;) {
    if (await isPackageRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("could not find omp-reviewer package root");
    current = parent;
  }
}

async function isPackageRoot(directory: string): Promise<boolean> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    return isRecord(raw) && raw["name"] === PACKAGE_NAME;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
