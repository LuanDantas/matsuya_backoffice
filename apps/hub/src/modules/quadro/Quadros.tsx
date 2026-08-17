import { useCallback, useEffect, useMemo, useState } from 'react'
import { EstadoVazio, PainelDeSecao } from '@matsuya/ui'
import type { OrderAction } from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { Cartao } from './Cartao'
import { CartaoDeAceite } from './CartaoDeAceite'
import { SECOES, type ChaveDaSecao, type SecaoDoQuadro } from '../../dados/secoes'

/**
 * Modo Quadros — uma coluna por lugar da loja.
 *
 * A metáfora é de fluxo: o pedido anda da esquerda para a direita, e a coluna
 * responde onde ele está fisicamente. Quatro colunas mais a de aceite, como a
 * referência — e não uma por estado, que obrigava a varrer a tela.
 */

export interface PropsDoQuadro {
  pedidos: PedidoDoQuadro[]
  permissoes: ReadonlySet<string>
  agora: number
  emCurso: ReadonlySet<number>
  selecionado: number | null
  /** Nome por unidade. Só desce ao cartão quando há mais de uma loja aberta. */
  nomesDasUnidades: ReadonlyMap<number, string>
  prazoDeAceiteEmMinutos: number
  aoPedirAcao: (pedido: PedidoDoQuadro, acao: OrderAction) => void
  aoAbrirDetalhe: (pedido: PedidoDoQuadro) => void
}

/**
 * Fora do prazo.
 *
 * Uma função só, usada para contar no cabeçalho e para filtrar a coluna. Se as
 * duas contas fossem escritas separadamente, um dia divergiriam num caso de
 * borda — o pedido que vence entre o cálculo do chip e o da lista — e o chip
 * diria "3 atrasados" abrindo uma coluna com dois.
 */
export function estaAtrasado(pedido: PedidoDoQuadro, agora: number): boolean {
  return pedido.deadlineAt !== null && new Date(pedido.deadlineAt).getTime() < agora
}

/** Quantos pedidos estão fora do prazo — alimenta o chip de alerta da coluna. */
export function contarAtrasados(pedidos: PedidoDoQuadro[], agora: number): number {
  return pedidos.filter((p) => estaAtrasado(p, agora)).length
}

export function agruparPorSecao(
  pedidos: PedidoDoQuadro[],
  agora: number
): Map<ChaveDaSecao, PedidoDoQuadro[]> {
  const mapa = new Map<ChaveDaSecao, PedidoDoQuadro[]>()
  for (const secao of SECOES) mapa.set(secao.chave, [])

  for (const pedido of pedidos) {
    const secao = SECOES.find((s) => s.status.includes(pedido.status))
    if (!secao) continue

    // Finalizados só mostra o que fechou há pouco. Sem o recorte, a coluna
    // cresce o turno inteiro e empurra as outras para fora da tela —
    // justamente aquela sobre a qual ninguém precisa agir.
    if (secao.janelaEmHoras) {
      const referencia = pedido.deliveredAt ?? pedido.createdAt
      const idade = agora - new Date(referencia).getTime()
      if (idade > secao.janelaEmHoras * 3_600_000) continue
    }

    mapa.get(secao.chave)!.push(pedido)
  }

  for (const [chave, lista] of mapa) {
    // Finalizados lê-se do mais recente; o resto, do que espera há mais tempo.
    lista.sort((a, b) =>
      chave === 'finalizados'
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  }

  return mapa
}

/** As seções que devem aparecer: `Aceitar` só existe quando tem alguém nela. */
export function secoesVisiveis(
  porSecao: Map<ChaveDaSecao, PedidoDoQuadro[]>
): SecaoDoQuadro[] {
  return SECOES.filter(
    (secao) => !secao.someQuandoVazia || (porSecao.get(secao.chave)?.length ?? 0) > 0
  )
}

export function Quadros({
  pedidos,
  permissoes,
  agora,
  emCurso,
  selecionado,
  nomesDasUnidades,
  prazoDeAceiteEmMinutos,
  aoPedirAcao,
  aoAbrirDetalhe,
}: PropsDoQuadro) {
  const porSecao = useMemo(() => agruparPorSecao(pedidos, agora), [pedidos, agora])
  const visiveis = useMemo(() => secoesVisiveis(porSecao), [porSecao])

  /**
   * Colunas filtradas pelo chip de atraso.
   *
   * Um conjunto, e não uma coluna só: filtrar Em preparo pelos atrasados não é
   * motivo para desfazer o filtro que alguém deixou em Em rota. São perguntas
   * independentes, feitas em lugares independentes da tela.
   */
  const [filtradas, definirFiltradas] = useState<ReadonlySet<ChaveDaSecao>>(new Set())

  const alternarFiltro = useCallback((chave: ChaveDaSecao) => {
    definirFiltradas((atuais) => {
      const proximo = new Set(atuais)
      if (proximo.has(chave)) proximo.delete(chave)
      else proximo.add(chave)
      return proximo
    })
  }, [])

  /**
   * O filtro se desliga sozinho quando o último atraso da coluna sai.
   *
   * Sem isto o chip some junto com o atraso e o filtro fica ligado sem
   * controle na tela: a coluna aparece vazia, os pedidos existem, e não há o
   * que clicar para trazê-los de volta. O jeito de sair some antes do estado.
   */
  useEffect(() => {
    definirFiltradas((atuais) => {
      const proximo = new Set(
        [...atuais].filter(
          (chave) => contarAtrasados(porSecao.get(chave) ?? [], agora) > 0
        )
      )
      return proximo.size === atuais.size ? atuais : proximo
    })
  }, [porSecao, agora])

  const multiLoja = nomesDasUnidades.size > 1

  return (
    <div className="quadros">
      {visiveis.map((secao) => {
        const todos = porSecao.get(secao.chave) ?? []
        const atrasados = contarAtrasados(todos, agora)
        const filtrando = filtradas.has(secao.chave)

        // A contagem do cabeçalho segue sendo a da coluna inteira, mesmo
        // filtrada: ela responde "quantos pedidos há aqui", e trocá-la pelo
        // subconjunto faria o número cair sem que nada tenha saído da fila.
        const lista = filtrando ? todos.filter((p) => estaAtrasado(p, agora)) : todos

        return (
          <div
            key={secao.chave}
            className="quadros__coluna"
            data-secao={secao.chave}
            data-filtrada={filtrando || undefined}
          >
            <PainelDeSecao
              titulo={secao.titulo}
              contagem={todos.length}
              alertas={atrasados}
              filtrandoAlertas={filtrando}
              aoFiltrarAlertas={() => alternarFiltro(secao.chave)}
            >
              <div className="quadros__pilha">
                {lista.map((pedido) =>
                  secao.chave === 'aceitar' ? (
                    <CartaoDeAceite
                      key={pedido.id}
                      pedido={pedido}
                      agora={agora}
                      prazoTotalEmMinutos={prazoDeAceiteEmMinutos}
                      nomeDaUnidade={
                        multiLoja ? (nomesDasUnidades.get(pedido.unityId) ?? null) : null
                      }
                      selecionado={selecionado === pedido.id}
                      aoAbrirDetalhe={aoAbrirDetalhe}
                    />
                  ) : (
                    <Cartao
                      key={pedido.id}
                      pedido={pedido}
                      permissoes={permissoes}
                      agora={agora}
                      ocupado={emCurso.has(pedido.id)}
                      selecionado={selecionado === pedido.id}
                      nomeDaUnidade={
                        multiLoja ? (nomesDasUnidades.get(pedido.unityId) ?? null) : null
                      }
                      aoPedirAcao={aoPedirAcao}
                      aoAbrirDetalhe={aoAbrirDetalhe}
                    />
                  )
                )}

                {lista.length === 0 && (
                  <EstadoVazio titulo="Nenhum pedido" descricao={secao.vazio} />
                )}

                {filtrando && (
                  <p className="quadros__filtro" role="status">
                    {todos.length - lista.length === 1
                      ? '1 pedido no prazo está oculto.'
                      : `${todos.length - lista.length} pedidos no prazo estão ocultos.`}{' '}
                    Toque no alerta para ver todos.
                  </p>
                )}
              </div>
            </PainelDeSecao>
          </div>
        )
      })}
    </div>
  )
}
