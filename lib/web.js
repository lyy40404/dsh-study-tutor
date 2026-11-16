/**
 * 联网搜索（DSH 的 ctx.web 能力 seam）
 *
 * 学习助手在提问时可选调用：把实时搜索结果拼进 prompt，让模型引用网页。
 * 宿主未注册 ctx.web（如精简部署没装 web-search 提供方）时优雅降级——只提示不可用，不阻塞回答。
 */
export function getWeb(ctx) {
  try {
    return ctx.get && ctx.get('web')
  } catch {
    return null
  }
}

/**
 * 跑一次网页搜索（带超时：超时按失败处理，调用方降级为纯模型回答）。
 * @param {object} ctx 插件上下文
 * @param {string} query 搜索词
 * @param {{ maxResults?: number, timeoutMs?: number }} options
 * @returns {Promise<{ok: boolean, content?: string, sources?: Array, truncated?: boolean, error?: string}>}
 */
export async function runWebSearch(ctx, query, options = {}) {
  const web = getWeb(ctx)
  if (!web || typeof web.search !== 'function') {
    return { ok: false, error: '宿主未注册联网能力（ctx.web 不可用）' }
  }
  // 搜索词截短：长问题只取前 120 字，减少搜索延迟
  const q = String(query || '').trim().slice(0, 120)
  if (!q) return { ok: false, error: '搜索词为空' }
  const maxResults = Math.max(1, Math.min(5, options.maxResults || 3))
  const timeoutMs = Math.max(2000, Math.min(20000, options.timeoutMs || 8000))
  // ctx.web.search 接受 AbortSignal：超时直接中止，避免拖慢整轮回答
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const result = await web.search({ query: q, maxResults }, controller.signal)
    const sources = Array.isArray(result && result.sources) ? result.sources : []
    const content = result && typeof result.content === 'string' ? result.content : ''
    if (!sources.length && !content) return { ok: false, error: '没有搜到结果' }
    return { ok: true, content, sources, truncated: !!(result && result.truncated) }
  } catch (error) {
    const msg = String((error && error.message) || error)
    return { ok: false, error: controller.signal.aborted ? '搜索超时（已跳过联网）' : msg }
  } finally {
    clearTimeout(timer)
  }
}

/** 把搜索结果格式化成可拼进 prompt 的文本块。 */
export function formatWebResults(result) {
  if (!result || !result.ok) return ''
  const parts = []
  if (result.content && result.content.trim()) {
    parts.push('【搜索摘要】\n' + result.content.trim().slice(0, 2000))
  }
  const sources = (result.sources || []).slice(0, 5)
  if (sources.length) {
    const lines = sources.map((s, index) => {
      const title = s && s.title ? String(s.title) : ''
      const snippet = s && s.snippet ? String(s.snippet).slice(0, 300) : ''
      const url = s && s.url ? String(s.url) : ''
      return `${index + 1}. ${title}${snippet ? ' — ' + snippet : ''}${url ? ' (' + url + ')' : ''}`
    })
    parts.push('【网页搜索结果】\n' + lines.join('\n'))
  }
  return parts.join('\n\n')
}
