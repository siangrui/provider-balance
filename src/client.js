/**
 * provider-balance — 客户端半区（浏览器侧）· 多供应商版
 *
 * 三个 UI 注册点：
 *  1. shell.overlay        → 右下角悬浮球：显示当前对话栏选中的供应商余额，点击展开全部供应商面板
 *  2. sidebar.footer.action → 侧边栏底部快捷开关
 *  3. settings.section      → 设置面板「供应商余额」页（开关 + 刷新间隔，持久化）
 *
 * "当前选中供应商"通过 useSessions（GlobalStandardProps）拿 current sessionId，
 * 再调 connection.api.sessions.models() 获取 {current: {provider, model}, groups}。
 * 数据经宿主路由 /provider-balance/balance 获取（key 永不进浏览器）。
 * 显式 React.createElement，避免 JSX/默认导出互操作风险。
 */
import * as React from 'react'

export const name = 'provider-balance-client'

export const inject = ['timer', 'slots']

const ROUTE = '/provider-balance/balance'

// ── 设置 scope：enabled 开关 + interval 刷新间隔 ──
function useBalancePrefs(scope) {
  const [prefs, setPrefs] = React.useState({ enabled: true, interval: 60 })
  React.useEffect(() => {
    if (!scope) return undefined
    const read = () => {
      const snap = scope.getSnapshot()
      if (snap.status === 'ready' && snap.value) {
        setPrefs({
          enabled: snap.value.enabled !== false,
          interval: Number(snap.value.interval) || 60,
        })
      }
    }
    read()
    return scope.subscribe(read)
  }, [scope])
  return prefs
}

// ── 当前对话栏选中的供应商 ──
// useSessions 是 root-scope slot 的 GlobalStandardProps hook，必须在渲染期调用；
// connection.api.sessions.models({sessionId}) 返回 {current: {provider, model}, groups}。
// 客户端没有"模型已切换"事件，采用独立短周期轮询（MODEL_CHECK_MS）：
// 选完模型最多 5 秒内更新；点击悬浮球（recheck）立即重查。
// 返回 { current, diag, recheck }——diag 描述检测链路状态，供展开面板自诊断。
const MODEL_CHECK_MS = 5_000

function useCurrentProvider(sessionId, hasSessionsHook, ctx) {
  const [current, setCurrent] = React.useState(null) // { provider, model, label }
  const [diag, setDiag] = React.useState({ step: 'idle', detail: null })
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!hasSessionsHook) {
      setDiag({ step: 'no-hook', detail: 'useSessions prop 未注入' })
      return undefined
    }
    if (!sessionId) {
      setDiag({ step: 'no-session', detail: '会话列表 current 为空' })
      return undefined
    }

    const connection = ctx.get('connection')
    const sessionsFace = connection?.api?.sessions
    if (!sessionsFace?.models) {
      setDiag({ step: 'no-api', detail: 'connection.api.sessions 不可用' })
      return undefined
    }

    let cancelled = false
    const check = () => {
      sessionsFace.models({ sessionId })
        .then(({ result }) => {
          if (cancelled) return
          if (!result?.ok) {
            setDiag({ step: 'rpc-fail', detail: result?.error?.code ?? 'unknown' })
            return
          }
          const { current: sel, groups } = result.value
          if (!sel?.provider) {
            setDiag({ step: 'no-selection', detail: 'session.models current 为空' })
            setCurrent(null)
            return
          }
          // 从 groups 找显示名
          const group = groups?.find((g) => g.id === sel.provider)
          setCurrent({
            provider: sel.provider,
            model: sel.model,
            label: group?.name ?? sel.provider,
          })
          setDiag({ step: 'ok', detail: `${sel.provider} / ${sel.model}` })
        })
        .catch((e) => {
          if (!cancelled) setDiag({ step: 'throw', detail: String(e?.message ?? e) })
        })
    }
    check()
    const disposer = ctx.interval(check, MODEL_CHECK_MS)
    return () => { cancelled = true; if (typeof disposer === 'function') disposer() }
  }, [sessionId, hasSessionsHook, ctx, tick])

  return { current, diag, recheck: () => setTick((t) => t + 1) }
}

// ── 多供应商余额：初始加载 + interval 轮询 + 手动刷新 ──
function useBalances(scope, ctx) {
  const prefs = useBalancePrefs(scope)
  const [state, setState] = React.useState({
    providers: null, error: null, loading: false,
  })

  const load = React.useCallback((force) => {
    setState((s) => ({ ...s, loading: true }))
    fetch(`${ROUTE}${force ? '?refresh=1' : ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data.providers)) {
          setState({ providers: data.providers, error: null, loading: false })
        } else {
          setState((s) => ({ ...s, error: (data && data.error) || 'unknown', loading: false }))
        }
      })
      .catch((e) => setState((s) => ({ ...s, error: String((e && e.message) || e), loading: false })))
  }, [])

  React.useEffect(() => {
    if (prefs.enabled) load(false)
  }, [prefs.enabled, load])

  React.useEffect(() => {
    if (!prefs.enabled) return undefined
    return ctx.interval(() => load(false), Math.max(15, prefs.interval) * 1000)
  }, [prefs.enabled, prefs.interval, load, ctx])

  return { state, prefs, refresh: () => load(true) }
}

// ── 悬浮球（shell.overlay） ──
function BalanceBadge({ scope, ctx, useSessions }) {
  const { state, prefs, refresh } = useBalances(scope, ctx)
  // useSessions 必须在渲染期调用（Rules of Hooks）：root scope slot 保证提供该 prop
  const list = useSessions ? useSessions((s) => s) : undefined
  const { current, diag, recheck } = useCurrentProvider(list?.current, Boolean(useSessions), ctx)
  const [open, setOpen] = React.useState(false)
  if (!prefs.enabled) return null

  const toggleOpen = () => { setOpen((v) => !v); recheck() }

  const providers = state.providers ?? []
  // 优先当前选中供应商，其次第一个有余额的，再次第一个
  const active =
    providers.find((p) => p.provider === current?.provider) ||
    providers.find((p) => p.ok) ||
    providers[0]

  const label = active
    ? `${active.label} ${active.ok ? `${active.currency} ${active.balance.toFixed(2)}` : active.error}`
    : state.loading ? '余额…' : (state.error ? '余额 ?' : '--')

  const highlightId = current?.provider

  const rows = (providers.length ? providers : [{ label: '—', error: state.error || '加载中' }]).map((p) =>
    React.createElement(
      'div',
      {
        key: p.provider ?? p.label,
        style: {
          display: 'flex', justifyContent: 'space-between', gap: 16,
          padding: '4px 0', fontSize: 13,
          opacity: highlightId === p.provider ? 1 : 0.85,
          fontWeight: highlightId === p.provider ? 600 : 400,
        },
      },
      React.createElement('span', null, p.label + (highlightId === p.provider ? ' ◂' : '')),
      React.createElement(
        'span',
        { style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: p.ok ? undefined : '#e0a45c' } },
        p.ok ? `${p.currency} ${p.balance.toFixed(2)}` : p.error,
      ),
    ),
  )

  return React.createElement(
    'div',
    { style: { position: 'fixed', right: 16, bottom: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'none' } },
    open &&
      React.createElement(
        'div',
        {
          style: {
            pointerEvents: 'auto', background: 'rgba(20, 22, 28, 0.96)', color: '#e8e8e8',
            borderRadius: 10, padding: '10px 14px', minWidth: 200,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
          },
        },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
          React.createElement('strong', { style: { fontSize: 13 } }, '供应商余额'),
          React.createElement(
            'button',
            {
              onClick: () => setOpen(false),
              style: { background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13, padding: 0 },
            },
            '✕',
          ),
        ),
        rows,
        React.createElement(
          'div',
          { style: { marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          React.createElement(
            'button',
            { onClick: () => { refresh(); recheck() }, style: { background: 'transparent', border: 'none', color: '#6ab0f3', cursor: 'pointer', fontSize: 12, padding: 0 } },
            state.loading ? '刷新中…' : '⟳ 刷新',
          ),
          state.error && React.createElement('span', { style: { fontSize: 11, color: '#e0a45c' } }, state.error),
        ),
        React.createElement(
          'div',
          {
            style: {
              marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: 11, opacity: 0.65, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            },
          },
          `选中: ${current ? `${current.label} (${current.model})` : diag.step === 'ok' ? '无' : `${diag.step}: ${diag.detail ?? ''}`}`,
        ),
      ),
    React.createElement(
      'div',
      {
        onClick: toggleOpen,
        title: '点击展开/收起全部供应商余额',
        style: {
          pointerEvents: 'auto', cursor: 'pointer', userSelect: 'none',
          background: 'rgba(20, 22, 28, 0.92)', color: '#e8e8e8',
          borderRadius: 999, padding: '6px 14px', fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 6,
        },
      },
      React.createElement('span', null, '💰'),
      React.createElement('span', null, label),
      state.loading && React.createElement('span', { style: { opacity: 0.6 } }, '↻'),
    ),
  )
}

// ── 侧边栏快捷开关（sidebar.footer.action） ──
function BalanceToggle({ scope }) {
  const prefs = useBalancePrefs(scope)
  const toggle = () => {
    if (scope) scope.set('enabled', !prefs.enabled)
  }
  return React.createElement(
    'button',
    {
      onClick: toggle,
      title: prefs.enabled ? '关闭余额悬浮球' : '开启余额悬浮球',
      style: {
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontSize: 13, color: 'inherit', padding: '4px 8px', borderRadius: 6,
      },
    },
    prefs.enabled ? '💰 余额 开' : '💰 余额 关',
  )
}

// ── 设置页（settings.section） ──
function BalanceSettingsSection({ scope }) {
  const prefs = useBalancePrefs(scope)
  const set = (field, value) => {
    if (scope) scope.set(field, value)
  }
  return React.createElement(
    'section',
    { style: { padding: '0 4px' } },
    React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 15 } }, '供应商余额'),
    React.createElement(
      'p',
      { style: { fontSize: 12, opacity: 0.75, margin: '0 0 12px' } },
      '悬浮球显示当前对话栏选中的供应商余额；点击展开全部供应商（无余额 API 的显示 n/a）。供应商列表自动跟随 Settings > Model。',
    ),
    React.createElement(
      'label',
      { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 14 } },
      React.createElement('input', {
        type: 'checkbox',
        checked: prefs.enabled,
        onChange: (e) => set('enabled', e.target.checked),
      }),
      React.createElement('span', null, '显示余额悬浮球'),
    ),
    React.createElement(
      'label',
      { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 } },
      React.createElement('span', null, '刷新间隔（秒）：'),
      React.createElement('input', {
        type: 'number', min: 15, max: 3600, value: prefs.interval,
        style: { width: 80 },
        onChange: (e) => set('interval', Math.max(15, Number(e.target.value) || 60)),
      }),
    ),
    !scope &&
      React.createElement(
        'p',
        { style: { fontSize: 12, opacity: 0.7 } },
        '设置服务不可用，开关不会被持久化。',
      ),
  )
}

// ── 插件入口 ──
export function apply(ctx) {
  const settingsScope = ctx.get('settingsScope')
  const scope = settingsScope ? settingsScope.bind({ namespace: 'provider-balance' }) : undefined

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'provider-balance.badge' },
    (props) => React.createElement(BalanceBadge, { scope, ctx, ...props }),
  ))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'provider-balance.toggle' },
    () => React.createElement(BalanceToggle, { scope }),
  ))

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'provider-balance', order: 200, label: () => '供应商余额' },
    (props) => React.createElement(BalanceSettingsSection, { scope, ...props }),
  ))
}
