import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeJsonReceipt(file: string | undefined, value: unknown): Promise<void> {
  if (file === undefined) return;
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
