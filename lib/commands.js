/** 用户命令：/study 打开学习助手窗口。 */
export function registerCommands(ctx, openStudyWindow) {
  try {
    const commands = ctx.get && ctx.get('commands')
    if (!commands || typeof commands.register !== 'function') return
    ctx.effect(() => commands.register({
      name: 'study',
      description: '打开学习助手浮窗（独立置顶小窗）',
      handler: () => {
        openStudyWindow()
        return { kind: 'success', text: '学习助手窗口已打开（如未出现，请稍等 2 秒或双击桌面快捷方式）' }
      },
    }), 'study-tutor: command /study')
  } catch { /* command surface optional */ }
}
