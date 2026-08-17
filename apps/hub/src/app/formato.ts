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
 * Duração em `Xmin`, ou `XhYYmin` depois de uma hora.
 *
 * **Sem segundos, e é a decisão que importa aqui.** O `m:ss` de antes obrigava
 * a interpretar: "1:05" é uma hora e cinco, ou um minuto e cinco segundos? Num
 * cartão que também mostra horários, a leitura errada é a natural. E os
 * segundos correndo faziam a coluna inteira redesenhar texto a cada tique,
 * chamando atenção sessenta vezes por minuto para uma mudança que não muda
 * nenhuma decisão.
 *
 * Arredonda para cima: faltando 30 s, "1min" é o que o operador tem de fato.
 * Dizer "0min" enquanto ainda há tempo faria o cartão mentir por meio minuto.
 */
function duracao(segundos: number): string {
  const minutos = Math.ceil(Math.max(0, segundos) / 60)
  if (minutos < 60) return `${minutos}min`

  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}min`
}

/**
 * Tempo decorrido desde um instante.
 *
 * Calculado contra o `agora` recebido — que é o relógio do **servidor**, medido
 * pelo heartbeat. O relógio de um tablet de loja erra por minutos, e um
 * cronômetro de SLA errado é pior do que nenhum: faz o operador confiar num
 * número falso.
 */
export function decorrido(desde: string, agora: number): string {
  return duracao(Math.floor((agora - new Date(desde).getTime()) / 1000))
}

/**
 * Quanto falta até um instante futuro.
 *
 * Par do `decorrido`: um conta para frente, o outro para trás. Ter os dois
 * evita a conta invertida no meio de um JSX, que é onde ela sai errada e
 * ninguém nota — porque um cronômetro errado ainda parece um cronômetro.
 */
export function restante(ate: string, agora: number): string {
  return duracao(Math.floor((new Date(ate).getTime() - agora) / 1000))
}
