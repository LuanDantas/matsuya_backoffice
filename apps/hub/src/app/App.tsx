import { useCallback, useEffect, useMemo, useState } from 'react'
import { Botao, Faixa, Icone, Selo } from '@matsuya/ui'
import {
  createApiClient,
  criarApiDePedidos,
  FalhaDaApi,
  type PedidoDoQuadro,
} from '@matsuya/api-client'
import { ORDER_ACTION_INFO, type OrderAction } from '@matsuya/contracts'
import { FalhaDeRede } from '@matsuya/api-client'
import { useSessao } from '../dados/useSessao'
import { useQuadro } from '../dados/useQuadro'
import { Quadros } from '../modules/quadro/Quadros'
import { Expedicao } from '../modules/quadro/Expedicao'
import { Ferramentas, normalizar, type ModoDoQuadro } from '../modules/quadro/Ferramentas'
import { ConfirmacaoDeAcao } from '../modules/quadro/ConfirmacaoDeAcao'
import { DetalheDoPedido } from '../modules/quadro/DetalheDoPedido'
import { Excecoes, apurarExcecoes } from '../modules/excecoes/Excecoes'
import { useAlertas } from '../som/useAlertas'
import { useFilaOffline } from '../offline/useFilaOffline'
import { Reconciliacao } from '../offline/Reconciliacao'
import { useImpressao } from '../impressao/useImpressao'
import { Entrada } from '../modules/sessao/Entrada'
import { EscolhaDeUnidade } from '../modules/sessao/EscolhaDeUnidade'
import { config } from './config'

/**
 * Casca do Order Hub.
 *
 * Três estados de tela, nesta ordem: sem sessão → sem unidade escolhida →
 * quadro. Cada um resolve uma pergunta só, o que mantém a entrada rápida num
 * tablet que é ligado uma vez por turno.
 */

const CHAVE_MODO = 'matsuya.hub.modo'

const ROTULO_DA_CONEXAO: Record<string, string> = {
  conectando: 'Conectando',
  'ao-vivo': 'Ao vivo',
  degradado: 'Modo degradado',
  desconectado: 'Sem conexão',
}

const TOM_DA_CONEXAO: Record<string, 'sucesso' | 'atencao' | 'perigo' | 'neutro'> = {
  conectando: 'neutro',
  'ao-vivo': 'sucesso',
  degradado: 'atencao',
  desconectado: 'perigo',
}

/** Redesenha uma vez por segundo, só para os cronômetros andarem. */
function useTique() {
  const [, redesenhar] = useState(0)
  useEffect(() => {
    const t = setInterval(() => redesenhar((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
}

export function App() {
  const sessao = useSessao()
  useTique()

  if (sessao.estado === 'verificando') {
    return (
      <main className="carregando">
        <span className="carregando__giro" aria-hidden="true" />
        <p role="status">Verificando seu acesso…</p>
      </main>
    )
  }

  if (sessao.estado === 'anonima' || !sessao.identidade) {
    return <Entrada aoEntrar={sessao.entrar} erro={sessao.erro} />
  }

  if (sessao.estado === 'falha') {
    return (
      <main className="carregando">
        <Faixa tom="perigo" icone="alerta">
          {sessao.erro ?? 'Não foi possível carregar seu acesso.'}
        </Faixa>
        <Botao enfase="secundaria" icone="atualizar" onClick={() => window.location.reload()}>
          Tentar de novo
        </Botao>
      </main>
    )
  }

  if (sessao.unidadeAtual === null) {
    return (
      <EscolhaDeUnidade
        identidade={sessao.identidade}
        aoEscolher={sessao.escolherUnidade}
        aoSair={sessao.sair}
      />
    )
  }

  return (
    <QuadroDaLoja
      key={sessao.unidadeAtual}
      unidadeId={sessao.unidadeAtual}
      sessao={sessao}
    />
  )
}

/**
 * A tela de trabalho.
 *
 * Componente separado, e montado com `key={unidade}`, de propósito: trocar de
 * loja precisa derrubar socket, cursor e cache de uma vez. Reaproveitar o
 * estado entre unidades é como um pedido da Mooca aparece no quadro da Santana.
 */
function QuadroDaLoja({
  unidadeId,
  sessao,
}: {
  unidadeId: number
  sessao: ReturnType<typeof useSessao>
}) {
  const quadro = useQuadro(unidadeId, sessao.token)
  const [emCurso, definirEmCurso] = useState<ReadonlySet<number>>(new Set())
  const [aviso, definirAviso] = useState<{ texto: string; tom: 'atencao' | 'perigo' } | null>(null)
  const [detalhe, definirDetalhe] = useState<number | null>(null)
  const [confirmacao, definirConfirmacao] = useState<{
    pedido: PedidoDoQuadro
    acao: OrderAction
  } | null>(null)
  const [busca, definirBusca] = useState('')
  const [modo, definirModo] = useState<ModoDoQuadro>(
    () => (localStorage.getItem(CHAVE_MODO) as ModoDoQuadro | null) ?? 'quadros'
  )

  useEffect(() => {
    localStorage.setItem(CHAVE_MODO, modo)
  }, [modo])

  const api = useMemo(() => {
    const cliente = createApiClient({
      baseUrl: config.apiBaseUrl,
      obterToken: () => sessao.token,
    })
    return criarApiDePedidos(cliente)
  }, [sessao.token])

  const unidade = sessao.identidade?.units.find((u) => u.id === unidadeId)
  const podeTrocar = (sessao.identidade?.units.length ?? 0) > 1

  const agora = quadro.agoraDoServidor()

  const som = useAlertas(quadro.pedidos, true)
  const impressao = useImpressao(unidade?.name ?? `Unidade ${unidadeId}`)
  const fila = useFilaOffline(unidadeId, api, quadro.recarregar)

  /**
   * A busca filtra o que o quadro mostra, e nada mais.
   *
   * As exceções continuam calculadas sobre a lista **inteira**: esconder um
   * pedido atrasado porque ele não casa com o texto digitado seria esconder
   * exatamente o que a faixa existe para não deixar passar.
   */
  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    if (!termo) return quadro.pedidos
    return quadro.pedidos.filter(
      (p) =>
        normalizar(p.code ?? String(p.id)).includes(termo) ||
        normalizar(p.customerLabel ?? '').includes(termo)
    )
  }, [busca, quadro.pedidos])

  const excecoes = useMemo(
    () => apurarExcecoes(quadro.pedidos, agora),
    [quadro.pedidos, agora]
  )

  const pedidoAberto = useMemo(
    () => quadro.pedidos.find((p) => p.id === detalhe) ?? null,
    [quadro.pedidos, detalhe]
  )

  const agir = useCallback(
    async ({
      pedido,
      acao,
      reasonCode,
      reasonNote,
    }: {
      pedido: PedidoDoQuadro
      acao: OrderAction
      reasonCode?: string
      reasonNote?: string
    }) => {
      definirEmCurso((atual) => new Set(atual).add(pedido.id))
      definirAviso(null)

      try {
        await api.transicionar({
          orderId: pedido.id,
          acao,
          reasonCode,
          reasonNote,
          // A versão que estava na tela quando o operador clicou. Se outra
          // tablete mexeu no meio, a API devolve 409 em vez de sobrescrever.
          versaoEsperada: pedido.version,
        })
        // O quadro não é atualizado aqui: a mudança volta pelo socket com o
        // `seq` que mantém o cursor coerente. Escrever nos dois caminhos faria
        // o mesmo evento ser aplicado duas vezes.
      } catch (falha) {
        if (falha instanceof FalhaDaApi && falha.code === 'ORDER_STATUS_CONFLICT') {
          definirAviso({
            texto: 'Este pedido mudou em outro dispositivo. Atualizando o quadro.',
            tom: 'atencao',
          })
          quadro.recarregar()
        } else if (falha instanceof FalhaDaApi && falha.code === 'FORBIDDEN_PERMISSION') {
          definirAviso({
            texto: 'Seu acesso não permite esta ação. Chame o responsável da loja.',
            tom: 'perigo',
          })
        } else if (falha instanceof FalhaDeRede && fila.disponivel) {
          // Sem rede: a ação vai para a fila e sai quando a conexão voltar.
          // Perder o aceite porque o Wi-Fi caiu seria o pior desfecho — o
          // operador fez o trabalho e o cliente continua esperando.
          await fila.enfileirar({
            unityId: unidadeId,
            orderId: pedido.id,
            codigoDoPedido: pedido.code,
            acao,
            statusAlvo: ORDER_ACTION_INFO[acao].para,
            reasonCode,
            reasonNote,
            versaoEsperada: pedido.version,
          })
          definirAviso({
            texto: 'Sem conexão. A ação foi guardada e será enviada quando a rede voltar.',
            tom: 'atencao',
          })
        } else if (falha instanceof FalhaDaApi) {
          som.tocarErro()
          definirAviso({ texto: falha.message, tom: 'perigo' })
        } else {
          som.tocarErro()
          definirAviso({
            texto: 'Não foi possível concluir. Verifique a conexão e tente de novo.',
            tom: 'perigo',
          })
        }
      } finally {
        definirEmCurso((atual) => {
          const proximo = new Set(atual)
          proximo.delete(pedido.id)
          return proximo
        })
      }
    },
    [api, quadro, fila, som, unidadeId]
  )

  /**
   * Ponto único onde se decide entre executar e confirmar.
   *
   * A regra vive no contrato (`confirmar` e `motivo` de cada ação), não
   * espalhada pelas telas: o quadro e o detalhe oferecem as mesmas ações, e
   * duplicar a decisão faria uma das duas esquecer de pedir o motivo — enviando
   * dados que a API recusa.
   */
  const pedirAcao = useCallback(
    (pedido: PedidoDoQuadro, acao: OrderAction) => {
      const info = ORDER_ACTION_INFO[acao]
      if (info.motivo || info.confirmar) {
        definirConfirmacao({ pedido, acao })
        return
      }
      void agir({ pedido, acao })
    },
    [agir]
  )

  const abrirDetalhe = useCallback((pedido: PedidoDoQuadro) => definirDetalhe(pedido.id), [])

  /**
   * Comanda sai no aceite.
   *
   * Antes disso o pedido ainda pode ser recusado — e comanda de pedido recusado
   * é papel jogado fora com a cozinha começando o que não devia. Depois disso é
   * atraso puro. O próprio hook garante uma via por pedido.
   */
  useEffect(() => {
    for (const pedido of quadro.pedidos) {
      if (pedido.status === 'confirmed') impressao.imprimirNoAceite(pedido)
    }
  }, [quadro.pedidos, impressao])

  // Socket de volta ⇒ tenta esvaziar o que ficou preso na fila offline.
  useEffect(() => {
    if (quadro.conexao === 'ao-vivo') void fila.reenviar()
  }, [quadro.conexao, fila])

  return (
    <div className="app">
      <header className="barra">
        <div className="barra__identidade">
          <Icone nome="loja" tamanho={20} />
          <div>
            <h1>{unidade?.name ?? `Unidade ${unidadeId}`}</h1>
            <p className="barra__usuario">{sessao.identidade?.user.name}</p>
          </div>
        </div>

        <div className="barra__estado">
          <Selo
            tom={TOM_DA_CONEXAO[quadro.conexao] ?? 'neutro'}
            icone={quadro.conexao === 'ao-vivo' ? 'wifi' : 'wifi-cortado'}
          >
            {ROTULO_DA_CONEXAO[quadro.conexao] ?? quadro.conexao}
          </Selo>

          <span className="barra__cursor num" title="Cursor do diário da loja">
            #{quadro.cursor}
          </span>

          {som.estado !== 'pronto' && (
            <Botao
              enfase={som.estado === 'mudo' ? 'fantasma' : 'secundaria'}
              onClick={() => void (som.estado === 'mudo' ? som.religar() : som.destravar())}
            >
              {som.estado === 'mudo' ? 'Som desligado' : 'Ligar o som'}
            </Botao>
          )}

          {som.estado === 'pronto' && (
            <Botao enfase="fantasma" onClick={som.silenciar}>
              <span className="ui-visualmente-oculto">Desligar o som</span>
              Som
            </Botao>
          )}

          {podeTrocar && (
            <Botao enfase="fantasma" onClick={() => sessao.escolherUnidade(null)}>
              Trocar de loja
            </Botao>
          )}

          <Botao enfase="fantasma" icone="sair" onClick={sessao.sair}>
            <span className="ui-visualmente-oculto">Sair</span>
          </Botao>
        </div>
      </header>

      {quadro.conexao === 'degradado' && (
        <Faixa tom="atencao" icone="wifi-cortado">
          Sem tempo real. O quadro está sendo atualizado a cada 10 segundos — as
          ações continuam funcionando.
        </Faixa>
      )}

      <Ferramentas
        modo={modo}
        aoTrocarModo={definirModo}
        busca={busca}
        aoBuscar={definirBusca}
        ocultados={quadro.pedidos.length - visiveis.length}
        aoAtualizar={quadro.recarregar}
      />

      {fila.pendentes.length > 0 && (
        <Faixa
          tom="atencao"
          icone="wifi-cortado"
          acao={
            <Botao
              enfase="secundaria"
              carregando={fila.reenviando}
              onClick={() => void fila.reenviar()}
            >
              Enviar agora
            </Botao>
          }
        >
          {fila.pendentes.length}{' '}
          {fila.pendentes.length === 1 ? 'ação aguardando' : 'ações aguardando'} a conexão
          voltar.
        </Faixa>
      )}

      {impressao.fila.length > 0 && (
        <Faixa
          tom="atencao"
          icone="alerta"
          acao={
            <Botao enfase="secundaria" onClick={impressao.tentarDeNovo}>
              Imprimir de novo
            </Botao>
          }
        >
          {impressao.fila.length}{' '}
          {impressao.fila.length === 1 ? 'comanda não saiu' : 'comandas não saíram'}.
          {!impressao.temAgente && ' Sem agente de impressão configurado nesta loja.'}
        </Faixa>
      )}

      {quadro.sincronia === 'recuperando' && (
        <Faixa tom="informativo" icone="atualizar">
          Recuperando eventos que chegaram enquanto você estava offline…
        </Faixa>
      )}

      {aviso && (
        <Faixa
          tom={aviso.tom}
          icone="alerta"
          acao={
            <Botao enfase="fantasma" onClick={() => definirAviso(null)}>
              Ok
            </Botao>
          }
        >
          {aviso.texto}
        </Faixa>
      )}

      {quadro.erro && (
        <Faixa
          tom="perigo"
          icone="alerta"
          acao={
            <Botao enfase="secundaria" icone="atualizar" onClick={quadro.recarregar}>
              Tentar de novo
            </Botao>
          }
        >
          {quadro.erro}
        </Faixa>
      )}

      {quadro.carregando ? (
        <main className="carregando">
          <span className="carregando__giro" aria-hidden="true" />
          <p role="status">Carregando o quadro…</p>
        </main>
      ) : (
        <main className="area">
          {modo === 'quadros' ? (
            <Quadros
              pedidos={visiveis}
              permissoes={sessao.permissoes}
              agora={agora}
              emCurso={emCurso}
              aoPedirAcao={pedirAcao}
              aoAbrirDetalhe={abrirDetalhe}
            />
          ) : (
            <Expedicao
              pedidos={visiveis}
              permissoes={sessao.permissoes}
              agora={agora}
              emCurso={emCurso}
              aoPedirAcao={pedirAcao}
              aoAbrirDetalhe={abrirDetalhe}
            />
          )}
          <Excecoes excecoes={excecoes} agora={agora} aoAbrir={abrirDetalhe} />
        </main>
      )}

      <DetalheDoPedido
        pedido={pedidoAberto}
        permissoes={sessao.permissoes}
        agora={agora}
        ocupado={pedidoAberto ? emCurso.has(pedidoAberto.id) : false}
        aoPedirAcao={(acao) => {
          if (pedidoAberto) pedirAcao(pedidoAberto, acao)
        }}
        aoFechar={() => definirDetalhe(null)}
        token={sessao.token}
        aoReimprimir={() => {
          if (pedidoAberto) void impressao.reimprimir(pedidoAberto)
        }}
      />

      {fila.reconciliacao && (
        <Reconciliacao linhas={fila.reconciliacao} aoReconhecer={fila.reconhecer} />
      )}

      {confirmacao && (
        <ConfirmacaoDeAcao
          pedido={confirmacao.pedido}
          acao={confirmacao.acao}
          ocupado={emCurso.has(confirmacao.pedido.id)}
          aoCancelar={() => definirConfirmacao(null)}
          aoConfirmar={({ reasonCode, reasonNote }) => {
            void agir({ ...confirmacao, reasonCode, reasonNote })
            definirConfirmacao(null)
            // Fecha o detalhe junto: a ação confirmada muda o pedido de coluna,
            // e manter aberto um painel que descreve o estado anterior é pior
            // do que voltar ao quadro.
            definirDetalhe(null)
          }}
        />
      )}
    </div>
  )
}
