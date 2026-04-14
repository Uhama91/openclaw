import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import { readWorkspaceGovernanceLedger, writeWorkspaceGovernanceLedger } from "./ledger.js";
import { getWorkspaceGovernanceStatus, runWorkspaceGovernanceMaintenanceIfDue } from "./runtime.js";

describe("workspace governor runtime", () => {
  it("reports maintenance as due when no optimization has run yet", async () => {
    const workspaceDir = await makeTempWorkspace();

    const status = await getWorkspaceGovernanceStatus({
      workspaceDir,
      config: {
        agents: {
          defaults: {
            bootstrapMaxChars: 20_000,
            workspaceGovernance: {
              enabled: true,
              mode: "hybrid",
              optimizeEvery: "72h",
              budgetRatio: 0.7,
              ledgerFile: ".openclaw-workspace.json",
            },
          },
        },
      },
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    expect(status?.due).toBe(true);
    expect(status?.pendingProposalCount).toBe(0);
  });

  it("skips maintenance before the interval elapses", async () => {
    const workspaceDir = await makeTempWorkspace();
    await writeWorkspaceGovernanceLedger({
      workspaceDir,
      ledger: {
        version: 1,
        lastOptimizedAt: "2026-04-14T10:00:00.000Z",
        pendingProposals: [],
      },
    });

    const result = await runWorkspaceGovernanceMaintenanceIfDue({
      workspaceDir,
      config: {
        agents: {
          defaults: {
            bootstrapMaxChars: 20_000,
            workspaceGovernance: {
              enabled: true,
              mode: "hybrid",
              optimizeEvery: "72h",
              budgetRatio: 0.7,
              ledgerFile: ".openclaw-workspace.json",
            },
          },
        },
      },
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    expect(result?.ran).toBe(false);
  });

  it("runs maintenance when due and creates a note for new proposals", async () => {
    const workspaceDir = await makeTempWorkspace();
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "TOOLS.md",
      content: `## Tooling\n${Array.from({ length: 220 }, () => "- Snapshot before acting.").join("\n")}\n`,
    });
    await writeWorkspaceGovernanceLedger({
      workspaceDir,
      ledger: {
        version: 1,
        lastOptimizedAt: "2026-04-10T12:00:00.000Z",
        pendingProposals: [],
      },
    });

    const result = await runWorkspaceGovernanceMaintenanceIfDue({
      workspaceDir,
      config: {
        agents: {
          defaults: {
            bootstrapMaxChars: 1000,
            workspaceGovernance: {
              enabled: true,
              mode: "hybrid",
              optimizeEvery: "72h",
              budgetRatio: 0.7,
              ledgerFile: ".openclaw-workspace.json",
            },
          },
        },
      },
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    const ledger = await readWorkspaceGovernanceLedger({ workspaceDir });
    expect(result?.ran).toBe(true);
    expect(result?.note).toContain("workspace governance");
    expect(ledger.pendingProposals).toHaveLength(1);
  });
});
