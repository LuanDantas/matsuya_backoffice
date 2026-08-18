import { describe, expect, it } from 'vitest'
import {
  ganhoDoVolume,
  gravarPreferencias,
  lerPreferencias,
  mesclarPreferencias,
  normalizarVolume,
  PADRAO,
  podeSoar,
  proximoVolumeDaRoda,
  CHAVE_DO_SOM,
} from './preferencias'

/** `localStorage` de mentira — o vitest daqui roda em node, sem DOM. */
function armazenamento(inicial: Record<string, string> = {}): Storage {
  const dados = new Map(Object.entries(inicial))
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    clear: () => dados.clear(),
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() {
      return dados.size
    },
  } as Storage
}

describe('mesclarPreferencias', () => {
  it('devolve o padrão sem nada guardado', () => {
    expect(mesclarPreferencias(null)).toEqual(PADRAO)
    expect(mesclarPreferencias(undefined)).toEqual(PADRAO)
  })

  it('não deixa o objeto guardado compartilhar referência com o padrão', () => {
    // Sem a cópia, mexer nos eventos de uma leitura mudaria a constante do
    // módulo — e a próxima leitura já nasceria "com o que a anterior escolheu".
    const a = mesclarPreferencias(null)
    a.eventos['pedido-novo'] = false
    expect(mesclarPreferencias(null).eventos['pedido-novo']).toBe(true)
  })

  it('preserva o que veio e completa o que faltou', () => {
    const saida = mesclarPreferencias({ mudo: true })
    expect(saida.mudo).toBe(true)
    expect(saida.volume).toBe(PADRAO.volume)
    expect(saida.eventos).toEqual(PADRAO.eventos)
  })

  it('tolera lixo campo a campo, sem derrubar o resto', () => {
    /*
     * O que está no armazenamento foi escrito por uma versão anterior deste
     * código, ou por alguém com o console aberto. Um campo estragado não pode
     * levar junto os que estavam bons.
     */
    const saida = mesclarPreferencias({
      mudo: 'sim',
      volume: 'alto',
      eventos: { 'pedido-novo': 'não', erro: false },
    })

    expect(saida.mudo).toBe(PADRAO.mudo)
    expect(saida.volume).toBe(PADRAO.volume)
    expect(saida.eventos['pedido-novo']).toBe(true)
    expect(saida.eventos.erro).toBe(false)
  })

  it('ignora um evento que não existe', () => {
    const saida = mesclarPreferencias({ eventos: { inventado: true } })
    expect(saida.eventos).toEqual(PADRAO.eventos)
  })

  it('guarda o som escolhido de pedido recebido', () => {
    expect(mesclarPreferencias({ somDePedidoNovo: 'campainha' }).somDePedidoNovo).toBe(
      'campainha'
    )
  })

  it('cai no padrão quando o som guardado não existe mais', () => {
    /*
     * A lista de sons pode mudar entre versões. Um nome que sumiu não pode
     * deixar o alerta mudo — que é o que aconteceria se ele fosse usado como
     * chave direta no mapa de padrões e devolvesse `undefined`.
     */
    expect(mesclarPreferencias({ somDePedidoNovo: 'trombeta' }).somDePedidoNovo).toBe(
      PADRAO.somDePedidoNovo
    )
    expect(mesclarPreferencias({ somDePedidoNovo: 7 }).somDePedidoNovo).toBe(
      PADRAO.somDePedidoNovo
    )
  })
})

describe('normalizarVolume', () => {
  it('grampeia nos dois extremos', () => {
    expect(normalizarVolume(-1)).toBe(0)
    expect(normalizarVolume(5)).toBe(1)
  })

  it('recusa o que não é número finito', () => {
    // `NaN` num ganho de Web Audio não lança: ele simplesmente emudece o nó, e
    // o defeito aparece como "o som parou de funcionar" sem nenhuma pista.
    expect(normalizarVolume(NaN)).toBe(PADRAO.volume)
    expect(normalizarVolume(Infinity)).toBe(PADRAO.volume)
    expect(normalizarVolume('0.5')).toBe(PADRAO.volume)
    expect(normalizarVolume(null)).toBe(PADRAO.volume)
  })
})

describe('podeSoar', () => {
  const base = { ...PADRAO, eventos: { ...PADRAO.eventos } }

  it('toca quando tudo está ligado', () => {
    expect(podeSoar(base, 'pedido-novo')).toBe(true)
  })

  it('mudo cala tudo', () => {
    expect(podeSoar({ ...base, mudo: true }, 'sla-estourado')).toBe(false)
  })

  it('volume zero também cala', () => {
    expect(podeSoar({ ...base, volume: 0 }, 'sla-estourado')).toBe(false)
  })

  it('cala só o evento desligado', () => {
    const so = { ...base, eventos: { ...base.eventos, 'pedido-novo': false } }
    expect(podeSoar(so, 'pedido-novo')).toBe(false)
    expect(podeSoar(so, 'sla-estourado')).toBe(true)
  })

  it('mudo e volume continuam sendo respostas separadas', () => {
    /*
     * As duas calam, mas cada uma guarda a própria resposta: silenciar não pode
     * zerar o volume que a pessoa ajustou, e arrastar até zero não pode marcar
     * como mudo um som que ela só queria baixo. Fazer uma significar a outra é
     * como um controle passa a mentir sobre o outro.
     */
    const mudoComVolume = { ...base, mudo: true, volume: 0.9 }
    expect(mudoComVolume.volume).toBe(0.9)

    const zeradoSemMudo = { ...base, volume: 0 }
    expect(zeradoSemMudo.mudo).toBe(false)
  })
})

describe('ganhoDoVolume', () => {
  it('é zero no zero e um no topo', () => {
    expect(ganhoDoVolume(0)).toBe(0)
    expect(ganhoDoVolume(1)).toBe(1)
  })

  it('curva o meio para baixo, seguindo o ouvido', () => {
    // Linear, o meio do curso soa quase igual ao topo — o ouvido responde de
    // forma aproximadamente logarítmica. O quadrado é a aproximação barata que
    // faz meio parecer meio.
    expect(ganhoDoVolume(0.5)).toBeCloseTo(0.25)
    expect(ganhoDoVolume(0.5)).toBeLessThan(0.5)
  })

  it('grampeia antes de elevar', () => {
    expect(ganhoDoVolume(2)).toBe(1)
    expect(ganhoDoVolume(-3)).toBe(0)
  })
})

describe('proximoVolumeDaRoda', () => {
  it('para cima aumenta', () => {
    // `deltaY` é NEGATIVO ao girar para cima. Seguir o valor cru faria a roda
    // baixar o volume ao subir — o oposto de qualquer controle de volume.
    expect(proximoVolumeDaRoda(0.5, -100)).toBeCloseTo(0.52)
  })

  it('para baixo diminui', () => {
    expect(proximoVolumeDaRoda(0.5, 100)).toBeCloseTo(0.48)
  })

  it('não acumula ruído de ponto flutuante ao longo de vários giros', () => {
    // Somar float repetidamente vira 0.30000000000000004, e isso apareceria na
    // tela como um "71%" que ninguém pediu.
    let v = 0.5
    for (let i = 0; i < 10; i += 1) v = proximoVolumeDaRoda(v, -100)
    expect(v).toBe(0.7)
  })

  it('para nos extremos', () => {
    expect(proximoVolumeDaRoda(1, -100)).toBe(1)
    expect(proximoVolumeDaRoda(0, 100)).toBe(0)
  })

  it('ignora giro nulo', () => {
    expect(proximoVolumeDaRoda(0.4, 0)).toBeCloseTo(0.4)
  })

  it('conserta um volume guardado inválido no caminho', () => {
    expect(proximoVolumeDaRoda(NaN, -100)).toBeCloseTo(PADRAO.volume + 0.02)
  })
})

describe('ler e gravar', () => {
  it('vai e volta', () => {
    const loja = armazenamento()
    const escolha = { ...PADRAO, mudo: true, volume: 0.2 }

    gravarPreferencias(escolha, loja)
    expect(lerPreferencias(loja)).toEqual(escolha)
  })

  it('cai no padrão com JSON quebrado', () => {
    // Derrubar o boot do Hub por causa de uma preferência de som seria pior do
    // que perder a preferência.
    const loja = armazenamento({ [CHAVE_DO_SOM]: '{isto não é json' })
    expect(lerPreferencias(loja)).toEqual(PADRAO)
  })

  it('não quebra sem armazenamento nenhum', () => {
    // Modo privado, ou este próprio teste rodando em node.
    expect(lerPreferencias(null)).toEqual(PADRAO)
    expect(() => gravarPreferencias(PADRAO, null)).not.toThrow()
  })
})
