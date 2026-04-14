import { describe, expect, it } from "vitest";
import {
  classifyWorkspaceGovernanceBudget,
  computeWorkspaceGovernanceBudget,
  resolveWorkspaceGovernanceRecommendedBudget,
} from "./budgets.js";

describe("workspace governor budgets", () => {
  it("computes 70 percent hard budgets from bootstrapMaxChars", () => {
    const budget = computeWorkspaceGovernanceBudget({
      bootstrapMaxChars: 20_000,
      budgetRatio: 0.7,
    });

    expect(budget.target).toBe(14_000);
    expect(budget.warning).toBe(11_900);
    expect(budget.critical).toBe(14_000);
  });

  it("returns recommended budgets for bootstrap-heavy files", () => {
    expect(resolveWorkspaceGovernanceRecommendedBudget("TOOLS.md", 14_000)).toBe(6000);
    expect(resolveWorkspaceGovernanceRecommendedBudget("AGENTS.md", 14_000)).toBe(8000);
  });

  it("classifies budget status", () => {
    expect(
      classifyWorkspaceGovernanceBudget({ chars: 5000, warning: 11_900, critical: 14_000 }),
    ).toBe("ok");
    expect(
      classifyWorkspaceGovernanceBudget({ chars: 12_000, warning: 11_900, critical: 14_000 }),
    ).toBe("warning");
    expect(
      classifyWorkspaceGovernanceBudget({ chars: 14_000, warning: 11_900, critical: 14_000 }),
    ).toBe("critical");
  });
});
