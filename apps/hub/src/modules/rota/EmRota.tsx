import { Suspense, lazy, useMemo, useState } from 'react'
import { EstadoVazio, Faixa, Icone, PainelDeSecao, Selo } from '@matsuya/ui'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderStatus } from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { coordenadaValida, distanciaKm, formatarDistancia, type Coordenada } from '@matsuya/utils'
import { decorrido } from '../../app/formato'
import type { PontoDeEntrega } from './MapaDasEntregas'

/**
 * Acompanhamento das entregas.
 *
 * Lista à esquerda, mapa à direita. Responde a pergunta que o responsável faz
 * quando o telefone toca: "onde está o pedido do fulano?".
 *
 * **O mapa não mostra o entregador.** Não existe posição de entregador na API —
 * `courierLocation` é `null` fixo, marcado como Fase 3. Mostrar um pino
 * inventado seria pior do que não mostrar nada: alguém tomaria decisão em cima
 * dele.
 *
 * O mapa é carregado sob demanda. Leaflet e sua folha de estilo somam mais de
 * 40 kB, e o quadro — que abre a cada turno — não paga por isso.
 */

const Mapa = lazy(() => import('./MapaDasEntregas'))

const EM_ROTA: ReadonlyArray<OrderStatus> = [
  'awaiting_courier',
  'out_for_delivery',
  'delivery_failed',
  'customer_not_found',
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
  const [selecionado, definirSelecionado] = useState<number | null>(null)

  const coordDaLoja = useMemo(
    () => coordenadaValida(unidade.lat, unidade.lng),
    [unidade.lat, unidade.lng]
  )

  const linhas = useMemo<LinhaDaRota[]>(() => {
    return pedidos
      .filter((p) => EM_ROTA.includes(p.status))
      .map((pedido) => {
        const endereco = pedido.addressSnapshot as
          | { lat?: unknown; lng?: unknown; district?: string }
          | null

        const coordenada = endereco ? coordenadaValida(endereco.lat, endereco.lng) : null

        return {
          pedido,
          coordenada,
          distancia:
            coordenada && coordDaLoja ? distanciaKm(coordDaLoja, coordenada) : null,
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
  }, [pedidos, coordDaLoja])

  const pontos = useMemo<PontoDeEntrega[]>(
    () =>
      linhas
        .filter((l): l is LinhaDaRota & { coordenada: Coordenada } => l.coordenada !== null)
        .map((l) => ({
          id: l.pedido.id,
          codigo: l.pedido.code ?? `#${l.pedido.id}`,
          cliente: l.pedido.customerLabel,
          coordenada: l.coordenada,
          distanciaKm: l.distancia ?? 0,
          status: l.pedido.status,
        })),
    [linhas]
  )

  const semCoordenada = linhas.length - pontos.length

  return (
    <main className="rota">
      <div className="rota__lista">
        <PainelDeSecao titulo="Entregas a caminho" contagem={linhas.length}>
          {linhas.length === 0 ? (
            <EstadoVazio
              icone="moto"
              titulo="Nada na rua"
              descricao="Nenhum pedido despachado ou aguardando entregador."
            />
          ) : (
            <ul className="rota__itens">
              {linhas.map(({ pedido, distancia, bairro }) => (
                <li key={pedido.id}>
                  <button
                    type="button"
                    className="rota__item"
                    data-selecionado={selecionado === pedido.id || undefined}
                    onClick={() => {
                      definirSelecionado(pedido.id)
                      aoAbrirDetalhe(pedido)
                    }}
                  >
                    <span className="rota__linha">
                      <strong className="num">{pedido.code ?? `#${pedido.id}`}</strong>
                      <Selo tom={ORDER_STATUS_TONE[pedido.status]}>
                        {ORDER_STATUS_LABEL[pedido.status]}
                      </Selo>
                    </span>

                    <span className="rota__linha rota__linha--fraca">
                      <span>{pedido.customerLabel ?? 'Cliente não informado'}</span>
                      <span className="num">
                        {distancia === null ? 'sem local' : formatarDistancia(distancia)}
                      </span>
                    </span>

                    <span className="rota__linha rota__linha--fraca">
                      <span>{bairro ?? '—'}</span>
                      <span className="num">há {decorrido(pedido.createdAt, agora)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PainelDeSecao>
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
            aoSelecionar={definirSelecionado}
          />
        </Suspense>

        <p className="rota__nota">
          <Icone nome="alerta" tamanho={14} />
          O mapa mostra a loja e os destinos. A posição do entregador ainda não
          existe na API.
        </p>
      </div>
    </main>
  )
}
