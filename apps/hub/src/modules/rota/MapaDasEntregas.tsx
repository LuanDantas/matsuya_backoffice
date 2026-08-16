import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Coordenada } from '@matsuya/utils'
import { formatarDistancia } from '@matsuya/utils'

/**
 * O mapa das entregas.
 *
 * Este arquivo é carregado sob demanda (`React.lazy` em `EmRota.tsx`). O
 * Leaflet e sua folha de estilo somam mais de 40 kB, e o quadro de pedidos —
 * que é o que abre a cada turno — não pode pagar por um mapa que ele não usa.
 *
 * **Não há entregador aqui, e não é omissão.** A API não guarda posição de
 * entregador; `courierLocation` é `null` fixo no código, marcado como Fase 3.
 * O mapa mostra de onde a comida sai e para onde ela vai — que é o que dá para
 * saber com verdade.
 */

export interface PontoDeEntrega {
  id: number
  codigo: string
  cliente: string | null
  coordenada: Coordenada
  distanciaKm: number
  status: string
}

/**
 * Marcadores desenhados como `divIcon`, não como imagem.
 *
 * O Leaflet aponta seus ícones padrão para arquivos PNG resolvidos por URL
 * relativa — que quebram em build com hash, e são a causa mais comum de
 * "marcador não aparece" com bundler. HTML inline não tem esse problema, herda
 * as cores do tema e escala sem borrar.
 */
const marcador = (cor: string, texto: string) =>
  L.divIcon({
    className: 'mapa__pino',
    html: `<span style="--pino:${cor}">${texto}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  })

/** Enquadra tudo o que existe, com folga para o pino não colar na borda. */
function Enquadrar({ pontos }: { pontos: Coordenada[] }) {
  const mapa = useMap()

  useEffect(() => {
    if (pontos.length === 0) return

    if (pontos.length === 1) {
      mapa.setView([pontos[0]!.lat, pontos[0]!.lng], 15)
      return
    }

    mapa.fitBounds(
      L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [40, 40], maxZoom: 16 }
    )
  }, [mapa, pontos])

  return null
}

export default function MapaDasEntregas({
  unidade,
  nomeDaUnidade,
  pontos,
  aoSelecionar,
}: {
  unidade: Coordenada | null
  nomeDaUnidade: string
  pontos: PontoDeEntrega[]
  aoSelecionar: (id: number) => void
}) {
  const todos = useMemo(
    () => [...(unidade ? [unidade] : []), ...pontos.map((p) => p.coordenada)],
    [unidade, pontos]
  )

  // Sem nenhuma coordenada não há mapa a desenhar — e um mapa do oceano com
  // zoom mundial é pior do que uma explicação.
  if (todos.length === 0) {
    return (
      <div className="mapa mapa--sem-dados">
        <p>
          Nenhum destino tem coordenada cadastrada. O mapa aparece quando os
          endereços forem geocodificados.
        </p>
      </div>
    )
  }

  const centro = unidade ?? pontos[0]!.coordenada

  return (
    <MapContainer
      className="mapa"
      center={[centro.lat, centro.lng]}
      zoom={13}
      scrollWheelZoom
      // Teclado: sem isto o mapa é uma área morta para quem navega por Tab.
      keyboard
    >
      <TileLayer
        // Atribuição é exigência da licença do OpenStreetMap, não enfeite.
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <Enquadrar pontos={todos} />

      {unidade && (
        <Marker position={[unidade.lat, unidade.lng]} icon={marcador('var(--marca)', '★')}>
          <Popup>{nomeDaUnidade}</Popup>
        </Marker>
      )}

      {pontos.map((ponto) => (
        <Marker
          key={ponto.id}
          position={[ponto.coordenada.lat, ponto.coordenada.lng]}
          icon={marcador('var(--info)', '')}
          eventHandlers={{ click: () => aoSelecionar(ponto.id) }}
        >
          <Popup>
            <strong>{ponto.codigo}</strong>
            {ponto.cliente && <> · {ponto.cliente}</>}
            <br />
            {formatarDistancia(ponto.distanciaKm)} da loja
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
