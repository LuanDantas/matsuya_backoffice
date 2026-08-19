import { FalhaDaApi, FalhaDeRede } from './cliente'

/**
 * Entrar, recuperar a senha e trocá-la já estando dentro.
 *
 * ## Por que este módulo não usa o `ApiClient`
 *
 * Três incompatibilidades, todas verificadas contra a API:
 *
 * 1. **As rotas vivem na raiz, não em `/api/v1`.** `POST /auth/login` está no
 *    roteador legado, montado sem prefixo. A `baseUrl` do cliente aponta para
 *    `/api/v1` e não serve aqui.
 * 2. **A resposta é plana.** O legado devolve `{ token, id, email, … }`, e o
 *    `ApiClient` termina com `return corpo.data` — o que daria `undefined`.
 * 3. **O 401 tem outro significado.** O cliente dispara `aoNaoAutorizar` em
 *    todo 401, que é o gancho do logout global. Mas **senha errada também é
 *    401** — passar o login por ali faria uma digitação errada disparar "sua
 *    sessão expirou" e limpar a sessão de quem nem entrou ainda.
 *
 * O terceiro é o que torna a separação obrigatória, e não apenas conveniente.
 *
 * ## O erro legado
 *
 * O legado responde `{ message }` e não `{ error: { code, message } }`. Sem
 * tradução, o `ApiClient` trocaria "Senha incorreta" por "Erro inesperado do
 * servidor" — a mensagem que o usuário mais precisa ler seria a única perdida.
 * Aqui ela é preservada dentro de `FalhaDaApi`, com o status.
 */

/** O que o login devolve. Campos além destes existem e são ignorados. */
export interface Autenticado {
  token: string
  id: number
  firstName: string
  lastName: string
  email: string
  role: string
}

export interface OpcoesDaApiDeSessao {
  /**
   * Origem da API — `http://localhost:3001`, e **não** a base `/api/v1`.
   * No Hub isso é `config.socketUrl`, que já aponta para a origem.
   */
  origem: string
  fetchImpl?: typeof fetch
}

interface Extras {
  metodo?: 'POST' | 'PUT'
  /** Token de sessão. Sem ele, nenhum cabeçalho de autorização é enviado. */
  token?: string
}

async function enviar<T>(
  opcoes: OpcoesDaApiDeSessao,
  caminho: string,
  corpo: unknown,
  extras?: Extras
): Promise<T> {
  const executar = opcoes.fetchImpl ?? globalThis.fetch

  const cabecalhos: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (extras?.token) cabecalhos.Authorization = `Bearer ${extras.token}`

  let resposta: Response

  try {
    resposta = await executar(`${opcoes.origem.replace(/\/$/, '')}${caminho}`, {
      // O padrão é `POST` para que as quatro rotas que já usavam esta função
      // continuem idênticas ao que eram.
      method: extras?.metodo ?? 'POST',
      headers: cabecalhos,
      body: JSON.stringify(corpo),
    })
  } catch (causa) {
    throw new FalhaDeRede(causa)
  }

  // `204 No Content` **antes** de tentar ler o corpo. Sem isto o `json()` lança
  // e o `catch` abaixo devolve `null` — funciona por acidente, e um acidente
  // some quando alguém mexe no tratamento de erro.
  if (resposta.status === 204) return undefined as T

  let lido: unknown = null
  try {
    lido = await resposta.json()
  } catch {
    lido = null
  }

  if (!resposta.ok) {
    const mensagem = (lido as { message?: string } | null)?.message

    throw new FalhaDaApi(resposta.status, {
      code: `HTTP_${resposta.status}`,
      message: mensagem ?? 'Não conseguimos falar com o servidor.',
    })
  }

  return lido as T
}

export function criarApiDeSessao(opcoes: OpcoesDaApiDeSessao) {
  return {
    entrar: (email: string, senha: string) =>
      enviar<Autenticado>(opcoes, '/auth/login', { email, password: senha }),

    /**
     * Pede o código de recuperação.
     *
     * A API responde 200 **mesmo para e-mail inexistente**, de propósito: não
     * vazar quais e-mails estão cadastrados. A tela precisa honrar isso e dizer
     * "se o e-mail existir, enviamos" — prometer que enviou seria desmentir o
     * cuidado que o servidor tomou.
     */
    pedirCodigo: (email: string) =>
      enviar<{ message: string }>(opcoes, '/auth/forgot-password', { email }),

    /** Troca o código de 6 dígitos por um token de 15 minutos. */
    conferirCodigo: (email: string, codigo: string) =>
      enviar<{ token: string }>(opcoes, '/auth/verify-reset-code', {
        email,
        code: codigo,
      }),

    /** O token aqui é o de `conferirCodigo`, não o de sessão. */
    trocarSenha: (token: string, novaSenha: string) =>
      enviar<{ message: string }>(opcoes, '/auth/reset-password', {
        token,
        newPassword: novaSenha,
      }),

    /**
     * Troca a senha de quem já está dentro.
     *
     * `PUT /users/current/password` → `204` sem corpo. A senha atual é conferida
     * no servidor; quando não bate, vem `400 { message: 'Senha incorreta' }` — a
     * única mensagem que aquele controlador emite de propósito, e por isso a
     * única sobre a qual vale ramificar.
     *
     * Mora aqui, e não no `ApiClient`, pelos três motivos do cabeçalho deste
     * arquivo: a rota está na raiz e não em `/api/v1`, a resposta não vem
     * envelopada em `{ data, meta }`, e o erro é `{ message }` cru. O transporte
     * novo quebraria na desserialização do envelope antes de chegar ao erro.
     *
     * O `401` aqui é sessão morta de verdade — quem chama decide o que fazer,
     * porque este módulo não conhece o gancho global de expiração.
     */
    alterarSenha: (token: string, atual: string, nova: string) =>
      enviar<void>(
        opcoes,
        '/users/current/password',
        { currentPassword: atual, newPassword: nova },
        { metodo: 'PUT', token }
      ),
  }
}

export type ApiDeSessao = ReturnType<typeof criarApiDeSessao>
