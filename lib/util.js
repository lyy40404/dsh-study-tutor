/** 通用工具：HTTP 读写、Python 定位。 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DSH_HOME } from './config.js'

export function readJson(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 512 * 1024) { resolve(null); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

export function sendJson(res, status, value) {
  try {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(value))
  } catch { /* noop */ }
}

export function sendFile(res, status, contentType, body) {
  try {
    res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' })
    res.end(body)
  } catch { /* noop */ }
}

/**
 * 找 Python：优先 DSH 运行时自带的，其次 PATH 里的。
 * ctypes 调 user32 只需 ~150ms；PowerShell 每次 spawn 都要编译 C#（~1.5s）。
 */
export function findPython() {
  const candidates = [
    process.env.STUDY_TUTOR_PYTHON,
    join(DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe'),
    'python',
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate === 'python' || existsSync(candidate)) return candidate
  }
  return undefined
}
