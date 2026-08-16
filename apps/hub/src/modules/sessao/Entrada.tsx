import { useState } from 'react'
import { Botao, Faixa, Icone } from '@matsuya/ui'

/**
 * Entrada no Hub.
 *
 * Provisória por natureza — a API ainda não tem fluxo de login próprio —, e o
 * texto na tela diz isso. Uma tela provisória que se disfarça de definitiva é
 * como uma gambiarra sobrevive por dois anos.
 */
export function Entrada({
  aoEntrar,
  erro,
}: {
  aoEntrar: (token: string) => void
  erro: string | null
}) {
  const [token, definirToken] = useState('')

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (token.trim()) aoEntrar(token.trim())
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
      </form>
    </main>
  )
}
