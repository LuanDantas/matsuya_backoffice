import { Icone } from '@matsuya/ui'
import type { PedidoDoQuadro } from '@matsuya/api-client'

/**
 * O cartão da coluna Aceitar.
 *
 * Deliberadamente estripado, como em `aceitar.png`: número gigante, barra de
 * prazo, nome da loja. **Sem nome de cliente, sem valor, sem endereço.**
 *
 * No momento do aceite existe uma decisão só — aceitar ou recusar —, e ela é
 * tomada contra o relógio. Cada informação a mais no cartão disputa atenção
 * com o único número que importa e atrasa a decisão que o cartão existe para
 * apressar. O detalhe continua a um toque, para quem precisar conferir antes.
 *
 * A barra drena conforme o prazo corre. É a mesma informação do texto, dita
 * de outro jeito: quem está a dois metros lê a barra, quem está perto lê os
 * minutos.
 */
export function CartaoDeAceite({
  pedido,
  agora,
  prazoTotalEmMinutos,
  nomeDaUnidade,
  selecionado,
  aoAbrirDetalhe,
}: {
  pedido: PedidoDoQuadro
  agora: number
  /** Janela cheia do prazo, para a barra saber o que é 100%. */
  prazoTotalEmMinutos: number
  nomeDaUnidade: string | null
  selecionado: boolean
  aoAbrirDetalhe: (pedido: PedidoDoQuadro) => void
}) {
  const restanteMs = pedido.deadlineAt
    ? new Date(pedido.deadlineAt).getTime() - agora
    : null

  const estourou = restanteMs !== null && restanteMs < 0
  const minutos = restanteMs === null ? null : Math.max(0, Math.ceil(restanteMs / 60_000))

  // Sem prazo, a barra fica cheia: é melhor não sugerir urgência falsa do que
  // desenhar uma barra vazia que parece atraso.
  const proporcao =
    restanteMs === null
      ? 1
      : Math.max(0, Math.min(1, restanteMs / (prazoTotalEmMinutos * 60_000)))

  const rotulo = estourou
    ? 'Atrasado — aceite agora'
    : minutos === null
      ? 'Aguardando aceite'
      : `Aceite em até ${minutos}min`

  return (
    <article
      className="aceite"
      data-estourou={estourou || undefined}
      data-selecionado={selecionado || undefined}
    >
      <button
        type="button"
        className="aceite__abrir"
        onClick={() => aoAbrirDetalhe(pedido)}
        aria-label={`Abrir o pedido ${pedido.code ?? pedido.id} para aceitar ou recusar`}
      >
        <strong className="aceite__numero num">{pedido.code ?? `#${pedido.id}`}</strong>

        <span
          className="aceite__barra"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={prazoTotalEmMinutos}
          aria-valuenow={minutos ?? prazoTotalEmMinutos}
          aria-valuetext={rotulo}
        >
          {/*
            O rótulo é desenhado duas vezes, e isso não é desperdício.
            A barra esvazia; se o texto fosse único, ele passaria de cima do
            vermelho para cima do rosa claro conforme o prazo corre, e ficaria
            ilegível exatamente no fim — quando mais importa. A cópia clara é
            recortada pelo preenchimento, a escura fica no trilho, e cada
            pedaço do texto tem o contraste do fundo em que está.
          */}
          <span className="aceite__trilho" aria-hidden="true">
            <span className="aceite__rotulo aceite__rotulo--trilho">{rotulo}</span>
          </span>

          <span
            className="aceite__preenchimento"
            style={{ width: `${proporcao * 100}%` }}
            aria-hidden="true"
          >
            <span className="aceite__rotulo aceite__rotulo--preenchido">{rotulo}</span>
          </span>
        </span>
      </button>

      {nomeDaUnidade && (
        <footer className="aceite__rodape">
          <Icone nome="loja" tamanho={14} />
          {nomeDaUnidade}
        </footer>
      )}
    </article>
  )
}
