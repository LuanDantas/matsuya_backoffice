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

  /*
   * Acima de um dia, a unidade vira dia.
   *
   * "1320h" é aritmeticamente correto e ilegível: ninguém converte isso para
   * "quase dois meses" de relance. O caso apareceu no bloco "o mais antigo" da
   * home, com um pedido em aberto havia 55 dias — mas vale em qualquer lugar,
   * porque o problema é a unidade, não a tela.
   *
   * O resto em horas some depois de uma semana: em "12d", as horas seriam
   * precisão sobre um número que já perdeu a precisão como decisão.
   */
  if (h >= 24) {
    const d = Math.floor(h / 24)
    const resto = h % 24
    return d >= 7 || resto === 0 ? `${d}d` : `${d}d${resto}h`
  }

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

/**
 * Iniciais de um nome, para o avatar.
 *
 * Primeira letra do primeiro e do último nome. Duas letras que pertencem a esta
 * pessoa dizem mais do que uma silhueta genérica — e elas ficam desenhadas por
 * baixo da foto, reaparecendo sozinhas quando a imagem não carrega.
 */
/**
 * Uma cor estável para o avatar de quem não tem foto.
 *
 * Derivada do nome, então a mesma pessoa tem sempre o mesmo tom — e quem opera
 * todo dia passa a achar a conversa pela cor antes de ler o nome. Sorteio faria
 * o disco mudar de cor a cada render, que é o oposto de útil.
 *
 * **A cor nunca identifica sozinha.** O nome está sempre ao lado e as iniciais
 * dentro do disco; ela é um reforço, não o sinal.
 *
 * **Luminosidade 30%, e não os 38% de `corDaLoja`.** Aquela função serve a um
 * disco com um *ícone* dentro, e ícone é elemento gráfico: a régua é 3:1. Aqui
 * dentro vão **letras**, que são texto e exigem 4,5:1 — e a 38% a matiz
 * amarela dá 3,50:1 com branco por cima, reprovando. Medido nas 360 matizes:
 * a 30% o pior caso é 5,27:1.
 */
export function corDoNome(nome: string): string {
  let soma = 0
  for (let i = 0; i < nome.length; i += 1) soma = (soma + nome.charCodeAt(i)) % 360
  return `hsl(${soma} 45% 30%)`
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]![0]!
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : ''
  return (primeira + ultima).toUpperCase()
}
