/**
 * dsh-breaker — 卡死自动跳闸。纯 JS，无构建步骤。
 *
 * 只使用官方公开接口：
 *   - 事件 agent/status、agent/assistant-stream
 *   - Agent#cancel(cause, { keepInbox })
 *   - ctx.effect 注册清理
 *
 * 已知局限：cancel 是协作式取消。若上游 provider 不观察 abort signal，
 * 取消不会让请求真正结算；此时本插件只会在日志里报告，救不回来，
 * 需要重启 DSH 宿主（不是整台电脑）。
 */
export const name = 'dsh-breaker'
export const inject = ['agents']

const DEFAULTS = {
  enabled: true,
  stallMs: 90000,
  checkMs: 15000,
  keepInbox: true,
  graceMs: 10000,
}

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config || {}) }
  const tracked = new Map()

  const say = (msg, level = 'info') => {
    const fn = ctx.logger?.[level]
    if (typeof fn === 'function') fn.call(ctx.logger, '[dsh-breaker] ' + msg)
  }

  ctx.on('agent/status', (payload) => {
    const agent = payload?.agent
    if (!agent) return
    if (payload.status === 'running') {
      const rec = tracked.get(agent)
      if (rec) {
        rec.last = Date.now()
        rec.tripped = false
      } else {
        tracked.set(agent, { last: Date.now(), tripped: false })
      }
    } else {
      tracked.delete(agent)
    }
  })

  ctx.on('agent/assistant-stream', (payload) => {
    const rec = tracked.get(payload?.agent)
    if (!rec) return
    rec.last = Date.now()
    if (payload.frame?.type === 'start') rec.tripped = false
  })

  const tick = () => {
    if (!cfg.enabled) return
    const now = Date.now()
    for (const [agent, rec] of tracked) {
      if (rec.tripped) continue
      if (now - rec.last < cfg.stallMs) continue
      rec.tripped = true
      const sessionId = agent.session?.header?.id ?? 'unknown'
      try {
        agent.cancel(
          { kind: 'hook', reason: 'dsh-breaker: no progress for ' + cfg.stallMs + 'ms' },
          { keepInbox: cfg.keepInbox },
        )
        say('已对会话 ' + sessionId + ' 触发取消（' + cfg.stallMs + 'ms 无进展）')
      } catch (error) {
        say('取消失败：' + (error?.message ?? String(error)), 'warn')
        continue
      }
      setTimeout(() => {
        if (agent.status === 'running') {
          say(
            '会话 ' + sessionId + ' 取消后仍未收敛；上游可能不响应 abort，需要重启 DSH 宿主',
            'warn',
          )
        }
      }, cfg.graceMs)
    }
  }

  const timer = setInterval(tick, Math.max(1000, Number(cfg.checkMs) || 15000))
  if (typeof timer.unref === 'function') timer.unref()

  ctx.effect(() => () => {
    clearInterval(timer)
    tracked.clear()
  })

  say('已加载：' + cfg.stallMs + 'ms 无进展即自动取消')
}
