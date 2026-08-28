# provider-balance

AI 供应商余额悬浮球插件：在 DSH Web 页面实时显示**所有已配置 AI 供应商**的账户余额，可开关、可配置刷新间隔。

## 功能

- **右下角悬浮球**（`shell.overlay`）：显示**最近被扣钱**（最近一次模型调用）的供应商及其余额，点击展开全部供应商面板，面板内可手动刷新
- **供应商列表自动跟随 Settings > Model**：读 `agent-default-model` + `llm-pi-ai.providers`，在设置页加供应商自动出现，删了自动消失（设置热重载，无需重启）
- **侧边栏底部快捷开关**（`sidebar.footer.action`）：一键显示/隐藏悬浮球
- **设置面板「供应商余额」页**（`settings.section`）：开关 + 刷新间隔（15–3600 秒），持久化到 `settings.yaml`
- **模型工具 `provider_balance`**：对话中直接问"还有多少钱"，返回全部供应商明细
- 安全：API key 只在宿主侧通过 `ctx.credentials` 按引用解析，浏览器只拿到余额数字

## 供应商余额 API 支持矩阵

| 供应商 | 支持 | 说明 |
|---|---|---|
| DeepSeek（deepseek-official） | ✅ | `api.deepseek.com/user/balance`（CNY/USD） |
| OpenRouter | ✅ | `openrouter.ai/api/v1/credits`（USD） |
| StepFun / SiliconFlow / Novita | ✅（预留） | 添加进 `ADAPTERS` 即生效 |
| Google（Gemini）/ OpenCode | ❌ n/a | 平台无 API-key 余额接口（Google 走 Cloud 账单，OpenCode 只是 CLI） |

## 架构

```
宿主半区 src/index.js（Node）
  ├─ ctx.settings.register('provider-balance', {enabled, interval})  → settings.yaml 持久化
  ├─ 供应商列表：agent-default-model + llm-pi-ai.providers（自动跟随配置）
  ├─ ctx.on('llm/stream')  → 记录最近被扣钱的供应商
  ├─ ctx.webServer.register('/provider-balance/balance')             → 并行查询 + 每供应商 45s 缓存
  └─ ctx.tools.register('provider_balance')                     → 对话工具

客户端半区 src/client.js（浏览器，bundle 到 lib/client.js）
  ├─ shell.overlay        → 悬浮球（最近使用供应商 + 点击展开面板）
  ├─ sidebar.footer.action → 快捷开关
  └─ settings.section      → 设置页
```

## 开发迭代

改完代码后重建客户端 bundle（pnpm 是链接安装，无需重装）：

```sh
cd /Users/roy/dsh/provider-balance
npm run build:client    # node build-client.mjs（宿主是纯 ESM，无需构建）
# 然后重启 dsh web 生效
```

## 回滚

```sh
# 1. 从 patch 层移除（编辑 ~/.dsh/profiles/web/cordis.patch.yml，删除 insert 块）
# 2. 卸载依赖
dsh plugin --profile web remove provider-balance
# 3. 重启 dsh web
```

## 排查

| 现象 | 原因 |
|---|---|
| 悬浮球显示「余额 ?」 | 点开面板看具体错误；多为某个 `apiKeyEnv` 未配置（`~/.dsh/.credentials.yaml`）或网络问题 |
| 某个供应商显示 n/a | 该供应商无余额 API（google/opencode）或适配器未内置 |
| 悬浮球不出现 | 设置页里开关未打开；或重启后浏览器未刷新 |
| 设置页没有「供应商余额」标签 | 客户端 bundle 未生效：确认 `lib/client.js` 存在且重启过 web |
| 新加的供应商没显示 | 确认它出现在 Settings > Model 的供应商列表里（llm-pi-ai 或 agent-default-model） |
