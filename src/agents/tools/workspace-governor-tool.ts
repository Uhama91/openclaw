import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { classifyWorkspaceGovernanceIntent } from "../../workspace-governor/classifier.js";
import { compactWorkspaceGovernance } from "../../workspace-governor/compactor.js";
import {
  applyWorkspaceGovernanceAction,
  applyWorkspaceGovernanceProposal,
  rejectWorkspaceGovernanceProposal,
} from "../../workspace-governor/policy.js";
import {
  getWorkspaceGovernanceStatus,
  resolveWorkspaceGovernanceConfig,
} from "../../workspace-governor/runtime.js";
import { resolveWorkspaceGovernanceTarget } from "../../workspace-governor/targets.js";
import { resolveBootstrapMaxChars } from "../pi-embedded-helpers.js";
import { jsonResult, readStringParam } from "./common.js";

const WORKSPACE_GOVERNOR_ACTIONS = [
  "remember",
  "propose",
  "apply",
  "reject",
  "optimize",
  "status",
] as const;

const WORKSPACE_GOVERNOR_INTENTS = [
  "remember_user_fact",
  "remember_preference",
  "update_persona",
  "update_identity",
  "update_operating_rule",
  "document_tool_usage",
  "document_skill",
  "remember_context",
  "remember_durable",
  "optimize_workspace",
] as const;

const WorkspaceGovernorToolSchema = Type.Object({
  action: Type.Union(WORKSPACE_GOVERNOR_ACTIONS.map((value) => Type.Literal(value))),
  text: Type.Optional(Type.String()),
  intent: Type.Optional(Type.Union(WORKSPACE_GOVERNOR_INTENTS.map((value) => Type.Literal(value)))),
  file: Type.Optional(Type.String()),
  skillName: Type.Optional(Type.String()),
  proposalId: Type.Optional(Type.String()),
});

export function createWorkspaceGovernorTool(options: {
  workspaceDir?: string;
  config?: OpenClawConfig;
}): AnyAgentTool | null {
  const workspaceDir = options.workspaceDir?.trim();
  const governance = resolveWorkspaceGovernanceConfig(options.config);
  if (!workspaceDir || !governance) {
    return null;
  }
  return {
    label: "Workspace Governor",
    name: "workspace_govern",
    description:
      "Manage workspace governance files. Use remember to route durable information, apply/reject to manage pending proposals, optimize to run compaction, and status to inspect pending proposals and budgets.",
    parameters: WorkspaceGovernorToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const now = new Date();

      switch (action) {
        case "status":
          return jsonResult(
            await getWorkspaceGovernanceStatus({ workspaceDir, config: options.config, now }),
          );
        case "optimize":
          return jsonResult({
            ran: true,
            ...(await compactWorkspaceGovernance({
              workspaceDir,
              governance,
              bootstrapMaxChars: resolveBootstrapMaxChars(options.config),
              now,
            })),
          });
        case "apply": {
          const proposalId = readStringParam(params, "proposalId", { required: true });
          const proposal = await applyWorkspaceGovernanceProposal({ workspaceDir, proposalId });
          return jsonResult({
            action,
            applied: true,
            proposalId,
            targetPath: proposal.targetPath,
          });
        }
        case "reject": {
          const proposalId = readStringParam(params, "proposalId", { required: true });
          const proposal = await rejectWorkspaceGovernanceProposal({ workspaceDir, proposalId });
          return jsonResult({
            action,
            rejected: true,
            proposalId,
            targetPath: proposal.targetPath,
          });
        }
        case "remember":
        case "propose": {
          const text = readStringParam(params, "text", { required: true });
          const explicitIntent = readStringParam(params, "intent");
          const intent = classifyWorkspaceGovernanceIntent({
            text,
            explicitIntent: explicitIntent as
              | Parameters<typeof classifyWorkspaceGovernanceIntent>[0]["explicitIntent"]
              | undefined,
          });
          const target = resolveWorkspaceGovernanceTarget({
            intent,
            text,
            explicitFile: readStringParam(params, "file"),
            skillName: readStringParam(params, "skillName"),
            now,
          });
          if (action === "propose" && target.kind === "memory") {
            throw new Error("propose requires a structural target");
          }
          const result = await applyWorkspaceGovernanceAction({
            workspaceDir,
            target: action === "propose" ? { ...target, kind: "structural" } : target,
            text,
            summary: text,
            now,
          });
          return jsonResult({
            action,
            intent,
            ...result,
          });
        }
        default:
          throw new Error(`unsupported workspace_govern action: ${action}`);
      }
    },
  };
}
