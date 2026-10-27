# 打开「学习助手」独立窗口
# 优先用 Electron 透明窗口（背景透明 + 文字不透明），找不到再退回 Edge app 模式。
$ErrorActionPreference = 'SilentlyContinue'
# DSH 宿主会设置 ELECTRON_RUN_AS_NODE=1（让 electron 以 Node 模式跑），必须清掉，否则 Electron 窗口起不来
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# ---------- 1. 找 DSH 的 web 端口 ----------
$dshPids = (Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue).Id
$ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -in $dshPids -and $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::') } |
  Select-Object -ExpandProperty LocalPort -Unique

$target = $null
foreach ($port in $ports) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/study-tutor/ui" -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200 -and $r.Content -match '学习助手') { $target = $port; break }
  } catch { }
}
if (-not $target) {
  Write-Host '没找到学习助手接口。请确认 DSH 已重启、插件已加载。' -ForegroundColor Red
  Start-Sleep 4; exit 1
}

# ---------- 2. 优先 Electron 透明窗口 ----------
$electronDir = Join-Path $env:USERPROFILE '.dsh\study-tutor-electron'
$electronExe = Join-Path $electronDir 'node_modules\electron\dist\electron.exe'
$mainJs = Join-Path $electronDir 'main.js'
if ((Test-Path $electronExe) -and (Test-Path $mainJs)) {
  Start-Process -FilePath $electronExe -ArgumentList @("`"$mainJs`"", "--port=$target") -WindowStyle Hidden
  Write-Host "学习助手（Electron 透明窗口）已启动（端口 $target）" -ForegroundColor Green
  Start-Sleep -Seconds 1
  exit 0
}

# ---------- 3. 回退：Edge/Chrome app 模式 ----------
$edgeCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $edgeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) {
  Write-Host '没找到 Electron / Edge / Chrome' -ForegroundColor Red
  Start-Sleep 3; exit 1
}

$url = "http://127.0.0.1:$target/study-tutor/ui"
$profileDir = Join-Path $env:USERPROFILE '.dsh\study-tutor-profile'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinTop {
  public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  public static IntPtr FindByTitle(string wanted) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      if (sb.ToString() == wanted) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

function Set-StudyLayout($hwnd) {
  $dpi = [WinTop]::GetDpiForWindow($hwnd)
  $scale = if ($dpi -gt 0) { $dpi / 96.0 } else { 1.0 }
  $w = [int](480 * $scale)
  $h = [int](640 * $scale)
  [WinTop]::ShowWindow($hwnd, 9) | Out-Null
  [WinTop]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, $w, $h, 0x0002) | Out-Null
  [WinTop]::SetForegroundWindow($hwnd) | Out-Null
}

$hwnd = [WinTop]::FindByTitle('学习助手')
if ($hwnd -ne [IntPtr]::Zero) {
  Set-StudyLayout $hwnd
  Write-Host "学习助手已在运行，已置顶（端口 $target）" -ForegroundColor Green
  Start-Sleep 1; exit 0
}

Start-Process -FilePath $browser -ArgumentList @(
  "--app=$url", '--window-size=480,640', "--user-data-dir=$profileDir",
  '--no-first-run', '--no-default-browser-check', '--disable-features=Translate'
)

$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Milliseconds 900
  $hwnd = [WinTop]::FindByTitle('学习助手')
  if ($hwnd -ne [IntPtr]::Zero) { break }
}
if ($hwnd -ne [IntPtr]::Zero) {
  Set-StudyLayout $hwnd
  Write-Host "学习助手已打开并置顶（端口 $target，Edge 模式）" -ForegroundColor Green
} else {
  Write-Host "学习助手窗口已打开（端口 $target），置顶未生效" -ForegroundColor Yellow
}
Start-Sleep -Seconds 1
