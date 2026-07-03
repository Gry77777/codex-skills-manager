import type { SkillIssue, SkillSource } from "../shared/types.js";

type SkillSummaryInput = {
  name: string;
  description: string;
  source: SkillSource;
  valid: boolean;
  issues: SkillIssue[];
};

type SummaryRule = {
  pattern: RegExp;
  summary: string;
};

const summaryRules: SummaryRule[] = [
  {
    pattern: /\b(api|interface|sdk|graphql|rest)\b/,
    summary: "用于 API、接口边界、SDK 或模块契约设计，帮助把调用方式和数据结构设计得更稳定。"
  },
  {
    pattern: /\b(frontend|ui|ux|design|react|component|browser|web)\b/,
    summary: "用于前端界面、交互体验、组件实现和浏览器端问题处理。"
  },
  {
    pattern: /\b(image|imagegen|vision|ocr|screenshot|visual)\b/,
    summary: "用于图片生成、图片理解、截图还原或视觉内容处理。"
  },
  {
    pattern: /\b(review|quality|lint|refactor|simplification|architecture)\b/,
    summary: "用于代码审查、质量检查、架构改进和复杂代码简化。"
  },
  {
    pattern: /\b(debug|diagnose|trace|error|recovery|logs?)\b/,
    summary: "用于定位错误、分析运行痕迹、排查异常并恢复失败流程。"
  },
  {
    pattern: /\b(test|testing|tdd|playwright|e2e|validation)\b/,
    summary: "用于测试设计、端到端验证、回归检查和实现后的行为确认。"
  },
  {
    pattern: /\b(git|github|issue|issues|pr|ci|cd|workflow|branch)\b/,
    summary: "用于 Git、GitHub、Issue、PR、分支管理和持续集成相关工作。"
  },
  {
    pattern: /\b(doc|docs|documentation|adr|documents|docx|slides|sheets)\b/,
    summary: "用于文档、说明材料、架构决策记录、表格或演示文件处理。"
  },
  {
    pattern: /\b(agent|subagent|handoff|dispatch|reach|context)\b/,
    summary: "用于代理协作、任务分派、上下文交接或多步骤任务组织。"
  },
  {
    pattern: /\b(skill|plugin|mcp|installer|creator)\b/,
    summary: "用于 Codex 技能、插件或 MCP 能力的创建、安装和维护。"
  },
  {
    pattern: /\b(openai|codex|chatgpt|model)\b/,
    summary: "用于 OpenAI、Codex 或模型相关配置、文档查询和集成实现。"
  },
  {
    pattern: /\b(security|threat|attack|finding|vulnerability|scan)\b/,
    summary: "用于安全扫描、威胁建模、漏洞分析、发现跟踪和修复验证。"
  },
  {
    pattern: /\b(azure|cosmos|eventhub|identity|keyvault|storage|cloud)\b/,
    summary: "用于 Azure、云服务、身份认证、存储或相关 SDK 开发。"
  },
  {
    pattern: /\b(rust|cargo)\b/,
    summary: "用于 Rust 项目实现、依赖处理、编译问题和代码质量改进。"
  },
  {
    pattern: /\b(python|fastapi|jupyter|debugpy)\b/,
    summary: "用于 Python、FastAPI、Jupyter 或 Python 调试与开发流程。"
  },
  {
    pattern: /\b(research|search|arxiv|paper|osint|wiki)\b/,
    summary: "用于资料检索、论文研究、信息整理和调研型任务。"
  },
  {
    pattern: /\b(email|gmail|inbox|mail)\b/,
    summary: "用于邮件、Gmail、收件箱整理和邮件自动化处理。"
  },
  {
    pattern: /\b(google-drive|google-docs|google-sheets|google-slides|workspace)\b/,
    summary: "用于 Google Drive、文档、表格、幻灯片和 Workspace 协作内容处理。"
  },
  {
    pattern: /\b(finance|stocks?|excel|model|dcf|lbo|comps|pptx)\b/,
    summary: "用于金融分析、股票研究、Excel 建模和演示材料制作。"
  },
  {
    pattern: /\b(electron|desktop|node|typescript|javascript)\b/,
    summary: "用于桌面应用、Node.js、TypeScript 或 JavaScript 工程开发。"
  }
];

export function buildSkillSummaryZh(input: SkillSummaryInput): string {
  const name = input.name.trim() || "这个技能";
  const description = input.description.trim();

  if (!input.valid) {
    if (input.issues.some((issue) => issue.code === "missing-skill-md")) {
      return "这个目录不是可直接使用的技能：缺少 SKILL.md。它可能是分组目录，也可能是损坏或未完成的技能。";
    }

    return "这个技能当前校验未通过，需要先修复右侧列出的问题，之后才能打开使用。";
  }

  if (containsChinese(description)) {
    return description;
  }

  const haystack = `${name} ${description}`.toLowerCase();
  const matchedRule = summaryRules.find((rule) => rule.pattern.test(haystack));

  if (matchedRule) {
    return matchedRule.summary;
  }

  return `用于处理「${name}」相关的专项任务；右侧 SKILL.md 中有完整触发规则和使用方式。`;
}

function containsChinese(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}
