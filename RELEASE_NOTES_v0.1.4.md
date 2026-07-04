# Codex 技能管理器 v0.1.4

这是 GitHub 批量导入体验补丁。

## 修复

- 修复批量导入 GitHub skills 时，前面已经成功导入、后面遇到 `403 rate limit exceeded` 后仍显示整批失败的问题。
- 现在只要至少有一个候选导入成功，就会刷新列表并保留成功结果。
- 如果只是部分成功，界面会提示“已成功导入 X/Y 个技能”，方便判断还需要稍后重试哪些候选。

## 关于 GitHub 限流

GitHub 匿名 API 有频率限制。遇到 `403 rate limit exceeded` 时，已经落盘的 skill 不会丢失；可以稍后再重试剩余候选。

## 验证

- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- 敏感信息扫描

## 下载

- `Codex-Skills-Manager-0.1.4-x64.exe`
- `Codex-Skills-Manager-0.1.4-x64.zip`
