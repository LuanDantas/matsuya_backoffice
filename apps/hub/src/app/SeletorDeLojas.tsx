import { useEffect, useMemo, useRef, useState } from 'react'
import { Botao, Icone } from '@matsuya/ui'
import type { EstadoDaLoja, Identidade } from '@matsuya/api-client'

/**
 * Seleção de lojas do cabeçalho.
 *
 * Múltipla, como a referência: o quadro passa a mostrar os pedidos de todas as
 * lojas marcadas. É a diferença entre um tablet por loja e um posto que
 * acompanha várias — e quem acompanha várias precisa das duas coisas ao mesmo
 * tempo, não de um seletor que troca.
 *
 * A pilha de avatares é a inicial da loja num círculo de cor derivada do nome.
 * `unity` não tem campo de imagem, e um espaço reservado cinza para todas seria
 * ruído em vez de identificação.
 */

/**
 * Cor estável a partir do nome.
 *
 * Determinística de propósito: a mesma loja tem sempre a mesma cor, em qualquer
 * tablet e depois de qualquer recarga. Cor sorteada faria o operador reaprender
 * a associação toda vez.
 */
function corDaLoja(nome: string): string {
  let soma = 0
  for (let i = 0; i < nome.length; i += 1) soma = (soma + nome.charCodeAt(i)) % 360
  return `hsl(${soma} 45% 38%)`
}

const inicial = (nome: string) => nome.trim().charAt(0).toUpperCase()

export interface OperacaoDaLoja {
  estado: EstadoDaLoja
  pausadaAte: string | null
}

const relogio = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * O rótulo de operação da linha.
 *
 * A pausa mostra o horário de volta em vez de "pausada" seco: saber que a loja
 * volta às 14:30 é o que decide se o operador espera ou liga para lá. Sem o
 * dado — loja que ainda não respondeu — não escreve nada, porque um "aberta"
 * chutado é pior do que rótulo nenhum.
 */
function rotuloDaOperacao(op: OperacaoDaLoja | undefined): string | null {
  if (!op) return null
  if (op.estado === 'fechada') return 'Fechada'
  if (op.estado === 'pausada') {
    return op.pausadaAte
      ? `Pausada até ${relogio.format(new Date(op.pausadaAte))}`
      : 'Pausada'
  }
  return 'Aberta'
}

export function SeletorDeLojas({
  identidade,
  selecionadas,
  comPedidos,
  operacao,
  aoSelecionar,
}: {
  identidade: Identidade
  selecionadas: ReadonlySet<number>
  /** Lojas com pelo menos um pedido em aberto — alimenta a linha de apoio. */
  comPedidos: ReadonlySet<number>
  /** Estado de operação por loja, do mesmo `/alerts` que alimenta o farol. */
  operacao: ReadonlyMap<number, OperacaoDaLoja>
  aoSelecionar: (ids: number[]) => void
}) {
  const [aberto, definirAberto] = useState(false)
  const [busca, definirBusca] = useState('')
  const caixa = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora e no Esc: um painel que só fecha pelo próprio botão
  // vira um obstáculo quando o operador já mudou de ideia.
  useEffect(() => {
    if (!aberto) return

    const aoClicarFora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) definirAberto(false)
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') definirAberto(false)
    }

    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return identidade.units
    return identidade.units.filter((u) => u.name.toLowerCase().includes(termo))
  }, [busca, identidade.units])

  const marcadas = identidade.units.filter((u) => selecionadas.has(u.id))
  const comMovimento = marcadas.filter((u) => comPedidos.has(u.id)).length

  function alternar(id: number) {
    const proximo = new Set(selecionadas)
    if (proximo.has(id)) proximo.delete(id)
    else proximo.add(id)

    // Nunca deixa zerar: um quadro sem loja nenhuma não é um estado útil, é uma
    // tela em branco que o operador não sabe desfazer.
    if (proximo.size === 0) return
    aoSelecionar([...proximo])
  }

  return (
    <div className="seletor" ref={caixa}>
      <button
        type="button"
        className="seletor__gatilho"
        onClick={() => definirAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
      >
        <span className="seletor__avatares" aria-hidden="true">
          {marcadas.slice(0, 3).map((u, i) => (
            <span
              key={u.id}
              className="seletor__avatar"
              style={{ background: corDaLoja(u.name), zIndex: 3 - i }}
            >
              {inicial(u.name)}
            </span>
          ))}
          {marcadas.length > 3 && (
            <span className="seletor__avatar seletor__avatar--resto">
              +{marcadas.length - 3}
            </span>
          )}
        </span>

        <span className="seletor__texto">
          <strong>
            {marcadas.length === 1
              ? marcadas[0]!.name
              : `${marcadas.length} lojas selecionadas`}
          </strong>
          <span className="seletor__apoio">
            {comMovimento === 0
              ? 'nenhuma com pedido em aberto'
              : `${comMovimento} com pedido em aberto`}
          </span>
        </span>

        <Icone nome="seta-direita" tamanho={16} />
      </button>

      {aberto && (
        <div className="seletor__painel" role="dialog" aria-label="Escolher lojas">
          <header className="seletor__cabecalho">
            <h2>Suas lojas</h2>
            <span className="seletor__contagem">{identidade.units.length}</span>
          </header>

          <div className="seletor__busca">
            <Icone nome="lupa" tamanho={16} />
            <label className="ui-visualmente-oculto" htmlFor="busca-loja">
              Buscar loja
            </label>
            <input
              id="busca-loja"
              type="search"
              value={busca}
              onChange={(e) => definirBusca(e.target.value)}
              placeholder="Buscar loja"
            />
          </div>

          <div className="seletor__acoes">
            <Botao
              enfase="fantasma"
              onClick={() => aoSelecionar(identidade.units.map((u) => u.id))}
            >
              Selecionar todas
            </Botao>
            <span className="seletor__apoio">{marcadas.length} selecionadas</span>
          </div>

          <ul className="seletor__lista">
            {filtradas.map((unidade) => {
              const marcada = selecionadas.has(unidade.id)
              const op = operacao.get(unidade.id)
              const rotulo = rotuloDaOperacao(op)
              const pedidos = comPedidos.has(unidade.id)

              return (
                <li key={unidade.id}>
                  <button
                    type="button"
                    className="seletor__opcao"
                    aria-pressed={marcada}
                    onClick={() => alternar(unidade.id)}
                  >
                    <span className="seletor__marca" aria-hidden="true">
                      {marcada && <Icone nome="check" tamanho={14} />}
                    </span>
                    <span
                      className="seletor__avatar"
                      style={{ background: corDaLoja(unidade.name) }}
                      aria-hidden="true"
                    >
                      {inicial(unidade.name)}
                    </span>

                    <span className="seletor__nome">
                      {unidade.name}
                      {/*
                        A contagem de pedidos desce para a linha de apoio e o
                        ponto passa a marcar o estado da loja. O ponto é o
                        elemento mais forte da linha, e estava contando a coisa
                        menos importante das duas: pedido em aberto é rotina,
                        loja fechada com fila é o que ninguém percebe.
                      */}
                      {pedidos && <small>com pedido em aberto</small>}
                    </span>

                    {rotulo && (
                      <span className="seletor__operacao" data-estado={op!.estado}>
                        <span className="seletor__ponto" aria-hidden="true" />
                        {rotulo}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}

            {filtradas.length === 0 && (
              <li className="seletor__vazio">Nenhuma loja com esse nome.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
