import fs from "node:fs/promises";
import path from "node:path";
import type { WorkspaceGovernanceTarget } from "./types.js";
import { readWorkspaceGovernanceLedger, writeWorkspaceGovernanceLedger } from "./ledger.js";
import {
  createWorkspaceGovernanceProposal,
  renderWorkspaceGovernanceContentUpdate,
} from "./proposals.js";

function resolveWorkspacePath(workspaceDir: string, relativePath: string) {
  const resolved = path.resolve(workspaceDir, relativePath);
  const relative = path.relative(workspaceDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`workspace_govern target escapes workspace: ${relativePath}`);
  }
  return resolved;
}

async function readTargetFile(workspaceDir: string, relativePath: string) {
  const filePath = resolveWorkspacePath(workspaceDir, relativePath);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function writeTargetFile(workspaceDir: string, relativePath: string, content: string) {
  const filePath = resolveWorkspacePath(workspaceDir, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

export async function applyWorkspaceGovernanceAction(params: {
  workspaceDir: string;
  target: WorkspaceGovernanceTarget;
  text: string;
  summary: string;
  now: Date;
}): Promise<
  | { mode: "direct"; targetPath: string; content: string }
  | { mode: "proposal"; targetPath: string; proposalId: string }
> {
  const currentContent = await readTargetFile(params.workspaceDir, params.target.path);
  if (params.target.kind === "memory") {
    const nextContent = renderWorkspaceGovernanceContentUpdate({
      currentContent,
      section: params.target.section,
      text: params.text,
    });
    await writeTargetFile(params.workspaceDir, params.target.path, nextContent);
    return {
      mode: "direct",
      targetPath: params.target.path,
      content: nextContent,
    };
  }

  const ledger = await readWorkspaceGovernanceLedger({ workspaceDir: params.workspaceDir });
  const existing = ledger.pendingProposals.find(
    (proposal) => proposal.targetPath === params.target.path,
  );
  if (existing) {
    throw new Error(`pending proposal already exists for ${params.target.path}`);
  }

  const proposal = createWorkspaceGovernanceProposal({
    currentContent,
    targetPath: params.target.path,
    targetKind: params.target.kind,
    section: params.target.section,
    summary: params.summary,
    reason: params.target.reason,
    text: params.text,
    now: params.now,
  });

  await writeWorkspaceGovernanceLedger({
    workspaceDir: params.workspaceDir,
    ledger: {
      ...ledger,
      pendingProposals: [...ledger.pendingProposals, proposal],
    },
  });
  return {
    mode: "proposal",
    targetPath: params.target.path,
    proposalId: proposal.id,
  };
}

export async function applyWorkspaceGovernanceProposal(params: {
  workspaceDir: string;
  proposalId: string;
}) {
  const ledger = await readWorkspaceGovernanceLedger({ workspaceDir: params.workspaceDir });
  const proposal = ledger.pendingProposals.find((entry) => entry.id === params.proposalId);
  if (!proposal) {
    throw new Error(`unknown workspace governance proposal: ${params.proposalId}`);
  }
  await writeTargetFile(params.workspaceDir, proposal.targetPath, proposal.nextContent);
  await writeWorkspaceGovernanceLedger({
    workspaceDir: params.workspaceDir,
    ledger: {
      ...ledger,
      pendingProposals: ledger.pendingProposals.filter((entry) => entry.id !== params.proposalId),
    },
  });
  return proposal;
}

export async function rejectWorkspaceGovernanceProposal(params: {
  workspaceDir: string;
  proposalId: string;
}) {
  const ledger = await readWorkspaceGovernanceLedger({ workspaceDir: params.workspaceDir });
  const proposal = ledger.pendingProposals.find((entry) => entry.id === params.proposalId);
  if (!proposal) {
    throw new Error(`unknown workspace governance proposal: ${params.proposalId}`);
  }
  await writeWorkspaceGovernanceLedger({
    workspaceDir: params.workspaceDir,
    ledger: {
      ...ledger,
      pendingProposals: ledger.pendingProposals.filter((entry) => entry.id !== params.proposalId),
    },
  });
  return proposal;
}
