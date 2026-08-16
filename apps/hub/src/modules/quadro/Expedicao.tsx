import { useMemo, useState } from 'react'
import { EstadoVazio, PainelDeSecao } from '@matsuya/ui'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { Cartao } from './Cartao'
import { SECOES } from '../../dados/useQuadro'
import { agruparPorStatus, type PropsDoQuadro } from './Quadros'

/**
 * Modo Expedição — seções empilhadas, cartões em grade densa.
 *
 * A metáfora muda: em vez de fluxo, é inventário. A pergunta que este modo
 * responde é "quantos e quais estão em cada balde agora", e para isso ele troca
 * contexto por quantidade — cabem três vezes mais pedidos na tela.
 *
 * É o modo do pico. Quando entram trinta pedidos numa hora, o quadro de colunas
 * vira seis listas que exigem rolagem, e rolar para conferir se sobrou alguém
 * na fila é exatamente o que não dá tempo de fazer.
 *
 * Seções vazias vêm recolhidas por padrão: no pico, uma seção vazia ocupando um
 * terço da tela é espaço tirado de quem precisa dele.
 */
export function Expedicao({
  pedidos,
  permissoes,
  agora,
  emCurso,
  aoPedirAcao,
  aoAbrirDetalhe,
}: PropsDoQuadro) {
  const porStatus = useMemo(() => agruparPorStatus(pedidos), [pedidos])

  /**
   * Escolha explícita do operador, por seção.
   *
   * Ausente = automático: seção vazia vem recolhida, seção com pedido vem
   * aberta. Presente = o operador decidiu, e a decisão dele vence — senão a
   * seção que ele acabou de abrir fecharia sozinha no próximo evento.
   */
  const [escolha, definirEscolha] = useState<ReadonlyMap<string, boolean>>(new Map())

  function alternar(status: string, recolhidaAgora: boolean) {
    definirEscolha((atual) => {
      const proximo = new Map(atual)
      proximo.set(status, !recolhidaAgora)
      return proximo
    })
  }

  return (
    <div className="expedicao">
      {SECOES.map((secao) => {
        const lista = porStatus.get(secao.status) ?? []
        const recolhida = escolha.get(secao.status) ?? lista.length === 0

        return (
          <PainelDeSecao
            key={secao.status}
            titulo={secao.titulo}
            contagem={lista.length}
            recolhivel
            recolhido={recolhida}
            aoAlternar={() => alternar(secao.status, recolhida)}
          >
            {lista.length === 0 ? (
              <EstadoVazio titulo="Nenhum pedido" descricao={secao.vazio} />
            ) : (
              <div className="expedicao__grade">
                {lista.map((pedido) => (
                  <Cartao
                    key={pedido.id}
                    pedido={pedido}
                    permissoes={permissoes}
                    agora={agora}
                    ocupado={emCurso.has(pedido.id)}
                    variante="denso"
                    aoPedirAcao={aoPedirAcao}
                    aoAbrirDetalhe={aoAbrirDetalhe}
                  />
                ))}
              </div>
            )}
          </PainelDeSecao>
        )
      })}
    </div>
  )
}
