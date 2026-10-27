/** 截图：调用 screenshot_system.py（系统级区域截图 + 剪贴板取图）。 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PYTHON } from './config.js'
import { findPython } from './util.js'

export function runScreenshot() {
  return new Promise((resolve) => {
    const python = findPython()
    if (!python) return resolve(null)
    const out = join(tmpdir(), 'study-tutor-shot-' + Date.now() + '.png')
    let child
    try {
      child = spawn(python, ['-X', 'utf8', PYTHON.screenshot, out], { windowsHide: true, stdio: 'ignore' })
    } catch { return resolve(null) }
    child.on('error', () => resolve(null))
    child.on('close', () => {
      try {
        if (!existsSync(out)) return resolve(null)
        resolve({ data: readFileSync(out).toString('base64'), mediaType: 'image/png' })
      } catch {
        resolve(null)
      } finally {
        try { rmSync(out, { force: true }) } catch { /* noop */ }
      }
    })
  })
}
