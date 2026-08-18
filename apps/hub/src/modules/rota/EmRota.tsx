import { Suspense, lazy, useMemo, useState, type CSSProperties } from 'react'
import { EstadoVazio, Faixa, Icone, Selo, type NomeDoIcone } from '@matsuya/ui'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderStatus } from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { coordenadaValida, distanciaKm, formatarDistancia, type Coordenada } from '@matsuya/utils'
import { decorrido } from '../../app/formato'
import {
  POSICAO_VELHA_MINUTOS,
  idadeDaPosicao,
  partirPorAba,
  progressoDoTrecho,
  type Aba,
} from './rota'
import type { PontoDeEntrega } from './MapaDasEntregas'

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
}

interface LinhaDaRota {
  pedido: PedidoDoQuadro
  coordenada: Coordenada | null
  distancia: number | null
  bairro: string | null
}

export function EmRota({ pedidos, unidade, agora, aoAbrirDetalhe }: Props) {
  const [aba, definirAba] = useState<Aba>('coleta')
  const [selecionado, definirSelecionado] = useState<number | null>(null)

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
                aoClicar={() => {
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
            aoSelecionar={definirSelecionado}
          />
        </Suspense>
      </div>
    </main>
  )
}

function Linha({
  pedido,
  distancia,
  bairro,
  aba,
  agora,
  ordem,
  selecionado,
  aoClicar,
}: {
  pedido: PedidoDoQuadro
  distancia: number | null
  bairro: string | null
  aba: Aba
  agora: number
  ordem: number
  selecionado: boolean
  aoClicar: () => void
}) {
  const entrega = pedido.entrega ?? null

  /*
   * O que a corrida já sabe, e que esta tela nunca mostrou.
   *
   * Nome do entregador, minutos até a loja e hora de chegada vêm na resposta
   * desde sempre, já tipados — e a linha exibia só status, cliente e bairro. Na
   * coleta é justamente isso que se quer saber: quem vem, e há quanto tempo
   * está parado no balcão.
   */
  const progresso =
    aba === 'coleta'
      ? progressoDoTrecho(
          entrega?.estado === 'a_caminho' ? pedido.acceptedAt : null,
          entrega?.etaLojaMinutos ?? null,
          agora
        )
      : null

  return (
    <li className="rota__linha-item" style={{ '--ordem': String(ordem) } as CSSProperties}>
      <button
        type="button"
        className="rota__item"
        data-selecionado={selecionado || undefined}
        onClick={aoClicar}
      >
        <span className="rota__linha">
          <strong className="num">{pedido.code ?? `#${pedido.id}`}</strong>
          <Selo tom={ORDER_STATUS_TONE[pedido.status as OrderStatus]}>
            {ORDER_STATUS_LABEL[pedido.status as OrderStatus]}
          </Selo>
        </span>

        <span className="rota__linha rota__linha--fraca">
          <span>{pedido.customerLabel ?? 'Cliente não informado'}</span>
          <span className="num">
            {distancia === null ? 'sem local' : formatarDistancia(distancia)}
          </span>
        </span>

        <span className="rota__linha rota__linha--fraca">
          <span className="rota__quem">
            {entrega?.entregador ? (
              <>
                <Icone nome="capacete" tamanho={12} />
                {entrega.entregador}
              </>
            ) : (
              (bairro ?? '—')
            )}
          </span>
          <span className="num">
            {aba === 'coleta' && entrega?.chegouLojaEm
              ? `no balcão há ${decorrido(entrega.chegouLojaEm, agora)}`
              : `há ${decorrido(pedido.createdAt, agora)}`}
          </span>
        </span>

        {/*
          A barra responde "está chegando?" sem obrigar a ler o mapa. Só existe
          quando há previsão: sem ETA informado, uma barra teria de inventar o
          denominador.
        */}
        {progresso !== null && (
          <span className="rota__trecho" aria-hidden="true">
            <span style={{ width: `${progresso * 100}%` }} />
          </span>
        )}
      </button>
    </li>
  )
}
