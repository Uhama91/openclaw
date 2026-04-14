import path from "node:path";
import type { WorkspaceGovernanceIntent, WorkspaceGovernanceTarget } from "./types.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
} from "../agents/workspace.js";

const EXPLICIT_FILE_MAP: Record<
  string,
  { path: string; kind: WorkspaceGovernanceTarget["kind"]; section?: string }
> = {
  "agents.md": { path: DEFAULT_AGENTS_FILENAME, kind: "structural", section: "Operating Rules" },
  "soul.md": { path: DEFAULT_SOUL_FILENAME, kind: "structural", section: "Voice" },
  "identity.md": { path: DEFAULT_IDENTITY_FILENAME, kind: "structural", section: "Identity" },
  "tools.md": { path: DEFAULT_TOOLS_FILENAME, kind: "structural", section: "Tooling" },
  "user.md": { path: DEFAULT_USER_FILENAME, kind: "structural", section: "Preferences" },
  "heartbeat.md": { path: DEFAULT_HEARTBEAT_FILENAME, kind: "structural", section: "Guidance" },
  "boot.md": { path: DEFAULT_BOOTSTRAP_FILENAME, kind: "structural", section: "Bootstrap" },
  "bootstrap.md": { path: DEFAULT_BOOTSTRAP_FILENAME, kind: "structural", section: "Bootstrap" },
  "memory.md": { path: DEFAULT_MEMORY_FILENAME, kind: "memory", section: "Durable Notes" },
};

function formatDailyMemoryPath(now: Date) {
  const iso = now.toISOString().slice(0, 10);
  return path.posix.join("memory", `${iso}.md`);
}

function resolveExplicitFile(explicitFile?: string): WorkspaceGovernanceTarget | null {
  const trimmed = explicitFile?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/\\/g, "/").toLowerCase();
  const mapped =
    EXPLICIT_FILE_MAP[normalized] ?? EXPLICIT_FILE_MAP[path.posix.basename(normalized)];
  if (mapped) {
    return {
      path: mapped.path,
      kind: mapped.kind,
      section: mapped.section,
      reason: "explicit file override",
    };
  }
  if (/^skills\/[^/]+\/skill\.md$/i.test(normalized)) {
    return {
      path: trimmed.replace(/\\/g, "/"),
      kind: "structural",
      section: "Skill Notes",
      reason: "explicit skill file override",
    };
  }
  return null;
}

export function resolveWorkspaceGovernanceTarget(params: {
  intent: WorkspaceGovernanceIntent;
  text: string;
  explicitFile?: string;
  skillName?: string;
  now: Date;
}): WorkspaceGovernanceTarget {
  const explicit = resolveExplicitFile(params.explicitFile);
  if (explicit) {
    return explicit;
  }
  switch (params.intent) {
    case "remember_user_fact":
    case "remember_preference":
      return {
        path: DEFAULT_USER_FILENAME,
        kind: "structural",
        section: "Preferences",
        reason: "user preference or profile",
      };
    case "update_persona":
      return {
        path: DEFAULT_SOUL_FILENAME,
        kind: "structural",
        section: "Voice",
        reason: "agent persona update",
      };
    case "update_identity":
      return {
        path: DEFAULT_IDENTITY_FILENAME,
        kind: "structural",
        section: "Identity",
        reason: "agent identity update",
      };
    case "update_operating_rule":
      return {
        path: DEFAULT_AGENTS_FILENAME,
        kind: "structural",
        section: "Operating Rules",
        reason: "operating rule update",
      };
    case "document_tool_usage":
      return {
        path: DEFAULT_TOOLS_FILENAME,
        kind: "structural",
        section: "Tooling",
        reason: "tool usage convention",
      };
    case "document_skill": {
      const skillName = params.skillName?.trim();
      if (!skillName) {
        throw new Error("skillName required for document_skill");
      }
      return {
        path: path.posix.join("skills", skillName, "SKILL.md"),
        kind: "structural",
        section: "Skill Notes",
        reason: "skill documentation",
      };
    }
    case "remember_context":
      return {
        path: formatDailyMemoryPath(params.now),
        kind: "memory",
        section: "Session Notes",
        reason: "temporary running context",
      };
    case "optimize_workspace":
    case "remember_durable":
    default:
      return {
        path: DEFAULT_MEMORY_FILENAME,
        kind: "memory",
        section: "Durable Notes",
        reason: "durable workspace memory",
      };
  }
}
