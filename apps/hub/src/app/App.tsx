import { useCallback, useMemo, useState } from 'react'
import { createApiClient, criarApiDePedidos, FalhaDaApi } from '@matsuya/api-client'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import type { OrderAction } from '@matsuya/contracts'
import { useQuadro } from '../dados/useQuadro'
import { Quadro } from '../modules/quadro/Quadro'
import { config } from './config'

/**
 * Casca do Order Hub.
 *
 * Sessão e seleção de unidade estão provisórias — o módulo `identity` da API
 * ainda não expõe `/auth/me`, então token e unidade vêm de campo e ficam no
 * `localStorage`. É deliberadamente feio para não ser confundido com pronto.
 */

const CHAVE_TOKEN = 'matsuya.hub.token'
const CHAVE_UNIDADE = 'matsuya.hub.unidade'

const ROTULO_DA_CONEXAO: Record<string, string> = {
  conectando: 'Conectando…',
  'ao-vivo': 'Ao vivo',
  degradado: 'Modo degradado — atualizando a cada 10 s',
  desconectado: 'Sem conexão',
}

export function App() {
  const [token, definirToken] = useState(() => localStorage.getItem(CHAVE_TOKEN) ?? '')
  const [unidade, definirUnidade] = useState(
    () => Number(localStorage.getItem(CHAVE_UNIDADE)) || 1
  )
  const [entrou, definirEntrou] = useState(() => Boolean(localStorage.getItem(CHAVE_TOKEN)))
  const [emCurso, definirEmCurso] = useState<ReadonlySet<number>>(new Set())
  const [aviso, definirAviso] = useState<string | null>(null)

  const quadro = useQuadro(unidade, entrou ? token : null)

  const api = useMemo(() => {
    const cliente = createApiClient({
      baseUrl: config.apiBaseUrl,
      obterToken: () => token,
    })
    return criarApiDePedidos(cliente)
  }, [token])

  /**
   * Permissões provisoriamente amplas.
   *
   * Enquanto `/auth/me` não existir, o front não sabe o que este usuário pode.
   * Assumir tudo é a escolha certa aqui: **a API é quem decide**, e ela já
   * recusa com 403. O oposto — esconder botões por precaução — deixaria um
   * operador legítimo sem conseguir aceitar pedido, e isso é pior.
   */
  const permissoes = useMemo(
    () =>
      new Set([
        'orders:read',
        'orders:accept',
        'orders:reject',
        'orders:ready',
        'orders:dispatch',
        'orders:cancel',
        'orders:delivery:fail',
      ]),
    []
  )

  const agir = useCallback(
    async (params: {
      pedido: PedidoDoQuadro
      acao: OrderAction
      reasonCode?: string
      reasonNote?: string
    }) => {
      definirEmCurso((atual) => new Set(atual).add(params.pedido.id))
      definirAviso(null)

      try {
        await api.transicionar({
          orderId: params.pedido.id,
          acao: params.acao,
          reasonCode: params.reasonCode,
          reasonNote: params.reasonNote,
          // A versão que estava na tela quando o operador clicou. Se outra
          // tablete mexeu no meio, a API devolve 409 em vez de sobrescrever.
          versaoEsperada: params.pedido.version,
        })
        // O quadro não é atualizado aqui: a mudança volta pelo socket, com o
        // `seq` que mantém o cursor coerente. Escrever nos dois caminhos faria
        // o mesmo evento ser aplicado duas vezes.
      } catch (falha) {
        if (falha instanceof FalhaDaApi && falha.code === 'ORDER_STATUS_CONFLICT') {
          definirAviso('Este pedido mudou em outro dispositivo. Atualizando…')
          quadro.recarregar()
        } else if (falha instanceof FalhaDaApi) {
          definirAviso(falha.message)
        } else {
          definirAviso('Não foi possível concluir. Verifique a conexão.')
        }
      } finally {
        definirEmCurso((atual) => {
          const proximo = new Set(atual)
          proximo.delete(params.pedido.id)
          return proximo
        })
      }
    },
    [api, quadro]
  )

  if (!entrou) {
    return (
      <main className="entrada">
        <h1>Order Hub</h1>
        <p className="entrada__nota">
          Acesso provisório: o fluxo de login definitivo depende do módulo de
          identidade da API.
        </p>
        <label>
          Unidade
          <input
            type="number"
            value={unidade}
            min={1}
            onChange={(e) => definirUnidade(Number(e.target.value))}
          />
        </label>
        <label>
          Token
          <input
            type="password"
            value={token}
            onChange={(e) => definirToken(e.target.value)}
            placeholder="JWT"
          />
        </label>
        <button
          type="button"
          className="botao botao--primaria"
          disabled={!token}
          onClick={() => {
            localStorage.setItem(CHAVE_TOKEN, token)
            localStorage.setItem(CHAVE_UNIDADE, String(unidade))
            definirEntrou(true)
          }}
        >
          Abrir o quadro
        </button>
      </main>
    )
  }

  return (
    <div className="app">
      <header className="barra">
        <h1>Order Hub · unidade {unidade}</h1>
        <div className="barra__estado">
          <span className={`selo selo--${quadro.conexao}`}>
            {ROTULO_DA_CONEXAO[quadro.conexao] ?? quadro.conexao}
          </span>
          <span className="barra__cursor">cursor {quadro.cursor}</span>
          <button
            type="button"
            className="botao botao--secundaria"
            onClick={() => {
              localStorage.removeItem(CHAVE_TOKEN)
              definirEntrou(false)
            }}
          >
            Sair
          </button>
        </div>
      </header>

      {quadro.sincronia === 'recuperando' && (
        <p className="faixa faixa--atencao">Recuperando eventos perdidos…</p>
      )}
      {aviso && <p className="faixa faixa--atencao">{aviso}</p>}
      {quadro.erro && <p className="faixa faixa--erro">{quadro.erro}</p>}

      {quadro.carregando ? (
        <p className="faixa">Carregando o quadro…</p>
      ) : (
        <Quadro
          pedidos={quadro.pedidos}
          permissoes={permissoes}
          agoraDoServidor={quadro.agoraDoServidor}
          aoAgir={agir}
          emCurso={emCurso}
        />
      )}
    </div>
  )
}
