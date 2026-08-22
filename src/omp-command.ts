import { access } from "node:fs/promises";
import path from "node:path";

const OMP_NAMES = ["omp", "omp.exe"] as const;

export async function resolveOmpCommand(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const override = env["OMP_REVIEWER_OMP"]?.trim();
  if (override) {
    await assertExecutable(override);
    return override;
  }
  for (const candidate of ompLookupPaths(env)) {
    if (await isExecutable(candidate)) return candidate;
  }
  throw new Error(
    "omp was not found. Install Oh My Pi and ensure `omp` is on PATH, or set OMP_REVIEWER_OMP.",
  );
}

export function ompLookupPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const directories = unique([
    ...(env["PATH"] ?? "").split(path.delimiter).filter((entry) => entry.length > 0),
    ...extraOmpDirectories(env["HOME"]?.trim()),
  ]);
  return directories.flatMap((directory) => OMP_NAMES.map((name) => path.join(directory, name)));
}

function extraOmpDirectories(home: string | undefined): string[] {
  if (home === undefined || home === "") return [];
  return [path.join(home, ".bun", "bin"), path.join(home, ".local", "bin")];
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

async function assertExecutable(file: string): Promise<void> {
  if (!(await isExecutable(file))) {
    throw new Error(`OMP_REVIEWER_OMP is not executable: ${file}`);
  }
}

async function isExecutable(file: string): Promise<boolean> {
  return await access(file).then(
    () => true,
    () => false,
  );
}
