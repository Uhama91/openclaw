import type { WorkspaceGovernanceIntent } from "./types.js";

export function classifyWorkspaceGovernanceIntent(params: {
  text: string;
  explicitIntent?: WorkspaceGovernanceIntent;
}): WorkspaceGovernanceIntent {
  if (params.explicitIntent) {
    return params.explicitIntent;
  }
  const normalized = params.text.trim().toLowerCase();
  if (!normalized) {
    return "remember_durable";
  }
  if (
    normalized.includes("aujourd") ||
    normalized.includes("session") ||
    normalized.includes("tempora") ||
    normalized.includes("for now") ||
    normalized.includes("today")
  ) {
    return "remember_context";
  }
  if (
    normalized.includes("ton") ||
    normalized.includes("tone") ||
    normalized.includes("persona") ||
    normalized.includes("voice") ||
    normalized.includes("style de l'agent")
  ) {
    return "update_persona";
  }
  if (
    normalized.includes("toujours") ||
    normalized.includes("always") ||
    normalized.includes("never") ||
    normalized.includes("utilise") ||
    normalized.includes("use the skill") ||
    normalized.includes("workflow")
  ) {
    return "update_operating_rule";
  }
  if (
    normalized.includes("prefere") ||
    normalized.includes("préfér") ||
    normalized.includes("call me") ||
    normalized.includes("reply") ||
    normalized.includes("langue") ||
    normalized.includes("language")
  ) {
    return "remember_preference";
  }
  return "remember_durable";
}
