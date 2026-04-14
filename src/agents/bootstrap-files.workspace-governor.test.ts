import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import {
  readWorkspaceGovernanceLedger,
  writeWorkspaceGovernanceLedger,
} from "../workspace-governor/ledger.js";
import { resolveBootstrapContextForRun } from "./bootstrap-files.js";

describe("bootstrap files workspace governor", () => {
  it("returns workspace notes when governance maintenance runs", async () => {
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

    const result = await resolveBootstrapContextForRun({
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
    });

    const ledger = await readWorkspaceGovernanceLedger({ workspaceDir });
    expect(result.workspaceNotes?.[0]).toContain("workspace governance");
    expect(ledger.pendingProposals).toHaveLength(1);
  });
});
