/**
 * Transporte tipado sobre `/api/v1`.
 *
 * Sem React de propósito: quem chama isto é o `queries`, o `realtime` e, em
 * alguns casos, um worker. Um cliente HTTP que só funciona dentro de um
 * componente não serve para reenviar uma fila offline.
 */

export interface ErroDaApi {
  code: string
  message: string
  details?: unknown
  requestId?: string
}

/**
 * Erro normalizado.
 *
 * O `code` é o que o front usa para decidir — `ORDER_STATUS_CONFLICT` reconcilia
 * a tela, `FORBIDDEN_SCOPE` sugere trocar de unidade, `FORBIDDEN_PERMISSION`
 * some com o botão. A `message` é para o humano ler; ramificar sobre texto de
 * mensagem é como um sistema quebra quando alguém corrige uma vírgula.
 */
export class FalhaDaApi extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  readonly requestId?: string

  constructor(status: number, erro: ErroDaApi) {
    super(erro.message)
    this.name = 'FalhaDaApi'
    this.status = status
    this.code = erro.code
    this.details = erro.details
    this.requestId = erro.requestId
  }
}

/** Rede fora, DNS, CORS: nada chegou ao servidor. Não é 4xx nem 5xx. */
export class FalhaDeRede extends Error {
  constructor(readonly causa: unknown) {
    super('Não foi possível falar com o servidor.')
    this.name = 'FalhaDeRede'
  }
}

export interface OpcoesDoCliente {
  baseUrl: string
  obterToken: () => string | null
  /** Chamado em 401 — quem decide o que fazer é a camada de sessão. */
  aoNaoAutorizar?: () => void
  fetchImpl?: typeof fetch
}

export interface OpcoesDaRequisicao {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  corpo?: unknown
  query?: Record<string, string | number | undefined>
  /** Vira `If-Match`: a versão sobre a qual o cliente acredita estar agindo. */
  versaoEsperada?: number
  /** Vira `Idempotency-Key`. Obrigatório nas rotas que a API exige. */
  chaveDeIdempotencia?: string
  signal?: AbortSignal
}

interface EnvelopeDeSucesso<T> {
  data: T
  meta?: { requestId?: string; page?: { limit: number; cursor: string | null } }
}

export interface ApiClient {
  requisitar: <T>(caminho: string, opcoes?: OpcoesDaRequisicao) => Promise<T>
}

function montarUrl(
  baseUrl: string,
  caminho: string,
  query?: Record<string, string | number | undefined>
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${caminho}`)
  for (const [chave, valor] of Object.entries(query ?? {})) {
    if (valor !== undefined) url.searchParams.set(chave, String(valor))
  }
  return url.toString()
}

export function createApiClient(opcoes: OpcoesDoCliente): ApiClient {
  const executar = opcoes.fetchImpl ?? globalThis.fetch

  async function requisitar<T>(
    caminho: string,
    req: OpcoesDaRequisicao = {}
  ): Promise<T> {
    const cabecalhos: Record<string, string> = { Accept: 'application/json' }

    const token = opcoes.obterToken()
    if (token) cabecalhos.Authorization = `Bearer ${token}`
    if (req.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json'
    if (req.versaoEsperada !== undefined) {
      cabecalhos['If-Match'] = String(req.versaoEsperada)
    }
    if (req.chaveDeIdempotencia) {
      cabecalhos['Idempotency-Key'] = req.chaveDeIdempotencia
    }

    let resposta: Response
    try {
      resposta = await executar(montarUrl(opcoes.baseUrl, caminho, req.query), {
        method: req.metodo ?? 'GET',
        headers: cabecalhos,
        body: req.corpo === undefined ? undefined : JSON.stringify(req.corpo),
        signal: req.signal,
      })
    } catch (causa) {
      // `AbortError` é intenção, não falha: quem abortou sabe por quê.
      if (causa instanceof DOMException && causa.name === 'AbortError') throw causa
      throw new FalhaDeRede(causa)
    }

    if (resposta.status === 204) return undefined as T

    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      corpo = null
    }

    if (!resposta.ok) {
      if (resposta.status === 401) opcoes.aoNaoAutorizar?.()

      const erro = (corpo as { error?: ErroDaApi } | null)?.error
      throw new FalhaDaApi(
        resposta.status,
        erro ?? {
          code: `HTTP_${resposta.status}`,
          // Sem envelope: ou é uma rota legada, ou um proxy respondendo no
          // lugar da aplicação. Nos dois casos, dizer "erro inesperado" é mais
          // honesto do que inventar um código.
          message: 'Erro inesperado do servidor.',
        }
      )
    }

    return (corpo as EnvelopeDeSucesso<T>).data
  }

  return { requisitar }
}
