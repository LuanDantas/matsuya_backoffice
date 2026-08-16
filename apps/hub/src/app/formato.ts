/**
 * Formatação pt-BR.
 *
 * Os formatadores do `Intl` são instanciados uma vez e reaproveitados: criar um
 * `Intl.NumberFormat` por célula renderizada é caro, e num quadro que redesenha
 * a cada segundo isso aparece como travamento.
 */

export const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export const horario = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Tempo decorrido em m:ss, ou h:mm:ss depois de uma hora.
 *
 * Calculado contra o `agora` recebido — que é o relógio do **servidor**, medido
 * pelo heartbeat. O relógio de um tablet de loja erra por minutos, e um
 * cronômetro de SLA errado é pior do que nenhum: faz o operador confiar num
 * número falso.
 */
export function decorrido(desde: string, agora: number): string {
  const segundos = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000))
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60

  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Quanto falta até um instante futuro, em m:ss.
 *
 * Par do `decorrido`: um conta para frente, o outro para trás. Ter os dois
 * evita a conta invertida no meio de um JSX, que é onde ela sai errada e
 * ninguém nota — porque um cronômetro errado ainda parece um cronômetro.
 */
export function restante(ate: string, agora: number): string {
  const segundos = Math.max(0, Math.floor((new Date(ate).getTime() - agora) / 1000))
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
