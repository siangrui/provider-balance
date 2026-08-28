/**
 * 构建客户端 bundle → lib/client.js
 *
 * 输出格式与官方产物一致：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { var module = {exports:{}}; ...; return module.exports } })
 *
 * 外部依赖（react / cordis）由 shell 基线提供，不打进 bundle。
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const outCjs = join(root, 'lib', 'client.cjs')
const outFinal = join(root, 'lib', 'client.js')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

mkdirSync(dirname(outCjs), { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'client.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  outfile: outCjs,
  external: ['react', '@deepseek-ai/cordis'],
  logLevel: 'info',
})

const body = readFileSync(outCjs, 'utf8')
const indented = body
  .split('\n')
  .map((line) => '    ' + line)
  .join('\n')

const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${indented}
    return module.exports;
  }
});
`

writeFileSync(outFinal, wrapped)
console.log(`built ${outFinal} (${(wrapped.length / 1024).toFixed(1)} KiB)`)
