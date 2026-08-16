#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  RAIZ,
  extrairArrayDeConstantes,
  extrairChavesDeRegistro,
  lerMaquinaDeEstados,
  localizarApi,
} from './api-fonte.mjs'

/**
 * Confere se o espelho do domínio no front bate com a API.
 *
 * O front espelha estados, motivos e ações porque precisa desenhar a tela antes
 * de perguntar ao servidor — não dá para renderizar um quadro de pedidos
 * pedindo ao backend, botão a botão, se aquele botão existe.
 *
 * O risco disso é conhecido: alguém acrescenta um estado na API, ninguém
 * atualiza o front, e a coluna nova simplesmente não aparece no quadro. Nada
 * quebra, nada avisa, e o pedido fica invisível para a loja. Este script existe
 * para que essa divergência reprove o build em vez de virar um chamado.
 *
 * Sai com:
 *   0  tudo em dia
 *   1  divergência encontrada
 *   2  não foi possível verificar (API não encontrada) — e isso não é "ok"
 */

const problemas = []
const conferidos = []

function comparar(rotulo, daApi, doFront) {
  if (!daApi) {
    problemas.push(`${rotulo}: não consegui extrair a lista do fonte da API.`)
    return
  }

  const faltando = daApi.filter((item) => !doFront.includes(item))
  const sobrando = doFront.filter((item) => !daApi.includes(item))

  if (faltando.length === 0 && sobrando.length === 0) {
    conferidos.push(`${rotulo}: ${daApi.length} itens`)
    return
  }

  const detalhe = []
  if (faltando.length) detalhe.push(`existem na API e não no front: ${faltando.join(', ')}`)
  if (sobrando.length) detalhe.push(`existem no front e não na API: ${sobrando.join(', ')}`)
  problemas.push(`${rotulo} — ${detalhe.join(' · ')}`)
}

const raizDaApi = localizarApi()

if (!raizDaApi) {
  console.error(
    '\n[deriva] Repositório da API não encontrado — a verificação NÃO foi feita.\n' +
      '         Defina MATSUYA_API_PATH apontando para o repositório da API.\n' +
      '         Tratar isto como sucesso seria fingir que o contrato foi conferido.\n'
  )
  process.exit(2)
}

// ── permissões: geradas, então basta reconferir a geração ────────────────
try {
  execFileSync('node', [resolve(RAIZ, 'tooling/gerar-permissoes.mjs'), '--check'], {
    stdio: 'pipe',
  })
  conferidos.push('permissões: arquivo gerado em dia')
} catch (erro) {
  problemas.push(
    'permissões — o arquivo gerado está desatualizado. Rode: node tooling/gerar-permissoes.mjs'
  )
}

// ── estados, motivos e ações ─────────────────────────────────────────────
const maquinaDaApi = lerMaquinaDeEstados(raizDaApi)

const ler = (caminho) => readFileSync(resolve(RAIZ, caminho), 'utf8')
const statusDoFront = ler('packages/contracts/src/orders/status.ts')
const motivosDoFront = ler('packages/contracts/src/orders/reasons.ts')
const acoesDoFront = ler('packages/contracts/src/orders/actions.ts')

comparar(
  'ORDER_STATUSES',
  extrairArrayDeConstantes(maquinaDaApi, 'ORDER_STATUSES'),
  extrairArrayDeConstantes(statusDoFront, 'ORDER_STATUSES') ?? []
)

for (const nome of [
  'MOTIVOS_DE_RECUSA',
  'MOTIVOS_DE_CANCELAMENTO',
  'MOTIVOS_DE_FALHA_NA_ENTREGA',
]) {
  comparar(
    nome,
    extrairChavesDeRegistro(maquinaDaApi, nome),
    extrairChavesDeRegistro(motivosDoFront, nome) ?? []
  )
}

// As ações da API são as chaves de `TRANSITIONS`, que são kebab-case entre
// aspas — formato diferente das constantes em maiúsculas.
const blocoDeTransicoes = maquinaDaApi.match(
  /export const TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\}/m
)
const acoesDaApi = blocoDeTransicoes
  ? [...blocoDeTransicoes[1].matchAll(/^ {2}'?([a-z-]+)'?:\s*\{/gm)].map((m) => m[1])
  : null

comparar(
  'ações do ciclo de vida',
  acoesDaApi,
  extrairArrayDeConstantes(acoesDoFront, 'ORDER_ACTIONS') ?? []
)

// ── resultado ────────────────────────────────────────────────────────────
console.log(`\n[deriva] API em: ${raizDaApi}\n`)
for (const linha of conferidos) console.log(`  ✓ ${linha}`)

if (problemas.length > 0) {
  console.error('\n  Divergências:')
  for (const linha of problemas) console.error(`  ✗ ${linha}`)
  console.error(
    '\n  O front desenha a tela a partir do espelho. Um espelho que discorda da\n' +
      '  API mostra botão que dá 409, ou esconde pedido que existe.\n'
  )
  process.exit(1)
}

console.log('\n  Contrato em dia com a API.\n')
