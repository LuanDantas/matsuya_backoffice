/**
 * Geometria de coordenadas.
 *
 * Espelho de `src/utils/geo.ts` na API. As duas cópias existem porque o front
 * precisa ordenar entregas por distância sem uma ida ao servidor por linha, e a
 * API precisa da mesma conta no ranking de unidades — e uma distância que muda
 * conforme quem calcula é pior do que distância nenhuma.
 *
 * A fórmula é fixa e testada dos dois lados. Se um dia divergirem, é a lista de
 * entregas que passa a mentir sobre qual é a mais perto.
 */

export interface Coordenada {
  lat: number
  lng: number
}

const RAIO_DA_TERRA_KM = 6371

const emRadianos = (graus: number) => (graus * Math.PI) / 180

/**
 * Distância em linha reta entre dois pontos, em quilômetros.
 *
 * Great-circle, não distância de rota: mostrar "2,3 km" quando o trajeto real
 * tem 4 km é aceitável para ordenar entregas por proximidade, e calcular rota
 * exigiria um serviço externo por pedido.
 */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const dLat = emRadianos(b.lat - a.lat)
  const dLng = emRadianos(b.lng - a.lng)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(emRadianos(a.lat)) * Math.cos(emRadianos(b.lat)) * Math.sin(dLng / 2) ** 2

  return 2 * RAIO_DA_TERRA_KM * Math.asin(Math.sqrt(h))
}

/**
 * Coordenada utilizável, ou `null`.
 *
 * `0,0` é rejeitado de propósito: é o valor que sobra quando alguém inicializa
 * um campo numérico e esquece de preencher, e fica no golfo da Guiné. Um pino
 * na África no mapa de uma loja de São Paulo não é um erro que passe
 * despercebido — mas ordenar por distância a partir dele, sim.
 */
export function coordenadaValida(
  lat: unknown,
  lng: unknown
): Coordenada | null {
  // `Number(null)` é 0, e `Number('')` também. Sem esta guarda, um campo
  // ausente vira latitude zero e o pino cai no golfo da Guiné com ar de dado
  // legítimo — enquanto um `0` explícito, que é coordenada de verdade, precisa
  // continuar passando.
  if (lat === null || lat === undefined || lat === '') return null
  if (lng === null || lng === undefined || lng === '') return null

  const a = Number(lat)
  const b = Number(lng)

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a === 0 && b === 0) return null
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null

  return { lat: a, lng: b }
}

/** Distância legível: uma casa decimal abaixo de 10 km, inteiro acima. */
export function formatarDistancia(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`
  return `${Math.round(km)} km`
}
