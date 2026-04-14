import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import {
  DEFAULT_WORKSPACE_GOVERNANCE_LEDGER_FILE,
  WORKSPACE_GOVERNANCE_LEDGER_VERSION,
  type WorkspaceGovernanceLedger,
  type WorkspaceGovernanceTargetKind,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeLedger(value: unknown): WorkspaceGovernanceLedger {
  if (!isRecord(value)) {
    return createEmptyWorkspaceGovernanceLedger();
  }
  const pendingProposals = Array.isArray(value.pendingProposals)
    ? value.pendingProposals.filter(isRecord).map((proposal) => ({
        id: typeof proposal.id === "string" ? proposal.id : "",
        createdAt: typeof proposal.createdAt === "string" ? proposal.createdAt : "",
        updatedAt: typeof proposal.updatedAt === "string" ? proposal.updatedAt : "",
        targetPath: typeof proposal.targetPath === "string" ? proposal.targetPath : "",
        targetKind: (proposal.targetKind === "memory"
          ? "memory"
          : "structural") as WorkspaceGovernanceTargetKind,
        section: typeof proposal.section === "string" ? proposal.section : undefined,
        summary: typeof proposal.summary === "string" ? proposal.summary : "",
        reason: typeof proposal.reason === "string" ? proposal.reason : "",
        diff: typeof proposal.diff === "string" ? proposal.diff : "",
        nextContent: typeof proposal.nextContent === "string" ? proposal.nextContent : "",
      }))
    : [];
  const budgets = isRecord(value.budgets)
    ? Object.fromEntries(Object.entries(value.budgets).filter(([, snapshot]) => isRecord(snapshot)))
    : undefined;
  return {
    version: WORKSPACE_GOVERNANCE_LEDGER_VERSION,
    lastOptimizedAt: typeof value.lastOptimizedAt === "string" ? value.lastOptimizedAt : undefined,
    pendingProposals,
    budgets: budgets as WorkspaceGovernanceLedger["budgets"],
  };
}

export function createEmptyWorkspaceGovernanceLedger(): WorkspaceGovernanceLedger {
  return {
    version: WORKSPACE_GOVERNANCE_LEDGER_VERSION,
    pendingProposals: [],
  };
}

export function resolveWorkspaceGovernanceLedgerPath(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
}): string {
  const configured = params.config?.agents?.defaults?.workspaceGovernance?.ledgerFile?.trim();
  const relativePath = configured || DEFAULT_WORKSPACE_GOVERNANCE_LEDGER_FILE;
  return path.join(params.workspaceDir, relativePath);
}

export async function readWorkspaceGovernanceLedger(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
}): Promise<WorkspaceGovernanceLedger> {
  const ledgerPath = resolveWorkspaceGovernanceLedgerPath(params);
  try {
    const raw = await fs.readFile(ledgerPath, "utf-8");
    return sanitizeLedger(JSON.parse(raw));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return createEmptyWorkspaceGovernanceLedger();
    }
    throw error;
  }
}

export async function writeWorkspaceGovernanceLedger(params: {
  workspaceDir: string;
  ledger: WorkspaceGovernanceLedger;
  config?: OpenClawConfig;
}): Promise<void> {
  const ledgerPath = resolveWorkspaceGovernanceLedgerPath(params);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  const tempPath = `${ledgerPath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(params.ledger, null, 2)}\n`;
  await fs.writeFile(tempPath, payload, "utf-8");
  await fs.rename(tempPath, ledgerPath);
}
