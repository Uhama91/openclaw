export const DEFAULT_WORKSPACE_GOVERNANCE_LEDGER_FILE = ".openclaw-workspace.json";
export const DEFAULT_WORKSPACE_GOVERNANCE_OPTIMIZE_EVERY = "72h";
export const DEFAULT_WORKSPACE_GOVERNANCE_BUDGET_RATIO = 0.7;
export const WORKSPACE_GOVERNANCE_LEDGER_VERSION = 1;

export type WorkspaceGovernanceMode = "hybrid";

export type WorkspaceGovernanceConfig = {
  enabled?: boolean;
  mode?: WorkspaceGovernanceMode;
  optimizeEvery?: string;
  budgetRatio?: number;
  ledgerFile?: string;
};

export type ResolvedWorkspaceGovernanceConfig = {
  enabled: true;
  mode: WorkspaceGovernanceMode;
  optimizeEvery: string;
  budgetRatio: number;
  ledgerFile: string;
};

export type WorkspaceGovernanceIntent =
  | "remember_user_fact"
  | "remember_preference"
  | "update_persona"
  | "update_identity"
  | "update_operating_rule"
  | "document_tool_usage"
  | "document_skill"
  | "remember_context"
  | "remember_durable"
  | "optimize_workspace";

export type WorkspaceGovernanceTargetKind = "memory" | "structural";

export type WorkspaceGovernanceTarget = {
  path: string;
  kind: WorkspaceGovernanceTargetKind;
  section?: string;
  reason: string;
};

export type WorkspaceGovernanceBudgetStatus = "ok" | "warning" | "critical";

export type WorkspaceGovernanceBudgetSnapshot = {
  path: string;
  chars: number;
  target: number;
  warning: number;
  critical: number;
  recommended?: number;
  status: WorkspaceGovernanceBudgetStatus;
};

export type WorkspaceGovernanceProposal = {
  id: string;
  createdAt: string;
  updatedAt: string;
  targetPath: string;
  targetKind: WorkspaceGovernanceTargetKind;
  section?: string;
  summary: string;
  reason: string;
  diff: string;
  nextContent: string;
};

export type WorkspaceGovernanceLedger = {
  version: typeof WORKSPACE_GOVERNANCE_LEDGER_VERSION;
  lastOptimizedAt?: string;
  pendingProposals: WorkspaceGovernanceProposal[];
  budgets?: Record<string, WorkspaceGovernanceBudgetSnapshot>;
};
