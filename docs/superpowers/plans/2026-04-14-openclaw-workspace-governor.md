# OpenClaw Workspace Governor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native OpenClaw workspace governor that routes durable information into the correct workspace files, enforces hybrid write policy, and runs session-triggered workspace optimization every 72 hours using a dynamic 70% bootstrap budget.

**Architecture:** Introduce a dedicated workspace-governor subsystem with a typed ledger, deterministic target resolver, hybrid policy engine, a new `workspace_govern` native tool, and a session-triggered compaction path integrated into the existing workspace/bootstrap flow. Reuse existing workspace helpers, bootstrap max-char resolution, and tool-registration patterns instead of inventing parallel infrastructure.

**Tech Stack:** TypeScript, Zod config schema, OpenClaw agent tools, workspace/bootstrap helpers, Vitest

---

### Task 1: Add config and ledger primitives

**Files:**

- Create: `src/workspace-governor/types.ts`
- Create: `src/workspace-governor/ledger.ts`
- Modify: `src/config/types.agent-defaults.ts`
- Modify: `src/config/zod-schema.agent-defaults.ts`
- Test: `src/workspace-governor/ledger.test.ts`
- Test: `src/config/config.workspace-governance.test.ts`

- [ ] Define typed governor config with `enabled`, `mode`, `optimizeEvery`, `budgetRatio`, and `ledgerFile`.
- [ ] Add typed ledger models for `pendingProposals`, `lastOptimizedAt`, and per-file budget snapshots.
- [ ] Implement atomic read/write helpers for the workspace ledger.
- [ ] Add config schema validation for the new `agents.defaults.workspaceGovernance` block.
- [ ] Write tests for defaults, invalid values, and atomic ledger persistence.

### Task 2: Build intent classification and target resolution

**Files:**

- Create: `src/workspace-governor/classifier.ts`
- Create: `src/workspace-governor/targets.ts`
- Create: `src/workspace-governor/budgets.ts`
- Test: `src/workspace-governor/classifier.test.ts`
- Test: `src/workspace-governor/targets.test.ts`
- Test: `src/workspace-governor/budgets.test.ts`

- [ ] Define normalized intents such as `remember_user_fact`, `update_operating_rule`, and `document_skill`.
- [ ] Implement deterministic target resolution for workspace files only.
- [ ] Compute dynamic hard safety budgets from `bootstrapMaxChars * 0.70`.
- [ ] Add recommended-budget support for bootstrap-heavy files without making it the hard invariant.
- [ ] Write tests for explicit-file override, fallback-to-memory, and 70% budget calculations.

### Task 3: Implement hybrid write policy and proposal model

**Files:**

- Create: `src/workspace-governor/policy.ts`
- Create: `src/workspace-governor/proposals.ts`
- Test: `src/workspace-governor/policy.test.ts`
- Test: `src/workspace-governor/proposals.test.ts`

- [ ] Encode hybrid policy: direct writes for `MEMORY.md` and `memory/*.md`, proposals for structural files.
- [ ] Add proposal ids, target metadata, unified diff payloads, and apply/reject state transitions.
- [ ] Prevent duplicate unresolved proposals for the same file/section.
- [ ] Ensure structural writes never auto-apply in hybrid mode.
- [ ] Write tests for direct-memory writes, proposal generation, apply, reject, and duplicate prevention.

### Task 4: Add the native `workspace_govern` tool

**Files:**

- Create: `src/agents/tools/workspace-governor-tool.ts`
- Modify: `src/agents/openclaw-tools.ts`
- Modify: `src/agents/tool-policy.ts`
- Modify: `src/agents/tool-display.json`
- Test: `src/agents/tools/workspace-governor-tool.test.ts`

- [ ] Implement tool actions: `remember`, `propose`, `apply`, `reject`, `optimize`, `status`.
- [ ] Wire the tool into `createOpenClawTools`.
- [ ] Add tool display metadata and policy-group coverage.
- [ ] Ensure the tool can resolve the active workspace and ledger safely.
- [ ] Write tests for each action and error cases such as unknown proposal id or disabled governance.

### Task 5: Integrate session-triggered optimization

**Files:**

- Create: `src/workspace-governor/compactor.ts`
- Create: `src/workspace-governor/runtime.ts`
- Modify: `src/agents/bootstrap-files.ts`
- Modify: `src/agents/system-prompt.ts`
- Test: `src/workspace-governor/compactor.test.ts`
- Test: `src/workspace-governor/runtime.test.ts`
- Test: `src/agents/bootstrap-files.workspace-governor.test.ts`
- Test: `src/agents/system-prompt.workspace-governor.test.ts`

- [ ] Implement due-check logic using `optimizeEvery` and `lastOptimizedAt`.
- [ ] Run compaction only on active turn/session, not in a background daemon.
- [ ] Generate direct memory cleanup or structural proposals depending on file type.
- [ ] Add a compact system-prompt section telling the model to use `workspace_govern` instead of freehand editing workspace governance files.
- [ ] Write tests for not-due, due, proposal generation, and prompt-section rendering.

### Task 6: Preserve semantics during compaction

**Files:**

- Modify: `src/workspace-governor/compactor.ts`
- Test: `src/workspace-governor/compactor.semantic.test.ts`

- [ ] Add deterministic transforms only: dedupe, merge equivalent bullets, shorten wording, move detail to memory files.
- [ ] Block unsafe transforms that change meaning or overwrite unresolved structural proposals.
- [ ] Add tests that prove compaction does not silently drop unique rules or preferences.

### Task 7: Document the feature

**Files:**

- Create: `docs/concepts/workspace-governance.md`
- Modify: `docs/concepts/agent-workspace.md`
- Modify: `docs/concepts/memory.md`
- Modify: `docs/concepts/system-prompt.md`
- Modify: `docs/hooks.md`

- [ ] Document the governor lifecycle, routing rules, hybrid mode, and 72-hour optimization behavior.
- [ ] Document the new tool and config block.
- [ ] Document how the governor coexists with hooks and existing memory flush behavior.
- [ ] Proofread links and keep Mintlify link conventions valid.

### Task 8: End-to-end validation

**Files:**

- Create: `src/workspace-governor/e2e.test.ts`

- [ ] Add an end-to-end test: user says “remember that I prefer short replies”, governor writes to `USER.md`.
- [ ] Add an end-to-end test: user updates an operating rule, governor creates a proposal for `AGENTS.md`.
- [ ] Add an end-to-end test: optimization becomes due after 72h and proposes compaction for an oversized `TOOLS.md`.
- [ ] Run the focused governor test suite.
- [ ] Run the broader agent/bootstrap/config test suite.

### Task 9: Verification commands

**Files:**

- None

- [ ] Run: `pnpm test src/workspace-governor`
- [ ] Run: `pnpm test src/agents/tools/workspace-governor-tool.test.ts`
- [ ] Run: `pnpm test src/agents/bootstrap-files.workspace-governor.test.ts`
- [ ] Run: `pnpm test src/agents/system-prompt.workspace-governor.test.ts`
- [ ] Run: `pnpm test src/config/config.workspace-governance.test.ts`
- [ ] Run: `pnpm check`
