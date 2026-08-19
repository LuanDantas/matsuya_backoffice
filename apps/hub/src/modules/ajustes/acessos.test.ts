import { describe, expect, it } from 'vitest'
import type { Identidade } from '@matsuya/api-client'
import {
  lojasDaConta,
  papeisDaConta,
  permissoesDaConta,
  telasDaConta,
} from './acessos'

function identidade(over: Partial<Identidade> = {}): Identidade {
  return {
    user: { id: 7, name: 'Antônio de Assunção', email: 'antonio@matsuya.com.br' },
    permissions: [],
    dangerousPermissions: [],
    scope: { network: false, unitIds: [1] },
    units: [
      { id: 1, name: 'MATSUYA SANTANA', lat: null, lng: null },
      { id: 2, name: 'MATSUYA TATUAPÉ', lat: null, lng: null },
    ],
    roles: [],
    ...over,
  }
}

describe('telasDaConta', () => {
  it('Ajustes abre para qualquer sessão autenticada', () => {
    // É a tela que contém esta própria página; se ela dependesse de permissão,
    // uma conta sem nada não teria como nem ver por que não tem nada.
    const ajustes = telasDaConta(new Set()).find((t) => t.tela.tela === 'ajustes')
    expect(ajustes?.aberta).toBe(true)
    expect(ajustes?.falta).toBeNull()
  })

  it('uma permissão pode abrir mais de uma tela', () => {
    // `orders:read` abre Pedidos e Em rota. Uma partição que tratasse permissão
    // e tela como 1:1 perderia uma das duas.
    const abertas = telasDaConta(new Set(['orders:read']))
      .filter((t) => t.aberta)
      .map((t) => t.tela.tela)

    expect(abertas).toContain('pedidos')
    expect(abertas).toContain('rota')
    expect(abertas).toContain('ajustes')
    expect(abertas).not.toContain('cardapio')
  })

  it('a tela fechada diz o que falta, em português', () => {
    const cardapio = telasDaConta(new Set()).find((t) => t.tela.tela === 'cardapio')

    expect(cardapio?.aberta).toBe(false)
    expect(cardapio?.falta?.chave).toBe('catalog:read')
    // A chave sozinha não explica nada a quem está no balcão.
    expect(cardapio?.falta?.descricao).toBeTruthy()
    expect(cardapio?.falta?.descricao).not.toBe('catalog:read')
  })

  it('não perde nem duplica nenhuma tela', () => {
    const todas = telasDaConta(new Set(['orders:read', 'chat:read']))
    expect(todas).toHaveLength(6)
    expect(new Set(todas.map((t) => t.tela.tela)).size).toBe(6)
  })
})

describe('permissoesDaConta', () => {
  it('agrupa por domínio e traz a descrição do catálogo', () => {
    const grupos = permissoesDaConta(
      identidade({ permissions: ['orders:read', 'orders:accept', 'chat:read'] })
    )

    const pedidos = grupos.find((g) => g.dominio === 'orders')
    expect(pedidos?.rotulo).toBe('Pedidos')
    expect(pedidos?.permissoes).toHaveLength(2)
    expect(pedidos?.permissoes[0]?.descricao).toBeTruthy()

    expect(grupos.find((g) => g.dominio === 'chat')?.rotulo).toBe('Conversas')
  })

  it('segue a ordem do catálogo, não a que o servidor mandou', () => {
    /*
     * O catálogo já vem agrupado por assunto. Respeitar a ordem da resposta
     * espalharia "Pedidos" entre "Carteira" e "Auditoria" sempre que a API
     * mudasse a consulta.
     */
    const grupos = permissoesDaConta(
      identidade({ permissions: ['orders:accept', 'orders:read'] })
    )

    expect(grupos[0]?.permissoes.map((p) => p.chave)).toEqual([
      'orders:read',
      'orders:accept',
    ])
  })

  it('marca as sensíveis pela resposta do servidor', () => {
    const grupos = permissoesDaConta(
      identidade({
        permissions: ['orders:read', 'wallet:adjust'],
        dangerousPermissions: ['wallet:adjust'],
      })
    )

    const todas = grupos.flatMap((g) => g.permissoes)
    expect(todas.find((p) => p.chave === 'wallet:adjust')?.sensivel).toBe(true)
    expect(todas.find((p) => p.chave === 'orders:read')?.sensivel).toBe(false)
  })

  it('cai no catálogo quando o servidor não manda as sensíveis', () => {
    // Sem este caminho, uma permissão perigosa apareceria como comum só porque
    // a resposta veio sem o campo.
    const grupos = permissoesDaConta(
      identidade({ permissions: ['wallet:adjust'], dangerousPermissions: [] })
    )

    expect(grupos.flatMap((g) => g.permissoes)[0]?.sensivel).toBe(true)
  })

  it('uma chave fora do catálogo aparece, em vez de sumir', () => {
    /*
     * A API pode conceder algo que este front ainda não conhece. Numa tela cujo
     * assunto é "o que eu posso", omitir em silêncio é o pior desfecho.
     */
    const grupos = permissoesDaConta(
      identidade({ permissions: ['orders:read', 'inventado:novo'] })
    )

    const nova = grupos
      .flatMap((g) => g.permissoes)
      .find((p) => p.chave === 'inventado:novo')

    expect(nova).toBeDefined()
    expect(nova?.descricao).toBeNull()
  })

  it('sessão sem permissão nenhuma devolve lista vazia', () => {
    expect(permissoesDaConta(identidade())).toEqual([])
  })
})

describe('papeisDaConta', () => {
  const agora = Date.parse('2026-08-18T12:00:00Z')

  it('escreve o escopo por extenso', () => {
    const papeis = papeisDaConta(
      identidade({
        roles: [
          { key: 'network_admin', name: 'Administrador da rede', scopeKind: 'network', scopeId: null, expiresAt: null },
          { key: 'store_manager', name: 'Responsável da unidade', scopeKind: 'unit', scopeId: 1, expiresAt: null },
          { key: 'regional_manager', name: 'Gerente regional', scopeKind: 'group', scopeId: 4, expiresAt: null },
        ],
      }),
      agora
    )

    expect(papeis[0]?.onde).toBe('em toda a rede')
    // O nome sai por `nomeDaLoja`, sem o prefixo da marca gritado em maiúsculas.
    expect(papeis[1]?.onde).toBe('em Santana')
    // O Hub nunca recebeu os nomes dos grupos; impreciso e verdadeiro é melhor
    // do que preciso e inventado.
    expect(papeis[2]?.onde).toBe('num grupo de lojas')
  })

  it('cai num texto genérico quando a unidade do papel não está no alcance', () => {
    const papeis = papeisDaConta(
      identidade({
        roles: [{ key: 'store_manager', name: 'Responsável', scopeKind: 'unit', scopeId: 99, expiresAt: null }],
      }),
      agora
    )

    expect(papeis[0]?.onde).toBe('numa loja')
  })

  it('separa vencido de vigente, e não esconde o vencido', () => {
    const papeis = papeisDaConta(
      identidade({
        roles: [
          { key: 'support', name: 'Suporte', scopeKind: 'network', scopeId: null, expiresAt: '2026-08-01T00:00:00Z' },
          { key: 'store_operator', name: 'Atendente', scopeKind: 'unit', scopeId: 1, expiresAt: '2026-12-01T00:00:00Z' },
          { key: 'store_manager', name: 'Responsável', scopeKind: 'unit', scopeId: 2, expiresAt: null },
        ],
      }),
      agora
    )

    expect(papeis.map((p) => p.vencido)).toEqual([true, false, false])
    // Some da lista quem perdeu o acesso ontem é como alguém fica sem entender
    // por que a tela mudou.
    expect(papeis).toHaveLength(3)
  })

  it('conta vazia não quebra', () => {
    expect(papeisDaConta(identidade(), agora)).toEqual([])
  })
})

describe('lojasDaConta', () => {
  it('separa alcance de acompanhamento', () => {
    const lojas = lojasDaConta(identidade(), [1])

    expect(lojas).toHaveLength(2)
    expect(lojas[0]).toMatchObject({ id: 1, nome: 'Santana', acompanhando: true, orfa: false })
    expect(lojas[1]).toMatchObject({ id: 2, nome: 'Tatuapé', acompanhando: false })
  })

  it('a loja escolhida que saiu do alcance aparece marcada', () => {
    /*
     * O saneamento do boot descartaria o id 9, mas quem tem o acesso revogado
     * no meio do expediente veria a loja sumir do quadro sem nenhuma pista.
     */
    const lojas = lojasDaConta(identidade(), [1, 9])
    const orfa = lojas.find((l) => l.id === 9)

    expect(orfa?.orfa).toBe(true)
    expect(orfa?.acompanhando).toBe(true)
  })

  it('nenhuma loja acompanhada ainda lista o alcance', () => {
    const lojas = lojasDaConta(identidade(), [])
    expect(lojas).toHaveLength(2)
    expect(lojas.every((l) => !l.acompanhando)).toBe(true)
  })
})
