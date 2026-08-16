import { useEffect, useState } from 'react'
import { Botao, Icone } from '@matsuya/ui'

/**
 * A linha de ferramentas do quadro.
 *
 * A busca é a adição que mais muda o turno. Com trinta pedidos na tela, achar
 * o `M-8871` que o cliente está reclamando ao telefone é o gesto mais repetido
 * do dia — e hoje ele é feito com o olho, varrendo colunas. Filtra por código e
 * por nome, em memória, sem ida ao servidor.
 *
 * A tela cheia não é enfeite: é o modo real de um tablet de balcão, onde a
 * barra do navegador só rouba altura.
 */

export type ModoDoQuadro = 'quadros' | 'expedicao'

export interface PropsDasFerramentas {
  modo: ModoDoQuadro
  aoTrocarModo: (modo: ModoDoQuadro) => void
  busca: string
  aoBuscar: (texto: string) => void
  /** Quantos pedidos a busca escondeu — some quando o campo está vazio. */
  ocultados: number
  aoAtualizar: () => void
}

const ROTULO_DO_MODO: Record<ModoDoQuadro, string> = {
  quadros: 'Quadros',
  expedicao: 'Expedição',
}

function useTelaCheia() {
  const [cheia, definirCheia] = useState(false)

  useEffect(() => {
    const aoMudar = () => definirCheia(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', aoMudar)
    return () => document.removeEventListener('fullscreenchange', aoMudar)
  }, [])

  return {
    cheia,
    alternar: () => {
      // Em iPad o `requestFullscreen` pode não existir; a promessa rejeitada
      // não pode derrubar a tela por causa de um botão secundário.
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      else void document.documentElement.requestFullscreen?.().catch(() => undefined)
    },
  }
}

export function Ferramentas({
  modo,
  aoTrocarModo,
  busca,
  aoBuscar,
  ocultados,
  aoAtualizar,
}: PropsDasFerramentas) {
  const telaCheia = useTelaCheia()

  return (
    <div className="ferramentas">
      <div className="ferramentas__busca">
        <Icone nome="lupa" tamanho={16} />
        <label className="ui-visualmente-oculto" htmlFor="busca">
          Buscar por número do pedido ou nome do cliente
        </label>
        <input
          id="busca"
          type="search"
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
          placeholder="Buscar por número ou cliente"
          autoComplete="off"
        />
        {busca && (
          <button
            type="button"
            className="ferramentas__limpar"
            onClick={() => aoBuscar('')}
            aria-label="Limpar a busca"
          >
            <Icone nome="x" tamanho={16} />
          </button>
        )}
      </div>

      {/*
        Quantos ficaram de fora, dito em voz alta para leitor de tela. Sem isto,
        uma busca que não casa com nada é indistinguível de um quadro vazio.
      */}
      {busca && (
        <p className="ferramentas__resultado" role="status" aria-live="polite">
          {ocultados === 0
            ? 'Mostrando todos'
            : `${ocultados} ${ocultados === 1 ? 'pedido oculto' : 'pedidos ocultos'} pela busca`}
        </p>
      )}

      <div className="ferramentas__direita">
        <div className="ferramentas__modos" role="group" aria-label="Modo de exibição">
          {(['quadros', 'expedicao'] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              className="ferramentas__modo"
              aria-pressed={modo === opcao}
              onClick={() => aoTrocarModo(opcao)}
            >
              {ROTULO_DO_MODO[opcao]}
            </button>
          ))}
        </div>

        <Botao enfase="fantasma" icone="atualizar" onClick={aoAtualizar}>
          <span className="ui-visualmente-oculto">Atualizar o quadro</span>
        </Botao>

        <Botao enfase="fantasma" onClick={telaCheia.alternar}>
          {telaCheia.cheia ? 'Sair da tela cheia' : 'Tela cheia'}
        </Botao>
      </div>
    </div>
  )
}

/**
 * Filtro em memória por código ou nome.
 *
 * Sem acento e sem caixa: quem digita no tablet do balcão não vai acertar o
 * acento de "Renê", e um filtro que exige isso é um filtro que não é usado.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
