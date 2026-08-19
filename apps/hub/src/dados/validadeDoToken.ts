/**
 * Quando esta sessão vence, lido do próprio token.
 *
 * ## Por que isto existe
 *
 * O token de login vale **um dia e não se renova** — a API não tem refresh
 * token (ver `useSessao.ts`). Até aqui o Hub tratava o JWT como string opaca e
 * só descobria o vencimento **reativamente**, no primeiro `401`: a pessoa
 * aperta um botão no meio do turno e é jogada para fora sem aviso nenhum.
 *
 * O `exp` sempre esteve ali, no `localStorage`, a um `atob` de distância.
 *
 * ## Só o `exp`, e o tipo de retorno é a trava
 *
 * O payload deste token carrega **CPF (`document`), telefone e `unityId`** além
 * do vencimento. Nada disso pode chegar à tela: o token é credencial, não fonte
 * de dados de perfil — para isso existe `/auth/me`, que devolve exatamente o que
 * a API decidiu expor.
 *
 * Por isso a função devolve `number | null` e não `{ exp, payload }`. A
 * disciplina de "não use os outros campos" some no primeiro dia corrido; o tipo
 * não some. Se alguém precisar de outro campo, vai ter de mudar a assinatura —
 * e aí a conversa acontece.
 *
 * ## Nada aqui autentica
 *
 * A assinatura **não** é verificada: não dá, o segredo é do servidor. Isto serve
 * para escrever uma frase na tela, e só. Quem decide se o token vale é a API, em
 * toda requisição.
 */

/** Menos de uma hora para vencer já é assunto de quem está operando. */
const PERTO_EM_MS = 60 * 60 * 1000

/**
 * O instante de vencimento em milissegundos, ou `null` quando não deu para ler.
 *
 * `null` não é erro: é "não sei". A tela que consome isto simplesmente não
 * mostra a linha, em vez de chutar o padrão de um dia — um relógio inventado é
 * pior do que relógio nenhum.
 */
export function expiracaoDoToken(token: string | null | undefined): number | null {
  if (!token) return null

  try {
    const partes = token.split('.')
    // Exatamente três. Duas ou quatro não é um JWT com o miolo no lugar que
    // este código espera, e adivinhar qual pedaço é o payload é como se lê o
    // token errado sem ninguém perceber.
    if (partes.length !== 3) return null

    const payload = decodificarBase64Url(partes[1]!)
    if (payload === null) return null

    const dados: unknown = JSON.parse(payload)
    if (typeof dados !== 'object' || dados === null) return null

    const exp = (dados as { exp?: unknown }).exp

    /*
     * `typeof number` de propósito: um servidor que mandar `"1755500000"` como
     * texto recebe `null` em vez de uma conversão silenciosa. Aceitar as duas
     * formas é como um campo muda de tipo e ninguém descobre.
     */
    if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= 0) return null

    return exp * 1000
  } catch {
    return null
  }
}

export type FaixaDaValidade = 'desconhecida' | 'vencida' | 'perto' | 'ok'

export function faixaDaValidade(
  expiraEm: number | null,
  agora: number
): FaixaDaValidade {
  if (expiraEm === null) return 'desconhecida'
  if (agora >= expiraEm) return 'vencida'
  return expiraEm - agora < PERTO_EM_MS ? 'perto' : 'ok'
}

/**
 * base64url → texto.
 *
 * `atob` e não `Buffer`: este código roda no navegador, onde `Buffer` não
 * existe. O acento do nome sai embaralhado porque `atob` devolve latin1 — e não
 * faz diferença, porque o único campo lido daqui é um número.
 */
function decodificarBase64Url(trecho: string): string | null {
  if (typeof atob !== 'function') return null

  const base64 = trecho.replace(/-/g, '+').replace(/_/g, '/')
  const sobra = base64.length % 4
  const completo = sobra === 0 ? base64 : base64 + '='.repeat(4 - sobra)

  try {
    return atob(completo)
  } catch {
    return null
  }
}
