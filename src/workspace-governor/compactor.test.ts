import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ResolvedWorkspaceGovernanceConfig } from "./types.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import { compactWorkspaceGovernance } from "./compactor.js";
import { readWorkspaceGovernanceLedger } from "./ledger.js";

const GOVERNANCE_CONFIG: ResolvedWorkspaceGovernanceConfig = {
  enabled: true,
  mode: "hybrid",
  optimizeEvery: "72h",
  budgetRatio: 0.7,
  ledgerFile: ".openclaw-workspace.json",
};

describe("workspace governor compactor", () => {
  it("creates proposals for oversized structural files", async () => {
    const workspaceDir = await makeTempWorkspace();
    const repeated = Array.from({ length: 220 }, () => "- Use the browser tool safely.").join("\n");
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "TOOLS.md",
      content: `## Tooling\n${repeated}\n`,
    });

    const result = await compactWorkspaceGovernance({
      workspaceDir,
      governance: GOVERNANCE_CONFIG,
      bootstrapMaxChars: 1000,
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    const ledger = await readWorkspaceGovernanceLedger({ workspaceDir });
    expect(result.proposalCount).toBe(1);
    expect(ledger.pendingProposals[0]?.targetPath).toBe("TOOLS.md");
    expect(ledger.lastOptimizedAt).toBe("2026-04-14T12:00:00.000Z");
  });

  it("writes compacted memory files directly", async () => {
    const workspaceDir = await makeTempWorkspace();
    const repeated = Array.from({ length: 120 }, () => "- Keep replies short.").join("\n");
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "MEMORY.md",
      content: `## Durable Notes\n${repeated}\n`,
    });

    const result = await compactWorkspaceGovernance({
      workspaceDir,
      governance: GOVERNANCE_CONFIG,
      bootstrapMaxChars: 600,
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    const content = await fs.readFile(path.join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(result.directWrites).toBe(1);
    expect(content.match(/Keep replies short\./g)?.length).toBe(1);
  });
});
