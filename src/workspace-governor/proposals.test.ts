import { describe, expect, it } from "vitest";
import {
  createWorkspaceGovernanceProposal,
  renderWorkspaceGovernanceContentUpdate,
} from "./proposals.js";

describe("workspace governor proposals", () => {
  it("renders bullet updates inside an existing section", () => {
    const nextContent = renderWorkspaceGovernanceContentUpdate({
      currentContent: "## Preferences\n- Keep replies short.\n",
      section: "Preferences",
      text: "Prefer French for operator-facing discussion.",
    });

    expect(nextContent).toContain("## Preferences");
    expect(nextContent).toContain("- Keep replies short.");
    expect(nextContent).toContain("- Prefer French for operator-facing discussion.");
  });

  it("creates a proposal with a diff and next content", () => {
    const proposal = createWorkspaceGovernanceProposal({
      currentContent: "## Operating Rules\n- Use guardrails.\n",
      targetPath: "AGENTS.md",
      targetKind: "structural",
      section: "Operating Rules",
      summary: "Prefer the vinted skill for Vinted tasks.",
      reason: "remembered operating rule",
      text: "Prefer the vinted skill for Vinted tasks.",
      now: new Date("2026-04-14T12:00:00.000Z"),
    });

    expect(proposal.id).toContain("proposal-");
    expect(proposal.diff).toContain("+++ AGENTS.md");
    expect(proposal.nextContent).toContain("Prefer the vinted skill for Vinted tasks.");
  });
});
