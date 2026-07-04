# Changelog

## 0.1.1 - 2026-07-04

这次更新重点改进 AI 识别稳定性、导入后的自动缓存，以及技能广场的空结果提示。

### Added

- 导入后的 skills 会自动加入后台 AI 识别队列。
- 后台 AI 识别只写入本地分析缓存，不会打开或关闭 skills。
- 导入后的 AI 识别按批处理，避免单次请求过大。
- 技能广场来源卡片会显示本地已索引数量。
- 技能广场空状态会解释当前来源为什么没有本地索引结果。
- 对本地索引为空的 GitHub 来源增加“扫描这个来源”入口。

### Changed

- AI 分析会优先请求结构化 JSON 输出。
- OpenAI 兼容接口如果不支持 JSON 模式，会自动退回普通 Chat Completions。
- AI JSON 解析兼容代码块、前后解释文字、嵌套结果字段和轻微尾逗号。
- 批量 AI 失败提示按原因聚合，不再重复显示同一条错误。
- 技能卡片排版更紧凑，名称、来源、用途和开关更清晰。

### Fixed

- 修复模型返回 Markdown 或解释文字时反复出现“AI 返回内容不是 JSON”的问题。
- 修复技能广场点击空索引来源时像“搜索坏了”的体验问题。
- 修复用户无法区分快速本地索引和较慢深度扫描的问题。

## 0.1.0 - 2026-07-03

Initial beta release.

### Added

- Windows desktop app built with Electron, React and TypeScript.
- Local skill scanner for:
  - `%USERPROFILE%\.codex\skills`
  - `%USERPROFILE%\.agents\skills`
  - `%APPDATA%\CodexSkillsManager\imported-skills`
- Skill card grid with search, filters, pagination and detail modal.
- Physical enable/disable by renaming:
  - `SKILL.md`
  - `SKILL.md.disabled`
- Local folder import.
- GitHub skill import from repository, folder, `blob/SKILL.md` and raw `SKILL.md` URLs.
- Online Skills marketplace with indexed GitHub sources and direct skill import.
- Faster marketplace source filtering that avoids full repository deep scans on click.
- AI skill analysis settings for mainstream providers and custom compatible API gateways.
- Managed local skill copies under AppData.
- One-click repair for common broken skill states.
- Chinese UI.
- Custom Windows icon.
- Portable Windows x64 build and zip package.

### Notes

- This release is Windows x64 only.
- The app is not code signed yet, so Windows SmartScreen may show an unknown publisher warning.
- Existing Codex sessions may need restart or a new session before skill changes are picked up.
- This is not an official OpenAI or Codex product.
