import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Botao, Drawer, Faixa, Icone, Selo } from '@matsuya/ui'
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
import { SeletorDeLojas } from './SeletorDeLojas'
import { BotaoComContador } from './BotaoComContador'
import { Farol, rotuloDoAlerta, useFarol, type AlertaDoDispositivo } from './Farol'
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
  sessao,
  agora,
}: {
  sessao: ReturnType<typeof useSessao>
  agora: number
}) {
  const lojas = sessao.unidadesAtuais
  const quadro = useQuadro(lojas, sessao.token)

  /**
   * A unidade "de trabalho" das telas que só sabem lidar com uma.
   *
   * Início e Cardápio são de uma loja por vez — somar num número só o mês de
   * lojas com volumes diferentes esconde qual é qual, e a decisão que sai daí
   * é ruim. A referência faz o mesmo: a home dela tem seletor próprio.
   */
  const [unidadeFoco, definirUnidadeFoco] = useState<number>(() => lojas[0] ?? 0)

  useEffect(() => {
    if (!lojas.includes(unidadeFoco)) definirUnidadeFoco(lojas[0] ?? 0)
  }, [lojas, unidadeFoco])

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
  const [farolAberto, definirFarolAberto] = useState(false)
  /** O painel do farol se expande a partir daqui — a origem é medida, não fixa. */
  const botaoDoFarol = useRef<HTMLButtonElement>(null)
  const [excecoesAbertas, definirExcecoesAbertas] = useState(false)

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

  const nomesDasUnidades = useMemo(() => {
    const mapa = new Map<number, string>()
    for (const u of sessao.identidade?.units ?? []) {
      if (lojas.includes(u.id)) mapa.set(u.id, u.name)
    }
    return mapa
  }, [sessao.identidade, lojas])

  const unidade = sessao.identidade?.units.find((u) => u.id === unidadeFoco)
  const nomeDaUnidade = unidade?.name ?? `Unidade ${unidadeFoco}`

  /** Lojas com pedido em aberto, para a linha de apoio do seletor. */
  const lojasComPedidos = useMemo(
    () => new Set(quadro.pedidos.map((p) => p.unityId)),
    [quadro.pedidos]
  )

  const som = useAlertas(quadro.pedidos, true)
  const impressao = useImpressao(nomeDaUnidade)
  const fila = useFilaOffline(unidadeFoco, api, quadro.recarregar)
  const acoes = useAcoesDoPedido({
    api,
    unidadeId: unidadeFoco,
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

  const unidadesDoFarol = useMemo(
    () => [...nomesDasUnidades].map(([id, name]) => ({ id, name })),
    [nomesDasUnidades]
  )
  // O gatilho junta as duas razões de o farol ficar velho: o quadro mudou, ou
  // uma loja abriu/fechou/pausou. A segunda não passa pelo quadro — uma loja
  // pode pausar sem que nenhum pedido se mexa.
  const gatilhoDoFarol = useMemo(
    () => ({ pedidos: quadro.pedidos, lojas: quadro.versaoDasLojas }),
    [quadro.pedidos, quadro.versaoDasLojas]
  )
  const farol = useFarol(unidadesDoFarol, sessao.token, lojasComPedidos, gatilhoDoFarol)

  /**
   * Alertas do próprio tablet, separados dos da loja.
   *
   * São coisas diferentes: "3 atrasados" é problema da operação e segue igual
   * em qualquer tela; "comanda não saiu" é problema **desta** máquina e some
   * quando alguém abre o Hub em outra. Misturar faria o responsável procurar
   * na loja um defeito que está no dispositivo.
   */
  const alertasDoDispositivo = useMemo<AlertaDoDispositivo[]>(() => {
    const lista: AlertaDoDispositivo[] = []

    if (impressao.fila.length > 0) {
      lista.push({
        chave: 'impressao',
        gravidade: 'critico',
        texto: `${impressao.fila.length} ${impressao.fila.length === 1 ? 'comanda não saiu' : 'comandas não saíram'} da impressora`,
      })
    }
    if (fila.pendentes.length > 0) {
      lista.push({
        chave: 'offline',
        gravidade: 'critico',
        texto: `${fila.pendentes.length} ${fila.pendentes.length === 1 ? 'ação aguardando' : 'ações aguardando'} a conexão voltar`,
      })
    }
    if (quadro.conexao === 'degradado' || quadro.conexao === 'desconectado') {
      lista.push({
        chave: 'conexao',
        gravidade: 'atencao',
        texto: 'Sem tempo real — o quadro está atualizando por consulta periódica',
      })
    }

    return lista
  }, [impressao.fila.length, fila.pendentes.length, quadro.conexao])

  /** `null` quando não há nada — é o que decide qual das duas pílulas aparece. */
  const rotuloDoFarol = useMemo(
    () => rotuloDoAlerta(farol.porLoja, alertasDoDispositivo.length),
    [farol.porLoja, alertasDoDispositivo.length]
  )

  // Sem endpoint agregado de não lidas por seleção; somar os pedidos com
  // conversa aberta é o que dá para saber sem uma requisição por loja.
  const naoLidasTotal = 0

  /**
   * A janela cheia do prazo de aceite, para a barra do cartão saber o 100%.
   *
   * Vem do servidor, junto do prazo. Fixar 10 aqui faria a barra mentir no dia
   * em que o prazo mudasse na API — e ninguém notaria, porque ela continuaria
   * desenhando uma barra bonita.
   */
  const prazoDeAceite = useMemo(() => {
    const comPrazo = quadro.pedidos.find(
      (p) => p.deadlineKind === 'aceite' && p.deadlineTotalMinutes
    )
    return comPrazo?.deadlineTotalMinutes ?? 10
  }, [quadro.pedidos])

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
          <SeletorDeLojas
            identidade={sessao.identidade!}
            selecionadas={new Set(lojas)}
            comPedidos={lojasComPedidos}
            operacao={farol.estados}
            aoSelecionar={sessao.escolherUnidades}
          />

          {/*
            O farol vai no centro, como na referência. É o único elemento do
            cabeçalho que muda de cor sozinho, e por isso o olho volta a ele
            sem procurar.

            Com alerta a **pílula inteira inverte** — fundo quase preto, texto
            branco, chip âmbar —, e não só a bolinha. É o que faz o alerta ser
            notado na visão periférica de quem está montando pedido de costas
            para a tela; trocar a cor de um ponto de 8 px não é.
          */}
          <button
            type="button"
            ref={botaoDoFarol}
            className="barra__farol"
            data-estado={rotuloDoFarol ? 'alerta' : 'ok'}
            data-aberto={farolAberto || undefined}
            onClick={() => definirFarolAberto(true)}
            aria-label={
              rotuloDoFarol
                ? `Farol da Operação: ${rotuloDoFarol}. Abrir detalhes.`
                : 'Farol da Operação: sem alertas. Abrir detalhes.'
            }
          >
            <span className="barra__farol-ponto" aria-hidden="true" />
            <span aria-hidden="true">Farol da Operação</span>
            {rotuloDoFarol && (
              <span className="barra__farol-chip" aria-hidden="true">
                <Icone nome="alerta" tamanho={14} />
                {rotuloDoFarol}
              </span>
            )}
            <span className="barra__farol-setas" aria-hidden="true">
              <Icone nome="cima-baixo" tamanho={16} />
            </span>
          </button>

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

            {/*
              "Atendimento" na referência abre o suporte da plataforma. Aqui
              abre a fila de exceções: é o que, no nosso produto, precisa de
              gente — pedido atrasado, falha de entrega, pedido alterado.
            */}
            <BotaoComContador
              icone="alerta"
              rotulo="Exceções"
              contagem={excecoes.length}
              aoClicar={() => definirExcecoesAbertas(true)}
            />

            <BotaoComContador
              icone="balao"
              rotulo="Conversas"
              contagem={naoLidasTotal}
              aoClicar={() => definirTela('conversas')}
            />

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
                unityId={unidadeFoco}
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
                    nomesDasUnidades={nomesDasUnidades}
                    prazoDeAceiteEmMinutos={prazoDeAceite}
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
                    nomesDasUnidades={nomesDasUnidades}
                    prazoDeAceiteEmMinutos={prazoDeAceite}
                    aoPedirAcao={pedirAcao}
                    aoAbrirDetalhe={abrirDetalhe}
                  />
                )}
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
                unityId={unidadeFoco}
                pedidos={quadro.pedidos}
                token={sessao.token}
                agora={agora}
                aoAbrirConversa={(pedido) => {
                  definirDetalhe(null)
                  definirConversa(pedido.id)
                }}
              />
            )}

            {tela === 'cardapio' && <Cardapio unityId={unidadeFoco} token={sessao.token} />}

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
                cursores={quadro.cursores}
                nomesDasUnidades={nomesDasUnidades}
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

      {farolAberto && (
        <Farol
          porLoja={farol.porLoja}
          alertasDoDispositivo={alertasDoDispositivo}
          ancora={botaoDoFarol}
          aoFechar={() => definirFarolAberto(false)}
        />
      )}

      {excecoesAbertas && (
        <Drawer
          aberto
          rotuloAcessivel="Pedidos que precisam de atenção"
          titulo={<h2>Exceções</h2>}
          subtitulo="Atrasados, com falha de entrega ou alterados depois do aceite."
          aoFechar={() => definirExcecoesAbertas(false)}
        >
          <Excecoes
            excecoes={excecoes}
            agora={agora}
            aoAbrir={(pedido) => {
              definirExcecoesAbertas(false)
              abrirDetalhe(pedido)
            }}
          />
        </Drawer>
      )}

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
