import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Icone } from './Icone'

/**
 * Uma escolha entre poucas opções, com lista desenhada por nós.
 *
 * ## Quando usar esta, e quando usar `CampoSelect`
 *
 * `CampoSelect` é o `<select>` **nativo**, com rótulo acima, e continua sendo o
 * certo em formulário: ele traz busca por digitação, o seletor em roda do toque
 * e o comportamento que a pessoa já conhece do sistema dela.
 *
 * Esta existe para o caso em que a lista **precisa** parecer com o resto da
 * interface — a lista de `<option>` é desenhada pelo sistema operacional e não
 * aceita estilo nenhum. O custo é honesto e está pago aqui dentro: teclado,
 * `Escape`, clique fora e devolução de foco tiveram de ser reconstruídos, e é
 * exatamente o que se perde quando alguém troca um `select` por `div`s sem
 * fazer este trabalho.
 *
 * ## Por que `combobox` e não um menu
 *
 * O padrão WAI-ARIA para "escolher um valor de uma lista" é `combobox`
 * controlando um `listbox`. Menu (`role="menu"`) é para **ações**, não para
 * valores — e a diferença é anunciada: o leitor de tela diz "caixa de
 * combinação, X selecionado" em vez de listar comandos.
 */

export interface OpcaoDaEscolha<T extends string> {
  valor: T
  rotulo: string
  /** Segunda linha, para o que o rótulo sozinho não explica. */
  detalhe?: string
}

export interface PropsDaEscolha<T extends string> {
  valor: T
  opcoes: ReadonlyArray<OpcaoDaEscolha<T>>
  /** `id` do texto que dá nome a este controle. */
  rotuladoPor: string
  desabilitado?: boolean
  aoEscolher: (valor: T) => void
}

export function Escolha<T extends string>({
  valor,
  opcoes,
  rotuladoPor,
  desabilitado = false,
  aoEscolher,
}: PropsDaEscolha<T>) {
  const [aberta, definirAberta] = useState(false)
  /** Onde o teclado está — separado do valor escolhido, que só muda no Enter. */
  const [emFoco, definirEmFoco] = useState(0)

  const caixa = useRef<HTMLDivElement>(null)
  const gatilho = useRef<HTMLButtonElement>(null)
  const idDaLista = useId()

  const escolhida = opcoes.findIndex((o) => o.valor === valor)
  const atual = opcoes[escolhida] ?? opcoes[0]

  const abrir = useCallback(() => {
    // Abre já com o cursor na opção corrente: descer a lista desde o topo toda
    // vez, para chegar na que já estava marcada, é atrito puro.
    definirEmFoco(escolhida >= 0 ? escolhida : 0)
    definirAberta(true)
  }, [escolhida])

  const fechar = useCallback((devolverFoco = true) => {
    definirAberta(false)
    if (devolverFoco) gatilho.current?.focus()
  }, [])

  const confirmar = useCallback(
    (indice: number) => {
      const opcao = opcoes[indice]
      if (opcao) aoEscolher(opcao.valor)
      fechar()
    },
    [opcoes, aoEscolher, fechar]
  )

  useEffect(() => {
    if (!aberta) return

    const aoClicarFora = (evento: MouseEvent) => {
      // Sem devolver o foco: quem clicou fora já escolheu para onde ir, e puxar
      // o foco de volta desfaria o clique seguinte.
      if (!caixa.current?.contains(evento.target as Node)) fechar(false)
    }

    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberta, fechar])

  const aoTeclar = (evento: React.KeyboardEvent) => {
    if (!aberta) {
      // Seta e Enter abrem — é o que o `select` nativo faz, e o dedo já sabe.
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(evento.key)) {
        evento.preventDefault()
        abrir()
      }
      return
    }

    switch (evento.key) {
      case 'Escape':
        // Impede que o Esc suba e feche o painel inteiro por baixo.
        evento.stopPropagation()
        evento.preventDefault()
        fechar()
        break
      case 'ArrowDown':
        evento.preventDefault()
        definirEmFoco((i) => (i + 1) % opcoes.length)
        break
      case 'ArrowUp':
        evento.preventDefault()
        definirEmFoco((i) => (i - 1 + opcoes.length) % opcoes.length)
        break
      case 'Home':
        evento.preventDefault()
        definirEmFoco(0)
        break
      case 'End':
        evento.preventDefault()
        definirEmFoco(opcoes.length - 1)
        break
      case 'Enter':
      case ' ':
        evento.preventDefault()
        confirmar(emFoco)
        break
      case 'Tab':
        // Sair pelo Tab não escolhe: fecha e deixa o foco seguir, como faz o
        // nativo. Confirmar aqui mudaria o valor de quem só estava passando.
        fechar(false)
        break
    }
  }

  return (
    <div className="ui-escolha" ref={caixa}>
      <button
        type="button"
        ref={gatilho}
        className="ui-escolha__gatilho"
        role="combobox"
        aria-expanded={aberta}
        aria-controls={idDaLista}
        aria-haspopup="listbox"
        aria-labelledby={rotuladoPor}
        disabled={desabilitado}
        onClick={() => (aberta ? fechar(false) : abrir())}
        onKeyDown={aoTeclar}
      >
        <span className="ui-escolha__valor">{atual?.rotulo}</span>
        <Icone nome="cima-baixo" tamanho={14} />
      </button>

      {aberta && (
        <ul
          className="ui-escolha__lista"
          id={idDaLista}
          role="listbox"
          aria-labelledby={rotuladoPor}
          // O foco fica no gatilho e a lista é percorrida por
          // `aria-activedescendant`: assim o teclado nunca sai do controle, e
          // não há um segundo elemento disputando o foco com ele.
          aria-activedescendant={`${idDaLista}-${emFoco}`}
        >
          {opcoes.map((opcao, indice) => (
            <li
              key={opcao.valor}
              id={`${idDaLista}-${indice}`}
              role="option"
              className="ui-escolha__opcao"
              aria-selected={opcao.valor === valor}
              data-em-foco={indice === emFoco || undefined}
              // `mousedown` e não `click`: o `click` chegaria depois do
              // fechamento por clique-fora, e a escolha se perderia.
              onMouseDown={(e) => {
                e.preventDefault()
                confirmar(indice)
              }}
              onMouseEnter={() => definirEmFoco(indice)}
            >
              <span className="ui-escolha__marca" aria-hidden="true">
                {opcao.valor === valor && <Icone nome="check" tamanho={14} />}
              </span>

              <span className="ui-escolha__texto">
                {opcao.rotulo}
                {opcao.detalhe && (
                  <span className="ui-escolha__detalhe">{opcao.detalhe}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
