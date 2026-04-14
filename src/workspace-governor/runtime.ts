import type { OpenClawConfig } from "../config/config.js";
import type { ResolvedWorkspaceGovernanceConfig } from "./types.js";
import { resolveBootstrapMaxChars } from "../agents/pi-embedded-helpers.js";
import { parseDurationMs } from "../cli/parse-duration.js";
import { compactWorkspaceGovernance } from "./compactor.js";
import { readWorkspaceGovernanceLedger } from "./ledger.js";

export function resolveWorkspaceGovernanceConfig(
  config?: OpenClawConfig,
): ResolvedWorkspaceGovernanceConfig | null {
  const raw = config?.agents?.defaults?.workspaceGovernance;
  if (!raw?.enabled) {
    return null;
  }
  return {
    enabled: true,
    mode: raw.mode ?? "hybrid",
    optimizeEvery: raw.optimizeEvery ?? "72h",
    budgetRatio: raw.budgetRatio ?? 0.7,
    ledgerFile: raw.ledgerFile ?? ".openclaw-workspace.json",
  };
}

function isOptimizationDue(params: { lastOptimizedAt?: string; optimizeEvery: string; now: Date }) {
  if (!params.lastOptimizedAt) {
    return true;
  }
  const last = Date.parse(params.lastOptimizedAt);
  if (!Number.isFinite(last)) {
    return true;
  }
  const everyMs = parseDurationMs(params.optimizeEvery, { defaultUnit: "h" });
  return params.now.getTime() - last >= everyMs;
}

export async function getWorkspaceGovernanceStatus(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  now?: Date;
}) {
  const governance = resolveWorkspaceGovernanceConfig(params.config);
  if (!governance) {
    return null;
  }
  const now = params.now ?? new Date();
  const ledger = await readWorkspaceGovernanceLedger({
    workspaceDir: params.workspaceDir,
    config: params.config,
  });
  return {
    enabled: true,
    due: isOptimizationDue({
      lastOptimizedAt: ledger.lastOptimizedAt,
      optimizeEvery: governance.optimizeEvery,
      now,
    }),
    lastOptimizedAt: ledger.lastOptimizedAt,
    pendingProposalCount: ledger.pendingProposals.length,
    budgets: ledger.budgets ?? {},
  };
}

export async function runWorkspaceGovernanceMaintenanceIfDue(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  now?: Date;
}) {
  const governance = resolveWorkspaceGovernanceConfig(params.config);
  if (!governance) {
    return null;
  }
  const now = params.now ?? new Date();
  const ledger = await readWorkspaceGovernanceLedger({
    workspaceDir: params.workspaceDir,
    config: params.config,
  });
  const due = isOptimizationDue({
    lastOptimizedAt: ledger.lastOptimizedAt,
    optimizeEvery: governance.optimizeEvery,
    now,
  });
  if (!due) {
    return { ran: false as const };
  }

  const result = await compactWorkspaceGovernance({
    workspaceDir: params.workspaceDir,
    governance,
    bootstrapMaxChars: resolveBootstrapMaxChars(params.config),
    now,
  });
  const note =
    result.proposalCount > 0 || result.directWrites > 0
      ? `Reminder: workspace governance ran maintenance and produced ${result.proposalCount} proposal(s) and ${result.directWrites} direct memory cleanup(s).`
      : undefined;
  return {
    ran: true as const,
    note,
    ...result,
  };
}
