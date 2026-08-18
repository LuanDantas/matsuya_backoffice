import { useCallback, useMemo, useRef, useState } from 'react'
import { Botao, EstadoVazio, Faixa, Icone, Selo } from '@matsuya/ui'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderStatus } from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { Chat } from '../chat/Chat'
import type { MensagemLocal } from '../../dados/mensagens'
import { corDoNome, decorrido, iniciais, moeda } from '../../app/formato'
import {
  filtrarConversas,
  montarListaDeConversas,
  type LinhaDeConversa,
} from './lista'
import {
  ABAS,
  outraAba,
  abaDaConversa,
  abaEfetiva,
  abaVizinha,
  aplicarFixacao,
  contagens as contarAbas,
  type Aba,
  type Fixacao,
} from './abas'

/**
 * Conversas com clientes.
 *
 * ## Duas colunas
 *
 * Lista à esquerda, conversa à direita, as duas em altura cheia — o mesmo
 * desenho de "Em rota". Antes a lista era uma coluna única e a conversa só
 * existia dentro de um drawer de 600 px, com o histórico numa janela de 44% da
 * altura da tela. O drawer continua existindo para quem chega pelo detalhe do
 * pedido; o que ele não deve ser é o **único** jeito de ler uma conversa.
 *
 * ## Duas abas, e a regra que as governa
 *
 * "Aguardando" é o que precisa de você. "Em aberto" é a porta para puxar
 * conversa sobre um pedido que ainda não tem nenhuma — que é o que a loja faz
 * quando liga para avisar de um atraso.
 *
 * **A lista só se move quando o operador manda.** Depois que ele escolheu uma
 * aba ou abriu uma conversa, nada na coluna esquerda muda de lugar sozinho — ver
 * `aplicarFixacao` e `abaEfetiva` em `abas.ts`, que são onde essa regra mora e
 * onde ela é testada.
 *
 * ## Sobre a tela nascer vazia
 *
 * **Não é defeito.** O contador de não lidas funciona, mas nada no sistema cria
 * mensagem com autor `customer`: o aplicativo do cliente não tem por onde
 * enviar. Enquanto isso não existir, a loja escreve e ninguém responde. O
 * estado vazio diz isso com todas as letras — um "nenhuma mensagem" genérico
 * faria o responsável concluir que os clientes não escrevem, quando na verdade
 * eles não podem.
 */
export function Conversas({
  pedidos,
  nomesDasLojas,
  naoLidasPorPedido,
  novidades,
  lojasComFalha,
  threads,
  selecionado,
  podeEscrever,
  agora,
  aoSelecionar,
  aoAbrirPedido,
  aoEnviar,
  aoReenviar,
  aoMarcarLida,
}: {
  pedidos: PedidoDoQuadro[]
  nomesDasLojas: ReadonlyMap<number, string>
  naoLidasPorPedido: ReadonlyMap<number, number>
  novidades: ReadonlySet<number>
  lojasComFalha: number[]
  threads: ReadonlyMap<number, { mensagens: MensagemLocal[]; carregando: boolean; erro: string | null }>
  selecionado: number | null
  podeEscrever: boolean
  agora: number
  aoSelecionar: (pedido: PedidoDoQuadro) => void
  /** Abre o painel de detalhe do pedido, o mesmo do quadro. */
  aoAbrirPedido: (pedido: PedidoDoQuadro) => void
  aoEnviar: (orderId: number, corpo: string) => Promise<void>
  aoReenviar: (orderId: number, idLocal: number) => Promise<void>
  aoMarcarLida: (orderId: number, upToId: number) => void
}) {
  const [busca, definirBusca] = useState('')
  const [escolhida, definirEscolhida] = useState<Aba | null>(null)
  const [fixacaoBruta, definirFixacao] = useState<Fixacao | null>(null)
  const faixa = useRef<HTMLDivElement>(null)

  const lista = useMemo(
    () => montarListaDeConversas(pedidos, naoLidasPorPedido, novidades, nomesDasLojas),
    [pedidos, naoLidasPorPedido, novidades, nomesDasLojas]
  )

  /*
   * O pino é **derivado**, nunca reconciliado por efeito.
   *
   * `selecionado` é do componente pai e muda de três lugares diferentes. Um
   * efeito que sincronizasse pino e seleção renderizaria um quadro inteiro com
   * o pino velho — e um quadro é o bastante para a linha piscar de lugar.
   */
  const fixacao = fixacaoBruta?.pedido === selecionado ? fixacaoBruta : null

  // O pino ANTES de tudo: é ele que decide a que aba cada linha pertence agora.
  const fixada = useMemo(() => aplicarFixacao(lista, fixacao), [lista, fixacao])

  /*
   * Duas contagens, e trocá-las é o erro mais fácil de cometer aqui.
   *
   * `totais` sai da lista **sem busca** e alimenta a escolha da aba: com as
   * filtradas, digitar uma letra que zera a aba atual trocaria a aba no meio da
   * digitação. `visivel` é o que a lista realmente mostra, e é dele que os
   * números dos chips saem — senão o chip diz 3 e a lista mostra 1.
   */
  const totais = useMemo(() => contarAbas(fixada), [fixada])

  const visivel = useMemo(
    () => ({
      aguardando: filtrarConversas(fixada.aguardando, busca),
      emAberto: filtrarConversas(fixada.emAberto, busca),
    }),
    [fixada, busca]
  )

  const mostradas = useMemo(() => contarAbas(visivel), [visivel])

  const ativa = abaEfetiva(escolhida, abaDaConversa(fixada, selecionado), totais)

  const escolher = useCallback((aba: Aba) => {
    definirEscolhida(aba)
    // Trocar de aba é navegar para longe — o contrato do pino é "fica até você
    // sair daqui", e sair é isto.
    definirFixacao(null)
  }, [])

  /** Setas, Home e End. A mecânica mora em `abaVizinha`, testada sem DOM. */
  const aoTeclarNaFaixa = useCallback(
    (evento: React.KeyboardEvent<HTMLDivElement>) => {
      const destino = abaVizinha(ativa, evento.key)
      if (!destino) return
      evento.preventDefault()
      escolher(destino)
      // Ativação automática: são duas abas e trocar não custa rede, então o
      // foco leva o conteúdo junto em vez de exigir um Enter a mais.
      faixa.current
        ?.querySelector<HTMLButtonElement>(`[data-aba='${destino}']`)
        ?.focus()
    },
    [ativa, escolher]
  )

  const linhas = visivel[ativa]
  const naOutra = mostradas[outraAba(ativa)]

  const pedidoAberto = useMemo(
    () => pedidos.find((p) => p.id === selecionado) ?? null,
    [pedidos, selecionado]
  )

  const thread = selecionado !== null ? threads.get(selecionado) : undefined

  /** Mais de uma loja na seleção: a linha precisa dizer de qual ela é. */
  const varias = nomesDasLojas.size > 1

  return (
    <main className="conversas">
      <div className="conversas__coluna">
        {lojasComFalha.length > 0 && (
          /*
            Loja que falhou é dita, não contada como zero. Sem isto, a insígnia
            diria 3 quando a realidade pode ser 8, e sem nenhum sinal de que a
            pergunta ficou sem resposta.
          */
          <Faixa tom="atencao" icone="alerta">
            Não foi possível ler as conversas de{' '}
            {lojasComFalha.map((id) => nomesDasLojas.get(id) ?? `Unidade ${id}`).join(', ')}.
            As contagens abaixo estão incompletas.
          </Faixa>
        )}

        {/*
          A busca é local a esta tela, e não o `CampoLinha` do sistema.

          Aquele desenha o rótulo **acima** do campo, o que aqui custava duas
          linhas de altura numa coluna em que altura é a lista. Num campo de
          busca a lupa e o texto de exemplo já dizem o que ele faz, então o
          rótulo fica só para o leitor de tela — que não vê nenhum dos dois.
        */}
        <div className="conversas__busca">
          <label className="ui-visualmente-oculto" htmlFor="conversas-busca">
            Buscar conversa por código ou cliente
          </label>
          <Icone nome="lupa" tamanho={15} />
          <input
            id="conversas-busca"
            type="search"
            placeholder="Buscar por código ou cliente…"
            value={busca}
            onChange={(e) => definirBusca(e.target.value)}
          />
          {busca && (
            <button
              type="button"
              className="conversas__limpar"
              aria-label="Limpar a busca"
              onClick={() => definirBusca('')}
            >
              <Icone nome="x" tamanho={14} />
            </button>
          )}
        </div>

        {/*
          A faixa de abas. Reusa `.chip` — que já é a estética certa: pílula
          cujo estado ativo é preenchimento escuro com texto claro — mas NÃO a
          `.chips`, que é `sticky` com margens negativas calibradas para um pai
          com outro recuo e sairia da coluna.
        */}
        <div
          className="conversas__abas"
          role="tablist"
          aria-label="O que acompanhar"
          ref={faixa}
          onKeyDown={aoTeclarNaFaixa}
        >
          {ABAS.map((aba) => {
            const corrente = ativa === aba.chave
            const quantas = mostradas[aba.chave]
            const total = totais[aba.chave]

            return (
              <button
                key={aba.chave}
                type="button"
                role="tab"
                data-aba={aba.chave}
                className="chip"
                aria-selected={corrente}
                aria-controls="conversas-painel"
                // Só a aba ativa entra na ordem de tabulação: o padrão manda
                // chegar à faixa com um Tab e andar por ela com as setas.
                tabIndex={corrente ? 0 : -1}
                title={aba.explica}
                onClick={() => escolher(aba.chave)}
              >
                <Icone nome={aba.icone} tamanho={14} />
                {aba.rotulo}
                <span
                  className="chip__contagem num"
                  /*
                    Com busca ativa o número passa a ser "quantos casaram", e
                    cair de 3 para 0 poderia ser lido como dado perdido. O
                    rótulo diz a fração inteira para desfazer a ambiguidade.
                  */
                  aria-label={
                    busca
                      ? `${aba.rotulo}: ${quantas} de ${total} com esse termo`
                      : `${aba.rotulo}: ${quantas}`
                  }
                >
                  {quantas}
                </span>
              </button>
            )
          })}
        </div>

        {/*
          O `key` vai no contêiner de ROLAGEM, e não na lista: aqui quem rola é
          este div, então keyar só o `ul` deixaria a rolagem da aba anterior — e
          numa coluna de 380 px isso larga a pessoa no meio de uma lista curta,
          olhando para o vazio.
        */}
        <div
          className="conversas__secoes"
          id="conversas-painel"
          role="tabpanel"
          aria-label={ABAS.find((a) => a.chave === ativa)!.rotulo}
          // O painel rola, e região que rola precisa ser alcançável por teclado.
          tabIndex={0}
          key={ativa}
        >
          {linhas.length === 0 ? (
            <EstadoVazio
              icone={ativa === 'aguardando' ? 'balao' : 'sacola'}
              titulo={
                busca
                  ? 'Nada com esse termo'
                  : ativa === 'aguardando'
                    ? 'Nenhuma mensagem de cliente'
                    : 'Nenhum pedido em aberto'
              }
              descricao={
                busca
                  ? undefined
                  : ativa === 'aguardando'
                    ? 'O aplicativo do cliente ainda não envia mensagens. Você pode escrever a partir de qualquer pedido em aberto.'
                    : undefined
              }
              /*
                Busca não troca de aba sozinha — ela serve tanto para achar um
                pedido quanto para estreitar a aba atual, e trocar serviria só ao
                primeiro. O custo é um clique, e o clique é oferecido aqui.
              */
              acao={
                busca && naOutra > 0 ? (
                  <Botao
                    enfase="secundaria"
                    icone="seta-direita"
                    onClick={() => escolher(outraAba(ativa))}
                  >
                    {naOutra} {naOutra === 1 ? 'resultado' : 'resultados'} em{' '}
                    {/* Da constante, e não escrito à mão: o rótulo da aba já
                        mudou uma vez, e duas cópias divergem na segunda. */}
                    {ABAS.find((a) => a.chave === outraAba(ativa))!.rotulo}
                  </Botao>
                ) : undefined
              }
            />
          ) : (
            <ul className="conversas__lista">
              {linhas.map((linha, indice) => (
                <Linha
                  key={linha.pedido.id}
                  linha={linha}
                  varias={varias}
                  agora={agora}
                  ordem={Math.min(indice, 7)}
                  selecionado={selecionado === linha.pedido.id}
                  fixada={fixacao?.pedido === linha.pedido.id}
                  aoSelecionar={(pedido) => {
                    // Guarda de onde veio e em que posição estava: nenhuma das
                    // duas coisas dá para recuperar depois que a contagem zerar.
                    definirFixacao({ pedido: pedido.id, aba: ativa, indice })
                    aoSelecionar(pedido)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="conversas__thread">
        {pedidoAberto ? (
          <>
            {/*
              O cabeçalho responde "de que pedido estamos falando" sem obrigar a
              abrir nada. Quem escreve para um cliente precisa saber o status
              agora, quanto ele pagou e se é entrega ou retirada — são as três
              coisas que a conversa costuma ser sobre. Todas já estão no quadro,
              e o quadro é ao vivo, então elas se atualizam sozinhas enquanto a
              conversa está aberta.
            */}
            <header className="conversas__cabecalho">
              <div className="conversas__identidade">
                <span className="conversas__titulo">
                  <strong className="num">{pedidoAberto.code ?? `#${pedidoAberto.id}`}</strong>
                  <span>{pedidoAberto.customerLabel ?? 'Cliente não informado'}</span>
                </span>

                <div className="conversas__fatos">
                  <Selo tom={ORDER_STATUS_TONE[pedidoAberto.status as OrderStatus]}>
                    {ORDER_STATUS_LABEL[pedidoAberto.status as OrderStatus]}
                  </Selo>

                  <span className="conversas__fato">
                    <Icone
                      nome={pedidoAberto.deliveryType === 'pickup' ? 'sacola' : 'capacete'}
                      tamanho={13}
                    />
                    {pedidoAberto.deliveryType === 'pickup' ? 'Retirada' : 'Entrega'}
                  </span>

                  <span className="conversas__fato num">
                    {moeda.format(pedidoAberto.total)}
                  </span>

                  <span className="conversas__fato">
                    <Icone nome="relogio" tamanho={13} />
                    há {decorrido(pedidoAberto.createdAt, agora)}
                  </span>

                  {varias && (
                    <span className="conversas__fato">
                      <Icone nome="loja" tamanho={13} />
                      {nomesDasLojas.get(pedidoAberto.unityId) ??
                        `Unidade ${pedidoAberto.unityId}`}
                    </span>
                  )}
                </div>
              </div>

              {/*
                Abre o MESMO painel de detalhe do quadro, em vez de repetir itens
                e endereço aqui. Duas telas mostrando o pedido divergem na
                primeira mudança de uma delas.
              */}
              <Botao
                enfase="secundaria"
                icone="lista"
                onClick={() => aoAbrirPedido(pedidoAberto)}
              >
                Ver pedido
              </Botao>
            </header>

            <Chat
              key={pedidoAberto.id}
              orderId={pedidoAberto.id}
              codigoDoPedido={pedidoAberto.code}
              mensagens={thread?.mensagens ?? []}
              carregando={thread?.carregando ?? true}
              erro={thread?.erro ?? null}
              podeEscrever={podeEscrever}
              agora={agora}
              aoEnviar={(corpo) => aoEnviar(pedidoAberto.id, corpo)}
              aoReenviar={(idLocal) => aoReenviar(pedidoAberto.id, idLocal)}
              aoMarcarLida={(upToId) => aoMarcarLida(pedidoAberto.id, upToId)}
            />
          </>
        ) : (
          <EstadoVazio
            icone="balao"
            titulo="Escolha uma conversa"
            descricao="A conversa aparece aqui, ao lado da lista."
          />
        )}
      </div>
    </main>
  )
}

function Linha({
  linha,
  varias,
  agora,
  ordem,
  selecionado,
  fixada,
  aoSelecionar,
}: {
  linha: LinhaDeConversa
  varias: boolean
  agora: number
  ordem: number
  selecionado: boolean
  /** Está sendo segurada nesta aba por estar aberta — ver `aplicarFixacao`. */
  fixada: boolean
  aoSelecionar: (pedido: PedidoDoQuadro) => void
}) {
  const { pedido, naoLidas, temNovidade, loja } = linha
  const nome = pedido.customerLabel ?? 'Cliente'

  return (
    <li className="conversas__linha-item" style={{ ['--ordem' as string]: String(ordem) }}>
      <button
        type="button"
        className="conversas__item"
        data-selecionado={selecionado || undefined}
        data-nao-lida={naoLidas > 0 || undefined}
        data-fixada={fixada || undefined}
        aria-current={selecionado || undefined}
        onClick={() => aoSelecionar(pedido)}
      >
        {/*
          O avatar do cliente.

          Iniciais sobre uma cor derivada do nome — a mesma pessoa tem sempre o
          mesmo tom, e quem opera todo dia acha a conversa pela cor antes de
          ler. Não há foto de cliente em lugar nenhum deste sistema, então o
          disco não finge um rosto.
        */}
        <span className="conversas__avatar" aria-hidden="true">
          <span style={{ background: corDoNome(nome) }}>
            {pedido.customerLabel ? iniciais(nome) : <Icone nome="pessoa" tamanho={16} />}
          </span>

          {/*
            O ponto de novidade fica no avatar, com anel na cor do cartão para
            se destacar do disco por baixo. Ele é o sinal LOCAL ("escreveram
            aqui desde que olhei") e nunca vira número — o número é a contagem
            do servidor, do outro lado da linha.
          */}
          {temNovidade && naoLidas === 0 && <span className="conversas__ponto" />}
        </span>

        {/*
          A divisória mora nesta coluna, não na linha inteira: assim ela começa
          depois do avatar, como em qualquer mensageiro, e some no item
          selecionado — que não precisa dela porque já tem fundo próprio.
        */}
        <span className="conversas__texto">
          <span className="conversas__linha">
            <span className="conversas__nome">{nome}</span>
            <span className="conversas__quando num">
              {decorrido(pedido.createdAt, agora)}
            </span>
          </span>

          <span className="conversas__linha conversas__linha--fraca">
            <span className="conversas__sobre">
              <strong className="num">{pedido.code ?? `#${pedido.id}`}</strong>
              {/*
                Capacete para entrega, sacola para retirada — o que a pessoa
                faz com o pedido, não o veículo. A moto dizia a mesma coisa e
                lia como enfeite; o capacete é o entregador.
              */}
              <Icone
                nome={pedido.deliveryType === 'pickup' ? 'sacola' : 'capacete'}
                tamanho={13}
                rotulo={pedido.deliveryType === 'pickup' ? 'Retirada' : 'Entrega'}
              />
              <span className="num">{moeda.format(pedido.total)}</span>
            </span>

            {naoLidas > 0 && (
              <span className="conversas__contagem num">
                {naoLidas > 9 ? '9+' : naoLidas}
              </span>
            )}
          </span>

          <span className="conversas__rodape">
            <Selo tom={ORDER_STATUS_TONE[pedido.status as OrderStatus]}>
              {ORDER_STATUS_LABEL[pedido.status as OrderStatus]}
            </Selo>
            {varias && <span className="conversas__loja">{loja}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}
