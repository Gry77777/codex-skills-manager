# Codex 技能管理器 v0.1.6

这是导入链路提速补丁。

## 优化

- GitHub 批量导入从纯串行改为小并发处理，默认最多同时导入 3 个候选。
- GitHub skill 目录下载时，目录内文件最多 4 个并发下载。
- 导入本地文件夹或 GitHub skill 成功后，前端不再额外触发一次全量扫描，直接合并导入结果。

## 影响

- 多候选 GitHub 仓库导入会更快。
- 导入后列表更新更快，减少一次全盘 skills 扫描。
- 并发数有限制，不会一次性请求过多 GitHub API。

## 验证

- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- `npm audit --audit-level=high`
- 敏感信息扫描

## 下载

- `Codex-Skills-Manager-0.1.6-x64.exe`
- `Codex-Skills-Manager-0.1.6-x64.zip`
