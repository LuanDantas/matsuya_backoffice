import { Icone } from '@matsuya/ui'
import type { PedidoDoQuadro } from '@matsuya/api-client'

/**
 * O cartão da coluna Aceitar.
 *
 * Enxuto: número, nome do cliente, barra de prazo e a loja. **Sem valor e sem
 * endereço** — no momento do aceite a decisão é uma só, e cada informação a
 * mais disputa atenção com o relógio. O detalhe fica a um toque.
 *
 * O nome do cliente entrou depois. `aceitar.png` mostra só o número, e a
 * primeira versão seguiu o print — mas o cartão fica ao lado dos das outras
 * colunas, que têm nome, e a linha do herói mudando de forma entre colunas faz
 * o olho reprocessar a cada troca. Vale o pareamento.
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
        <span className="aceite__heroi">
          <strong className="aceite__numero num">{pedido.code ?? `#${pedido.id}`}</strong>
          {pedido.customerLabel && (
            <span className="aceite__cliente">{pedido.customerLabel}</span>
          )}
        </span>

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

          {/*
            A camada preenchida tem a largura da barra inteira e é **recortada**
            até a proporção do tempo. Ela já teve `width` variável, e aí o
            rótulo de dentro encolhia junto: centralizado numa caixa que
            diminuía, o texto caminhava para a esquerda enquanto o prazo corria.
            Com o recorte, as duas camadas têm sempre o mesmo tamanho, o texto
            fica parado, e só a área vermelha se move.
          */}
          <span
            className="aceite__preenchimento"
            style={{ clipPath: `inset(0 ${(1 - proporcao) * 100}% 0 0)` }}
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
