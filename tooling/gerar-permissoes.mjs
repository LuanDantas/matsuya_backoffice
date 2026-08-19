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

/**
 * Um literal de string seguro.
 *
 * As chaves nunca tiveram apóstrofo, e por isso a concatenação crua funcionou
 * até aqui. As **descrições** são texto livre em português escrito por gente:
 * basta alguém escrever "Ver o que's..." ou colar um texto com quebra de linha
 * para este arquivo passar a não compilar — e o defeito não aparece no primeiro
 * teste, aparece meses depois, num arquivo que ninguém edita à mão.
 */
const literal = (valor) =>
  `'${String(valor).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

function montarArquivo(catalogo) {
  /*
   * Falha fechada: descrição ou nome faltando viraria uma linha em branco na
   * tela de Minha conta, e uma tela com buraco é pior do que um portão que
   * reprova. Mesmo código de saída do "não achei a API" logo abaixo.
   */
  for (const p of catalogo.permissions) {
    if (!p.description) {
      console.error(`[permissoes] a permissão '${p.key}' está sem 'description' no catálogo.`)
      process.exit(2)
    }
  }
  for (const r of catalogo.roles) {
    if (!r.name || !r.scopeKind) {
      console.error(`[permissoes] o papel '${r.key}' está sem 'name' ou 'scopeKind'.`)
      process.exit(2)
    }
  }

  const chaves = catalogo.permissions.map((p) => p.key)
  const perigosas = catalogo.permissions.filter((p) => p.dangerous === true).map((p) => p.key)
  const papeis = catalogo.roles.map((p) => p.key)

  const lista = (itens) => itens.map((k) => `  '${k}',`).join('\n')

  const permissoes = catalogo.permissions
    .map(
      (p) =>
        `  { chave: ${literal(p.key)}, descricao: ${literal(p.description)}, perigosa: ${
          p.dangerous === true
        } },`
    )
    .join('\n')

  const papeisDetalhados = catalogo.roles
    .map(
      (r) =>
        `  { chave: ${literal(r.key)}, nome: ${literal(r.name)}, escopo: ${literal(r.scopeKind)} },`
    )
    .join('\n')

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
 *
 * **As descrições em pt-BR também vêm daqui.** Isso significa que corrigir uma
 * vírgula numa \`description\` no repositório da API reprova
 * \`pnpm contracts:drift\` até alguém regerar este arquivo. É o comportamento
 * certo — texto que aparece na tela é contrato como qualquer outro —, mas é
 * inesperado o bastante para merecer estar escrito: se o portão reprovou e você
 * não mexeu em nada aqui, rode o gerador.
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

export interface Permissao {
  chave: PermissionKey
  /** Frase em pt-BR, escrita no catálogo da API. É o que a interface mostra. */
  descricao: string
  perigosa: boolean
}

/**
 * As permissões com o texto que dá para ler.
 *
 * Na ordem do catálogo, que já vem agrupada por domínio — reordenar aqui
 * desmancharia esse agrupamento e obrigaria cada tela a reinventá-lo.
 *
 * \`chave: PermissionKey\` é autoconferência: se o gerador emitir uma chave que
 * não está na união acima, o \`typecheck\` reprova sozinho.
 */
export const PERMISSOES: ReadonlyArray<Permissao> = [
${permissoes}
]

export interface Papel {
  chave: RoleKey
  nome: string
  escopo: 'network' | 'group' | 'unit'
}

/** Os papéis com nome legível — \`/auth/me\` devolve o nome, mas não o escopo do papel. */
export const PAPEIS: ReadonlyArray<Papel> = [
${papeisDetalhados}
]
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
