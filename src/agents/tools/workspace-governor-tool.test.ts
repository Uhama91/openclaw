import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../../test-helpers/workspace.js";
import { createWorkspaceGovernorTool } from "./workspace-governor-tool.js";

function parseToolResult(
  result: Awaited<
    ReturnType<NonNullable<ReturnType<typeof createWorkspaceGovernorTool>>["execute"]>
  >,
) {
  const text = result.content.find((entry) => entry.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("missing text result");
  }
  return JSON.parse(text.text) as Record<string, unknown>;
}

describe("workspace governor tool", () => {
  it("writes memory directly for durable remember actions", async () => {
    const workspaceDir = await makeTempWorkspace();
    const tool = createWorkspaceGovernorTool({
      workspaceDir,
      config: {
        agents: {
          defaults: {
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

    expect(tool).not.toBeNull();
    if (!tool) {
      throw new Error("expected tool");
    }
    const result = parseToolResult(
      await tool.execute("call-1", {
        action: "remember",
        text: "Operator prefers French.",
      }),
    );

    const content = await fs.readFile(path.join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(result.mode).toBe("direct");
    expect(content).toContain("Operator prefers French.");
  });

  it("creates and applies structural proposals", async () => {
    const workspaceDir = await makeTempWorkspace();
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "AGENTS.md",
      content: "## Operating Rules\n- Use guardrails.\n",
    });
    const tool = createWorkspaceGovernorTool({
      workspaceDir,
      config: {
        agents: {
          defaults: {
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
    if (!tool) {
      throw new Error("expected tool");
    }

    const proposed = parseToolResult(
      await tool.execute("call-2", {
        action: "remember",
        text: "For Vinted, always use the vinted skill.",
      }),
    );
    expect(proposed.mode).toBe("proposal");
    expect(typeof proposed.proposalId).toBe("string");

    await tool.execute("call-3", {
      action: "apply",
      proposalId: proposed.proposalId,
    });

    const content = await fs.readFile(path.join(workspaceDir, "AGENTS.md"), "utf-8");
    expect(content).toContain("For Vinted, always use the vinted skill.");
  });

  it("reports status and optimize results", async () => {
    const workspaceDir = await makeTempWorkspace();
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "TOOLS.md",
      content: `## Tooling\n${Array.from({ length: 220 }, () => "- Snapshot before acting.").join("\n")}\n`,
    });
    const tool = createWorkspaceGovernorTool({
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
    if (!tool) {
      throw new Error("expected tool");
    }

    const statusBefore = parseToolResult(await tool.execute("call-4", { action: "status" }));
    expect(statusBefore.due).toBe(true);

    const optimize = parseToolResult(await tool.execute("call-5", { action: "optimize" }));
    expect(optimize.ran).toBe(true);
    expect(Number(optimize.proposalCount)).toBeGreaterThanOrEqual(1);
  });
});
