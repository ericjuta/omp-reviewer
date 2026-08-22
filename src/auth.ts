import { spawn } from "node:child_process";

import { resolveOmpCommand } from "./omp-command.js";

export async function loginReviewer(
  provider?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const omp = await resolveOmpCommand(env);
  const args = provider === undefined ? ["login"] : ["login", provider];
  const code = await runOmp(omp, args, env);
  if (code !== 0) throw new Error(`omp login failed with exit ${String(code)}`);
}

export async function listReviewerModels(
  search?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const omp = await resolveOmpCommand(env);
  const args = search === undefined ? ["models"] : ["models", search];
  const result = await captureOmp(omp, args, env);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `omp models failed with exit ${String(result.code)}`);
  }
  return result.stdout;
}

function runOmp(command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { env, stdio: "inherit" });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

function captureOmp(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
