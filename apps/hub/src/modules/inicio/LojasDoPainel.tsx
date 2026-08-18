import { useState, type CSSProperties } from 'react'
import { Icone } from '@matsuya/ui'
import { ordenarLojas, type ColunaDeLoja, type PainelDeLoja } from './painel'
import { corDaLoja, nomeDaLoja } from '../../app/loja'

/**
 * A quebra por loja, quando há mais de uma selecionada.
 *
 * O agregado responde "como vai a operação"; esta tabela responde a pergunta
 * seguinte, que é inevitável: **qual loja está puxando o resultado**. Um total
 * sozinho esconde a loja que caiu pela metade enquanto as outras cobriram a
 * queda — e é justamente essa que precisa de alguém.
 *
 * Tabela, e não cartões. São cinco números por loja, todos comparáveis entre
 * si: comparar coluna a coluna é o que uma tabela faz melhor que qualquer
 * outra forma, e é por isso que ela ganha de um gráfico aqui. Nove lojas em
 * nove cores seria uma paleta impossível de distinguir — e o próprio catálogo
 * de antipadrões chama isso pelo nome.
 */

const dinheiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

const inteiro = new Intl.NumberFormat('pt-BR')

const COLUNAS: Array<{ chave: ColunaDeLoja; rotulo: string; numero: boolean }> = [
  { chave: 'nome', rotulo: 'Loja', numero: false },
  { chave: 'emAberto', rotulo: 'Em aberto', numero: true },
  { chave: 'atrasados', rotulo: 'Atrasados', numero: true },
  { chave: 'pedidos', rotulo: 'Pedidos no mês', numero: true },
  { chave: 'faturado', rotulo: 'Faturado', numero: true },
]

export function LojasDoPainel({ lojas }: { lojas: PainelDeLoja[] }) {
  // Faturado primeiro: é a coluna que responde "quem está puxando", que é a
  // razão de a tabela existir.
  const [coluna, definirColuna] = useState<ColunaDeLoja>('faturado')
  const [invertido, definirInvertido] = useState(false)

  const ordenadas = ordenarLojas(lojas, coluna, invertido)

  /*
   * O maior faturamento da seleção, para a barra de participação.
   *
   * A barra é o que transforma cinco colunas de números numa tabela que se
   * varre: dá para ver de relance quem responde por metade do resultado sem
   * ler valor nenhum. Escala pelo maior, e não pelo total — é a comparação
   * entre lojas que interessa aqui, e contra o total todas as barras de uma
   * rede de nove lojas ficariam curtas demais para comparar.
   */
  const maiorFaturado = Math.max(1, ...lojas.map((l) => l.painel.mes.faturado))

  const totais = lojas.reduce(
    (t, l) => ({
      emAberto: t.emAberto + l.painel.operacao.emAberto,
      atrasados: t.atrasados + l.painel.operacao.atrasados,
      pedidos: t.pedidos + l.painel.mes.atual,
      faturado: t.faturado + l.painel.mes.faturado,
    }),
    { emAberto: 0, atrasados: 0, pedidos: 0, faturado: 0 }
  )

  function ordenarPor(nova: ColunaDeLoja) {
    if (nova === coluna) definirInvertido((v) => !v)
    else {
      definirColuna(nova)
      definirInvertido(false)
    }
  }

  return (
    <section className="cartao-d lojas" style={{ '--ordem': '6' } as CSSProperties}>
      <h2 className="cartao-d__cabecalho">
        <span className="cartao-d__disco" aria-hidden="true">
          <Icone nome="loja" tamanho={16} />
        </span>
        Por loja
        <span className="lojas__contagem">{lojas.length}</span>
      </h2>

      <div className="lojas__rolagem">
        <table className="lojas__tabela">
          <caption className="ui-visualmente-oculto">
            Números de cada loja selecionada. Toque no título de uma coluna para
            ordenar por ela.
          </caption>
          <thead>
            <tr>
              {COLUNAS.map((c) => {
                const ativa = c.chave === coluna
                return (
                  <th
                    key={c.chave}
                    scope="col"
                    data-numero={c.numero || undefined}
                    /*
                     * `aria-sort` no cabeçalho é o que faz o leitor de tela
                     * anunciar a ordem. Sem ele, a seta é informação só para
                     * quem enxerga — e a tabela fica ordenada em segredo.
                     */
                    aria-sort={
                      ativa ? (invertido ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button type="button" onClick={() => ordenarPor(c.chave)}>
                      {c.rotulo}
                      <Icone
                        nome="cima-baixo"
                        tamanho={12}
                        className="lojas__seta"
                        data-ativa={ativa || undefined}
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {ordenadas.map(({ unidade, nome, painel }) => {
              const { principal, apoio } = nomeDaLoja(nome)

              return (
                <tr key={unidade}>
                  <th scope="row">
                    <span className="lojas__nome">
                      {/* O mesmo tom que a loja tem no seletor e nos selos do
                          cabeçalho: uma loja, uma cor, no produto inteiro. */}
                      <span
                        className="lojas__ponto"
                        style={{ background: corDaLoja(nome) }}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{principal}</strong>
                        {apoio && <small>{apoio}</small>}
                      </span>
                    </span>
                  </th>

                  <td className="num">{inteiro.format(painel.operacao.emAberto)}</td>

                  {/* Zero atrasado não vira vermelho: tingir o que está em ordem
                      faz a coluna inteira parecer um problema. */}
                  <td className="num" data-alarme={painel.operacao.atrasados > 0 || undefined}>
                    {inteiro.format(painel.operacao.atrasados)}
                  </td>

                  <td className="num">{inteiro.format(painel.mes.atual)}</td>

                  <td className="num">
                    <span className="lojas__valor">
                      {dinheiro.format(painel.mes.faturado)}
                    </span>
                    {/*
                      A barra é decoração de dado, não de tela: ela codifica a
                      mesma grandeza do número ao lado. Por isso não precisa de
                      rótulo próprio nem de contraste de texto — o valor exato
                      está logo acima dela.
                    */}
                    <span className="lojas__barra" aria-hidden="true">
                      <span
                        style={{
                          width: `${(painel.mes.faturado / maiorFaturado) * 100}%`,
                        }}
                      />
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/*
            O total fecha a tabela e amarra os dois blocos: é o mesmo número que
            está lá em cima, na figura herói. Sem ele, quem soma as linhas de
            cabeça para conferir não sabe se chegou ao valor certo.
          */}
          <tfoot>
            <tr>
              <th scope="row">
                Total
                {/* Quantas lojas entraram na soma. Sem isso, o total é um
                    número sem denominador — e ele muda quando a seleção muda. */}
                <small>{lojas.length} lojas</small>
              </th>
              <td className="num">{inteiro.format(totais.emAberto)}</td>
              <td className="num" data-alarme={totais.atrasados > 0 || undefined}>
                {inteiro.format(totais.atrasados)}
              </td>
              <td className="num">{inteiro.format(totais.pedidos)}</td>
              {/* O faturamento total é o mesmo número da figura herói lá em
                  cima. É o fecho da tabela, e leva o corpo maior por isso. */}
              <td className="num lojas__total-valor">
                {dinheiro.format(totais.faturado)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
