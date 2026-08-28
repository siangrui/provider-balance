/**
 * provider-balance — 宿主半区（Node 侧）· 多供应商版
 *
 * 供应商列表自动跟随 Settings > Model：
 *   - agent-default-model  → 默认模型供应商（如 deepseek-official）
 *   - llm-pi-ai.providers  → pi-ai 多供应商路由（route → apiKeyEnv）
 *
 * 每个供应商查适配器表（有余额 API 的查询，没有的报 n/a），并行拉取 + 每供应商 TTL 缓存。
 * "最近被扣钱"供应商通过监听 llm/stream 瀑布事件记录（每次模型调用都会经过）。
 */
import Schema from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'provider-balance'

const BALANCE_ROUTE = '/provider-balance/balance'
const CACHE_TTL_MS = 45_000
const FETCH_TIMEOUT_MS = 10_000

/** 供应商 id → 余额适配器；无适配器的供应商报 n/a。 */
const ADAPTERS = {
  deepseek: {
    url: 'https://api.deepseek.com/user/balance',
    parse: (d) => {
      const b = d.balance_infos?.[0]
      return b ? { currency: b.currency, balance: Number(b.total_balance) } : null
    },
  },
  'deepseek-official': {
    url: 'https://api.deepseek.com/user/balance',
    parse: (d) => {
      const b = d.balance_infos?.[0]
      return b ? { currency: b.currency, balance: Number(b.total_balance) } : null
    },
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/credits',
    parse: (d) => {
      // 兼容两种返回形态：{credits, total_usage} 与 {data:{total_credits, total_usage}}
      const data = d.data
      const total = data?.total_credits ?? d.credits
      const used = data?.total_usage ?? d.total_usage ?? 0
      return { currency: 'USD', balance: Number(total ?? 0) - Number(used ?? 0) }
    },
  },
  stepfun: {
    url: 'https://api.stepfun.com/v1/accounts',
    parse: (d) => ({ currency: 'CNY', balance: Number(d.balance ?? 0) }),
  },
  siliconflow: {
    url: 'https://api.siliconflow.cn/v1/user/info',
    parse: (d) => ({ currency: 'CNY', balance: Number(d.data?.totalBalance ?? 0) }),
  },
  novita: {
    url: 'https://api.novita.ai/v3/user/balance',
    parse: (d) => ({ currency: 'USD', balance: Number(d.availableBalance ?? 0) / 10000 }),
  },
}

const LABELS = {
  'deepseek-official': 'DeepSeek',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  google: 'Google',
  opencode: 'OpenCode',
  stepfun: 'StepFun',
  siliconflow: 'SiliconFlow',
  novita: 'Novita',
}
const pretty = (id) => LABELS[id] ?? id

/** 前缀匹配适配器：deepseek-official 命中 deepseek 同款端点。 */
function adapterFor(id) {
  for (const [key, adapter] of Object.entries(ADAPTERS)) {
    if (key === id || id.startsWith(key)) return adapter
  }
  return null
}

export const inject = ['credentials', 'webServer', 'tools', 'settings']

export function apply(ctx) {
  // ── 设置命名空间：enabled + interval（持久化到 settings.yaml） ──
  ctx.settings.register(
    settingsNamespace('provider-balance'),
    Schema.object({
      enabled: Schema.boolean().default(true),
      interval: Schema.number().min(15).max(3600).default(60),
    }),
  )

  // ── 供应商列表：自动跟随 Settings > Model ──
  function providerList() {
    const list = []
    const seen = new Set()
    const defaultModel = ctx.settings.get(settingsNamespace('agent-default-model'))
    if (defaultModel?.provider && !seen.has(defaultModel.provider)) {
      seen.add(defaultModel.provider)
      list.push({
        id: defaultModel.provider,
        label: pretty(defaultModel.provider),
        keyRef: 'DEEPSEEK_API_KEY',
      })
    }
    const pi = ctx.settings.get(settingsNamespace('llm-pi-ai'))
    for (const [route, profile] of Object.entries(pi?.providers ?? {})) {
      if (seen.has(route)) continue
      seen.add(route)
      list.push({ id: route, label: pretty(route), keyRef: profile?.apiKeyEnv })
    }
    return list
  }

  // ── 单供应商余额查询 ──
  async function fetchOne(p) {
    const adapter = adapterFor(p.id)
    if (!adapter) return { provider: p.id, label: p.label, ok: false, error: 'n/a' }
    const hit = p.keyRef ? await ctx.credentials.resolve(credentialRef(p.keyRef)) : undefined
    if (!hit) return { provider: p.id, label: p.label, ok: false, error: p.keyRef ? `未配置 ${p.keyRef}` : '未配置 API key' }
    try {
      const res = await fetch(adapter.url, {
        headers: { Authorization: `Bearer ${hit.value}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) return { provider: p.id, label: p.label, ok: false, error: `HTTP ${res.status}` }
      const data = await res.json()
      const parsed = adapter.parse(data)
      if (!parsed) return { provider: p.id, label: p.label, ok: false, error: '解析失败' }
      return { provider: p.id, label: p.label, ok: true, currency: parsed.currency, balance: parsed.balance }
    } catch (err) {
      return { provider: p.id, label: p.label, ok: false, error: String(err?.message ?? err) }
    }
  }

  // ── 全部供应商并行拉取 + 每供应商 TTL 缓存 ──
  const cache = new Map() // provider id → { value, fetchedAt }
  async function getBalances(force = false) {
    const list = providerList()
    const now = Date.now()
    const providers = await Promise.all(
      list.map(async (p) => {
        const hit = cache.get(p.id)
        if (!force && hit && now - hit.fetchedAt < CACHE_TTL_MS) return hit.value
        const value = await fetchOne(p)
        cache.set(p.id, { value, fetchedAt: now })
        return value
      }),
    )
    return { providers }
  }

  // ── HTTP 路由：客户端悬浮球数据源 ──
  ctx.webServer.register({
    kind: 'exact',
    path: BALANCE_ROUTE,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost')
        const force = url.searchParams.get('refresh') === '1'
        const result = await getBalances(force)
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(result))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
      }
    },
  })

  // ── 模型工具：对话中直接问余额 ──
  ctx.tools.register(defineTool({
    name: 'provider_balance',
    description: '查询所有已配置 AI 供应商的账户余额（实时）',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args, _exec) {
      const { providers } = await getBalances(true)
      const lines = providers.map((p) =>
        p.ok
          ? `${p.label}  ${p.currency} ${p.balance.toFixed(2)}`
          : `${p.label}  ${p.error}`,
      )
      return `AI 供应商余额：\n${lines.join('\n')}`
    },
  }))
}
