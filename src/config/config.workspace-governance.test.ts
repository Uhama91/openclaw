import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempHome } from "./test-helpers.js";

describe("config workspace governance", () => {
  it("applies defaults when workspace governance is enabled", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".openclaw");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "openclaw.json"),
        JSON.stringify(
          {
            agents: {
              defaults: {
                workspaceGovernance: {
                  enabled: true,
                },
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      vi.resetModules();
      const { loadConfig } = await import("./config.js");
      const cfg = loadConfig();

      expect(cfg.agents?.defaults?.workspaceGovernance?.enabled).toBe(true);
      expect(cfg.agents?.defaults?.workspaceGovernance?.mode).toBe("hybrid");
      expect(cfg.agents?.defaults?.workspaceGovernance?.optimizeEvery).toBe("72h");
      expect(cfg.agents?.defaults?.workspaceGovernance?.budgetRatio).toBe(0.7);
      expect(cfg.agents?.defaults?.workspaceGovernance?.ledgerFile).toBe(
        ".openclaw-workspace.json",
      );
    });
  });

  it("treats an empty workspace governance block as enabled", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".openclaw");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "openclaw.json"),
        JSON.stringify(
          {
            agents: {
              defaults: {
                workspaceGovernance: {},
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      vi.resetModules();
      const { loadConfig } = await import("./config.js");
      const cfg = loadConfig();

      expect(cfg.agents?.defaults?.workspaceGovernance?.enabled).toBe(true);
      expect(cfg.agents?.defaults?.workspaceGovernance?.mode).toBe("hybrid");
    });
  });

  it("rejects budget ratios above 1", async () => {
    const { validateConfigObject } = await import("./validation.js");
    const result = validateConfigObject({
      agents: {
        defaults: {
          workspaceGovernance: {
            enabled: true,
            budgetRatio: 1.2,
          },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected validation failure");
    }
    expect(result.issues[0]?.path).toBe("agents.defaults.workspaceGovernance.budgetRatio");
  });
});
