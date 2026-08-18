import { describe, expect, it } from 'vitest'
import {
  GRUPOS,
  gruposPermitidos,
  paginaEfetiva,
  paginaVizinha,
  paginasPermitidas,
} from './paginas'

const TUDO = new Set(['orders:read'])
const NADA = new Set<string>()

describe('gruposPermitidos', () => {
  it('mostra tudo para quem tem tudo', () => {
    expect(gruposPermitidos(TUDO)).toHaveLength(GRUPOS.length)
  })

  it('esconde a página que exige permissão', () => {
    const chaves = paginasPermitidas(NADA).map((p) => p.chave)
    expect(chaves).not.toContain('agentes')
    expect(chaves).toContain('som')
  })

  it('some com o grupo que ficou vazio, e não deixa o rótulo órfão', () => {
    // Um rótulo "Dispositivo" sozinho, sem item nenhum embaixo, lê como
    // defeito — pior do que o grupo não existir.
    const semNada = gruposPermitidos(NADA)
    for (const grupo of semNada) expect(grupo.paginas.length).toBeGreaterThan(0)
  })

  it('não muda os grupos originais ao filtrar', () => {
    gruposPermitidos(NADA)
    expect(paginasPermitidas(TUDO).map((p) => p.chave)).toContain('agentes')
  })

  it('sobra pelo menos uma página para qualquer sessão', () => {
    // "Alertas de som" não exige permissão nenhuma, de propósito: sem isso a
    // tela poderia abrir completamente vazia.
    expect(paginasPermitidas(NADA).length).toBeGreaterThan(0)
  })
})

describe('paginaEfetiva', () => {
  it('respeita a escolha quando ela é visível', () => {
    expect(paginaEfetiva('diagnostico', TUDO)).toBe('diagnostico')
  })

  it('cai para a primeira quando a escolhida sumiu', () => {
    /*
     * Trocar de loja pode tirar uma permissão. Apontar para uma página que
     * deixou de existir deixaria o painel vazio e nada marcado na lateral —
     * a tela pareceria quebrada sem nenhuma explicação.
     */
    expect(paginaEfetiva('agentes', NADA)).toBe('som')
  })

  it('abre na primeira sem escolha nenhuma', () => {
    expect(paginaEfetiva(null, TUDO)).toBe('som')
  })
})

describe('paginaVizinha', () => {
  it('desce e sobe pela lista', () => {
    expect(paginaVizinha('som', 'ArrowDown', TUDO)).toBe('impressao')
    expect(paginaVizinha('impressao', 'ArrowUp', TUDO)).toBe('som')
  })

  it('dá a volta nas duas pontas', () => {
    const visiveis = paginasPermitidas(TUDO)
    const primeira = visiveis[0]!.chave
    const ultima = visiveis[visiveis.length - 1]!.chave

    expect(paginaVizinha(ultima, 'ArrowDown', TUDO)).toBe(primeira)
    expect(paginaVizinha(primeira, 'ArrowUp', TUDO)).toBe(ultima)
  })

  it('atravessa a fronteira de grupo', () => {
    // A lista é achatada: para o teclado, os grupos são rótulos, não paredes.
    expect(paginaVizinha('impressao', 'ArrowDown', TUDO)).toBe('agentes')
  })

  it('pula a página escondida', () => {
    expect(paginaVizinha('impressao', 'ArrowDown', NADA)).toBe('diagnostico')
  })

  it('Home e End vão às pontas', () => {
    expect(paginaVizinha('diagnostico', 'Home', TUDO)).toBe('som')
    expect(paginaVizinha('som', 'End', TUDO)).toBe('conta')
  })

  it('é nula para tecla que não navega', () => {
    // Devolver a página atual faria o componente reposicionar o foco a cada
    // tecla, inclusive nas que deveriam simplesmente passar.
    expect(paginaVizinha('som', 'a', TUDO)).toBeNull()
    expect(paginaVizinha('som', 'ArrowRight', TUDO)).toBeNull()
    expect(paginaVizinha('som', 'Enter', TUDO)).toBeNull()
  })

  it('é nula para página que não está visível', () => {
    expect(paginaVizinha('agentes', 'ArrowDown', NADA)).toBeNull()
  })
})
