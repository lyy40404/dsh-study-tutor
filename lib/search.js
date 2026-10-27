/** 资料检索：调用 search_library.py 对 dsh-library 的 chunk 做关键词检索。 */
import { spawn } from 'node:child_process'
import { PYTHON } from './config.js'
import { findPython } from './util.js'

export function runSearch(query, topK) {
  return new Promise((resolve) => {
    const python = findPython()
    if (!python) return resolve([])
    let child
    try {
      child = spawn(python, ['-X', 'utf8', PYTHON.search, String(query), String(topK), 'course'], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })
    } catch { return resolve([]) }
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString('utf8') })
    child.on('error', () => resolve([]))
    child.on('close', () => {
      try {
        const parsed = JSON.parse(out)
        resolve(Array.isArray(parsed) ? parsed : [])
      } catch { resolve([]) }
    })
  })
}
