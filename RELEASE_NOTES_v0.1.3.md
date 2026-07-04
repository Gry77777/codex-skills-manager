# Codex 技能管理器 v0.1.3

这是一个技能广场兼容性补丁，修复升级后来源筛选可能为空的问题。

## 修复

- 修复旧 marketplace 缓存条目缺少 `sourceId` 时，点击来源会显示 0 个候选的问题。
- 修复旧窗口数据缺少 `canIndex` / `status` 时，GitHub 内置来源被错误显示成“外部目录 / 打开网站”的问题。
- 来源筛选兼容新版 `sourceId` 和旧版 `sourceName`。

## 验证

- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- 敏感信息扫描

## 下载

- `Codex-Skills-Manager-0.1.3-x64.exe`
- `Codex-Skills-Manager-0.1.3-x64.zip`
