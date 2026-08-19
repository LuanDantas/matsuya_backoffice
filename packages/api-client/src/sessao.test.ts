import { describe, expect, it } from 'vitest'
import { criarApiDeSessao } from './sessao'
import { FalhaDaApi, FalhaDeRede } from './cliente'

/**
 * O transporte da superfície legada.
 *
 * Testado com `fetch` de mentira porque o que importa aqui não é o servidor: é
 * **o que sai daqui** — método, cabeçalhos e corpo — e o que este módulo faz
 * com o que volta. Um erro de método ou um `Authorization` vazando para uma
 * rota pública são exatamente os defeitos que nenhuma tela revela.
 */

interface Chamada {
  url: string
  init: RequestInit
}

function espiao(resposta: () => Response | Promise<Response>) {
  const chamadas: Chamada[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init })
    return resposta()
  }) as unknown as typeof fetch

  return { chamadas, fetchImpl }
}

const respostaVazia = (status: number) =>
  new Response(null, { status, statusText: 'sem corpo' })

const respostaJson = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const cabecalhos = (chamada: Chamada) =>
  chamada.init.headers as Record<string, string>

describe('alterarSenha', () => {
  it('faz um PUT autenticado na origem, fora do /api/v1', async () => {
    const { chamadas, fetchImpl } = espiao(() => respostaVazia(204))
    const api = criarApiDeSessao({ origem: 'https://api.exemplo.com/', fetchImpl })

    await api.alterarSenha('tok-123', 'antiga', 'nova-senha')

    expect(chamadas).toHaveLength(1)
    // A barra final da origem não pode virar `//users` — o Express trata as
    // duas como rotas diferentes e a segunda responde 404.
    expect(chamadas[0]!.url).toBe('https://api.exemplo.com/users/current/password')
    expect(chamadas[0]!.init.method).toBe('PUT')
    expect(cabecalhos(chamadas[0]!).Authorization).toBe('Bearer tok-123')
    expect(JSON.parse(chamadas[0]!.init.body as string)).toEqual({
      currentPassword: 'antiga',
      newPassword: 'nova-senha',
    })
  })

  it('resolve no 204, que não tem corpo nenhum para ler', async () => {
    const { fetchImpl } = espiao(() => respostaVazia(204))
    const api = criarApiDeSessao({ origem: 'https://api.exemplo.com', fetchImpl })

    await expect(api.alterarSenha('tok', 'a', 'b')).resolves.toBeUndefined()
  })

  it('preserva a mensagem do servidor no 400', async () => {
    // "Senha incorreta" é a única mensagem que aquele controlador emite de
    // propósito. Trocá-la por um texto genérico apagaria justamente a
    // informação que a pessoa precisa ler.
    const { fetchImpl } = espiao(() => respostaJson(400, { message: 'Senha incorreta' }))
    const api = criarApiDeSessao({ origem: 'https://api.exemplo.com', fetchImpl })

    await expect(api.alterarSenha('tok', 'errada', 'nova')).rejects.toMatchObject({
      status: 400,
      message: 'Senha incorreta',
    })
    await expect(api.alterarSenha('tok', 'errada', 'nova')).rejects.toBeInstanceOf(
      FalhaDaApi
    )
  })

  it('distingue rede fora de resposta de erro', async () => {
    const { fetchImpl } = espiao(() => {
      throw new TypeError('Failed to fetch')
    })
    const api = criarApiDeSessao({ origem: 'https://api.exemplo.com', fetchImpl })

    await expect(api.alterarSenha('tok', 'a', 'b')).rejects.toBeInstanceOf(FalhaDeRede)
  })

  it('não engole um 401 como se fosse senha errada', async () => {
    // Sessão vencida e senha incorreta são problemas diferentes e pedem telas
    // diferentes. Quem chama precisa do status para escolher.
    const { fetchImpl } = espiao(() =>
      respostaJson(401, { message: 'Não autorizado: token inválido' })
    )
    const api = criarApiDeSessao({ origem: 'https://api.exemplo.com', fetchImpl })

    await expect(api.alterarSenha('tok', 'a', 'b')).rejects.toMatchObject({ status: 401 })
  })
})

describe('regressão das rotas públicas', () => {
  it('entrar continua POST e sem cabeçalho de autorização', async () => {
    /*
     * A função de envio passou a aceitar método e token para servir à troca de
     * senha. Se o padrão escorregar, `/auth/login` passa a mandar `Authorization`
     * — um cabeçalho com token em rota pública, que é o tipo de vazamento que
     * nenhuma tela mostra.
     */
    const { chamadas, fetchImpl } = espiao(() =>
      respostaJson(200, { token: 't', id: 1, firstName: 'A', lastName: 'B', email: 'a@b.c', role: 'user' })
    )
    const api = criarApiDeSessao({ origem: 'https://api.exemplo.com', fetchImpl })

    await api.entrar('a@b.c', 'segredo')

    expect(chamadas[0]!.init.method).toBe('POST')
    expect(cabecalhos(chamadas[0]!).Authorization).toBeUndefined()
  })

  it('pedirCodigo continua POST e anônimo', async () => {
    const { chamadas, fetchImpl } = espiao(() => respostaJson(200, { message: 'ok' }))
    const api = criarApiDeSessao({ origem: 'https://api.exemplo.com', fetchImpl })

    await api.pedirCodigo('a@b.c')

    expect(chamadas[0]!.url).toBe('https://api.exemplo.com/auth/forgot-password')
    expect(chamadas[0]!.init.method).toBe('POST')
    expect(cabecalhos(chamadas[0]!).Authorization).toBeUndefined()
  })
})
