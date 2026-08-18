import { describe, expect, it } from 'vitest'
import { decorrido, restante } from './formato'

const AGORA = new Date('2026-08-16T12:00:00.000Z').getTime()
const daqui = (segundos: number) => new Date(AGORA + segundos * 1000).toISOString()
const atras = (segundos: number) => new Date(AGORA - segundos * 1000).toISOString()

describe('duração nos rótulos do quadro', () => {
  describe('acima de um dia', () => {
    /**
     * "1320h" é correto e ilegível — ninguém converte isso para "quase dois
     * meses" de relance. Apareceu no bloco "o mais antigo" da home, com um
     * pedido em aberto havia 55 dias.
     */
    it('troca a unidade para dia', () => {
      expect(decorrido(atras(24 * 3600), AGORA)).toBe('1d')
      expect(decorrido(atras(55 * 24 * 3600), AGORA)).toBe('55d')
    })

    it('mantém o resto em horas na primeira semana', () => {
      expect(decorrido(atras(26 * 3600), AGORA)).toBe('1d2h')
      expect(decorrido(atras((3 * 24 + 7) * 3600), AGORA)).toBe('3d7h')
    })

    /** Depois de uma semana, hora é precisão sobre um número que já a perdeu. */
    it('deixa as horas de fora depois de uma semana', () => {
      expect(decorrido(atras((7 * 24 + 9) * 3600), AGORA)).toBe('7d')
      expect(decorrido(atras((30 * 24 + 13) * 3600), AGORA)).toBe('30d')
    })

    it('não muda nada abaixo de um dia', () => {
      expect(decorrido(atras(23 * 3600), AGORA)).toBe('23h')
      expect(decorrido(atras(3 * 3600 + 7 * 60), AGORA)).toBe('3h07min')
    })
  })

  describe('quanto falta', () => {
    it('mostra minutos, não m:ss', () => {
      expect(restante(daqui(120), AGORA)).toBe('2min')
    })

    /**
     * Arredonda para cima: faltando 30 s, "1min" é o tempo que o operador tem
     * de fato. "0min" com meio minuto sobrando seria o cartão mentindo.
     */
    it('arredonda para cima enquanto ainda há tempo', () => {
      expect(restante(daqui(30), AGORA)).toBe('1min')
      expect(restante(daqui(61), AGORA)).toBe('2min')
    })

    it('só chega a zero quando o prazo acaba', () => {
      expect(restante(daqui(0), AGORA)).toBe('0min')
    })

    it('nunca volta a subir depois de vencido', () => {
      expect(restante(atras(600), AGORA)).toBe('0min')
    })

    it('passa a horas depois de sessenta minutos', () => {
      expect(restante(daqui(3600), AGORA)).toBe('1h')
      expect(restante(daqui(3600 + 300), AGORA)).toBe('1h05min')
      expect(restante(daqui(3600 * 2 + 60 * 30), AGORA)).toBe('2h30min')
    })
  })

  describe('quanto já passou', () => {
    it('conta para frente', () => {
      expect(decorrido(atras(180), AGORA)).toBe('3min')
    })

    it('não fica negativo com instante no futuro', () => {
      expect(decorrido(daqui(300), AGORA)).toBe('0min')
    })

    it('passa a horas', () => {
      expect(decorrido(atras(3600 * 3 + 60 * 7), AGORA)).toBe('3h07min')
    })
  })

  /**
   * O motivo de o formato ter mudado: "1:05" num cartão que também mostra
   * horários lê-se como uma hora e cinco. A unidade explícita fecha a dúvida.
   */
  it('nunca produz um formato que se confunda com horário', () => {
    for (const s of [65, 3900, 7200, 30, 0]) {
      expect(restante(daqui(s), AGORA)).not.toMatch(/^\d+:\d/)
    }
  })
})
