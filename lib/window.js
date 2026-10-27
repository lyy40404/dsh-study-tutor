/** 窗口相关：透明度（Win32 分层窗口）、启动独立窗口。 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PLUGIN_DIR, PYTHON, WINDOW_SETTINGS } from './config.js'
import { findPython } from './util.js'

let applyTimer = null

export function loadWindowSettings() {
  try { return JSON.parse(readFileSync(WINDOW_SETTINGS, 'utf8')) || {} } catch { return {} }
}

export function saveWindowSettings(next) {
  try {
    mkdirSync(dirname(WINDOW_SETTINGS), { recursive: true })
    writeFileSync(WINDOW_SETTINGS, JSON.stringify(next, null, 2), 'utf8')
  } catch { /* best effort */ }
}

/**
 * 用 Win32 WS_EX_LAYERED + SetLayeredWindowAttributes 设置整窗透明度。
 * 优先 Python helper（~150ms），失败退回 PowerShell -EncodedCommand。
 */
export function applyWindowOpacity(opacity) {
  const alpha = Math.max(0.2, Math.min(1, Number(opacity) || 1))

  const python = findPython()
  if (python) {
    try {
      const child = spawn(python, ['-X', 'utf8', PYTHON.apply, String(alpha)], { windowsHide: true, stdio: 'ignore' })
      child.on('error', () => { /* 交给下面的 PowerShell 兜底 */ })
      child.unref()
      return
    } catch { /* fallback */ }
  }

  const alphaByte = Math.round(alpha * 255)
  const ps = [
    '$ErrorActionPreference = "SilentlyContinue"',
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Text;',
    'using System.Runtime.InteropServices;',
    'public class StudyTutorWin {',
    '  public delegate bool EP(IntPtr h, IntPtr l);',
    '  [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb, IntPtr l);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
    '  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);',
    '  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);',
    '  [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte a, uint flags);',
    '  public static IntPtr Find(string w) {',
    '    IntPtr f = IntPtr.Zero;',
    '    EnumWindows((h, l) => {',
    '      if (!IsWindowVisible(h)) return true;',
    '      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);',
    '      if (sb.ToString() == w) { f = h; return false; }',
    '      return true;',
    '    }, IntPtr.Zero);',
    '    return f;',
    '  }',
    '}',
    '"@',
    '$title = [string]::Join("", [char]0x5b66, [char]0x4e60, [char]0x52a9, [char]0x624b)',
    '$h = [StudyTutorWin]::Find($title)',
    'if ($h -ne [IntPtr]::Zero) {',
    '  $ex = [StudyTutorWin]::GetWindowLong($h, -20)',
    '  [StudyTutorWin]::SetWindowLong($h, -20, $ex -bor 0x80000) | Out-Null',
    '  [StudyTutorWin]::SetLayeredWindowAttributes($h, 0, ' + alphaByte + ', 2) | Out-Null',
    '}',
  ].join('\n')

  const encoded = Buffer.from(ps, 'utf16le').toString('base64')
  try {
    spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      encoding: 'utf8', timeout: 30000, windowsHide: true,
    })
  } catch (error) {
    try {
      appendFileSync(join(process.env.DSH_HOME || '', 'study-tutor-debug.log'),
        new Date().toISOString() + ' opacity fallback failed: ' + String((error && error.message) || error) + '\n')
    } catch { /* noop */ }
  }
}

export function scheduleOpacity(opacity) {
  if (applyTimer) clearTimeout(applyTimer)
  applyTimer = setTimeout(() => {
    applyTimer = null
    applyWindowOpacity(opacity)
  }, 220)
}

/** 用启动器脚本打开（或前置）独立学习助手窗口。 */
export function openStudyWindow() {
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(PLUGIN_DIR, 'open-study-tutor.ps1')], {
      windowsHide: true,
      stdio: 'ignore',
    })
    child.on('error', () => {})
    child.unref()
  } catch { /* best effort */ }
}
