import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSkillAnalysisInput } from "../src/shared/types.js";
import { SkillAiAnalyzer } from "../src/main/skill-ai-analyzer.js";

describe("SkillAiAnalyzer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls an OpenAI-compatible endpoint and parses JSON analysis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe("https://api.minimaxi.com/v1/chat/completions");
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

        const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
        expect(body.model).toBe("MiniMax-M3");
        expect(body.messages[0].role).toBe("system");
        expect(body.messages[1].content).toContain("SKILL.md 内容");

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summaryZh: "用于管理 Codex skills 的测试技能。",
                    useCases: ["整理技能", "风险分析"],
                    tags: ["管理", "AI"],
                    riskLevel: "low",
                    risks: ["无明显高风险"],
                    dependencies: ["MiniMax API"],
                    managementAdvice: ["导入后先保持关闭并检查说明"],
                    enableRecommendation: "review-first",
                    confidence: 0.82
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const analyzer = new SkillAiAnalyzer({
      resolve: async () => ({
        enabled: true,
        provider: "minimax",
        baseUrl: "https://api.minimaxi.com/v1",
        model: "MiniMax-M3",
        hasApiKey: true,
        keyStorage: "safe-storage",
        apiKey: "test-key"
      })
    });

    const input: AiSkillAnalysisInput = {
      skill: {
        id: "skill-1",
        name: "skill-manager",
        description: "Manage skills",
        summaryZh: "管理技能。",
        source: "imported",
        status: "disabled",
        valid: true,
        issues: [],
        hash: "hash-1"
      },
      markdown: "---\nname: skill-manager\ndescription: Manage skills\n---\n"
    };

    const analysis = await analyzer.analyzeSkill(input);

    expect(analysis.summaryZh).toBe("用于管理 Codex skills 的测试技能。");
    expect(analysis.riskLevel).toBe("low");
    expect(analysis.enableRecommendation).toBe("review-first");
    expect(analysis.confidence).toBe(0.82);
  });

  it("calls an Anthropic Messages endpoint when the provider uses that protocol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("anthropic-key");
        expect((init?.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");

        const body = JSON.parse(String(init?.body)) as {
          model: string;
          system: string;
          messages: Array<{ role: string; content: string }>;
        };
        expect(body.model).toBe("claude-sonnet-4-5");
        expect(body.system).toContain("安全分析助手");
        expect(body.messages[0].role).toBe("user");
        expect(body.messages[0].content).toContain("SKILL.md 内容");

        return new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  summaryZh: "用于测试 Claude 协议的技能。",
                  useCases: ["协议测试"],
                  tags: ["Claude"],
                  riskLevel: "medium",
                  risks: ["需要外部 API"],
                  dependencies: ["Anthropic API"],
                  managementAdvice: ["先审查再启用"],
                  enableRecommendation: "review-first",
                  confidence: 0.7
                })
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const analyzer = new SkillAiAnalyzer({
      resolve: async () => ({
        enabled: true,
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-5",
        hasApiKey: true,
        keyStorage: "safe-storage",
        apiKey: "anthropic-key"
      })
    });

    const input: AiSkillAnalysisInput = {
      skill: {
        id: "skill-2",
        name: "claude-skill",
        description: "Claude test",
        summaryZh: "测试 Claude。",
        source: "imported",
        status: "disabled",
        valid: true,
        issues: [],
        hash: "hash-2"
      },
      markdown: "---\nname: claude-skill\ndescription: Claude test\n---\n"
    };

    const analysis = await analyzer.analyzeSkill(input);

    expect(analysis.summaryZh).toBe("用于测试 Claude 协议的技能。");
    expect(analysis.riskLevel).toBe("medium");
    expect(analysis.confidence).toBe(0.7);
  });
});
