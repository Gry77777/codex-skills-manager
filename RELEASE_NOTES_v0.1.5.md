# Codex 技能管理器 v0.1.5

这是错误提示和本地状态文件容错补丁。

## 修复

- 修复本地 `registry.json` 为空或损坏时，打开/关闭 skill 会显示英文 `Unexpected end of JSON input` 的问题。
- 损坏的 registry 会自动备份为 `.corrupt-时间戳`，应用会用当前扫描结果重建状态文件。
- 前端会去掉 Electron IPC 的英文包装，例如 `Error invoking remote method ...`。
- GitHub 限流、网络失败、本地文件缺失等常见错误会显示中文说明。

## 验证

- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- 敏感信息扫描

## 下载

- `Codex-Skills-Manager-0.1.5-x64.exe`
- `Codex-Skills-Manager-0.1.5-x64.zip`
