/** 问答：通过 DSH 的 ctx.llm 流式生成，不占用任何会话。 */
import { sendJson } from './util.js'

let cachedDefault = null

/** 默认 provider/model：取第一个可用模型（当前是 deepseek-flash / V4.1-Flash）。 */
export async function resolveDefault(ctx) {
  if (cachedDefault) return cachedDefault
  const providers = (ctx.llm.listProviders() || []).map((p) => p.id || p.provider || p.name).filter((x) => typeof x === 'string')
  for (const provider of providers) {
    try {
      const models = await ctx.llm.listModels(provider)
      if (Array.isArray(models) && models.length) {
        const model = models[0].id || models[0].model || models[0].name
        if (model) { cachedDefault = { provider, model }; return cachedDefault }
      }
    } catch { /* try next */ }
  }
  cachedDefault = { provider: providers[0] || '', model: process.env.STUDY_TUTOR_MODEL || '' }
  return cachedDefault
}

export function buildPrompt(body) {
  const parts = []
  if (body.context && String(body.context).trim()) {
    parts.push('【参考资料/题目】\n' + String(body.context).trim())
  }
  if (body.history && Array.isArray(body.history) && body.history.length) {
    const lines = body.history.slice(-8).map((m) => (m.role === 'user' ? '学生：' : '助手：') + String(m.text || ''))
    parts.push('【此前的对话】\n' + lines.join('\n'))
  }
  parts.push('【问题】\n' + String(body.question || '').trim())
  return parts.join('\n\n')
}

/**
 * 构造一条 user 消息的内容块（文本 + 可选图片）。
 * 图片走 ctx.attachments.admitPromptContent() 换成持久引用，符合附件 seam 契约。
 */
export async function buildContent(ctx, body) {
  const text = buildPrompt(body)
  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : []
  const valid = images.filter((img) => img && typeof img.data === 'string' && typeof img.mediaType === 'string')
  if (!valid.length) return { content: [{ type: 'text', text }] }

  const attachments = ctx.get && ctx.get('attachments')
  if (!attachments || typeof attachments.admitPromptContent !== 'function') {
    throw new Error('图片功能不可用：宿主没有 attachments 服务')
  }
  const parts = [{ type: 'text', text }]
  for (const img of valid) {
    parts.push({ type: 'image', mediaType: img.mediaType, data: img.data, name: String(img.name || 'image') })
  }
  const admitted = await attachments.admitPromptContent(parts)
  const content = admitted.map((part) => (part.type === 'image'
    ? { type: 'image', attachment: part.attachment }
    : { type: 'text', text: part.text }))
  return { content }
}

export async function handleAsk(ctx, req, res, readJson) {
  const body = await readJson(req)
  if (!body || !body.question) return sendJson(res, 400, { ok: false, error: 'need question' })

  const def = await resolveDefault(ctx)
  const provider = body.provider || def.provider
  const model = body.model || def.model
  if (!provider || !model) {
    return sendJson(res, 503, { ok: false, error: 'no model available', def })
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  })
  const write = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n') } catch { /* noop */ } }

  try {
    write({ type: 'start', provider, model })
    const { content } = await buildContent(ctx, body)
    // 人格通道：前端传 systemPrompt（预设人格或自定义提示词）
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : ''
    const messages = []
    // DSH 的 messages 内容统一用内容块数组（system 用裸字符串会导致 TRANSPORT 失败）
    if (systemPrompt) messages.push({ role: 'system', content: [{ type: 'text', text: systemPrompt }] })
    messages.push({ role: 'user', content })
    const stream = ctx.llm.stream({
      provider,
      model,
      messages,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.6,
      // 学习助手默认用最低推理档：题目解答场景够用，回复更快、省 token
      reasoningEffort: typeof body.reasoningEffort === 'string' ? body.reasoningEffort : 'low',
    })
    let reason = 'stop'
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') write({ type: 'delta', text: chunk.text })
      else if (chunk.type === 'finish') {
        reason = chunk.reason || 'stop'
        if (chunk.reason === 'error' || chunk.reason === 'aborted') {
          write({ type: 'error', message: (chunk.failure && chunk.failure.message) || String(chunk.reason) })
        }
      }
    }
    write({ type: 'done', reason })
  } catch (error) {
    write({ type: 'error', message: String((error && error.message) || error) })
  } finally {
    try { res.end() } catch { /* noop */ }
  }
}
