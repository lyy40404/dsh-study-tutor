# Changelog

## 0.2.0 — 2026-10-29

### Added
- **人格通道**：设置里可选「默认 / 严格老师 / 幽默学长 / 极简」四种系统提示词，也支持完全自定义提示词（自定义优先）
- **F2 备用截图键**（防 Ctrl+Alt+S 被输入法/安全软件抢占）
- **CSS 按区块拆分**：`ui.base.css`（基础/透明窗口/顶栏）、`ui.chat.css`（聊天区）、`ui.panels.css`（面板/设置），旧 `/study-tutor/ui.css` 地址保留兼容

### Changed
- 推理档默认改为 `reasoningEffort: low`（题目解答场景回复更快、省 token）
- 快捷键改按**物理键位**（`e.code`）判断，修复 Alt 组合键下 `e.key` 变化导致的失效
- 快捷栏按钮文字精简（解释/出题/总结/反例/检查/截图/资料），截图与资料按钮不再被挤出窗口
- `lib/config.js` 的 `UI_FILES.css` 由单文件改为三文件映射

### Fixed
- `Ctrl+Alt+S` / `F2` 截图快捷键按下无反应
- systemPrompt 以裸字符串传入 `ctx.llm.stream` 导致 `DeepSeek Messages transport failed`（改用内容块数组）

## 0.1.1 — 2026-10-29

### Added
- 初始发布：Electron 透明窗口（背景透明 + 文字不透明 + 点击穿透 + 记忆位置）
- LLM 流式对话、Markdown 渲染、代码语法高亮（Python/C/C++/JS/TS/Java/SQL/JSON/Bash）+ 行号 + 复制
- 系统截图提问（`Ctrl+Alt+S`）、图片附件（粘贴/拖拽/选择，最多 4 张）
- 知识库检索（dsh-library）、错题本、`/study` 命令、设置面板
- GitHub Actions：tag 触发自动打包并发布 Release
