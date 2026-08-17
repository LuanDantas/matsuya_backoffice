import { useState } from 'react'
import { Botao, Faixa, Icone } from '@matsuya/ui'
import { config } from '../../app/config'

/**
 * Entrada no Hub.
 *
 * Provisória por natureza — a API ainda não tem fluxo de login próprio —, e o
 * texto na tela diz isso. Uma tela provisória que se disfarça de definitiva é
 * como uma gambiarra sobrevive por dois anos.
 */

/**
 * Credenciais do seed local, para o atalho de desenvolvimento.
 *
 * Ficam aqui sem cerimônia porque é o que são: o usuário semeado no banco de
 * desenvolvimento, com senha que está no seeder versionado. Não há segredo a
 * proteger — o que precisa de proteção é isto **não existir em produção**, e
 * quem garante isso é o `import.meta.env.DEV` abaixo, não o sigilo da senha.
 */
const ATALHO_DE_DEV = {
  email: 'admin@matsuya.com.br',
  senha: 'admin123',
}

export function Entrada({
  aoEntrar,
  erro,
}: {
  aoEntrar: (token: string) => void
  erro: string | null
}) {
  const [token, definirToken] = useState('')
  const [entrandoDireto, definirEntrandoDireto] = useState(false)
  const [erroDoAtalho, definirErroDoAtalho] = useState<string | null>(null)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (token.trim()) aoEntrar(token.trim())
  }

  /**
   * Busca um token com as credenciais do seed e entra.
   *
   * Bate em `/auth/login`, que mora na raiz e não sob `/api/v1` — é rota do
   * roteador antigo, congelado. Daí a URL sair de `socketUrl`, que é a origem
   * da API, em vez de `apiBaseUrl`.
   */
  async function entrarComoAdmin() {
    definirEntrandoDireto(true)
    definirErroDoAtalho(null)

    try {
      const resposta = await fetch(`${config.socketUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ATALHO_DE_DEV.email,
          password: ATALHO_DE_DEV.senha,
        }),
      })

      const corpo = (await resposta.json().catch(() => null)) as
        | { token?: string; message?: string }
        | null

      if (!resposta.ok || !corpo?.token) {
        definirErroDoAtalho(
          corpo?.message ?? 'A API respondeu, mas sem token. O seed já rodou?'
        )
        return
      }

      aoEntrar(corpo.token)
    } catch {
      definirErroDoAtalho(`Sem resposta da API em ${config.socketUrl}. Ela está de pé?`)
    } finally {
      definirEntrandoDireto(false)
    }
  }

  return (
    <main className="entrada">
      <form className="entrada__cartao" onSubmit={enviar}>
        <div className="entrada__marca">
          <Icone nome="loja" tamanho={26} />
          <div>
            <h1>Order Hub</h1>
            <p>Matsuya</p>
          </div>
        </div>

        {erro && (
          <Faixa tom="perigo" icone="alerta">
            {erro}
          </Faixa>
        )}

        <div className="ui-campo">
          <label className="ui-campo__rotulo" htmlFor="token">
            Token de acesso
          </label>
          <input
            id="token"
            className="entrada__campo"
            type="password"
            value={token}
            onChange={(e) => definirToken(e.target.value)}
            placeholder="Cole o JWT"
            autoComplete="off"
            // O teclado de senha evita corretor automático estragando um JWT.
            aria-describedby="token-ajuda"
          />
          <p id="token-ajuda" className="ui-campo__ajuda">
            Acesso provisório enquanto o login definitivo não existe na API.
          </p>
        </div>

        <Botao type="submit" enfase="primaria" largo disabled={!token.trim()}>
          Entrar
        </Botao>

        {/*
          Atalho de desenvolvimento.

          `import.meta.env.DEV` é substituído por `false` no build de produção,
          e o bloco inteiro — incluindo as credenciais — sai do bundle na
          eliminação de código morto. É a razão de a checagem estar aqui, em
          volta do JSX, e não dentro do `onClick`: uma condição em tempo de
          execução deixaria a senha no arquivo publicado.
        */}
        {import.meta.env.DEV && (
          <div className="entrada__atalho">
            {erroDoAtalho && (
              <Faixa tom="perigo" icone="alerta">
                {erroDoAtalho}
              </Faixa>
            )}

            <Botao
              type="button"
              enfase="secundaria"
              largo
              icone="pessoa"
              carregando={entrandoDireto}
              onClick={() => void entrarComoAdmin()}
            >
              Entrar como admin
            </Botao>

            <p className="entrada__aviso">
              Atalho de desenvolvimento — some no build de produção.
            </p>
          </div>
        )}
      </form>
    </main>
  )
}
