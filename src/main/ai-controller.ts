import type {
  AiAnalysisCacheView,
  AiBatchAnalysisResult,
  AiBatchAnalysisProgress,
  AiConnectionTestResult,
  AiSettingsInput,
  AiSettingsView,
  AiSkillAnalysis,
  AiSkillAnalysisRecord,
  AiSkillAnalysisInput
} from "../shared/types.js";
import { AiAnalysisCache } from "./ai-analysis-cache.js";
import { DEFAULT_AI_PROVIDER, getAiProviderPreset, normalizeAiProvider } from "../shared/ai-providers.js";
import { AiSettingsStore } from "./ai-settings.js";
import { SkillAiAnalyzer } from "./skill-ai-analyzer.js";
import type { SkillsController } from "./skills-controller.js";

export class AiController {
  private readonly settingsStore = new AiSettingsStore();
  private readonly analyzer = new SkillAiAnalyzer(this.settingsStore);
  private readonly cache = new AiAnalysisCache();

  constructor(private readonly skillsController?: SkillsController) {}

  async getSettings(): Promise<AiSettingsView> {
    return this.settingsStore.read();
  }

  async saveSettings(input: AiSettingsInput): Promise<AiSettingsView> {
    assertSettingsInput(input);
    return this.settingsStore.save(input);
  }

  async testConnection(input?: AiSettingsInput): Promise<AiConnectionTestResult> {
    if (input) {
      assertSettingsInput(input);
    }

    return this.analyzer.testConnection(input);
  }

  async analyzeSkill(input: AiSkillAnalysisInput): Promise<AiSkillAnalysis> {
    assertAnalysisInput(input);
    const analysis = await this.analyzer.analyzeSkill(input);
    const settings = await this.settingsStore.read();
    await this.cache.set({
      skillId: input.skill.id,
      skillHash: input.skill.hash,
      analysis,
      analyzedAt: new Date().toISOString(),
      provider: settings.provider,
      model: settings.model
    });
    return analysis;
  }

  async getAnalysisCache(): Promise<AiAnalysisCacheView> {
    return this.cache.read();
  }

  async analyzeSkills(
    skillIds: string[],
    onProgress?: (progress: AiBatchAnalysisProgress) => void,
    signal?: AbortSignal
  ): Promise<AiBatchAnalysisResult> {
    if (!this.skillsController) {
      throw new Error("AI 批量识别没有可用的技能控制器。");
    }

    if (!Array.isArray(skillIds) || skillIds.length === 0) {
      throw new Error("请选择要识别的技能。");
    }

    if (skillIds.length > 24) {
      throw new Error("一次最多识别当前页 24 个技能。");
    }

    const uniqueSkillIds = [...new Set(skillIds.filter((id) => typeof id === "string" && id.trim()))];
    const skills = await this.skillsController.list();
    const settings = await this.settingsStore.read();
    const analyzed: AiSkillAnalysisRecord[] = [];
    const skipped: AiBatchAnalysisResult["skipped"] = [];
    const failed: AiBatchAnalysisResult["failed"] = [];
    const total = uniqueSkillIds.length;
    let completed = 0;
    const emitProgress = (
      patch: Partial<AiBatchAnalysisProgress> & Pick<AiBatchAnalysisProgress, "stage" | "message">
    ): void => {
      onProgress?.({
        total,
        completed,
        analyzed: analyzed.length,
        skipped: skipped.length,
        failed: failed.length,
        ...patch
      });
    };

    emitProgress({
      stage: "preparing",
      message: `准备识别 ${total} 个技能。AI 会读取 SKILL.md，生成中文作用、标签、风险和启用建议。`
    });

    for (const skillId of uniqueSkillIds) {
      throwIfAborted(signal, "AI 识别已取消。");
      const skill = skills.find((record) => record.id === skillId);
      if (!skill) {
        skipped.push({ skillId, reason: "技能不存在或已被移除。" });
        completed += 1;
        emitProgress({
          stage: "skipped",
          currentSkillId: skillId,
          message: "技能不存在或已经被移除，已跳过。"
        });
        continue;
      }

      if (!skill.valid) {
        skipped.push({ skillId, reason: "无效技能暂不发送给 AI 识别。" });
        completed += 1;
        emitProgress({
          stage: "skipped",
          currentSkillId: skill.id,
          currentSkillName: skill.name,
          message: `${skill.name} 当前无效，不发送给 AI，已跳过。`
        });
        continue;
      }

      const cached = await this.cache.get(skill.id);
      if (cached && cached.skillHash === skill.hash) {
        skipped.push({ skillId, reason: "已有最新 AI 识别缓存。" });
        completed += 1;
        emitProgress({
          stage: "skipped",
          currentSkillId: skill.id,
          currentSkillName: skill.name,
          record: cached,
          message: `${skill.name} 已有最新 AI 缓存，直接复用。`
        });
        continue;
      }

      try {
        emitProgress({
          stage: "analyzing",
          currentSkillId: skill.id,
          currentSkillName: skill.name,
          message: `正在识别 ${skill.name}。`
        });
        const markdown = await this.skillsController.readSkillMd(skill.id);
        const analysis = await this.analyzer.analyzeSkill({
          skill: {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            summaryZh: skill.summaryZh,
            source: skill.source,
            status: skill.status,
            valid: skill.valid,
            issues: skill.issues,
            hash: skill.hash
          },
          markdown
        }, signal);
        const record: AiSkillAnalysisRecord = {
          skillId: skill.id,
          skillHash: skill.hash,
          analysis,
          analyzedAt: new Date().toISOString(),
          provider: settings.provider,
          model: settings.model
        };
        await this.cache.set(record);
        analyzed.push(record);
        completed += 1;
        emitProgress({
          stage: "analyzed",
          currentSkillId: skill.id,
          currentSkillName: skill.name,
          record,
          message: `${skill.name} 已识别完成。`
        });
      } catch (error) {
        throwIfAborted(signal, "AI 识别已取消。");
        failed.push({
          skillId,
          reason: error instanceof Error ? error.message : "AI 识别失败。"
        });
        completed += 1;
        emitProgress({
          stage: "failed",
          currentSkillId: skill.id,
          currentSkillName: skill.name,
          message: `${skill.name} 识别失败。`
        });
      }
    }

    emitProgress({
      stage: "complete",
      message: `AI 识别完成：新增 ${analyzed.length} 个，跳过 ${skipped.length} 个，失败 ${failed.length} 个。`
    });
    return { analyzed, skipped, failed };
  }
}

function assertSettingsInput(input: AiSettingsInput): void {
  if (!input || typeof input !== "object") {
    throw new Error("AI 设置格式无效。");
  }

  if (typeof input.enabled !== "boolean") {
    throw new Error("AI 设置缺少启用状态。");
  }

  input.provider = normalizeAiProvider(input.provider ?? DEFAULT_AI_PROVIDER);
  const preset = getAiProviderPreset(input.provider);

  if (typeof input.baseUrl !== "string") {
    input.baseUrl = preset.defaultBaseUrl;
  }

  if (typeof input.model !== "string") {
    input.model = preset.defaultModel;
  }

  if (input.apiKey !== undefined && typeof input.apiKey !== "string") {
    throw new Error("API Key 格式无效。");
  }
}

function assertAnalysisInput(input: AiSkillAnalysisInput): void {
  if (!input || typeof input !== "object" || !input.skill || typeof input.markdown !== "string") {
    throw new Error("AI 分析输入无效。");
  }

  if (typeof input.skill.id !== "string" || typeof input.skill.name !== "string" || typeof input.skill.hash !== "string") {
    throw new Error("AI 分析缺少技能信息。");
  }
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) {
    throw new Error(message);
  }
}
