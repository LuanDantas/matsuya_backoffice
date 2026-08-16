import { useCallback, useEffect, useMemo, useState } from 'react'
import { Botao, Faixa, Icone, Selo } from '@matsuya/ui'
import { createApiClient, criarApiDePedidos, type PedidoDoQuadro } from '@matsuya/api-client'
import { ORDER_ACTION_INFO, type OrderAction } from '@matsuya/contracts'
import type { useSessao } from '../dados/useSessao'
import { useQuadro } from '../dados/useQuadro'
import { useAcoesDoPedido } from '../dados/useAcoesDoPedido'
import { useAlertas } from '../som/useAlertas'
import { useFilaOffline } from '../offline/useFilaOffline'
import { useImpressao } from '../impressao/useImpressao'
import { Reconciliacao } from '../offline/Reconciliacao'
import { MenuLateral } from './MenuLateral'
import { telaInicial, type Tela } from './telas'
import { config } from './config'

import { Quadros } from '../modules/quadro/Quadros'
import { Expedicao } from '../modules/quadro/Expedicao'
import { Ferramentas, normalizar, type ModoDoQuadro } from '../modules/quadro/Ferramentas'
import { ConfirmacaoDeAcao } from '../modules/quadro/ConfirmacaoDeAcao'
import { DrawerDoPedido } from '../modules/quadro/DrawerDoPedido'
import { DrawerDeChat } from '../modules/chat/DrawerDeChat'
import { Excecoes, apurarExcecoes } from '../modules/excecoes/Excecoes'
import { Inicio } from '../modules/inicio/Inicio'
import { EmRota } from '../modules/rota/EmRota'
import { Conversas } from '../modules/conversas/Conversas'
import { Cardapio } from '../modules/cardapio/Cardapio'
import { Ajustes } from '../modules/ajustes/Ajustes'

/**
 * A tela de trabalho: menu, barra, faixas e o roteamento entre seções.
 *
 * Montada com `key={unidade}` pelo `App`, de propósito: trocar de loja precisa
 * derrubar socket, cursor e cache de uma vez. Reaproveitar o estado entre
 * unidades é como um pedido da Mooca aparece no quadro da Santana.
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

export function Casca({
  unidadeId,
  sessao,
  agora,
}: {
  unidadeId: number
  sessao: ReturnType<typeof useSessao>
  agora: number
}) {
  const quadro = useQuadro(unidadeId, sessao.token)

  const [tela, definirTela] = useState<Tela>(() => telaInicial(sessao.permissoes))
  const [busca, definirBusca] = useState('')
  const [modo, definirModo] = useState<ModoDoQuadro>(
    () => (localStorage.getItem(CHAVE_MODO) as ModoDoQuadro | null) ?? 'quadros'
  )
  const [detalhe, definirDetalhe] = useState<number | null>(null)
  const [conversa, definirConversa] = useState<number | null>(null)
  const [confirmacao, definirConfirmacao] = useState<{
    pedido: PedidoDoQuadro
    acao: OrderAction
  } | null>(null)

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
  const nomeDaUnidade = unidade?.name ?? `Unidade ${unidadeId}`
  const podeTrocar = (sessao.identidade?.units.length ?? 0) > 1

  const som = useAlertas(quadro.pedidos, true)
  const impressao = useImpressao(nomeDaUnidade)
  const fila = useFilaOffline(unidadeId, api, quadro.recarregar)
  const acoes = useAcoesDoPedido({
    api,
    unidadeId,
    fila,
    aoConflitar: quadro.recarregar,
    aoErrar: som.tocarErro,
  })

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

  const pedidoDaConversa = useMemo(
    () => quadro.pedidos.find((p) => p.id === conversa) ?? null,
    [quadro.pedidos, conversa]
  )

  /**
   * Ponto único onde se decide entre executar e confirmar.
   *
   * A regra vive no contrato (`confirmar` e `motivo` de cada ação), não
   * espalhada pelas telas: o quadro e o drawer oferecem as mesmas ações, e
   * duplicar a decisão faria uma das duas esquecer de pedir o motivo.
   */
  const pedirAcao = useCallback(
    (pedido: PedidoDoQuadro, acao: OrderAction) => {
      const info = ORDER_ACTION_INFO[acao]
      if (info.motivo || info.confirmar) {
        definirConfirmacao({ pedido, acao })
        return
      }
      void acoes.agir({ pedido, acao })
    },
    [acoes]
  )

  const abrirDetalhe = useCallback((pedido: PedidoDoQuadro) => {
    definirConversa(null)
    definirDetalhe(pedido.id)
  }, [])

  /**
   * Entrega o quadro à impressão e sai do caminho.
   *
   * A regra de o que imprimir é do hook: o primeiro lote é o estado do mundo e
   * não gera papel, e a impressão automática só vale com agente local. Deixar
   * essa decisão aqui foi o que fez o diálogo do navegador aparecer a cada
   * carregamento.
   */
  useEffect(() => {
    impressao.sincronizar(quadro.pedidos)
  }, [quadro.pedidos, impressao])

  useEffect(() => {
    if (quadro.conexao === 'ao-vivo') void fila.reenviar()
  }, [quadro.conexao, fila])

  const ehQuadro = tela === 'pedidos'

  return (
    <div className="app">
      <MenuLateral
        permissoes={sessao.permissoes}
        tela={tela}
        aoNavegar={definirTela}
        naoLidas={0}
      />

      <div className="app__conteudo">
        <header className="barra">
          <div className="barra__identidade">
            <Icone nome="loja" tamanho={20} />
            <div>
              <h1>{nomeDaUnidade}</h1>
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

            {som.estado !== 'pronto' && (
              <Botao
                enfase={som.estado === 'mudo' ? 'fantasma' : 'secundaria'}
                onClick={() => void (som.estado === 'mudo' ? som.religar() : som.destravar())}
              >
                {som.estado === 'mudo' ? 'Som desligado' : 'Ligar o som'}
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

        {ehQuadro && (
          <Ferramentas
            modo={modo}
            aoTrocarModo={definirModo}
            busca={busca}
            aoBuscar={definirBusca}
            ocultados={quadro.pedidos.length - visiveis.length}
            aoAtualizar={quadro.recarregar}
          />
        )}

        {quadro.conexao === 'degradado' && (
          <Faixa tom="atencao" icone="wifi-cortado">
            Sem tempo real. O quadro está sendo atualizado a cada 10 segundos — as
            ações continuam funcionando.
          </Faixa>
        )}

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
            {fila.pendentes.length === 1 ? 'ação aguardando' : 'ações aguardando'} a
            conexão voltar.
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
          </Faixa>
        )}

        {acoes.aviso && (
          <Faixa
            tom={acoes.aviso.tom}
            icone="alerta"
            acao={
              <Botao enfase="fantasma" onClick={acoes.limparAviso}>
                Ok
              </Botao>
            }
          >
            {acoes.aviso.texto}
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

        {ehQuadro && quadro.carregando ? (
          <main className="carregando">
            <span className="carregando__giro" aria-hidden="true" />
            <p role="status">Carregando o quadro…</p>
          </main>
        ) : (
          <>
            {tela === 'inicio' && (
              <Inicio
                unityId={unidadeId}
                nomeDaUnidade={nomeDaUnidade}
                nomeDoUsuario={sessao.identidade?.user.name ?? ''}
                token={sessao.token}
                agora={agora}
                aoIrParaOQuadro={() => definirTela('pedidos')}
              />
            )}

            {ehQuadro && (
              <main className="area">
                {modo === 'quadros' ? (
                  <Quadros
                    pedidos={visiveis}
                    permissoes={sessao.permissoes}
                    agora={agora}
                    emCurso={acoes.emCurso}
                    selecionado={detalhe}
                    aoPedirAcao={pedirAcao}
                    aoAbrirDetalhe={abrirDetalhe}
                  />
                ) : (
                  <Expedicao
                    pedidos={visiveis}
                    permissoes={sessao.permissoes}
                    agora={agora}
                    emCurso={acoes.emCurso}
                    selecionado={detalhe}
                    aoPedirAcao={pedirAcao}
                    aoAbrirDetalhe={abrirDetalhe}
                  />
                )}
                <Excecoes excecoes={excecoes} agora={agora} aoAbrir={abrirDetalhe} />
              </main>
            )}

            {tela === 'rota' && (
              <EmRota
                pedidos={quadro.pedidos}
                unidade={{ nome: nomeDaUnidade, lat: unidade?.lat, lng: unidade?.lng }}
                agora={agora}
                aoAbrirDetalhe={abrirDetalhe}
              />
            )}

            {tela === 'conversas' && (
              <Conversas
                unityId={unidadeId}
                pedidos={quadro.pedidos}
                token={sessao.token}
                agora={agora}
                aoAbrirConversa={(pedido) => {
                  definirDetalhe(null)
                  definirConversa(pedido.id)
                }}
              />
            )}

            {tela === 'cardapio' && <Cardapio unityId={unidadeId} token={sessao.token} />}

            {tela === 'ajustes' && (
              <Ajustes
                som={som}
                impressao={{
                  temAgente: impressao.temAgente,
                  automatica: impressao.automatica,
                  pendentes: impressao.fila.length,
                  tentarDeNovo: impressao.tentarDeNovo,
                }}
                conexao={ROTULO_DA_CONEXAO[quadro.conexao] ?? quadro.conexao}
                cursor={quadro.cursor}
              />
            )}
          </>
        )}
      </div>

      <DrawerDoPedido
        pedido={pedidoAberto}
        permissoes={sessao.permissoes}
        nomeDaUnidade={nomeDaUnidade}
        agora={agora}
        ocupado={pedidoAberto ? acoes.emCurso.has(pedidoAberto.id) : false}
        naoLidas={0}
        aoPedirAcao={(acao) => pedidoAberto && pedirAcao(pedidoAberto, acao)}
        aoAbrirConversa={() => {
          if (!pedidoAberto) return
          definirConversa(pedidoAberto.id)
          definirDetalhe(null)
        }}
        aoImprimir={() => pedidoAberto && void impressao.reimprimir(pedidoAberto)}
        aoFechar={() => definirDetalhe(null)}
      />

      <DrawerDeChat
        pedido={pedidoDaConversa}
        nomeDaUnidade={nomeDaUnidade}
        token={sessao.token}
        podeEscrever={sessao.permissoes.has('chat:write')}
        // Volta para o detalhe de onde veio, em vez de fechar tudo: o operador
        // abriu a conversa a partir de um pedido e ainda está tratando dele.
        aoFechar={() => {
          const voltarPara = pedidoDaConversa?.id ?? null
          definirConversa(null)
          if (voltarPara !== null && tela === 'pedidos') definirDetalhe(voltarPara)
        }}
      />

      {fila.reconciliacao && (
        <Reconciliacao linhas={fila.reconciliacao} aoReconhecer={fila.reconhecer} />
      )}

      {confirmacao && (
        <ConfirmacaoDeAcao
          pedido={confirmacao.pedido}
          acao={confirmacao.acao}
          ocupado={acoes.emCurso.has(confirmacao.pedido.id)}
          aoCancelar={() => definirConfirmacao(null)}
          aoConfirmar={({ reasonCode, reasonNote }) => {
            void acoes.agir({ ...confirmacao, reasonCode, reasonNote })
            definirConfirmacao(null)
            definirDetalhe(null)
          }}
        />
      )}
    </div>
  )
}
