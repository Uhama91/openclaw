import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "./system-prompt.js";

describe("system prompt workspace governor", () => {
  it("includes workspace governance guidance when the tool is available", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/openclaw",
      toolNames: ["workspace_govern"],
    });

    expect(prompt).toContain("## Workspace Governance");
    expect(prompt).toContain("use workspace_govern");
    expect(prompt).toContain("Do not freehand-edit AGENTS.md");
  });

  it("omits workspace governance guidance when the tool is unavailable", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/openclaw",
      toolNames: ["exec"],
    });

    expect(prompt).not.toContain("## Workspace Governance");
  });
});
