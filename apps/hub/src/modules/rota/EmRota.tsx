import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { EstadoVazio, Faixa, Icone, Selo, type NomeDoIcone } from '@matsuya/ui'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderStatus } from '@matsuya/contracts'
import type {
  AcompanhamentoDaEntrega,
  EstadoDaCorrida,
  PedidoDoQuadro,
} from '@matsuya/api-client'
import { coordenadaValida, distanciaKm, formatarDistancia, type Coordenada } from '@matsuya/utils'
import { decorrido, iniciais } from '../../app/formato'
import {
  POSICAO_VELHA_MINUTOS,
  abaDoPedido,
  focoDoAcompanhamento,
  idadeDaPosicao,
  partirPorAba,
  progressoDoTrecho,
  type Aba,
} from './rota'
import { PainelDaEntrega } from './PainelDaEntrega'
import { useAcompanhamento } from './useAcompanhamento'
import type { PontoDeEntrega, RotaNoMapa } from './MapaDasEntregas'

/**
 * Acompanhamento das entregas.
 *
 * Lista à esquerda, mapa à direita. Responde a pergunta que o responsável faz
 * quando o telefone toca: "onde está o pedido do fulano?".
 *
 * ## Duas abas, porque são duas perguntas
 *
 * **Coleta** é a comida ainda na loja: alguém está sendo procurado, vindo, ou
 * parado no balcão. **Entrega** é o que já saiu. As providências são
 * diferentes — na coleta se cobra entregador, na entrega se acompanha e se
 * avisa o cliente —, e misturá-las numa lista só obrigava a ler o selo de cada
 * linha para saber em qual das duas situações se estava.
 *
 * A separação vem da máquina de corrida da API, que já a fazia. A tela antes
 * filtrava por status do **pedido**, e `awaiting_courier` cobre os três estados
 * de coleta de uma vez.
 *
 * O mapa é carregado sob demanda: o motor de mapa é a maior dependência do Hub,
 * e o quadro — que abre a cada turno — não paga por ele.
 */

const Mapa = lazy(() => import('./MapaDasEntregas'))

const ABAS: Array<{ chave: Aba; rotulo: string; icone: NomeDoIcone; explica: string }> = [
  {
    chave: 'coleta',
    rotulo: 'Coleta',
    icone: 'loja',
    explica: 'Entregadores a caminho da loja ou esperando no balcão.',
  },
  {
    chave: 'entrega',
    rotulo: 'Entrega',
    icone: 'moto',
    explica: 'Pedidos que já saíram, a caminho do cliente.',
  },
]

interface Props {
  pedidos: PedidoDoQuadro[]
  unidade: { nome: string; lat?: number | null; lng?: number | null }
  agora: number
  aoAbrirDetalhe: (pedido: PedidoDoQuadro) => void
  /**
   * Busca o acompanhamento de uma entrega — traçado, distância e previsão.
   *
   * Vem de fora porque é uma chamada de rede, e esta tela não conhece cliente
   * de API: quem monta a `Casca` já tem um, autenticado e com a sessão certa.
   */
  aoAcompanhar: (orderId: number, signal?: AbortSignal) => Promise<AcompanhamentoDaEntrega>
}

interface LinhaDaRota {
  pedido: PedidoDoQuadro
  coordenada: Coordenada | null
  distancia: number | null
  bairro: string | null
}

export function EmRota({ pedidos, unidade, agora, aoAbrirDetalhe, aoAcompanhar }: Props) {
  const [aba, definirAba] = useState<Aba>('coleta')
  const [selecionado, definirSelecionado] = useState<number | null>(null)
  const [acompanhando, definirAcompanhando] = useState<number | null>(null)

  const acompanhamento = useAcompanhamento(acompanhando, aoAcompanhar)

  const coordDaLoja = useMemo(
    () => coordenadaValida(unidade.lat, unidade.lng),
    [unidade.lat, unidade.lng]
  )

  const porAba = useMemo(() => partirPorAba(pedidos), [pedidos])

  // A aba escolhida pode esvaziar sozinha — o último pedido dela é entregue e a
  // fila muda embaixo da mão. Cair para a que tem conteúdo é melhor do que
  // deixar a pessoa olhando um vazio que ela não causou.
  const ativa: Aba =
    porAba[aba].length === 0 && porAba[aba === 'coleta' ? 'entrega' : 'coleta'].length > 0
      ? aba === 'coleta'
        ? 'entrega'
        : 'coleta'
      : aba

  const linhas = useMemo<LinhaDaRota[]>(() => {
    return porAba[ativa]
      .map((pedido) => {
        const endereco = pedido.addressSnapshot as
          | { lat?: unknown; lng?: unknown; district?: string }
          | null

        const coordenada = endereco ? coordenadaValida(endereco.lat, endereco.lng) : null

        return {
          pedido,
          coordenada,
          distancia: coordenada && coordDaLoja ? distanciaKm(coordDaLoja, coordenada) : null,
          bairro: endereco?.district ?? null,
        }
      })
      .sort((a, b) => {
        // Sem coordenada vai para o fim: não dá para dizer que está longe nem
        // que está perto, e enfiar no meio da lista sugere uma ordem que não
        // existe.
        if (a.distancia === null) return 1
        if (b.distancia === null) return -1
        return a.distancia - b.distancia
      })
  }, [porAba, ativa, coordDaLoja])

  const pontos = useMemo<PontoDeEntrega[]>(
    () =>
      linhas
        .filter((l): l is LinhaDaRota & { coordenada: Coordenada } => l.coordenada !== null)
        .map((l) => {
          const posicao = l.pedido.entrega?.posicao ?? null

          return {
            id: l.pedido.id,
            codigo: l.pedido.code ?? `#${l.pedido.id}`,
            cliente: l.pedido.customerLabel,
            coordenada: l.coordenada,
            distanciaKm: l.distancia ?? 0,
            status: l.pedido.status,
            /*
             * Posição velha não vira pino.
             *
             * Depois de alguns minutos sem ping, a origem parou de publicar — o
             * aparelho desligou, o aplicativo fechou. Desenhar o último ponto
             * conhecido depois disso afirma que alguém está numa esquina onde
             * não está, e é dessa afirmação que sai a ligação errada.
             */
            entregador:
              posicao && idadeDaPosicao(posicao.em, agora) < POSICAO_VELHA_MINUTOS
                ? {
                    lat: posicao.lat,
                    lng: posicao.lng,
                    nome: l.pedido.entrega?.entregador ?? null,
                  }
                : null,
          }
        }),
    [linhas, agora]
  )

  const semCoordenada = linhas.length - pontos.length

  /*
   * A entrega acompanhada pode terminar embaixo da mão.
   *
   * Ela é entregue, sai das duas abas, e a folha ficaria aberta com a linha
   * desenhada e um cronômetro correndo para uma corrida que acabou. `abaDoPedido`
   * é a mesma régua que monta as listas: fora das duas abas, não há nada na rua
   * para acompanhar.
   *
   * O pedido é procurado em `pedidos`, e não em `linhas`: trocar de aba não
   * pode fechar a folha, e a lista só tem a aba corrente.
   */
  const pedidoAcompanhado = useMemo(() => {
    const encontrado = pedidos.find((p) => p.id === acompanhando) ?? null
    return encontrado && abaDoPedido(encontrado) !== null ? encontrado : null
  }, [pedidos, acompanhando])

  const aindaNaRua = pedidoAcompanhado !== null

  /*
   * E o acompanhamento para de ser consultado junto.
   *
   * Sem isto a folha some da tela mas o intervalo continua batendo na API a
   * cada dez segundos por uma entrega que terminou — o tipo de vazamento que
   * não aparece em teste nenhum e só se descobre no log de produção.
   */
  useEffect(() => {
    if (acompanhando !== null && !aindaNaRua) definirAcompanhando(null)
  }, [acompanhando, aindaNaRua])

  const rotaNoMapa = useMemo<RotaNoMapa | null>(() => {
    if (!aindaNaRua || acompanhando === null) return null
    const pontosDaRota = acompanhamento.dados?.rota?.pontos
    if (!pontosDaRota || pontosDaRota.length < 2) return null
    return { pontos: pontosDaRota, pedidoId: acompanhando }
  }, [acompanhamento.dados, acompanhando, aindaNaRua])

  const foco = useMemo(
    () =>
      aindaNaRua
        ? focoDoAcompanhamento(
            acompanhamento.dados?.entrega?.posicao ?? null,
            acompanhamento.dados?.destino ?? null
          )
        : null,
    [acompanhamento.dados, aindaNaRua]
  )

  const fecharAcompanhamento = useCallback(() => definirAcompanhando(null), [])

  return (
    <main className="rota">
      <div className="rota__lista">
        <div className="chips" role="tablist" aria-label="O que acompanhar">
          {ABAS.map((a) => (
            <button
              key={a.chave}
              type="button"
              role="tab"
              className="chip"
              aria-selected={ativa === a.chave}
              aria-pressed={ativa === a.chave}
              title={a.explica}
              onClick={() => definirAba(a.chave)}
            >
              <Icone nome={a.icone} tamanho={14} />
              {a.rotulo}
              <span className="chip__contagem num">{porAba[a.chave].length}</span>
            </button>
          ))}
        </div>

        <p className="rota__explica">{ABAS.find((a) => a.chave === ativa)!.explica}</p>

        {linhas.length === 0 ? (
          <EstadoVazio
            icone={ativa === 'coleta' ? 'loja' : 'moto'}
            titulo={ativa === 'coleta' ? 'Nada para coletar' : 'Nada na rua'}
            descricao={
              ativa === 'coleta'
                ? 'Nenhum entregador a caminho da loja nem esperando no balcão.'
                : 'Nenhum pedido saiu para entrega.'
            }
          />
        ) : (
          <ul className="rota__itens" key={ativa}>
            {linhas.map(({ pedido, distancia, bairro }, indice) => (
              <Linha
                key={pedido.id}
                pedido={pedido}
                distancia={distancia}
                bairro={bairro}
                aba={ativa}
                agora={agora}
                ordem={Math.min(indice, 7)}
                selecionado={selecionado === pedido.id}
                acompanhando={acompanhando === pedido.id}
                aoAcompanhar={() => {
                  definirSelecionado(pedido.id)
                  definirAcompanhando(pedido.id)
                }}
                aoAbrirDetalhe={() => {
                  definirSelecionado(pedido.id)
                  aoAbrirDetalhe(pedido)
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="rota__mapa">
        {/*
          Dizer quantos ficaram de fora, sempre. Um mapa com quatro pinos e uma
          lista de seis parece completo, e é assim que alguém conclui que a
          entrega sumiu.
        */}
        {semCoordenada > 0 && (
          <Faixa tom="atencao" icone="alerta">
            {semCoordenada}{' '}
            {semCoordenada === 1
              ? 'entrega sem coordenada não aparece'
              : 'entregas sem coordenada não aparecem'}{' '}
            no mapa. Elas estão na lista ao lado.
          </Faixa>
        )}

        <Suspense
          fallback={
            <div className="mapa mapa--carregando">
              <span className="carregando__giro" aria-hidden="true" />
              <p role="status">Carregando o mapa…</p>
            </div>
          }
        >
          <Mapa
            unidade={coordDaLoja}
            nomeDaUnidade={unidade.nome}
            pontos={pontos}
            selecionado={selecionado}
            rota={rotaNoMapa}
            foco={foco}
            aoSelecionar={definirSelecionado}
          />
        </Suspense>

        {/*
          A folha é remontada por `key` ao trocar de entrega: é isso que faz o
          foco entrar de novo e a animação de entrada acontecer, em vez de o
          conteúdo trocar por baixo sem nenhum sinal de que mudou.
        */}
        {pedidoAcompanhado && (
          <PainelDaEntrega
            key={pedidoAcompanhado.id}
            pedido={pedidoAcompanhado}
            acompanhamento={acompanhamento.dados}
            carregando={acompanhamento.carregando}
            erro={acompanhamento.erro}
            agora={agora}
            aoFechar={fecharAcompanhamento}
            aoAbrirDetalhe={() => aoAbrirDetalhe(pedidoAcompanhado)}
          />
        )}
      </div>
    </main>
  )
}

/**
 * Estado da corrida, para o selo no canto do avatar e para a linha de apoio.
 *
 * O ícone é o que separa os estados sem depender de cor — e ele fica no avatar,
 * e não numa segunda coluna: quem é a pessoa e o que ela está fazendo são duas
 * informações, e empilhá-las no mesmo círculo é o que faz a linha caber numa
 * altura em vez de duas.
 */
const CORRIDA: Record<
  EstadoDaCorrida,
  { icone: NomeDoIcone; rotulo: string; tom: 'neutro' | 'atencao' | 'sucesso' }
> = {
  buscando: { icone: 'lupa', rotulo: 'Procurando entregador', tom: 'atencao' },
  a_caminho: { icone: 'moto', rotulo: 'A caminho da loja', tom: 'neutro' },
  na_loja: { icone: 'loja', rotulo: 'No balcão', tom: 'atencao' },
  em_rota: { icone: 'moto', rotulo: 'A caminho do cliente', tom: 'sucesso' },
  entregue: { icone: 'check', rotulo: 'Entregue', tom: 'sucesso' },
  falhou: { icone: 'alerta', rotulo: 'Falhou', tom: 'atencao' },
}

/**
 * Quantas corridas avaliadas a média precisa ter para ser mostrada.
 *
 * Mesma régua do detalhe do pedido. Abaixo disso o número engana quem decide
 * olhando: "5,0" de quem fez quatro corridas e "4,7" de quem fez oitocentas
 * têm o mesmo tamanho na tela e dizem coisas opostas.
 */
const MINIMO_DE_CORRIDAS_PARA_NOTA = 30

function Linha({
  pedido,
  distancia,
  bairro,
  aba,
  agora,
  ordem,
  selecionado,
  acompanhando,
  aoAcompanhar,
  aoAbrirDetalhe,
}: {
  pedido: PedidoDoQuadro
  distancia: number | null
  bairro: string | null
  aba: Aba
  agora: number
  ordem: number
  selecionado: boolean
  acompanhando: boolean
  aoAcompanhar: () => void
  aoAbrirDetalhe: () => void
}) {
  const entrega = pedido.entrega ?? null
  const corrida = entrega ? CORRIDA[entrega.estado] : null

  /*
   * A barra do trecho.
   *
   * Na coleta ela mede o caminho até a loja, a partir da **atribuição** — não
   * do aceite do pedido, que é anterior e faria a barra encher demais, dizendo
   * que o entregador está chegando quando ele acabou de sair.
   *
   * Na entrega mede da saída até a previsão de chegada. As duas só existem
   * quando há previsão: sem ela, a barra teria de inventar o denominador.
   */
  const progresso =
    aba === 'coleta'
      ? progressoDoTrecho(
          entrega?.estado === 'a_caminho' ? entrega.atribuidoEm : null,
          entrega?.etaLojaMinutos ?? null,
          agora
        )
      : progressoDoTrecho(pedido.dispatchedAt, pedido.deliveryEtaMinutes, agora)

  const mostraNota =
    entrega?.nota != null &&
    (entrega.notaDeQuantas ?? 0) >= MINIMO_DE_CORRIDAS_PARA_NOTA

  return (
    <li className="rota__linha-item" style={{ '--ordem': String(ordem) } as CSSProperties}>
      {/*
        `article`, e não `button`.

        O cartão passou a ter duas ações, e **botão dentro de botão é HTML
        inválido**: o navegador desfaz o aninhamento, o teclado para de alcançar
        o de dentro e o clique dispara os dois. O envelope vira um elemento
        neutro e as ações ficam no rodapé, cada uma com o seu alvo.

        O corpo continua clicável — é a área grande, e a tela é usada com pressa
        —, e ele equivale a "Acompanhar", que é a pergunta desta tela. Como
        `div` com `onClick` seria invisível ao teclado, quem navega assim chega
        pelos dois botões do rodapé, que dizem exatamente o que fazem.
      */}
      <article
        className="rota__item"
        data-selecionado={selecionado || undefined}
        data-acompanhando={acompanhando || undefined}
      >
        <div className="rota__toque" onClick={aoAcompanhar} aria-hidden="true">
        {/*
          O avatar, com as iniciais por baixo e a foto por cima.
          
          As letras ficam desenhadas embaixo e reaparecem sozinhas quando a
          imagem não carrega — entregador sem foto cadastrada, ou a internet da
          loja ruim. Um `onError` faria o mesmo com um estado a mais para manter.
          
          Sem ninguém atribuído, o disco não finge um rosto: leva a lupa, que é
          literalmente o que está acontecendo.
        */}
        <span
          className="rota__avatar"
          data-tom={corrida?.tom}
          data-sem-entregador={entrega?.entregador ? undefined : true}
          aria-hidden="true"
        >
          {entrega?.entregador ? (
            <>
              {iniciais(entrega.entregador)}
              {entrega.fotoUrl && (
                <img src={entrega.fotoUrl} alt="" loading="lazy" decoding="async" />
              )}
            </>
          ) : (
            <Icone nome={corrida?.icone ?? 'moto'} tamanho={20} />
          )}

          {corrida && (
            <span className="rota__selo">
              <Icone nome={corrida.icone} tamanho={11} />
            </span>
          )}
        </span>

        <span className="rota__corpo">
          <span className="rota__linha">
            <strong className="num">{pedido.code ?? `#${pedido.id}`}</strong>
            <Selo tom={ORDER_STATUS_TONE[pedido.status as OrderStatus]}>
              {ORDER_STATUS_LABEL[pedido.status as OrderStatus]}
            </Selo>
          </span>

          {/*
            Quem está com o pedido, com a nota ao lado. A linha de baixo é o
            cliente — a ordem responde "quem traz" antes de "para quem", que é a
            ordem em que se pergunta nesta tela.
          */}
          <span className="rota__linha rota__linha--fraca">
            <span className="rota__quem">
              {entrega?.entregador ?? corrida?.rotulo ?? 'Sem corrida'}
              {mostraNota && (
                <span className="rota__nota num">
                  <Icone nome="estrela" tamanho={11} />
                  {entrega!.nota!.toFixed(1).replace('.', ',')}
                </span>
              )}
            </span>
            <span className="num">
              {aba === 'coleta' && entrega?.chegouLojaEm
                ? `balcão há ${decorrido(entrega.chegouLojaEm, agora)}`
                : `há ${decorrido(pedido.createdAt, agora)}`}
            </span>
          </span>

          <span className="rota__linha rota__linha--fraca">
            <span className="rota__cliente">
              {pedido.customerLabel ?? 'Cliente não informado'}
              {bairro && <span className="rota__bairro">{bairro}</span>}
            </span>
            <span className="num">
              {distancia === null ? 'sem local' : formatarDistancia(distancia)}
            </span>
          </span>

          {/*
            A barra responde "está chegando?" sem obrigar a ler o mapa. Só
            aparece quando há previsão — sem ela, inventaria o denominador.
          */}
          {progresso !== null && (
            <span className="rota__trecho" aria-hidden="true">
              <span style={{ width: `${progresso * 100}%` }} />
            </span>
          )}
        </span>
        </div>

        {/*
          As duas ações, e a hierarquia entre elas.

          "Acompanhar" é primária porque é a pergunta desta tela — onde está e
          quando chega. "Detalhes" abre o mesmo painel de sempre e continua
          sendo o caminho para decidir sobre o pedido.
        */}
        <div className="rota__acoes">
          <button type="button" className="rota__acao" onClick={aoAbrirDetalhe}>
            <Icone nome="lista" tamanho={14} />
            Detalhes do pedido
            <span className="ui-visualmente-oculto">
              {' '}
              {pedido.code ?? `#${pedido.id}`}
            </span>
          </button>

          <button
            type="button"
            className="rota__acao rota__acao--primaria"
            data-ativa={acompanhando || undefined}
            onClick={aoAcompanhar}
          >
            <Icone nome="mapa" tamanho={14} />
            {acompanhando ? 'Acompanhando' : 'Acompanhar'}
            <span className="ui-visualmente-oculto">
              {' '}
              a entrega {pedido.code ?? `#${pedido.id}`}
            </span>
          </button>
        </div>
      </article>
    </li>
  )
}
