import type { PainelDaUnidade, PontoDoDia } from '@matsuya/api-client'

/**
 * As contas da home, fora do componente.
 *
 * Tudo aqui é função pura sobre número — escala, caminho de SVG, variação
 * percentual. Dentro do componente isso vira código que só se confere abrindo
 * o navegador; aqui se confere com teste, que é o que o Hub tem no lugar de
 * QA visual.
 */

/** Uma das duas medidas que a curva sabe desenhar. */
export type Medida = 'pedidos' | 'faturado'

export interface Variacao {
  /** Diferença absoluta. Positiva, negativa ou zero. */
  delta: number
  /** Fração da base. `null` quando não há base para comparar. */
  fracao: number | null
  sentido: 'alta' | 'baixa' | 'igual'
}

/**
 * A comparação contra o mesmo período do mês anterior.
 *
 * Com base zero a fração é `null`, e não infinito nem 100%: sair de zero para
 * qualquer coisa é um aumento sem porcentagem definida. "+∞%" e "+100%" são as
 * duas formas comuns de mentir sobre isso — a primeira é ruído, a segunda diz
 * que dobrou.
 */
export function variacao(atual: number, anterior: number): Variacao {
  const delta = atual - anterior
  return {
    delta,
    fracao: anterior === 0 ? null : delta / anterior,
    sentido: delta > 0 ? 'alta' : delta < 0 ? 'baixa' : 'igual',
  }
}

/**
 * Junta as duas séries num eixo só, dia a dia.
 *
 * A API devolve **só os dias com pedido**. Ligar ponto 3 direto no ponto 7
 * desenharia uma reta subindo por dias que não existiram: a curva mentiria
 * sobre quatro dias parados. Aqui as lacunas viram zero, e o traço desce até a
 * base como deve.
 *
 * O eixo vai até o maior dia visto nas duas séries — nunca até 31. Numa loja
 * no dia 6, um eixo de 31 dias é 80% de espaço vazio à direita, e a curva do
 * mês vira um risco no canto.
 */
export interface DiaDaCurva {
  dia: number
  atual: number
  /** O mesmo dia do mês anterior. `null` depois do fim daquele recorte. */
  anterior: number | null
}

export function alinharPorDia(
  atual: PontoDoDia[],
  anterior: PontoDoDia[],
  medida: Medida
): DiaDaCurva[] {
  const porDia = (serie: PontoDoDia[]) =>
    new Map(serie.map((p) => [p.dia, p[medida]]))

  const a = porDia(atual)
  const b = porDia(anterior)

  const ultimoDia = Math.max(0, ...a.keys(), ...b.keys())
  if (ultimoDia === 0) return []

  // O recorte anterior para no dia de hoje. Depois dele não há "mesmo período"
  // para comparar, e continuar a linha cinza em zero afirmaria que a loja não
  // vendeu — quando o que houve é que aquele dia ainda não chegou.
  const ultimoDiaAnterior = Math.max(0, ...b.keys())

  const dias: DiaDaCurva[] = []
  for (let dia = 1; dia <= ultimoDia; dia += 1) {
    dias.push({
      dia,
      atual: a.get(dia) ?? 0,
      anterior: dia <= ultimoDiaAnterior ? (b.get(dia) ?? 0) : null,
    })
  }
  return dias
}

/**
 * O teto do eixo, arredondado para um número que se lê.
 *
 * Um eixo que termina em 87 obriga a decodificar cada marca. Subir para 100
 * custa um pouco de altura de traço e devolve marcas de 0/50/100 — que é o que
 * o eixo existe para dar.
 */
export function escalaY(maximo: number): number {
  if (maximo <= 0) return 1

  const grandeza = 10 ** Math.floor(Math.log10(maximo))
  for (const passo of [1, 2, 2.5, 5, 10]) {
    const teto = passo * grandeza
    if (teto >= maximo) return teto
  }
  return 10 * grandeza
}

/** As marcas do eixo: base, meio e teto. Três bastam e não amontoam. */
export function marcasY(teto: number): number[] {
  return [0, teto / 2, teto]
}

export interface Geometria {
  largura: number
  altura: number
}

/**
 * O caminho da linha, em coordenadas de viewBox.
 *
 * Reta entre pontos, e não curva suavizada: uma spline inventa valores entre
 * dois dias que ninguém mediu, e num gráfico de operação isso é dado falso com
 * aparência de precisão.
 */
export function caminhoDaLinha(
  valores: Array<number | null>,
  teto: number,
  { largura, altura }: Geometria
): string {
  const pontos = coordenadas(valores, teto, { largura, altura })
  if (pontos.length === 0) return ''

  return pontos
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${arred(x)} ${arred(y)}`)
    .join(' ')
}

/** O mesmo caminho, fechado na base — o preenchimento de ~10% embaixo da linha. */
export function caminhoDaArea(
  valores: Array<number | null>,
  teto: number,
  { largura, altura }: Geometria
): string {
  const pontos = coordenadas(valores, teto, { largura, altura })
  if (pontos.length === 0) return ''

  const primeiro = pontos[0]!
  const ultimo = pontos[pontos.length - 1]!

  return (
    caminhoDaLinha(valores, teto, { largura, altura }) +
    ` L${arred(ultimo[0])} ${altura} L${arred(primeiro[0])} ${altura} Z`
  )
}

/**
 * A posição de cada dia no eixo horizontal.
 *
 * Exportada porque o fio de prumo e a área de toque precisam das mesmas
 * coordenadas do traço — calcular duas vezes é como as duas coisas param de se
 * alinhar depois de um ajuste de margem.
 */
export function coordenadas(
  valores: Array<number | null>,
  teto: number,
  { largura, altura }: Geometria
): Array<[number, number]> {
  const validos = valores
    .map((v, i) => [i, v] as const)
    .filter((par): par is readonly [number, number] => par[1] !== null)

  if (validos.length === 0) return []

  // Um ponto só fica no meio: numa série de um dia, colar no canto esquerdo
  // deixa o traço em cima do eixo Y e parecendo erro de desenho.
  const passo = valores.length > 1 ? largura / (valores.length - 1) : 0
  const meio = valores.length > 1 ? 0 : largura / 2

  return validos.map(([i, v]) => [meio + i * passo, altura - (v / teto) * altura])
}

const arred = (n: number) => Math.round(n * 100) / 100

// ── Várias lojas numa tela só ────────────────────────────────────────────

export interface PainelDeLoja {
  unidade: number
  nome: string
  painel: PainelDaUnidade
}

/**
 * Junta os painéis das lojas selecionadas num só.
 *
 * ## As duas médias, que é onde isto dá errado
 *
 * **Ticket médio e nota média não se somam nem se tiram a média das médias.**
 * Uma loja com 150 pedidos a R$ 90 e outra com 5 pedidos a R$ 200 têm média
 * das médias R$ 145 — e ticket real R$ 93,55. A média das médias trata as duas
 * lojas como se tivessem o mesmo peso, e a diferença cresce justamente quando
 * as lojas são desiguais, que é sempre.
 *
 * Ticket sai da divisão dos totais. Nota sai da ponderação pela quantidade de
 * notas de cada loja.
 *
 * **Uma imprecisão conhecida, e pequena:** a API já devolve a média de cada
 * loja arredondada em uma casa, então a ponderação carrega esse arredondamento.
 * O erro fica abaixo de 0,05 de estrela. Corrigir exigiria a soma bruta das
 * notas na resposta, e não vale a mudança de contrato por meia casa decimal.
 *
 * ## O resto
 *
 * Contagem e dinheiro somam. `maisAntigoEm` é o menor instante — o pedido que
 * espera há mais tempo em qualquer uma das lojas. A curva soma dia a dia, e os
 * comentários são reunidos e reordenados por data, ficando os três mais
 * recentes do conjunto — não três de cada loja.
 */
export function agregarPaineis(lojas: PainelDeLoja[]): PainelDaUnidade {
  const paineis = lojas.map((l) => l.painel)

  const soma = (f: (p: PainelDaUnidade) => number) =>
    paineis.reduce((total, p) => total + f(p), 0)

  const pedidos = soma((p) => p.mes.atual)
  const pedidosAnterior = soma((p) => p.mes.mesmoPeriodoMesAnterior)
  const faturado = arredondar(soma((p) => p.mes.faturado))
  const faturadoAnterior = arredondar(soma((p) => p.mes.faturadoMesmoPeriodoMesAnterior))

  const instantes = paineis
    .map((p) => p.operacao.maisAntigoEm)
    .filter((i): i is string => i !== null)

  const notas = soma((p) => p.avaliacoes.total)
  const somaDasNotas = paineis.reduce(
    (total, p) => total + (p.avaliacoes.media ?? 0) * p.avaliacoes.total,
    0
  )

  return {
    operacao: {
      emAberto: soma((p) => p.operacao.emAberto),
      atrasados: soma((p) => p.operacao.atrasados),
      maisAntigoEm:
        instantes.length === 0
          ? null
          : instantes.reduce((a, b) => (new Date(a) <= new Date(b) ? a : b)),
    },
    mes: {
      atual: pedidos,
      mesmoPeriodoMesAnterior: pedidosAnterior,
      faturado,
      faturadoMesmoPeriodoMesAnterior: faturadoAnterior,
      ticketMedio: pedidos === 0 ? null : arredondar(faturado / pedidos),
      ticketMedioMesmoPeriodoMesAnterior:
        pedidosAnterior === 0 ? null : arredondar(faturadoAnterior / pedidosAnterior),
      porDia: somarPorDia(paineis.map((p) => p.mes.porDia)),
      porDiaMesAnterior: somarPorDia(paineis.map((p) => p.mes.porDiaMesAnterior)),
    },
    avaliacoes: {
      media: notas === 0 ? null : Math.round((somaDasNotas / notas) * 10) / 10,
      total: notas,
      comentarios: paineis
        .flatMap((p) => p.avaliacoes.comentarios)
        .sort((a, b) => new Date(b.em).getTime() - new Date(a.em).getTime())
        .slice(0, 3),
    },
    catalogo: {
      pausados: soma((p) => p.catalogo.pausados),
      total: soma((p) => p.catalogo.total),
    },
  }
}

function somarPorDia(series: PontoDoDia[][]): PontoDoDia[] {
  const total = new Map<number, PontoDoDia>()

  for (const serie of series) {
    for (const ponto of serie) {
      const atual = total.get(ponto.dia)
      if (atual) {
        atual.pedidos += ponto.pedidos
        atual.faturado += ponto.faturado
      } else {
        total.set(ponto.dia, { ...ponto })
      }
    }
  }

  return [...total.values()]
    .map((p) => ({ ...p, faturado: arredondar(p.faturado) }))
    .sort((a, b) => a.dia - b.dia)
}

/** Centavos somam exato; reais somados em ponto flutuante, não. */
const arredondar = (n: number) => Math.round(n * 100) / 100

export type ColunaDeLoja = 'nome' | 'emAberto' | 'atrasados' | 'pedidos' | 'faturado'

/**
 * Ordena a quebra por loja.
 *
 * Número desce por padrão (quem tem mais aparece primeiro — é o que se procura
 * numa tabela de operação) e nome sobe. Inverter isso faria a primeira toca na
 * coluna "atrasados" mostrar as lojas sem nenhum.
 */
export function ordenarLojas(
  lojas: PainelDeLoja[],
  coluna: ColunaDeLoja,
  invertido: boolean
): PainelDeLoja[] {
  const valor = (l: PainelDeLoja): number => {
    switch (coluna) {
      case 'emAberto':
        return l.painel.operacao.emAberto
      case 'atrasados':
        return l.painel.operacao.atrasados
      case 'pedidos':
        return l.painel.mes.atual
      case 'faturado':
        return l.painel.mes.faturado
      default:
        return 0
    }
  }

  const ordenadas = [...lojas].sort((a, b) =>
    coluna === 'nome'
      ? a.nome.localeCompare(b.nome, 'pt-BR')
      : valor(b) - valor(a) || a.nome.localeCompare(b.nome, 'pt-BR')
  )

  return invertido ? ordenadas.reverse() : ordenadas
}

// ── A saudação ───────────────────────────────────────────────────────────

/**
 * Bom dia, boa tarde ou boa noite — pelo relógio de quem está olhando.
 *
 * Usa o relógio do **navegador**, e não o do servidor. É a exceção à regra que
 * vale no quadro: lá o cronômetro precisa do relógio do servidor porque um
 * tablet com a hora errada mostraria um SLA falso. Aqui a frase fala da pessoa
 * que está lendo, e a hora dela é a que importa — "boa noite" às três da tarde
 * porque o servidor está em outro fuso seria o erro oposto.
 *
 * Os cortes são os de uso corrente em pt-BR: madrugada conta como noite, e a
 * tarde começa ao meio-dia, não às 13h.
 */
export function saudacao(agora: number): string {
  const hora = new Date(agora).getHours()
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * O primeiro nome, para a saudação.
 *
 * "Olá, Luan Dantas" é como um formulário se dirige a alguém; "Olá, Luan" é
 * como uma pessoa se dirige. A tela é aberta pelo responsável da loja todo dia,
 * e o nome completo no cumprimento diário soa como cadastro.
 *
 * Cai para o nome inteiro quando não há espaço para cortar, e devolve vazio
 * quando não há nome — quem chama decide o que fazer com isso, porque uma
 * saudação sem nome ("Olá, ") é pior do que saudação nenhuma.
 */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}
