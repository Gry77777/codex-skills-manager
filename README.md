# Codex Skills Manager

![Codex Skills Manager icon](build/icon-256.png)

Codex Skills Manager 是一个 Windows 桌面应用，用来可视化管理本机 Codex skills。

> 非官方项目：本项目不是 OpenAI 或 Codex 官方产品，也不代表 OpenAI。它只管理本机文件系统中的 skills。

## 当前状态

`v0.1.0` 是 Beta 预览版，建议先在个人电脑或小范围局域网环境试用。

已验证平台：

- Windows 10 / Windows 11
- x64

暂不保证：

- macOS / Linux
- Windows ARM
- 公司电脑的严格杀毒、白名单或权限策略
- 特殊重定向用户目录、网络盘目录
- Codex 已运行会话实时热加载 skills

## 功能

- 自动扫描本机 skills：
  - `%USERPROFILE%\.codex\skills`
  - `%USERPROFILE%\.agents\skills`
  - `%APPDATA%\CodexSkillsManager\imported-skills`
- 展示 skill 名称、来源、状态、路径、描述和校验问题。
- 搜索、来源筛选、状态筛选、分页显示。
- 查看 `SKILL.md` 详情和中文摘要。
- 真实启用/禁用 skill：
  - 启用：`SKILL.md.disabled` -> `SKILL.md`
  - 禁用：`SKILL.md` -> `SKILL.md.disabled`
- 导入本地 skill 文件夹。
- 从 GitHub 仓库、文件夹或 `SKILL.md` 链接导入 skill。
- 在线 Skills 广场：
  - 浏览内置 GitHub 技能来源
  - 搜索公开 skills
  - 从具体技能卡片一键导入
  - 来源筛选使用本地索引，避免点击后长时间卡住
- 托管本机 skills 到 AppData，方便整理和备份。
- 一键修复常见损坏状态：
  - 清理失效 registry 记录
  - 解决 `SKILL.md` / `SKILL.md.disabled` 冲突
  - 补齐缺失 frontmatter
- AI 辅助识别：
  - 支持 MiniMax、OpenAI、Anthropic、Gemini、DeepSeek、Qwen、Kimi、OpenRouter、SiliconFlow 等
  - 支持自定义 OpenAI / Anthropic 兼容中转站 Base URL 和 API Key
  - 可批量总结 skills 的中文用途、标签、风险和启用建议
- Windows 便携版打包。

## 下载和运行

在 GitHub Releases 下载：

- `Codex-Skills-Manager-0.1.0-x64.exe`：便携版，直接双击运行。
- `Codex-Skills-Manager-0.1.0-x64.zip`：压缩包，适合放到共享目录或局域网分发。

首次运行时，Windows 可能提示“未知发布者”。这是因为当前版本没有代码签名证书。

## 使用说明

### 扫描本地 skills

启动后应用会自动扫描当前 Windows 用户自己的 skills。每个人看到的是自己电脑上的内容。

### 打开/关闭 skill

卡片右上角的开关是真实文件级开关，会改名 `SKILL.md` 或 `SKILL.md.disabled`。

注意：已经运行中的 Codex 会话可能不会立刻重新加载 skills。更稳妥的做法是重启 Codex 或开启新会话。

### 导入本地文件夹

点击“导入单个文件夹”，选择包含 `SKILL.md` 的目录。导入后的副本默认关闭，需要手动打开。

### 从 GitHub 导入

支持以下链接：

- GitHub 仓库链接
- GitHub `tree` 文件夹链接
- GitHub `blob/SKILL.md` 文件链接
- `raw.githubusercontent.com/.../SKILL.md` 链接

导入后的 GitHub skill 默认关闭。

### 使用 Skills 广场

点击“技能广场”后，应用会先展示已索引的在线 skills。点击具体 skill 卡片的“安装”会下载并校验该 skill；点击左侧来源只会切换当前来源筛选，不会立刻扫描整个远程仓库。

### AI 识别

点击“AI 设置”配置 provider、Base URL、模型和 API Key。API Key 只保存在当前 Windows 用户数据目录中，应用不会把密钥写入源码、README 或日志。

### 一键修复

一键修复只处理保守、安全的场景，不会删除 skill 目录。冲突文件会被改成备份名。

## 安全说明

- 应用不会执行 skill 中的脚本。
- 应用只读取 skill 文件，或在用户明确操作时改名 `SKILL.md` / `SKILL.md.disabled`。
- 导入 GitHub skill 时会下载文件到 AppData 托管目录。
- 托管数据保存到 `%APPDATA%\CodexSkillsManager`。

## 开发

```powershell
npm install
npm run dev
```

常用命令：

```powershell
npm run typecheck
npm run test:run
npm run build
npm run dist
```

打包产物输出到 `release/`。

## 已知限制

- 当前只打包 Windows x64。
- 当前没有代码签名。
- 当前不直接修改 Codex 原生配置或当前会话注入结果。
- 当前没有 ZIP/Git 批量导入。
- 当前没有操作日志和状态备份/恢复功能。
- GitHub 匿名 API 可能被限流；技能广场会优先使用缓存，具体导入仍依赖网络。

## License

MIT
