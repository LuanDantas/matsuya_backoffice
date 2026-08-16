#!/usr/bin/env node
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { localizarApi, lerCatalogoDeRbac, RAIZ } from './api-fonte.mjs'

/**
 * Gera a união de chaves de permissão a partir do catálogo da API.
 *
 * Gerar em vez de copiar à mão: 62 chaves copiadas manualmente divergem na
 * terceira vez que alguém acrescenta uma permissão, e a divergência aparece
 * como um `can('orders:acept')` que o TypeScript aceita e que nunca é
 * verdadeiro.
 *
 * Uso:
 *   node tooling/gerar-permissoes.mjs           grava o arquivo
 *   node tooling/gerar-permissoes.mjs --check   só confere e sai 1 se diferir
 */

const DESTINO = resolve(RAIZ, 'packages/contracts/src/rbac/permissions.generated.ts')

function montarArquivo(catalogo) {
  const chaves = catalogo.permissions.map((p) => p.key)
  const perigosas = catalogo.permissions.filter((p) => p.dangerous === true).map((p) => p.key)
  const papeis = catalogo.roles.map((p) => p.key)

  const lista = (itens) => itens.map((k) => `  '${k}',`).join('\n')

  return `/**
 * ARQUIVO GERADO — não edite à mão.
 *
 * Fonte: \`src/platform/rbac/catalog.json\` no repositório da API.
 * Para atualizar: \`node tooling/gerar-permissoes.mjs\` na raiz do monorepo.
 *
 * A geração existe para que a união de chaves aqui e as linhas da tabela
 * \`permissions\` no banco sejam literalmente a mesma lista. Copiar à mão
 * diverge, e a divergência aparece como uma permissão que o TypeScript aceita e
 * que nunca é concedida a ninguém.
 */

export const PERMISSION_KEYS = [
${lista(chaves)}
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/** Exigem reautenticação com MFA quando o fluxo existir. */
export const DANGEROUS_PERMISSION_KEYS = [
${lista(perigosas)}
] as const satisfies ReadonlyArray<PermissionKey>

export const ROLE_KEYS = [
${lista(papeis)}
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]
`
}

const raizDaApi = localizarApi()

if (!raizDaApi) {
  console.error(
    '[permissoes] Repositório da API não encontrado.\n' +
      '            Defina MATSUYA_API_PATH ou deixe o repositório ao lado deste.'
  )
  process.exit(2)
}

const conteudo = montarArquivo(lerCatalogoDeRbac(raizDaApi))
const conferir = process.argv.includes('--check')

if (conferir) {
  const atual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : ''
  if (atual !== conteudo) {
    console.error(
      '[permissoes] O arquivo gerado está desatualizado em relação ao catálogo da API.\n' +
        '            Rode: node tooling/gerar-permissoes.mjs'
    )
    process.exit(1)
  }
  console.log('[permissoes] em dia')
  process.exit(0)
}

writeFileSync(DESTINO, conteudo)
console.log(`[permissoes] gravado: ${DESTINO}`)
