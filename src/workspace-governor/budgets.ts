import type { WorkspaceGovernanceBudgetStatus } from "./types.js";

const RECOMMENDED_BUDGETS: Record<string, number> = {
  "AGENTS.md": 8000,
  "TOOLS.md": 6000,
  "SOUL.md": 3000,
  "USER.md": 3000,
  "IDENTITY.md": 600,
  "HEARTBEAT.md": 500,
  "BOOTSTRAP.md": 1000,
  "MEMORY.md": 8000,
};

export function computeWorkspaceGovernanceBudget(params: {
  bootstrapMaxChars: number;
  budgetRatio: number;
}) {
  const target = Math.floor(params.bootstrapMaxChars * params.budgetRatio);
  return {
    target,
    warning: Math.floor(target * 0.85),
    critical: target,
  };
}

export function resolveWorkspaceGovernanceRecommendedBudget(
  filePath: string,
  hardTarget: number,
): number | undefined {
  const recommended = RECOMMENDED_BUDGETS[filePath];
  if (typeof recommended !== "number") {
    return undefined;
  }
  return Math.min(recommended, hardTarget);
}

export function classifyWorkspaceGovernanceBudget(params: {
  chars: number;
  warning: number;
  critical: number;
}): WorkspaceGovernanceBudgetStatus {
  if (params.chars >= params.critical) {
    return "critical";
  }
  if (params.chars >= params.warning) {
    return "warning";
  }
  return "ok";
}
