import { useId, useMemo, useState } from 'react'
import type { PontoDoDia } from '@matsuya/api-client'
import {
  alinharPorDia,
  caminhoDaArea,
  caminhoDaLinha,
  coordenadas,
  escalaY,
  marcasY,
  type Medida,
} from './painel'

/**
 * A curva do mês — dois meses sobrepostos, um eixo, SVG à mão.
 *
 * ## Por que sem biblioteca
 *
 * `vite.config.ts` documenta que o teto de 400 kB do pacote existe justamente
 * para impedir que alguém acrescente uma biblioteca de gráficos sem perceber.
 * Uma área com duas séries e um fio de prumo são trinta linhas de caminho SVG;
 * a biblioteca mais leve do gênero é dez vezes o tamanho do resto desta tela.
 *
 * ## Por que uma medida de cada vez
 *
 * Pedidos e faturamento têm escalas incompatíveis. Plotar os dois no mesmo
 * gráfico exigiria dois eixos Y — e o alinhamento entre duas escalas é
 * arbitrário, então o desenho **inventa** uma correlação que não está no dado.
 * O alternador troca o que está plotado; o eixo continua sendo um só.
 *
 * ## Por que o mês anterior em cinza
 *
 * Não são duas séries de mesmo peso: o mês atual é o assunto, o anterior é a
 * régua. Duas cores de identidade fariam o olho comparar duas coisas de igual
 * importância; uma cor e um cinza dizem qual é qual antes de qualquer legenda.
 */

const LARGURA = 640
const ALTURA = 180
/** Espaço à direita para o rótulo do último ponto não sair do desenho. */
const MARGEM_DIREITA = 44
const MARGEM_TOPO = 8

const MEDIDAS: Array<{ chave: Medida; rotulo: string }> = [
  { chave: 'pedidos', rotulo: 'Pedidos' },
  { chave: 'faturado', rotulo: 'Faturamento' },
]

const dinheiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

const inteiro = new Intl.NumberFormat('pt-BR')

export function CurvaDoMes({
  porDia,
  porDiaMesAnterior,
}: {
  porDia: PontoDoDia[]
  porDiaMesAnterior: PontoDoDia[]
}) {
  const [medida, definirMedida] = useState<Medida>('pedidos')
  const [foco, definirFoco] = useState<number | null>(null)
  const idDoTitulo = useId()

  const dias = useMemo(
    () => alinharPorDia(porDia, porDiaMesAnterior, medida),
    [porDia, porDiaMesAnterior, medida]
  )

  const formatar = medida === 'faturado' ? dinheiro.format : inteiro.format

  const geometria = {
    largura: LARGURA - MARGEM_DIREITA,
    altura: ALTURA - MARGEM_TOPO,
  }

  const teto = escalaY(
    Math.max(0, ...dias.map((d) => Math.max(d.atual, d.anterior ?? 0)))
  )

  const serieAtual = dias.map((d) => d.atual)
  const serieAnterior = dias.map((d) => d.anterior)

  const pontosAtual = coordenadas(serieAtual, teto, geometria)
  const ultimo = pontosAtual[pontosAtual.length - 1]

  if (dias.length === 0) {
    return (
      <div className="curva">
        <Alternador medida={medida} aoTrocar={definirMedida} />
        <p className="curva__vazio">
          Nenhum pedido concluído neste mês ainda. A curva aparece com o primeiro.
        </p>
      </div>
    )
  }

  const diaEmFoco = foco === null ? null : dias[foco]

  return (
    <div className="curva">
      <Alternador medida={medida} aoTrocar={definirMedida} />

      {/*
        Legenda em traço, não em quadrado: o quadrado é tinta com peso de dado
        fazendo o trabalho de um rótulo. E o texto nunca veste a cor da série —
        quem carrega identidade é a marca colorida ao lado dele.
      */}
      <p className="curva__legenda">
        <span className="curva__chave" data-serie="atual" aria-hidden="true" />
        Este mês
        <span className="curva__chave" data-serie="anterior" aria-hidden="true" />
        Mesmo período do mês anterior
      </p>

      <div className="curva__caixa">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          className="curva__desenho"
          role="img"
          aria-labelledby={idDoTitulo}
          preserveAspectRatio="none"
        >
          <title id={idDoTitulo}>
            {medida === 'pedidos' ? 'Pedidos' : 'Faturamento'} por dia do mês,
            comparado ao mesmo período do mês anterior. Os valores de cada dia estão
            na tabela abaixo.
          </title>

          {/* Grade em linha de cabelo sólida — nunca tracejada, que compete com o dado. */}
          {marcasY(teto).map((valor) => {
            const y = MARGEM_TOPO + geometria.altura - (valor / teto) * geometria.altura
            return (
              <line
                key={valor}
                className="curva__grade"
                x1={0}
                x2={LARGURA}
                y1={y}
                y2={y}
              />
            )
          })}

          <g transform={`translate(0 ${MARGEM_TOPO})`}>
            {/* O mês anterior primeiro, para o traço do mês atual passar por cima. */}
            <path
              className="curva__linha"
              data-serie="anterior"
              d={caminhoDaLinha(serieAnterior, teto, geometria)}
            />

            <path
              className="curva__area"
              d={caminhoDaArea(serieAtual, teto, geometria)}
            />
            <path
              className="curva__linha"
              data-serie="atual"
              d={caminhoDaLinha(serieAtual, teto, geometria)}
            />

            {ultimo && (
              <circle
                className="curva__ponta"
                cx={ultimo[0]}
                cy={ultimo[1]}
                r={4}
              />
            )}

            {diaEmFoco && (
              <line
                className="curva__prumo"
                x1={pontosAtual[foco!]?.[0] ?? 0}
                x2={pontosAtual[foco!]?.[0] ?? 0}
                y1={0}
                y2={geometria.altura}
              />
            )}
          </g>
        </svg>

        {/*
          A área de toque é uma faixa por dia, e não o ponto de 8px: mirar num
          ponto desse tamanho é precisão que ninguém acerta. Botão de verdade
          para o teclado chegar nos mesmos valores que o ponteiro.
        */}
        <div className="curva__alvos">
          {dias.map((d, i) => (
            <button
              key={d.dia}
              type="button"
              className="curva__alvo"
              aria-label={`Dia ${d.dia}: ${formatar(d.atual)} este mês${
                d.anterior === null ? '' : `, ${formatar(d.anterior)} no mês anterior`
              }`}
              onMouseEnter={() => definirFoco(i)}
              onMouseLeave={() => definirFoco(null)}
              onFocus={() => definirFoco(i)}
              onBlur={() => definirFoco(null)}
            />
          ))}
        </div>

        {diaEmFoco && (
          <div className="curva__balao" role="status">
            <strong>Dia {diaEmFoco.dia}</strong>
            <span>
              <span className="curva__chave" data-serie="atual" aria-hidden="true" />
              <b className="num">{formatar(diaEmFoco.atual)}</b> este mês
            </span>
            {diaEmFoco.anterior !== null && (
              <span>
                <span className="curva__chave" data-serie="anterior" aria-hidden="true" />
                <b className="num">{formatar(diaEmFoco.anterior)}</b> mês anterior
              </span>
            )}
          </div>
        )}
      </div>

      <p className="curva__eixo">
        <span className="num">dia 1</span>
        <span className="num">
          teto {formatar(teto)}
        </span>
        <span className="num">dia {dias[dias.length - 1]!.dia}</span>
      </p>

      {/*
        A tabela não é acessório: o balão **enriquece**, nunca é a única porta
        para o número. Quem não usa ponteiro, quem imprime e quem confere valor
        a valor chegam aqui.
      */}
      <details className="curva__tabela">
        <summary>Ver os valores dia a dia</summary>
        <table>
          <caption className="ui-visualmente-oculto">
            {medida === 'pedidos' ? 'Pedidos' : 'Faturamento'} por dia do mês
          </caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Este mês</th>
              <th scope="col">Mês anterior</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.dia}>
                <th scope="row" className="num">
                  {d.dia}
                </th>
                <td className="num">{formatar(d.atual)}</td>
                <td className="num">{d.anterior === null ? '—' : formatar(d.anterior)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function Alternador({
  medida,
  aoTrocar,
}: {
  medida: Medida
  aoTrocar: (m: Medida) => void
}) {
  return (
    <div className="curva__medidas" role="group" aria-label="O que a curva mostra">
      {MEDIDAS.map((m) => (
        <button
          key={m.chave}
          type="button"
          className="chip"
          aria-pressed={medida === m.chave}
          onClick={() => aoTrocar(m.chave)}
        >
          {m.rotulo}
        </button>
      ))}
    </div>
  )
}
