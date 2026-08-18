import { useMemo, useState, type CSSProperties } from 'react'
import { Botao, Drawer, EstadoVazio, Icone, Selo, type NomeDoIcone } from '@matsuya/ui'
import { ORDER_STATUS_LABEL } from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { decorrido, moeda } from '../../app/formato'

/**
 * Fila de exceções.
 *
 * O quadro mostra onde cada pedido está. Esta fila mostra o que **saiu do
 * trilho** — e existe porque as duas coisas competem por atenção de formas
 * diferentes.
 *
 * Num quadro de seis colunas em horário de pico, um pedido com SLA estourado é
 * um cartão vermelho entre trinta cartões. Ele fica visível para quem procura,
 * e invisível para quem está trabalhando. A exceção precisa de um lugar onde a
 * ausência de itens seja a informação — uma fila vazia diz "está tudo em dia"
 * de relance, coisa que um quadro cheio nunca consegue dizer.
 *
 * Três motivos entram aqui, na ordem em que doem:
 *
 * 1. **SLA estourado** — o cliente está esperando resposta que não veio.
 * 2. **Falha na entrega / cliente não localizado** — a comida saiu e voltou.
 * 3. **Cancelamento parcial** — o pedido mudou depois do aceite e alguém
 *    precisa conferir se o cliente foi avisado.
 *
 * ## O módulo é dono do próprio painel
 *
 * `DrawerDeExcecoes` monta o `Drawer` inteiro, como `DrawerDeChat` e
 * `DrawerDoPedido` já fazem. Antes a `Casca` montava o painel e este arquivo
 * devolvia o miolo — o que obrigava o miolo a abrir um `PainelDeSecao` próprio,
 * titulado "Exceções", dentro de um painel já titulado "Exceções". Duas
 * molduras e o mesmo título duas vezes, a dezesseis pixels de distância. E o
 * botão do rodapé, que depende do filtro, não tinha como chegar ao rodapé do
 * painel de fora.
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

/** Rótulo curto, para o chip — onde o espaço é da contagem, não da frase. */
const CURTO_DO_MOTIVO: Record<MotivoDeExcecao, string> = {
  sla: 'Sem resposta',
  entrega: 'Entrega',
  parcial: 'Alterado',
}

const TOM_DO_MOTIVO: Record<MotivoDeExcecao, 'urgente' | 'perigo' | 'atencao'> = {
  sla: 'urgente',
  entrega: 'perigo',
  parcial: 'atencao',
}

/**
 * Um ícone por motivo, e três desenhos diferentes de propósito.
 *
 * Dois dos três motivos são vermelhos, e vermelho ao lado de vermelho não
 * distingue nada — é a mesma queixa que a coluna "Em preparo" já rendeu. O
 * ícone é o sinal que funciona sem cor nenhuma: relógio para quem espera
 * resposta, moto para o que saiu e não chegou, lista para o pedido que mudou.
 */
const ICONE_DO_MOTIVO: Record<MotivoDeExcecao, NomeDoIcone> = {
  sla: 'relogio',
  entrega: 'moto',
  parcial: 'lista',
}

const MOTIVOS: MotivoDeExcecao[] = ['sla', 'entrega', 'parcial']

/** Depois deste ponto todos os cartões entram juntos. Ver o CSS de `--ordem`. */
const TETO_DO_ESCALONAMENTO = 7

type Filtro = 'todas' | MotivoDeExcecao

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

export function contarPorMotivo(
  excecoes: Excecao[]
): Record<MotivoDeExcecao, number> {
  const contagem: Record<MotivoDeExcecao, number> = { sla: 0, entrega: 0, parcial: 0 }
  for (const { motivo } of excecoes) contagem[motivo] += 1
  return contagem
}

export function DrawerDeExcecoes({
  excecoes,
  agora,
  carregando = false,
  aoFechar,
  aoAbrir,
}: {
  excecoes: Excecao[]
  agora: number
  /**
   * O quadro ainda está buscando.
   *
   * Sem isto, a fila vazia do carregamento era indistinguível da fila vazia de
   * verdade, e o painel anunciava "Nada fora do trilho" antes de ter olhado —
   * dizia "está tudo em dia" quando ainda não sabia.
   */
  carregando?: boolean
  aoFechar: () => void
  aoAbrir: (pedido: PedidoDoQuadro) => void
}) {
  const [filtro, definirFiltro] = useState<Filtro>('todas')

  const contagem = useMemo(() => contarPorMotivo(excecoes), [excecoes])

  // Só entra chip de motivo que tem item. Um filtro que garante lista vazia é
  // um alvo que só decepciona — e some sozinho quando o problema é resolvido.
  const chips = useMemo(
    () => MOTIVOS.filter((motivo) => contagem[motivo] > 0),
    [contagem]
  )

  // O filtro escolhido pode zerar sozinho com o painel aberto: o último pedido
  // daquele motivo é aceito e a fila muda embaixo da mão. Cair de volta em
  // "todas" é melhor do que deixar a pessoa olhando um vazio que ela não causou.
  const ativo: Filtro = filtro !== 'todas' && contagem[filtro] === 0 ? 'todas' : filtro

  const visiveis = useMemo(
    () => (ativo === 'todas' ? excecoes : excecoes.filter((e) => e.motivo === ativo)),
    [excecoes, ativo]
  )

  const buscando = carregando && excecoes.length === 0
  const vazio = !buscando && excecoes.length === 0

  return (
    <Drawer
      aberto
      variante="excecoes"
      rotuloAcessivel="Pedidos que precisam de atenção"
      aoFechar={aoFechar}
      titulo={<h2>Exceções</h2>}
      subtitulo={
        buscando
          ? 'Procurando o que saiu do trilho…'
          : vazio
            ? 'Atrasados, com falha de entrega ou alterados depois do aceite.'
            : `${excecoes.length} ${
                excecoes.length === 1 ? 'pedido precisa' : 'pedidos precisam'
              } de atenção`
      }
      rodape={
        visiveis.length > 0 ? (
          // "O mais antigo" é o primeiro da lista **visível**: com "Entrega"
          // marcado, ele trata a entrega mais antiga. Um botão que ignorasse o
          // filtro abriria um pedido que não está na tela.
          <Botao
            enfase="primaria"
            largo
            icone="seta-direita"
            onClick={() => aoAbrir(visiveis[0]!.pedido)}
          >
            Tratar o mais antigo
          </Botao>
        ) : undefined
      }
    >
      {buscando ? (
        <ul className="excecoes__lista" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="excecoes__esqueleto esqueleto"
              style={{ '--atraso': `${i * 60}ms` } as CSSProperties}
            >
              <span className="esqueleto__bloco" />
              <span className="esqueleto__bloco" />
              <span className="esqueleto__bloco" />
            </li>
          ))}
        </ul>
      ) : vazio ? (
        <EstadoVazio
          icone="check"
          titulo="Nada fora do trilho"
          descricao="Nenhum pedido atrasado, com falha de entrega ou alterado."
        />
      ) : (
        <>
          {chips.length > 1 && (
            <div className="excecoes__chips" role="group" aria-label="Filtrar por motivo">
              <Chip
                marcado={ativo === 'todas'}
                contagem={excecoes.length}
                aoClicar={() => definirFiltro('todas')}
              >
                Todas
              </Chip>

              {chips.map((motivo) => (
                <Chip
                  key={motivo}
                  motivo={motivo}
                  marcado={ativo === motivo}
                  contagem={contagem[motivo]}
                  aoClicar={() => definirFiltro(motivo)}
                >
                  {CURTO_DO_MOTIVO[motivo]}
                </Chip>
              ))}
            </div>
          )}

          {/*
            A chave é o filtro, e não uma lista estável: trocar de chip remonta a
            lista e a entrada escalonada roda de novo. É a troca de conteúdo se
            anunciando — sem isso, filtrar é o conteúdo se teletransportando.
          */}
          <ul className="excecoes__lista" key={ativo}>
            {visiveis.map(({ pedido, motivo }, indice) => (
              <li
                key={pedido.id}
                className="excecoes__item"
                style={
                  {
                    '--ordem': String(Math.min(indice, TETO_DO_ESCALONAMENTO)),
                  } as CSSProperties
                }
              >
                <button
                  type="button"
                  className="excecoes__cartao cartao-d"
                  onClick={() => aoAbrir(pedido)}
                >
                  <span
                    className="cartao-d__disco excecoes__disco"
                    data-motivo={motivo}
                    aria-hidden="true"
                  >
                    <Icone nome={ICONE_DO_MOTIVO[motivo]} tamanho={16} />
                  </span>

                  <span className="excecoes__corpo">
                    <span className="excecoes__linha">
                      <strong className="num">{pedido.code ?? `#${pedido.id}`}</strong>
                      <Selo tom={TOM_DO_MOTIVO[motivo]}>{ROTULO_DO_MOTIVO[motivo]}</Selo>
                    </span>

                    <span className="excecoes__linha excecoes__linha--fraca">
                      <span className="excecoes__cliente">
                        {pedido.customerLabel ?? ORDER_STATUS_LABEL[pedido.status]}
                      </span>
                      <span className="num">{moeda.format(pedido.total)}</span>
                    </span>

                    <span className="excecoes__linha excecoes__linha--fraca">
                      <span className="num">há {decorrido(pedido.createdAt, agora)}</span>
                      <span className="excecoes__abrir">
                        Abrir
                        <Icone nome="seta-direita" tamanho={14} className="excecoes__seta" />
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        Anúncio para leitor de tela, separado do visual: a lista muda sozinha, e
        `role="status"` avisa sem interromper quem está no meio de outra ação.
      */}
      <p className="ui-visualmente-oculto" role="status" aria-live="polite">
        {buscando
          ? 'Carregando a fila de exceções.'
          : vazio
            ? 'Nenhuma exceção.'
            : ativo === 'todas'
              ? `${excecoes.length} ${
                  excecoes.length === 1 ? 'pedido precisa' : 'pedidos precisam'
                } de atenção.`
              : `${visiveis.length} de ${excecoes.length}, filtrando por ${ROTULO_DO_MOTIVO[
                  ativo
                ].toLocaleLowerCase('pt-BR')}.`}
      </p>
    </Drawer>
  )
}

function Chip({
  motivo,
  marcado,
  contagem,
  aoClicar,
  children,
}: {
  motivo?: MotivoDeExcecao
  marcado: boolean
  contagem: number
  aoClicar: () => void
  children: string
}) {
  return (
    <button
      type="button"
      className="excecoes__chip"
      data-motivo={motivo}
      aria-pressed={marcado}
      onClick={aoClicar}
    >
      {motivo && <Icone nome={ICONE_DO_MOTIVO[motivo]} tamanho={14} />}
      {children}
      <span className="excecoes__chip-contagem num">{contagem}</span>
    </button>
  )
}
