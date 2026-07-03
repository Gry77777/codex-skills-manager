# Codex Skills Manager v0.1.0 Beta

这是 Codex Skills Manager 的第一个公开 Beta 版本。

## 适用范围

- Windows 10 / 11
- x64
- 面向本机 Codex skills 管理

暂不保证 macOS、Linux、Windows ARM 或严格企业权限环境。

## 主要功能

- 自动扫描本机 `.codex/skills` 和 `.agents/skills`
- 可视化查看 skill 名称、来源、状态、路径、摘要和校验问题
- 真实启用/禁用 skill，通过切换 `SKILL.md` / `SKILL.md.disabled`
- 导入本地 skill 文件夹
- 从 GitHub 仓库、文件夹或 `SKILL.md` 链接导入 skill
- 在线 Skills 广场，支持从已索引来源快速发现和导入网上技能
- AI 辅助识别 skills，用中文总结用途、标签、风险和启用建议
- 支持 MiniMax、OpenAI、Anthropic、Gemini、DeepSeek、Qwen、Kimi、OpenRouter、SiliconFlow 以及自定义中转站 API
- 托管本机 skills 到 AppData
- 一键修复常见损坏状态
- 中文界面
- Windows 便携版

## 下载

- `Codex-Skills-Manager-0.1.0-x64.exe`：便携版，直接运行
- `Codex-Skills-Manager-0.1.0-x64.zip`：压缩包，适合局域网共享

## 注意

- 当前版本未代码签名，Windows 可能提示未知发布者。
- 关闭/打开 skill 会真实改名 `SKILL.md` 文件。
- 已经运行中的 Codex 会话可能不会实时加载变更，建议重启 Codex 或开启新会话。
- GitHub 匿名 API 可能遇到限流；技能广场会优先使用本地缓存，具体导入仍需要网络。
- 本项目不是 OpenAI 或 Codex 官方产品。

## 校验

本版本发布前已通过：

- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- `npm run dist`
