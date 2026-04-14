import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempWorkspace } from "../test-helpers/workspace.js";
import {
  createEmptyWorkspaceGovernanceLedger,
  readWorkspaceGovernanceLedger,
  resolveWorkspaceGovernanceLedgerPath,
  writeWorkspaceGovernanceLedger,
} from "./ledger.js";

describe("workspace governor ledger", () => {
  it("returns an empty ledger when the file is missing", async () => {
    const workspaceDir = await makeTempWorkspace();

    const ledger = await readWorkspaceGovernanceLedger({ workspaceDir });

    expect(ledger.pendingProposals).toEqual([]);
    expect(ledger.version).toBe(1);
    expect(ledger.lastOptimizedAt).toBeUndefined();
  });

  it("persists ledger updates atomically", async () => {
    const workspaceDir = await makeTempWorkspace();
    const ledgerPath = resolveWorkspaceGovernanceLedgerPath({ workspaceDir });
    const initial = createEmptyWorkspaceGovernanceLedger();

    await writeWorkspaceGovernanceLedger({
      workspaceDir,
      ledger: {
        ...initial,
        lastOptimizedAt: "2026-04-14T10:00:00.000Z",
        pendingProposals: [
          {
            id: "proposal-1",
            createdAt: "2026-04-14T10:00:00.000Z",
            updatedAt: "2026-04-14T10:00:00.000Z",
            targetPath: "AGENTS.md",
            targetKind: "structural",
            section: "Operating Rules",
            summary: "Prefer vinted skill for Vinted tasks.",
            reason: "remembered operating rule",
            diff: "--- AGENTS.md\n+++ AGENTS.md\n+ - Prefer vinted skill for Vinted tasks.\n",
            nextContent: "## Operating Rules\n- Prefer vinted skill for Vinted tasks.\n",
          },
        ],
      },
    });

    const stored = await readWorkspaceGovernanceLedger({ workspaceDir });
    expect(stored.lastOptimizedAt).toBe("2026-04-14T10:00:00.000Z");
    expect(stored.pendingProposals).toHaveLength(1);
    expect(stored.pendingProposals[0]?.id).toBe("proposal-1");

    const tempCandidates = await fs.readdir(workspaceDir);
    expect(tempCandidates.some((name) => name.startsWith(".openclaw-workspace.json."))).toBe(false);
    expect(path.basename(ledgerPath)).toBe(".openclaw-workspace.json");
  });
});
