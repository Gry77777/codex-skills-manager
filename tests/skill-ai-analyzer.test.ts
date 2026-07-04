import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSkillAnalysisInput } from "../src/shared/types.js";
import { parseAiSkillAnalysis, SkillAiAnalyzer } from "../src/main/skill-ai-analyzer.js";

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

        const body = JSON.parse(String(init?.body)) as {
          model: string;
          messages: Array<{ role: string; content: string }>;
          response_format?: { type?: string };
        };
        expect(body.model).toBe("MiniMax-M3");
        expect(body.messages[0].role).toBe("system");
        expect(body.messages[1].content).toContain("SKILL.md 内容");
        expect(body.response_format).toEqual({ type: "json_object" });

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

  it("falls back when an OpenAI-compatible provider rejects JSON mode", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { response_format?: unknown };
      if (body.response_format) {
        return new Response(
          JSON.stringify({
            error: {
              message: "response_format is not supported by this model"
            }
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summaryZh: "退回普通模式后仍能解析。",
                  useCases: ["兼容中转站"],
                  tags: ["兼容"],
                  riskLevel: "low",
                  risks: [],
                  dependencies: [],
                  managementAdvice: ["继续使用"],
                  enableRecommendation: "review-first",
                  confidence: 0.66
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const analyzer = new SkillAiAnalyzer({
      resolve: async () => ({
        enabled: true,
        provider: "custom-openai-compatible",
        baseUrl: "https://proxy.example.com/v1",
        model: "proxy-model",
        hasApiKey: true,
        keyStorage: "safe-storage",
        apiKey: "test-key"
      })
    });

    const analysis = await analyzer.analyzeSkill(makeInput("fallback-skill"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(analysis.summaryZh).toBe("退回普通模式后仍能解析。");
    expect(analysis.confidence).toBe(0.66);
  });

  it("parses fenced, prose-wrapped, and lightly malformed JSON outputs", () => {
    const fenced = parseAiSkillAnalysis(`\`\`\`json
{
  "summaryZh": "代码块里的 JSON 可以解析。",
  "useCases": "单个场景也会归一化",
  "tags": ["json"],
  "riskLevel": "低风险",
  "risks": [],
  "dependencies": [],
  "managementAdvice": [],
  "enableRecommendation": "review-first",
  "confidence": 0.9
}
\`\`\``);
    expect(fenced.summaryZh).toBe("代码块里的 JSON 可以解析。");
    expect(fenced.useCases).toEqual(["单个场景也会归一化"]);
    expect(fenced.riskLevel).toBe("low");

    const proseWrapped = parseAiSkillAnalysis(`下面是分析结果：
{
  "analysis": {
    "summaryZh": "前后带说明文字也可以解析。",
    "useCases": ["批量识别"],
    "tags": ["AI"],
    "riskLevel": "medium",
    "risks": [],
    "dependencies": [],
    "managementAdvice": [],
    "enableRecommendation": "review-first",
    "confidence": 0.75
  }
}
请查收。`);
    expect(proseWrapped.summaryZh).toBe("前后带说明文字也可以解析。");

    const trailingComma = parseAiSkillAnalysis(`{
  "summaryZh": "尾逗号可以被轻量修复。",
  "useCases": ["兼容模型输出"],
  "tags": ["repair",],
  "riskLevel": "high",
  "risks": [],
  "dependencies": [],
  "managementAdvice": [],
  "enableRecommendation": "keep-disabled",
  "confidence": 0.8,
}`);
    expect(trailingComma.tags).toEqual(["repair"]);
    expect(trailingComma.enableRecommendation).toBe("keep-disabled");
  });
});

function makeInput(name: string): AiSkillAnalysisInput {
  return {
    skill: {
      id: name,
      name,
      description: "Test skill",
      summaryZh: "测试技能。",
      source: "imported",
      status: "disabled",
      valid: true,
      issues: [],
      hash: `${name}-hash`
    },
    markdown: `---\nname: ${name}\ndescription: Test skill\n---\n`
  };
}
