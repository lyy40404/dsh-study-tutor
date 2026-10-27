# -*- coding: utf-8 -*-
"""系统级区域截图：最小化学习助手 → 触发 Windows 截图（Win+Shift+S）→ 轮询剪贴板拿图 → 恢复窗口。

用法：python -X utf8 screenshot_system.py <输出路径>
输出：ok / cancel / error:xxx
"""
import ctypes
import sys
import time
from ctypes import wintypes

user32 = ctypes.windll.user32
user32.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM), wintypes.LPARAM]
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextLengthW.restype = ctypes.c_int
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextW.restype = ctypes.c_int
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsWindowVisible.restype = wintypes.BOOL
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.ShowWindow.restype = wintypes.BOOL
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.SetForegroundWindow.restype = wintypes.BOOL
user32.SetWindowPos.argtypes = [wintypes.HWND, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
user32.SetWindowPos.restype = wintypes.BOOL
user32.keybd_event.argtypes = [wintypes.BYTE, wintypes.BYTE, wintypes.DWORD, ctypes.c_void_p]
user32.keybd_event.restype = None

SW_MINIMIZE = 6
SW_RESTORE = 9
VK_LWIN, VK_SHIFT, VK_S = 0x5B, 0x10, 0x53
KEY_UP = 0x0002


def find_window(title):
    found = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def callback(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        if buf.value == title:
            found.append(hwnd)
            return False
        return True

    user32.EnumWindows(callback, 0)
    return found[0] if found else None


def key(vk, up=False):
    user32.keybd_event(vk, 0, KEY_UP if up else 0, None)


def main():
    if len(sys.argv) < 2:
        print('usage: screenshot_system.py <out.png>')
        return 2
    out = sys.argv[1]
    title = '\u5b66\u4e60\u52a9\u624b'

    hwnd = find_window(title)
    if hwnd:
        user32.ShowWindow(hwnd, SW_MINIMIZE)
        time.sleep(0.35)

    try:
        from PIL import ImageGrab
        before = None
        try:
            before = ImageGrab.grabclipboard()
        except Exception:
            before = None
        before_bytes = None
        if before is not None and not isinstance(before, list):
            try:
                before_bytes = before.tobytes()
            except Exception:
                before_bytes = None

        # 触发 Windows 截图：直接用 ms-screenclip: 协议（比模拟 Win+Shift+S 可靠，
        # 后者会被联想电脑管家等第三方软件接管/拦截）
        try:
            import subprocess
            subprocess.Popen(
                ['cmd', '/c', 'start', '', 'ms-screenclip:'],
                creationflags=0x08000000,
                close_fds=True,
            )
        except Exception:
            try:
                import os
                os.startfile('ms-screenclip:')
            except Exception:
                # 最后退回模拟按键
                key(VK_LWIN)
                key(VK_SHIFT)
                key(VK_S)
                time.sleep(0.08)
                key(VK_S, up=True)
                key(VK_SHIFT, up=True)
                key(VK_LWIN, up=True)

        deadline = time.time() + 15
        while time.time() < deadline:
            time.sleep(0.25)
            try:
                img = ImageGrab.grabclipboard()
            except Exception:
                continue
            if img is None or isinstance(img, list):
                continue
            try:
                data = img.tobytes()
            except Exception:
                continue
            if before_bytes is not None and data == before_bytes:
                continue
            img.save(out)
            print('ok')
            return 0
        print('cancel')
        return 1
    except Exception as exc:
        print('error: ' + str(exc))
        return 1
    finally:
        if hwnd:
            user32.ShowWindow(hwnd, SW_RESTORE)
            # 恢复后重新置顶（ShowWindow(SW_RESTORE) 会丢掉 WS_EX_TOPMOST 之外的 Z 序状态）
            user32.SetWindowPos(hwnd, ctypes.c_void_p(-1), 0, 0, 0, 0, 0x0002 | 0x0001)
            user32.SetForegroundWindow(hwnd)


if __name__ == '__main__':
    sys.exit(main())
