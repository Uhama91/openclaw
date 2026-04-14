import type { WorkspaceGovernanceProposal, WorkspaceGovernanceTargetKind } from "./types.js";

function normalizeBullet(text: string) {
  return text.trim().replace(/^-\s*/, "");
}

function appendSection(content: string, section: string, bullet: string) {
  const trimmed = content.trimEnd();
  const block = [`## ${section}`, `- ${bullet}`].join("\n");
  if (!trimmed) {
    return `${block}\n`;
  }
  return `${trimmed}\n\n${block}\n`;
}

export function renderWorkspaceGovernanceContentUpdate(params: {
  currentContent: string;
  section?: string;
  text: string;
}): string {
  const bullet = normalizeBullet(params.text);
  const currentContent = params.currentContent.trimEnd();
  if (!params.section) {
    if (!currentContent) {
      return `- ${bullet}\n`;
    }
    if (currentContent.includes(`- ${bullet}`)) {
      return `${currentContent}\n`;
    }
    return `${currentContent}\n- ${bullet}\n`;
  }
  const heading = `## ${params.section}`;
  if (!currentContent.includes(heading)) {
    return appendSection(currentContent, params.section, bullet);
  }
  if (currentContent.includes(`- ${bullet}`)) {
    return `${currentContent}\n`;
  }
  const sectionPattern = new RegExp(
    `(^## ${params.section.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\n)([\\s\\S]*?)(?=\\n## |$)`,
    "m",
  );
  const updated = currentContent.replace(sectionPattern, (_match, headingBlock, body) => {
    const trimmedBody = String(body).trimEnd();
    const nextBody = trimmedBody ? `${trimmedBody}\n- ${bullet}` : `- ${bullet}`;
    return `${headingBlock}${nextBody}`;
  });
  return `${updated}\n`;
}

function buildSimpleUnifiedDiff(params: {
  targetPath: string;
  currentContent: string;
  nextContent: string;
}) {
  const oldLines = params.currentContent.trimEnd().split("\n");
  const newLines = params.nextContent.trimEnd().split("\n");
  const added = newLines.filter((line) => !oldLines.includes(line));
  const removed = oldLines.filter((line) => !newLines.includes(line));
  return [
    `--- ${params.targetPath}`,
    `+++ ${params.targetPath}`,
    "@@ workspace-governor @@",
    ...removed.map((line) => `- ${line}`),
    ...added.map((line) => `+ ${line}`),
    "",
  ].join("\n");
}

export function createWorkspaceGovernanceProposal(params: {
  currentContent: string;
  targetPath: string;
  targetKind: WorkspaceGovernanceTargetKind;
  section?: string;
  summary: string;
  reason: string;
  text: string;
  now: Date;
}): WorkspaceGovernanceProposal {
  const nextContent = renderWorkspaceGovernanceContentUpdate({
    currentContent: params.currentContent,
    section: params.section,
    text: params.text,
  });
  return {
    id: `proposal-${params.now.getTime()}`,
    createdAt: params.now.toISOString(),
    updatedAt: params.now.toISOString(),
    targetPath: params.targetPath,
    targetKind: params.targetKind,
    section: params.section,
    summary: params.summary,
    reason: params.reason,
    nextContent,
    diff: buildSimpleUnifiedDiff({
      targetPath: params.targetPath,
      currentContent: params.currentContent,
      nextContent,
    }),
  };
}
