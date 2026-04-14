import { describe, expect, it } from "vitest";
import { classifyWorkspaceGovernanceIntent } from "./classifier.js";

describe("workspace governor classifier", () => {
  it("classifies durable user preferences", () => {
    expect(
      classifyWorkspaceGovernanceIntent({
        text: "Retiens que je prefere des reponses courtes en francais.",
      }),
    ).toBe("remember_preference");
  });

  it("classifies operating rules", () => {
    expect(
      classifyWorkspaceGovernanceIntent({
        text: "Pour Vinted, utilise toujours le skill vinted avant la navigation.",
      }),
    ).toBe("update_operating_rule");
  });

  it("classifies persona updates", () => {
    expect(
      classifyWorkspaceGovernanceIntent({
        text: "Le ton de l'agent doit etre plus direct et sec.",
      }),
    ).toBe("update_persona");
  });

  it("classifies temporary session notes", () => {
    expect(
      classifyWorkspaceGovernanceIntent({
        text: "A retenir pour aujourd'hui: reprendre le debug proxy demain matin.",
      }),
    ).toBe("remember_context");
  });
});
