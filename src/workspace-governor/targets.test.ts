import { describe, expect, it } from "vitest";
import { resolveWorkspaceGovernanceTarget } from "./targets.js";

describe("workspace governor targets", () => {
  it("honors explicit file overrides", () => {
    expect(
      resolveWorkspaceGovernanceTarget({
        intent: "remember_durable",
        explicitFile: "AGENTS.md",
        text: "Always use the vinted skill for Vinted tasks.",
        now: new Date("2026-04-14T12:00:00.000Z"),
      }),
    ).toMatchObject({
      path: "AGENTS.md",
      kind: "structural",
    });
  });

  it("routes user preferences to USER.md", () => {
    expect(
      resolveWorkspaceGovernanceTarget({
        intent: "remember_preference",
        text: "Keep replies short.",
        now: new Date("2026-04-14T12:00:00.000Z"),
      }),
    ).toMatchObject({
      path: "USER.md",
      kind: "structural",
      section: "Preferences",
    });
  });

  it("routes temporary context to the daily memory note", () => {
    expect(
      resolveWorkspaceGovernanceTarget({
        intent: "remember_context",
        text: "Need to retry the proxy check tomorrow.",
        now: new Date("2026-04-14T12:00:00.000Z"),
      }),
    ).toMatchObject({
      path: "memory/2026-04-14.md",
      kind: "memory",
    });
  });

  it("routes skill documentation to a local SKILL.md", () => {
    expect(
      resolveWorkspaceGovernanceTarget({
        intent: "document_skill",
        text: "Document the Vinted navigation skill.",
        skillName: "vinted",
        now: new Date("2026-04-14T12:00:00.000Z"),
      }),
    ).toMatchObject({
      path: "skills/vinted/SKILL.md",
      kind: "structural",
    });
  });
});
