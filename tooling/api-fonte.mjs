import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Localiza o repositório da API, que é a fonte da verdade do domínio.
 *
 * O front espelha estados, motivos e permissões porque precisa desenhar a tela
 * antes de perguntar ao servidor. Espelho que diverge é pior do que espelho
 * nenhum — ele mente com confiança —, então tudo que é espelhado aqui é
 * conferido contra o original.
 */

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')

const CANDIDATOS = [
  process.env.MATSUYA_API_PATH,
  resolve(RAIZ, '../matsuya_app-api-phase0'),
  resolve(RAIZ, '../matsuya_app-api'),
].filter(Boolean)

export function localizarApi() {
  for (const caminho of CANDIDATOS) {
    if (existsSync(resolve(caminho, 'src/platform/rbac/catalog.json'))) {
      return caminho
    }
  }
  return null
}

export function lerCatalogoDeRbac(raizDaApi) {
  return JSON.parse(
    readFileSync(resolve(raizDaApi, 'src/platform/rbac/catalog.json'), 'utf8')
  )
}

export function lerMaquinaDeEstados(raizDaApi) {
  return readFileSync(
    resolve(raizDaApi, 'src/modules/orders/orderStateMachine.ts'),
    'utf8'
  )
}

/**
 * Extrai um array `const NOME = [...] as const` do fonte da API.
 *
 * Análise por expressão regular, e não por AST, de propósito: são listas de
 * literais de string com formato estável, e carregar um parser de TypeScript
 * nas ferramentas do monorepo custaria mais do que resolve. Se o formato mudar,
 * a extração devolve vazio e a verificação reprova — que é o comportamento
 * certo para uma ferramenta que existe para pegar divergência.
 */
export function extrairArrayDeConstantes(fonte, nome) {
  const bloco = new RegExp(`export const ${nome}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`, 'm')
  const encontrado = fonte.match(bloco)
  if (!encontrado) return null
  return [...encontrado[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/** Extrai as chaves de um `export const NOME: Record<...> = { CHAVE: '...' }`. */
export function extrairChavesDeRegistro(fonte, nome) {
  const bloco = new RegExp(`export const ${nome}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`, 'm')
  const encontrado = fonte.match(bloco)
  if (!encontrado) return null
  return [...encontrado[1].matchAll(/^\s*([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1])
}

export { RAIZ }
