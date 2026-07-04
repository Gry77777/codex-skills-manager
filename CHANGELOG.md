# Changelog

## 0.1.6 - 2026-07-04

这是导入链路提速补丁。

### Changed

- GitHub 批量导入从纯串行改为小并发处理，默认最多同时导入 3 个候选，减少多 skill 仓库的等待时间。
- GitHub skill 目录下载时，目录内文件从逐个下载改为最多 4 个并发下载。
- 前端导入本地文件夹或 GitHub skill 成功后，不再额外触发一次全量扫描，直接合并后端返回的导入结果。

### Tests

- 新增 GitHub 批量导入并发上限回归测试。

## 0.1.5 - 2026-07-04

这是错误提示和本地状态文件容错补丁。

### Fixed

- 修复本地 `registry.json` 为空或损坏时，开关 skill 会显示英文 `Unexpected end of JSON input` 的问题。
- 损坏的 registry 会自动备份为 `.corrupt-时间戳`，应用会用当前扫描结果重建状态文件。
- 前端会清理 Electron IPC 的英文包装错误，后续顶部错误提示默认显示中文。
- GitHub 限流、网络失败、文件缺失等常见错误会转换成更容易理解的中文提示。

### Tests

- 新增空 registry 自动备份并重建的回归测试。

## 0.1.4 - 2026-07-04

这是 GitHub 批量导入体验补丁。

### Fixed

- 修复批量导入 GitHub skills 时，前面已经成功导入、后面遇到 GitHub 403 rate limit 后仍显示整批失败的问题。
- 批量导入现在会保留已经成功导入的条目；只有全部失败时才显示错误。
- 前端会在部分成功时提示“已成功导入 X/Y 个技能”，避免用户误以为完全没有导入。

### Tests

- 新增 controller 层批量 GitHub 导入部分成功 / 全部失败回归测试。

## 0.1.3 - 2026-07-04

这是技能广场兼容性补丁。

### Fixed

- 修复升级后旧技能广场缓存缺少 `sourceId` 时，点击来源会显示 0 个候选的问题。
- 修复旧窗口数据缺少 `canIndex` / `status` 时，GitHub 内置来源被错误显示成“外部目录”的问题。
- 来源筛选现在会同时兼容新版 `sourceId` 和旧版 `sourceName`。

### Tests

- 新增旧缓存缺少 `sourceId` 的回归测试。

## 0.1.2 - 2026-07-04

这次更新重点优化技能广场的速度和交互边界，避免点击来源时误触发较慢的 GitHub 深度扫描。

### Added

- 技能广场来源现在带有明确状态：未扫描、可浏览、未发现、扫描失败、外部目录。
- 新增单个来源刷新接口，只扫描用户明确选择的 GitHub 来源。
- 新增 marketplace 单元测试，覆盖本地缓存读取、单来源刷新、来源过滤和失败状态。
- 外部链接统一交给系统浏览器打开，避免 Electron 创建额外窗口。

### Changed

- 打开技能广场时只读取本地索引缓存，不再自动联网扫描所有内置仓库。
- 点击来源卡片只切换筛选，不再触发深度识别或导入。
- “扫描来源 / 刷新来源”成为独立动作，用户更容易理解什么时候会访问网络。
- 技能广场缓存升级为按来源保存，搜索缓存也加入来源维度，避免来源结果串台。
- 每个内置 GitHub 来源最多索引数量从 64 提升到 96。

### Fixed

- 修复来源索引为空时点击来源会卡很久的问题。
- 修复后端搜索接口没有真正按来源隔离缓存的潜在问题。
- 修复 GitHub Topic / 外部目录来源可能被误当成可深度扫描 GitHub 仓库的问题。

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
