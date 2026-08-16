import { useMemo } from 'react'
import { Botao, EstadoVazio, Icone, Selo } from '@matsuya/ui'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { decorrido, moeda } from '../../app/formato'

/**
 * Fila de exceções.
 *
 * O quadro mostra onde cada pedido está. Esta faixa mostra o que **saiu do
 * trilho** — e existe porque as duas coisas competem por atenção de formas
 * diferentes.
 *
 * Num quadro de seis colunas em horário de pico, um pedido com SLA estourado é
 * um cartão vermelho entre trinta cartões. Ele fica visível para quem procura,
 * e invisível para quem está trabalhando. A exceção precisa de um lugar onde a
 * ausência de itens seja a informação — uma faixa vazia diz "está tudo em dia"
 * de relance, coisa que um quadro cheio nunca consegue dizer.
 *
 * Três motivos entram aqui, na ordem em que doem:
 *
 * 1. **SLA estourado** — o cliente está esperando resposta que não veio.
 * 2. **Falha na entrega / cliente não localizado** — a comida saiu e voltou.
 * 3. **Cancelamento parcial** — o pedido mudou depois do aceite e alguém
 *    precisa conferir se o cliente foi avisado.
 */

export type MotivoDeExcecao = 'sla' | 'entrega' | 'parcial'

export interface Excecao {
  pedido: PedidoDoQuadro
  motivo: MotivoDeExcecao
  /** Quanto tempo o problema já dura, em minutos. Ordena a fila. */
  minutos: number
}

const ROTULO_DO_MOTIVO: Record<MotivoDeExcecao, string> = {
  sla: 'Sem resposta da loja',
  entrega: 'Problema na entrega',
  parcial: 'Pedido alterado',
}

const TOM_DO_MOTIVO: Record<MotivoDeExcecao, 'urgente' | 'perigo' | 'atencao'> = {
  sla: 'urgente',
  entrega: 'perigo',
  parcial: 'atencao',
}

export function apurarExcecoes(
  pedidos: PedidoDoQuadro[],
  agora: number
): Excecao[] {
  const excecoes: Excecao[] = []

  for (const pedido of pedidos) {
    const idade = Math.floor((agora - new Date(pedido.createdAt).getTime()) / 60000)

    // A ordem dos ifs é a prioridade: um pedido com SLA estourado E
    // cancelamento parcial aparece uma vez só, pelo motivo mais grave.
    if (
      pedido.status === 'pending' &&
      (pedido.slaExpiredAt !== null ||
        (pedido.slaExpiresAt !== null && new Date(pedido.slaExpiresAt).getTime() < agora))
    ) {
      excecoes.push({ pedido, motivo: 'sla', minutos: idade })
      continue
    }

    if (pedido.status === 'delivery_failed' || pedido.status === 'customer_not_found') {
      excecoes.push({ pedido, motivo: 'entrega', minutos: idade })
      continue
    }

    if (pedido.hasPartialCancellation) {
      excecoes.push({ pedido, motivo: 'parcial', minutos: idade })
    }
  }

  // Mais antigo primeiro: quem espera há mais tempo é quem está mais perto de
  // desistir do pedido.
  return excecoes.sort((a, b) => b.minutos - a.minutos)
}

export function Excecoes({
  excecoes,
  agora,
  aoAbrir,
}: {
  excecoes: Excecao[]
  agora: number
  aoAbrir: (pedido: PedidoDoQuadro) => void
}) {
  const contagem = useMemo(() => excecoes.length, [excecoes])

  return (
    <section className="excecoes" aria-labelledby="excecoes-titulo">
      <header className="excecoes__cabecalho">
        <h2 id="excecoes-titulo">
          <Icone nome="alerta" tamanho={16} />
          Exceções
        </h2>
        {contagem > 0 && (
          <Selo tom="urgente">
            {contagem} {contagem === 1 ? 'pedido' : 'pedidos'}
          </Selo>
        )}
      </header>

      {contagem === 0 ? (
        <EstadoVazio
          icone="check"
          titulo="Nada fora do trilho"
          descricao="Nenhum pedido atrasado, com falha de entrega ou alterado."
        />
      ) : (
        <ul className="excecoes__lista">
          {excecoes.map(({ pedido, motivo, minutos }) => (
            <li key={pedido.id}>
              <button
                type="button"
                className="excecoes__item"
                data-motivo={motivo}
                onClick={() => aoAbrir(pedido)}
              >
                <div className="excecoes__linha">
                  <strong>{pedido.code ?? `#${pedido.id}`}</strong>
                  <Selo tom={TOM_DO_MOTIVO[motivo]}>{ROTULO_DO_MOTIVO[motivo]}</Selo>
                </div>
                <div className="excecoes__linha excecoes__linha--fraca">
                  <span>{ORDER_STATUS_LABEL[pedido.status]}</span>
                  <span className="num">{moeda.format(pedido.total)}</span>
                </div>
                <div className="excecoes__linha excecoes__linha--fraca">
                  <span className="num">
                    há {decorrido(pedido.createdAt, agora)}
                  </span>
                  <span className="excecoes__abrir">
                    Abrir <Icone nome="seta-direita" tamanho={14} />
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        Anúncio para leitor de tela, separado do visual: a lista muda sozinha, e
        `role="status"` avisa sem interromper quem está no meio de outra ação.
      */}
      <p className="ui-visualmente-oculto" role="status" aria-live="polite">
        {contagem === 0
          ? 'Nenhuma exceção.'
          : `${contagem} ${contagem === 1 ? 'pedido precisa' : 'pedidos precisam'} de atenção.`}
      </p>

      {contagem > 0 && (
        <Botao
          enfase="fantasma"
          largo
          onClick={() => aoAbrir(excecoes[0]!.pedido)}
        >
          Tratar o mais antigo
        </Botao>
      )}
    </section>
  )
}
