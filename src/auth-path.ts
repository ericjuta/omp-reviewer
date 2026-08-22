import os from "node:os";
import path from "node:path";

export function regularOmpConfigDir(
  homeDir = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configName = envTrim(env, "PI_CONFIG_DIR") ?? ".omp";
  const profile = envTrim(env, "OMP_PROFILE") ?? envTrim(env, "PI_PROFILE");
  if (profile !== undefined && profile !== "default") {
    return path.join(homeDir, configName, "profiles", profile);
  }
  return path.join(homeDir, configName);
}

function envTrim(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

export function regularOmpAgentDir(
  homeDir = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env["PI_CODING_AGENT_DIR"]?.trim();
  if (override) return path.resolve(override);
  return path.join(regularOmpConfigDir(homeDir, env), "agent");
}
