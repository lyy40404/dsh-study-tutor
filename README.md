# dsh-study-tutor — 学习助手浮窗

DSH 插件：在独立置顶小窗里提问，走 DSH 的 `ctx.llm`（V4.1-Flash），不占用、不打扰主会话。

## 结构

```
index.js              装配入口：路由注册 + /study 命令
lib/
  config.js           路径常量（插件目录、DSH_HOME、Python 脚本路径）
  util.js             HTTP 读写（readJson/sendJson/sendFile）、Python 定位
  window.js           窗口透明度（Win32 分层窗口）、启动独立窗口
  screenshot.js       系统级区域截图（子进程调 screenshot_system.py）
  search.js           课程资料检索（子进程调 search_library.py）
  ask.js              LLM 流式问答（ctx.llm.stream + 附件图片块）
  commands.js         /study 用户命令
ui.html               页面结构（引用 ui.css / ui.js）
ui.css                样式（设计 tokens + 深浅色主题）
ui.js                 前端逻辑（聊天/附件/截图/错题本/设置/快捷键）
apply_window.py       窗口透明度（ctypes：SetLayeredWindowAttributes）
screenshot_system.py  截图（ms-screenclip: 触发系统截图 → 剪贴板取图 → 恢复窗口并置顶）
search_library.py     dsh-library 索引的关键词检索
open-study-tutor.ps1  打开独立窗口的启动器（Edge app 模式 + DPI 自适应 + 置顶 + 透明度）
cordis.patch.yml      插件挂载声明
```

## 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/study-tutor/ui` | 页面结构 |
| GET | `/study-tutor/ui.css` | 样式 |
| GET | `/study-tutor/ui.js` | 前端逻辑 |
| GET | `/study-tutor/models` | 可用 provider/model |
| POST | `/study-tutor/ask` | SSE 流式问答（支持 images） |
| GET | `/study-tutor/search` | 课程资料检索 |
| POST | `/study-tutor/screenshot` | 系统区域截图（base64 PNG） |
| POST | `/study-tutor/open` | 打开/前置窗口 |
| GET/POST | `/study-tutor/window` | 窗口透明度设置 |

## 前端功能

- 聊天（流式、Markdown 渲染、代码块复制）
- 图片附件（📎 / 粘贴 / 拖拽，最多 4 张）
- 📷 截图（Ctrl+Alt+S，系统级区域截图，自动发送）
- 📚 查资料（提问时检索课程资料库并附给模型）
- 错题本（本地存储，可再问一次）
- 设置：主题 / 窗口透明度 / 字号 / 紧凑模式 / 头像 / 动画 / 发送方式
- 快捷键：Enter 发送、Ctrl+K 新对话、Ctrl+L 错题本、Ctrl+, 设置、Ctrl+/ 聚焦、Alt+1..5 快捷指令、Esc 停止/关闭

## 安装

```powershell
dsh plugin --profile desktop add <本目录绝对路径>
```

改 host 侧代码（index.js / lib / *.py）需要重启 DSH；改前端（ui.*）只需刷新窗口。
