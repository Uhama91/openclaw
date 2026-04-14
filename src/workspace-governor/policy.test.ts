import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkspaceGovernanceTarget } from "./types.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import { readWorkspaceGovernanceLedger } from "./ledger.js";
import { applyWorkspaceGovernanceAction } from "./policy.js";

describe("workspace governor policy", () => {
  it("writes directly to memory files", async () => {
    const workspaceDir = await makeTempWorkspace();
    const target: WorkspaceGovernanceTarget = {
      path: "MEMORY.md",
      kind: "memory",
      section: "Durable Notes",
      reason: "fallback durable memory",
    };

    const result = await applyWorkspaceGovernanceAction({
      workspaceDir,
      target,
      text: "Operator prefers French.",
      summary: "Operator prefers French.",
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    const content = await fs.readFile(path.join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(result.mode).toBe("direct");
    expect(content).toContain("Operator prefers French.");
  });

  it("creates pending proposals for structural files", async () => {
    const workspaceDir = await makeTempWorkspace();
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "AGENTS.md",
      content: "## Operating Rules\n- Use explicit approval for risky actions.\n",
    });

    const result = await applyWorkspaceGovernanceAction({
      workspaceDir,
      target: {
        path: "AGENTS.md",
        kind: "structural",
        section: "Operating Rules",
        reason: "remembered operating rule",
      },
      text: "Prefer the vinted skill for Vinted tasks.",
      summary: "Prefer the vinted skill for Vinted tasks.",
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    const ledger = await readWorkspaceGovernanceLedger({ workspaceDir });
    expect(result.mode).toBe("proposal");
    expect(ledger.pendingProposals).toHaveLength(1);
    expect(ledger.pendingProposals[0]?.targetPath).toBe("AGENTS.md");
  });

  it("prevents duplicate unresolved proposals for the same file", async () => {
    const workspaceDir = await makeTempWorkspace();
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "AGENTS.md",
      content: "## Operating Rules\n- Use explicit approval for risky actions.\n",
    });

    await applyWorkspaceGovernanceAction({
      workspaceDir,
      target: {
        path: "AGENTS.md",
        kind: "structural",
        section: "Operating Rules",
        reason: "remembered operating rule",
      },
      text: "Prefer the vinted skill for Vinted tasks.",
      summary: "Prefer the vinted skill for Vinted tasks.",
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    await expect(
      applyWorkspaceGovernanceAction({
        workspaceDir,
        target: {
          path: "AGENTS.md",
          kind: "structural",
          section: "Operating Rules",
          reason: "remembered operating rule",
        },
        text: "Use Chrome host stack A for Vinted.",
        summary: "Use Chrome host stack A for Vinted.",
        now: new Date("2026-04-14T12:01:00.000Z"),
      }),
    ).rejects.toThrow(/pending proposal/i);
  });
});
