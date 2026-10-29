/**
 * dsh-study-tutor — 学习助手浮窗的 host 半（装配入口）。
 *
 * 模块划分：
 *   lib/config.js     路径常量
 *   lib/util.js       HTTP 读写 / Python 定位
 *   lib/window.js     窗口透明度、打开窗口
 *   lib/screenshot.js 系统级区域截图
 *   lib/search.js     课程资料检索
 *   lib/ask.js        LLM 流式问答
 *   lib/commands.js   /study 命令
 *
 * 路由（注册在 DSH webServer 上，插件路由不需要会话 cookie）：
 *   GET  /study-tutor/ui       页面结构
 *   GET  /study-tutor/ui.css   样式
 *   GET  /study-tutor/ui.js    前端逻辑
 *   GET  /study-tutor/models   可用 provider/model
 *   POST /study-tutor/ask      { question, context?, images?, provider?, model? } -> SSE
 *   GET  /study-tutor/search   ?q=&k=  资料检索
 *   POST /study-tutor/screenshot        系统区域截图（返回 base64 PNG）
 *   POST /study-tutor/open     打开/前置独立窗口
 *   GET|POST /study-tutor/window        窗口透明度设置
 *
 * 纪律：所有异常在插件层吞掉（宿主以 entry 是否 activate 判定启动成败）；
 * 延迟 inject，拿不到 webServer/llm 只记日志，不阻塞插件激活。
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { UI_FILES } from './lib/config.js'

const BOOT_LOG = (process.env.DSH_HOME || 'C:/Users/19120/.dsh').replace(/\\/g, '/') + '/study-tutor-boot.log'
const bootLog = (msg) => { try { appendFileSync(BOOT_LOG, new Date().toISOString() + ' ' + msg + '\n') } catch { /* noop */ } }
bootLog('module loaded')
import { readJson, sendFile, sendJson } from './lib/util.js'
import { loadWindowSettings, openStudyWindow, saveWindowSettings, scheduleOpacity } from './lib/window.js'
import { runScreenshot } from './lib/screenshot.js'
import { runSearch } from './lib/search.js'
import { handleAsk, resolveDefault } from './lib/ask.js'
import { registerCommands } from './lib/commands.js'

export const name = 'study-tutor'
export const inject = ['webServer', 'llm']

function serveFile(res, path, contentType) {
  try {
    sendFile(res, 200, contentType, readFileSync(path))
  } catch (error) {
    sendFile(res, 500, 'text/plain; charset=utf-8', 'file missing: ' + String((error && error.message) || error))
  }
}

function makeRoutes(ctx) {
  return [
    {
      kind: 'exact',
      path: '/study-tutor/ui',
      handler: (req, res) => serveFile(res, UI_FILES.html, 'text/html; charset=utf-8'),
    },
    {
      kind: 'exact',
      path: '/study-tutor/ui.base.css',
      handler: (req, res) => serveFile(res, UI_FILES.css.base, 'text/css; charset=utf-8'),
    },
    {
      kind: 'exact',
      path: '/study-tutor/ui.chat.css',
      handler: (req, res) => serveFile(res, UI_FILES.css.chat, 'text/css; charset=utf-8'),
    },
    {
      kind: 'exact',
      path: '/study-tutor/ui.panels.css',
      handler: (req, res) => serveFile(res, UI_FILES.css.panels, 'text/css; charset=utf-8'),
    },
    {
      kind: 'exact',
      path: '/study-tutor/ui.css',
      // 兼容旧地址：整包样式仍可访问（按顺序拼接三个文件）
      handler: (req, res) => {
        try {
          const parts = [UI_FILES.css.base, UI_FILES.css.chat, UI_FILES.css.panels]
            .map((file) => readFileSync(file, 'utf8'))
          res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' })
          res.end(parts.join('\n'))
        } catch {
          sendJson(res, 500, { ok: false, error: 'css read failed' })
        }
      },
    },
    {
      kind: 'exact',
      path: '/study-tutor/ui.js',
      handler: (req, res) => serveFile(res, UI_FILES.js, 'application/javascript; charset=utf-8'),
    },
    {
      kind: 'exact',
      path: '/study-tutor/models',
      handler: async (req, res) => {
        try {
          const providers = (ctx.llm.listProviders() || []).map((p) => p.id || p.provider || p.name).filter(Boolean)
          const out = []
          for (const provider of providers) {
            try { out.push({ provider, models: await ctx.llm.listModels(provider) }) } catch { out.push({ provider, models: [] }) }
          }
          sendJson(res, 200, { ok: true, providers: out, default: await resolveDefault(ctx) })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/study-tutor/ask',
      handler: (req, res) => { handleAsk(ctx, req, res, readJson).catch(() => { try { res.end() } catch { /* noop */ } }) },
    },
    {
      kind: 'exact',
      path: '/study-tutor/search',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://127.0.0.1')
          const q = String(url.searchParams.get('q') || '').trim()
          if (!q) return sendJson(res, 400, { ok: false, error: 'need q' })
          const topK = Math.min(8, Math.max(1, Number(url.searchParams.get('k') || 3)))
          sendJson(res, 200, { ok: true, results: await runSearch(q, topK) })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/study-tutor/screenshot',
      handler: async (req, res) => {
        try {
          const shot = await runScreenshot()
          if (!shot) return sendJson(res, 200, { ok: false, cancel: true })
          sendJson(res, 200, { ok: true, mediaType: shot.mediaType, data: shot.data })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/study-tutor/open',
      handler: (req, res) => {
        try {
          openStudyWindow()
          sendJson(res, 200, { ok: true })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/study-tutor/window',
      handler: async (req, res) => {
        try {
          if (req.method === 'POST') {
            const body = await readJson(req)
            if (!body || typeof body.opacity !== 'number') return sendJson(res, 400, { ok: false, error: 'need opacity' })
            const opacity = Math.max(0.2, Math.min(1, body.opacity))
            saveWindowSettings(Object.assign(loadWindowSettings(), { opacity }))
            scheduleOpacity(opacity)
            return sendJson(res, 200, { ok: true, opacity })
          }
          return sendJson(res, 200, { ok: true, settings: loadWindowSettings() })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    },
  ]
}

function register(ctx) {
  bootLog('register start')
  for (const route of makeRoutes(ctx)) {
    ctx.effect(() => ctx.webServer.register(route), 'study-tutor: ' + route.path)
  }
  registerCommands(ctx, openStudyWindow)
  // 启动后把上次保存的透明度重新应用一次（窗口可能已经开着）
  const saved = loadWindowSettings()
  if (typeof saved.opacity === 'number') scheduleOpacity(saved.opacity)
  bootLog('routes registered')
  ctx.logger?.info?.('[study-tutor] routes registered')
}

export function apply(ctx) {
  try {
    bootLog('apply called')
    ctx.logger?.info?.('[study-tutor] host loaded')
    ctx.inject(['webServer', 'llm'], (inner) => {
      try { register(inner) } catch (error) {
        ctx.logger?.warn?.('[study-tutor] register failed: ' + String((error && error.message) || error))
      }
    })
  } catch (error) {
    try { console.error('[study-tutor] apply failed (swallowed):', error) } catch { /* noop */ }
  }
}
