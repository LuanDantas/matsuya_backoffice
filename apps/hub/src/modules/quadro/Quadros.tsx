import { useMemo } from 'react'
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

/** Quantos pedidos estão fora do prazo — alimenta o distintivo pulsante. */
export function contarAtrasados(pedidos: PedidoDoQuadro[], agora: number): number {
  return pedidos.filter(
    (p) => p.deadlineAt !== null && new Date(p.deadlineAt).getTime() < agora
  ).length
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

  const multiLoja = nomesDasUnidades.size > 1

  return (
    <div className="quadros">
      {visiveis.map((secao) => {
        const lista = porSecao.get(secao.chave) ?? []
        const atrasados = contarAtrasados(lista, agora)

        return (
          <div key={secao.chave} className="quadros__coluna" data-secao={secao.chave}>
            <PainelDeSecao
              titulo={secao.titulo}
              contagem={lista.length}
              alertas={atrasados}
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
              </div>
            </PainelDeSecao>
          </div>
        )
      })}
    </div>
  )
}
