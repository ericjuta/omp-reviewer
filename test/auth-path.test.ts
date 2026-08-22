import path from "node:path";

import { describe, expect, it } from "vitest";

import { regularOmpAgentDir, regularOmpConfigDir } from "../src/auth-path.js";

describe("omp auth paths", () => {
  it("uses the default OMP agent directory", () => {
    expect(regularOmpConfigDir("/home/reviewer", {})).toBe(path.join("/home/reviewer", ".omp"));
    expect(regularOmpAgentDir("/home/reviewer", {})).toBe(
      path.join("/home/reviewer", ".omp", "agent"),
    );
  });

  it("honors profile and agent overrides", () => {
    expect(regularOmpConfigDir("/home/reviewer", { OMP_PROFILE: "work" })).toBe(
      path.join("/home/reviewer", ".omp", "profiles", "work"),
    );
    expect(regularOmpAgentDir("/home/reviewer", { PI_CODING_AGENT_DIR: "/tmp/agent" })).toBe(
      "/tmp/agent",
    );
  });
});
