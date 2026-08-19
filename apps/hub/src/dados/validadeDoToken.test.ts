import { describe, expect, it } from 'vitest'
import { expiracaoDoToken, faixaDaValidade } from './validadeDoToken'

/** Monta um JWT de mentira: só o miolo importa, a assinatura nunca é conferida. */
function token(payload: unknown, partes = 3): string {
  const miolo = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return ['cabecalho', miolo, 'assinatura'].slice(0, partes).join('.')
}

describe('expiracaoDoToken', () => {
  it('devolve o vencimento em milissegundos', () => {
    // O JWT guarda segundos; o resto do aplicativo pensa em milissegundos, e a
    // conversão feita em cada chamador é como um fator de mil se perde.
    expect(expiracaoDoToken(token({ exp: 1_755_500_000 }))).toBe(1_755_500_000_000)
  })

  it('lê base64url com - e _ e sem preenchimento', () => {
    // O `exp` vem no fim do payload; e-mails e nomes longos empurram o miolo
    // para tamanhos que exigem preenchimento e caracteres trocados.
    const cru = token({
      email: 'responsavel+santana@matsuya.com.br',
      name: 'Antônio de Assunção',
      exp: 1_800_000_000,
    })
    expect(cru).not.toContain('=')
    expect(expiracaoDoToken(cru)).toBe(1_800_000_000_000)
  })

  it('não devolve nada além do número', () => {
    /*
     * A trava de privacidade. O payload real deste token carrega CPF, telefone
     * e unidade; se alguém trocar o retorno por um objeto "para aproveitar",
     * este teste reprova antes de o CPF chegar a uma tela.
     */
    const saida = expiracaoDoToken(
      token({
        exp: 1_755_500_000,
        document: '12345678900',
        phone: '11999998888',
        unityId: 3,
        firstName: 'Antônio',
      })
    )
    expect(typeof saida).toBe('number')
  })

  it('recusa exp que não é número', () => {
    // Converter texto em número aqui seria adivinhar. Melhor não mostrar linha
    // nenhuma do que mostrar uma hora inventada.
    expect(expiracaoDoToken(token({ exp: '1755500000' }))).toBeNull()
    expect(expiracaoDoToken(token({ exp: null }))).toBeNull()
    expect(expiracaoDoToken(token({ exp: 0 }))).toBeNull()
    expect(expiracaoDoToken(token({ exp: -5 }))).toBeNull()
  })

  it('recusa token sem exp', () => {
    expect(expiracaoDoToken(token({ email: 'a@b.c' }))).toBeNull()
  })

  it('recusa qualquer coisa que não tenha três partes', () => {
    expect(expiracaoDoToken(token({ exp: 1 }, 2))).toBeNull()
    expect(expiracaoDoToken(`${token({ exp: 1 })}.sobra`)).toBeNull()
    expect(expiracaoDoToken('sem-ponto-nenhum')).toBeNull()
  })

  it('recusa miolo que não é JSON', () => {
    expect(expiracaoDoToken('a.bbbb.c')).toBeNull()
    expect(expiracaoDoToken(`a.${btoa('não é json')}.c`)).toBeNull()
  })

  it('recusa miolo que é JSON mas não é objeto', () => {
    expect(expiracaoDoToken(`a.${btoa('42')}.c`)).toBeNull()
    expect(expiracaoDoToken(`a.${btoa('null')}.c`)).toBeNull()
  })

  it('aguenta ausência de token', () => {
    // Acontece de verdade: entre o logout e a próxima renderização o token é
    // nulo, e derrubar a tela de Ajustes por causa disso seria absurdo.
    expect(expiracaoDoToken(null)).toBeNull()
    expect(expiracaoDoToken(undefined)).toBeNull()
    expect(expiracaoDoToken('')).toBeNull()
  })
})

describe('faixaDaValidade', () => {
  const agora = 1_700_000_000_000

  it('sem vencimento legível, não opina', () => {
    expect(faixaDaValidade(null, agora)).toBe('desconhecida')
  })

  it('separa vencida, perto e tranquila', () => {
    expect(faixaDaValidade(agora - 1, agora)).toBe('vencida')
    expect(faixaDaValidade(agora, agora)).toBe('vencida')
    expect(faixaDaValidade(agora + 30 * 60_000, agora)).toBe('perto')
    expect(faixaDaValidade(agora + 5 * 60 * 60_000, agora)).toBe('ok')
  })

  it('a borda de uma hora cai do lado certo', () => {
    // Exatamente 60 min ainda é tranquilo; um milissegundo a menos já avisa.
    expect(faixaDaValidade(agora + 60 * 60_000, agora)).toBe('ok')
    expect(faixaDaValidade(agora + 60 * 60_000 - 1, agora)).toBe('perto')
  })
})
