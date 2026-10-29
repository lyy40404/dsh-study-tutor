/**
 * 路径与常量。插件目录结构：
 *   index.js          装配入口（路由 + 命令）
 *   lib/              各功能模块
 *   ui.html/css/js    前端（由 ui.html 拆分）
 *   *.py              Python 辅助脚本（透明度 / 截图 / 资料检索）
 *   open-study-tutor.ps1  打开独立窗口的启动器
 */
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
export const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
export const WINDOW_SETTINGS = join(DSH_HOME, 'study-tutor-window.json')
export const UI_FILES = {
  html: join(PLUGIN_DIR, 'ui.html'),
  // 样式按区块拆成三个文件（基础 / 聊天区 / 面板），加载顺序即层叠顺序
  css: {
    base: join(PLUGIN_DIR, 'ui.base.css'),
    chat: join(PLUGIN_DIR, 'ui.chat.css'),
    panels: join(PLUGIN_DIR, 'ui.panels.css'),
  },
  js: join(PLUGIN_DIR, 'ui.js'),
}
export const PYTHON = {
  apply: join(PLUGIN_DIR, 'apply_window.py'),
  screenshot: join(PLUGIN_DIR, 'screenshot_system.py'),
  search: join(PLUGIN_DIR, 'search_library.py'),
}
export const WINDOW_TITLE = '学习助手'
export const MAX_IMAGES = 4
