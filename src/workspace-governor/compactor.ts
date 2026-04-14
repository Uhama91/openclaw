import fs from "node:fs/promises";
import path from "node:path";
import type {
  ResolvedWorkspaceGovernanceConfig,
  WorkspaceGovernanceBudgetSnapshot,
  WorkspaceGovernanceProposal,
} from "./types.js";
import { loadWorkspaceBootstrapFiles } from "../agents/workspace.js";
import {
  classifyWorkspaceGovernanceBudget,
  computeWorkspaceGovernanceBudget,
  resolveWorkspaceGovernanceRecommendedBudget,
} from "./budgets.js";
import { readWorkspaceGovernanceLedger, writeWorkspaceGovernanceLedger } from "./ledger.js";
import { createWorkspaceGovernanceProposal } from "./proposals.js";

function compactWorkspaceContent(content: string): string {
  const lines = content.split("\n");
  const next: string[] = [];
  const seenBulletLines = new Set<string>();
  let lastBlank = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (!lastBlank && next.length > 0) {
        next.push("");
      }
      lastBlank = true;
      continue;
    }
    lastBlank = false;
    if (trimmed.startsWith("- ")) {
      if (seenBulletLines.has(trimmed)) {
        continue;
      }
      seenBulletLines.add(trimmed);
    }
    next.push(line);
  }
  return `${next.join("\n").trimEnd()}\n`;
}

async function writeRelativeFile(
  workspaceDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = path.join(workspaceDir, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

export async function compactWorkspaceGovernance(params: {
  workspaceDir: string;
  governance: ResolvedWorkspaceGovernanceConfig;
  bootstrapMaxChars: number;
  now: Date;
}) {
  const budget = computeWorkspaceGovernanceBudget({
    bootstrapMaxChars: params.bootstrapMaxChars,
    budgetRatio: params.governance.budgetRatio,
  });
  const ledger = await readWorkspaceGovernanceLedger({ workspaceDir: params.workspaceDir });
  const bootstrapFiles = await loadWorkspaceBootstrapFiles(params.workspaceDir);
  const nextBudgets: Record<string, WorkspaceGovernanceBudgetSnapshot> = {};
  const nextPending = [...ledger.pendingProposals];
  let directWrites = 0;
  let proposalCount = 0;

  for (const file of bootstrapFiles) {
    const relativePath = path.basename(file.path);
    const chars = file.content?.trimEnd().length ?? 0;
    const recommended = resolveWorkspaceGovernanceRecommendedBudget(relativePath, budget.target);
    const snapshot: WorkspaceGovernanceBudgetSnapshot = {
      path: relativePath,
      chars,
      target: budget.target,
      warning: budget.warning,
      critical: budget.critical,
      recommended,
      status: classifyWorkspaceGovernanceBudget({
        chars,
        warning: budget.warning,
        critical: budget.critical,
      }),
    };
    nextBudgets[relativePath] = snapshot;

    if (file.missing || !file.content || snapshot.status !== "critical") {
      continue;
    }
    if (nextPending.some((proposal) => proposal.targetPath === relativePath)) {
      continue;
    }

    const compacted = compactWorkspaceContent(file.content);
    if (compacted.length >= file.content.length) {
      continue;
    }

    const isMemoryFile = relativePath.toLowerCase() === "memory.md";
    if (isMemoryFile) {
      await writeRelativeFile(params.workspaceDir, relativePath, compacted);
      directWrites += 1;
      nextBudgets[relativePath] = {
        ...snapshot,
        chars: compacted.trimEnd().length,
        status: classifyWorkspaceGovernanceBudget({
          chars: compacted.trimEnd().length,
          warning: budget.warning,
          critical: budget.critical,
        }),
      };
      continue;
    }

    const proposal: WorkspaceGovernanceProposal = createWorkspaceGovernanceProposal({
      currentContent: file.content,
      targetPath: relativePath,
      targetKind: "structural",
      summary: `Compact oversized ${relativePath}.`,
      reason: "automatic workspace optimization",
      text: compacted.trim(),
      now: params.now,
    });
    proposal.nextContent = compacted;
    proposal.diff = [
      `--- ${relativePath}`,
      `+++ ${relativePath}`,
      "@@ workspace-governor compaction @@",
      `- original_chars=${file.content.trimEnd().length}`,
      `+ compacted_chars=${compacted.trimEnd().length}`,
      "",
    ].join("\n");
    nextPending.push(proposal);
    proposalCount += 1;
  }

  await writeWorkspaceGovernanceLedger({
    workspaceDir: params.workspaceDir,
    ledger: {
      ...ledger,
      lastOptimizedAt: params.now.toISOString(),
      pendingProposals: nextPending,
      budgets: nextBudgets,
    },
  });

  return {
    directWrites,
    proposalCount,
    budgets: nextBudgets,
  };
}
