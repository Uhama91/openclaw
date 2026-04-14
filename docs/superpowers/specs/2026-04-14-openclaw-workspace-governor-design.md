# OpenClaw Workspace Governor Spec

**Date**: 2026-04-14  
**Scope**: Native OpenClaw feature for agent workspace self-management  
**Status**: Approved for implementation planning

---

## Context & Objective

OpenClaw already has a clear workspace file layout:

- `AGENTS.md` for operating rules
- `SOUL.md` for persona
- `USER.md` for user profile and preferences
- `TOOLS.md` for local tool guidance
- `MEMORY.md` plus `memory/YYYY-MM-DD.md` for durable and daily memory
- `skills/*/SKILL.md` for workspace-local skills

However, the current system does not natively enforce how the agent should
route new information into those files, when it should write directly versus
propose a diff, or how it should keep bootstrap files small enough to avoid
prompt truncation.

The goal of this feature is to make OpenClaw natively responsible for managing
its own workspace files using deterministic rules, rather than relying on
prompt-only behavior or ad hoc agent discipline.

---

## Target Outcome

After implementation:

1. When a user says "remember this", OpenClaw can deterministically route the
   information to the correct workspace file.
2. Durable memory writes happen automatically in the correct memory file.
3. Structural files such as `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, and
   `skills/*/SKILL.md` are updated through explicit proposed diffs before write.
4. OpenClaw can periodically optimize workspace files so they stay well below
   bootstrap truncation thresholds.
5. The optimization pass runs on the next active turn or session after the due
   interval elapses, without requiring a separate daemon or cron.
6. Workspace governance applies only to files inside the agent workspace, never
   to `~/.openclaw/` config, credentials, or session storage.

---

## Scope

### In scope

- Native routing of workspace writes
- Native proposal workflow for structural workspace files
- Native periodic workspace optimization
- Native per-workspace governance ledger/state
- Native system prompt guidance for the model
- Native tool surface for workspace governance actions

### Out of scope

- Editing `~/.openclaw/openclaw.json`
- Editing credentials, auth profiles, or session transcripts
- Background autonomous jobs independent of active sessions
- General git automation for workspace commits
- Cross-workspace or multi-agent memory synchronization

---

## Product Policy

The governance mode for V1 is **hybrid**:

- `MEMORY.md` and `memory/YYYY-MM-DD.md` may be written directly.
- Structural files require a proposed diff before application:
  - `AGENTS.md`
  - `SOUL.md`
  - `USER.md`
  - `IDENTITY.md`
  - `TOOLS.md`
  - `HEARTBEAT.md`
  - `BOOT.md`
  - `skills/*/SKILL.md`

This policy is deliberate. Memory capture should be low-friction. Structural
changes should remain visible and user-approved.

---

## Architecture Summary

The feature is a native subsystem called **Workspace Governor**.

It has five core components:

1. **WorkspaceIntentClassifier**
   - Converts a raw request into a normalized intent such as
     `remember_user_fact`, `update_operating_rule`, `document_skill`, or
     `optimize_workspace`.

2. **WorkspaceTargetResolver**
   - Maps the normalized intent to the correct workspace file.

3. **WorkspacePolicyEngine**
   - Applies hybrid write policy: auto-write for memory files, diff proposal for
     structural files.

4. **WorkspaceCompactor**
   - Checks file budgets and produces either direct memory cleanup or structural
     compaction proposals.

5. **WorkspaceLedger**
   - Stores governance state in a small workspace-local file such as
     `.openclaw-workspace.json`.

The governor is exposed to the model through a dedicated native tool and is
also used by a session-triggered maintenance path for periodic optimization.

---

## Routing Rules

The default routing table is:

| Intent                                              | Target                   |
| --------------------------------------------------- | ------------------------ |
| Stable user facts                                   | `USER.md`                |
| Durable user preferences                            | `USER.md`                |
| Agent persona / tone                                | `SOUL.md`                |
| Agent identity                                      | `IDENTITY.md`            |
| Durable operating rule                              | `AGENTS.md`              |
| Tool usage convention                               | `TOOLS.md`               |
| Durable fact that does not fit a more specific file | `MEMORY.md`              |
| Temporary running context                           | `memory/YYYY-MM-DD.md`   |
| Heartbeat-only guidance                             | `HEARTBEAT.md`           |
| Boot-time guidance                                  | `BOOT.md`                |
| Skill documentation                                 | `skills/<name>/SKILL.md` |

Resolution rules:

1. If the user explicitly names a file, that choice wins.
2. If the content clearly belongs to a specific workspace file, write there.
3. `MEMORY.md` is fallback durable storage, not a catch-all dump.
4. `memory/YYYY-MM-DD.md` is for current-day context, not durable governance.

---

## Tool Surface

OpenClaw should expose a new native tool:

### `workspace_govern`

Primary actions:

- `remember`
  - Classify and route a raw user fact or preference
- `propose`
  - Produce a structured diff proposal for a structural file
- `apply`
  - Apply a pending proposal by id
- `reject`
  - Reject a pending proposal by id
- `optimize`
  - Run budget checks and generate due compaction work
- `status`
  - Show budgets, pending proposals, and last optimization time

The tool is the stable interface. The model should not need to decide file
paths by itself when the governor is enabled.

---

## Prompt Integration

OpenClaw should add a compact **Workspace Governance** section to the system
prompt when the feature is enabled.

That section should instruct the model:

- use `workspace_govern` when the user asks to remember something
- use `workspace_govern` when updating workspace rules, persona, tool guidance,
  or skill docs
- do not freehand-edit workspace governance files unless explicitly requested
- prefer governor-managed routing over ad hoc markdown edits

This keeps the policy visible every session without forcing large bootstrap text
into `AGENTS.md`.

---

## Session-Triggered Optimization

V1 optimization is **session-triggered**, not daemon-driven.

Behavior:

1. At session start or first active turn, OpenClaw checks whether optimization
   is due.
2. If the due window has not elapsed, nothing happens.
3. If optimization is due, OpenClaw runs the Workspace Compactor.
4. Memory-only cleanup may apply directly.
5. Structural file changes are turned into pending diff proposals.
6. The next user-visible turn can mention those proposals briefly.

This avoids extra infrastructure while still keeping workspace hygiene regular.

---

## Budget Model

The budget model must be dynamic and derived from the actual bootstrap limit.

Definitions:

- `bootstrapMaxChars`: existing OpenClaw truncation threshold
- `hardSafetyBudget = floor(bootstrapMaxChars * 0.70)`

With the default threshold of `20_000`, the hard safety budget becomes `14_000`.

The governor uses three levels:

- **target**: `70%` of `bootstrapMaxChars`
- **warning**: `85%` of target
- **critical**: `100%` of target

In addition, the governor may keep lower **recommended budgets** by file type
for files injected on every session. These recommended budgets are an
optimization layer, not the primary safety invariant.

The hard rule is: the governor should try to keep every bootstrap file below
`70%` of the truncation threshold, not merely below truncation itself.

---

## Compaction Strategy

Compaction must be semantics-preserving and deterministic.

Allowed transforms:

- deduplicate repeated facts or rules
- merge equivalent bullets
- replace long prose with shorter bullets
- move detailed history out of bootstrap files into `MEMORY.md` or
  `memory/YYYY-MM-DD.md`
- preserve section structure when possible

Disallowed transforms:

- changing meaning
- silently deleting unique preferences or rules
- rewriting persona or operating rules without a user-visible proposal
- compacting a structural file while another pending proposal for the same file
  is unresolved

---

## Workspace Ledger

The governor needs a small workspace-local state file, for example:

`<workspace>/.openclaw-workspace.json`

Suggested contents:

- `version`
- `lastOptimizedAt`
- `lastReviewedAt`
- `pendingProposals`
- `fileBudgets`
- `lastCompactionReport`

This file is operational state, not user-facing memory.

---

## Safety Rules

1. The governor only manages files inside the active agent workspace.
2. It never writes to `~/.openclaw/` config or credentials.
3. It never auto-applies structural changes in hybrid mode.
4. It prefers updating an existing section over appending duplicates.
5. It never relies on chat history alone for durable retention.
6. It must degrade safely: if classification fails, it can propose `MEMORY.md`
   or request clarification rather than guessing a structural file.

---

## Configuration

Add a new optional config block under `agents.defaults`:

```json5
{
  agents: {
    defaults: {
      workspaceGovernance: {
        enabled: true,
        mode: "hybrid",
        optimizeEvery: "72h",
        budgetRatio: 0.7,
        ledgerFile: ".openclaw-workspace.json",
      },
    },
  },
}
```

V1 should default to safe, explicit behavior:

- `enabled`: off by default or gated behind explicit opt-in
- `mode`: `hybrid`
- `optimizeEvery`: `72h`
- `budgetRatio`: `0.7`

---

## Implementation Notes

- The existing `agent:bootstrap` hook path is a natural integration point for
  pre-turn budget checks and prompt augmentation.
- The existing memory tooling and workspace helpers already provide a solid base
  for memory-layer integration.
- The governor should reuse current workspace path resolution and bootstrap
  limits rather than redefining them.

---

## Success Criteria

This feature is successful when:

1. The model has a native path for remembering and documenting workspace state.
2. Memory writes land in the right file without user micromanagement.
3. Structural changes are reviewable before apply.
4. Bootstrap files are kept safely below truncation pressure over time.
5. The system is deterministic enough that operators can trust it.
