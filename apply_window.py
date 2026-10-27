# -*- coding: utf-8 -*-
"""Window opacity helper: set the study-tutor window to a layered alpha.

Called by the dsh-study-tutor host as:
    python -X utf8 apply_window.py <alpha 0..1> [title]

Why Python instead of PowerShell: PowerShell needs Add-Type compilation on every
spawn (~1.5 s), while ctypes is ready in ~200 ms, so dragging the opacity slider
feels responsive.
"""
import ctypes
import sys
from ctypes import wintypes

user32 = ctypes.windll.user32
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextW.restype = ctypes.c_int
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextLengthW.restype = ctypes.c_int
user32.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM), wintypes.LPARAM]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsWindowVisible.restype = wintypes.BOOL
user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongW.restype = ctypes.c_long
user32.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
user32.SetWindowLongW.restype = ctypes.c_long
user32.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.COLORREF, wintypes.BYTE, wintypes.DWORD]
user32.SetLayeredWindowAttributes.restype = wintypes.BOOL

GWL_EXSTYLE = -20
WS_EX_LAYERED = 0x00080000
LWA_ALPHA = 0x00000002


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


def main():
    if len(sys.argv) < 2:
        print('usage: apply_window.py <alpha> [title]')
        return 2
    try:
        opacity = float(sys.argv[1])
    except ValueError:
        print('bad alpha')
        return 2
    opacity = max(0.2, min(1.0, opacity))
    title = sys.argv[2] if len(sys.argv) > 2 else '\u5b66\u4e60\u52a9\u624b'

    hwnd = find_window(title)
    if not hwnd:
        print('window-not-found')
        return 1

    ex = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    if not (ex & WS_EX_LAYERED):
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED)
    alpha = int(round(opacity * 255))
    ok = user32.SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA)
    print('ok' if ok else 'failed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
