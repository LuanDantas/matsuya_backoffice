import { describe, expect, it } from 'vitest'
import { coordenadaValida, distanciaKm, formatarDistancia } from './geo'

/**
 * Estes valores vêm de coordenadas reais do banco de desenvolvimento: a unidade
 * Matsuya Santana e a Matsuya Morumbi. A distância entre elas é conhecida e
 * serve de âncora — se a fórmula mudar, este número muda junto.
 */
const SANTANA = { lat: -23.4996177, lng: -46.6257447 }
const MORUMBI = { lat: -23.6004112, lng: -46.7104862 }

describe('distância', () => {
  it('calcula a distância entre duas unidades reais', () => {
    // 14,15 km em linha reta, cruzando São Paulo de norte a sudoeste. O valor
    // é a saída medida da fórmula, não uma estimativa: serve de âncora para
    // detectar qualquer mudança silenciosa no cálculo.
    expect(distanciaKm(SANTANA, MORUMBI)).toBeCloseTo(14.15, 2)
  })

  it('é simétrica', () => {
    expect(distanciaKm(SANTANA, MORUMBI)).toBeCloseTo(distanciaKm(MORUMBI, SANTANA), 10)
  })

  it('é zero para o mesmo ponto', () => {
    expect(distanciaKm(SANTANA, SANTANA)).toBe(0)
  })
})

describe('coordenada válida', () => {
  it('aceita coordenada real', () => {
    expect(coordenadaValida(-23.4996177, -46.6257447)).toEqual(SANTANA)
  })

  it('aceita string numérica, que é como o JSONB às vezes devolve', () => {
    expect(coordenadaValida('-23.4996177', '-46.6257447')).toEqual(SANTANA)
  })

  /**
   * `0,0` é o valor que sobra quando alguém inicializa um campo e esquece de
   * preencher. Fica no golfo da Guiné — um pino na África no mapa de uma loja
   * de São Paulo chama atenção, mas ordenar entregas por distância a partir
   * dele, não.
   */
  it('rejeita a ilha nula', () => {
    expect(coordenadaValida(0, 0)).toBeNull()
  })

  /**
   * `Number(null)` é 0 e `Number('')` também — sem guarda explícita, uma
   * coordenada ausente vira latitude zero com ar de dado legítimo.
   */
  it('rejeita ausente, nulo, vazio e fora de faixa', () => {
    expect(coordenadaValida(undefined, undefined)).toBeNull()
    expect(coordenadaValida(null, -46)).toBeNull()
    expect(coordenadaValida(-23, null)).toBeNull()
    expect(coordenadaValida('', -46)).toBeNull()
    expect(coordenadaValida('abc', -46)).toBeNull()
    expect(coordenadaValida(91, -46)).toBeNull()
    expect(coordenadaValida(-23, 181)).toBeNull()
  })

  it('aceita zero em um eixo só — é coordenada legítima', () => {
    expect(coordenadaValida(0, -46.6)).toEqual({ lat: 0, lng: -46.6 })
  })
})

describe('formatação', () => {
  it('usa metros abaixo de um quilômetro', () => {
    expect(formatarDistancia(0.42)).toBe('420 m')
  })

  it('usa vírgula decimal até dez quilômetros', () => {
    expect(formatarDistancia(2.34)).toBe('2,3 km')
  })

  it('arredonda para inteiro acima de dez', () => {
    expect(formatarDistancia(15.52)).toBe('16 km')
  })
})
