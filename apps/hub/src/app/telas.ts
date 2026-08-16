import type { NomeDoIcone } from '@matsuya/ui'

/**
 * Registro das telas do Hub.
 *
 * Um lugar só descreve rótulo, ícone e permissão de cada tela. O menu, o
 * roteamento e o título derivam daqui — acrescentar uma tela é acrescentar uma
 * linha, e esquecer de esconder um item de menu deixa de ser possível.
 *
 * `permissao: null` significa que qualquer sessão autenticada pode entrar.
 */

export type Tela = 'inicio' | 'pedidos' | 'rota' | 'conversas' | 'cardapio' | 'ajustes'

export interface DescricaoDaTela {
  tela: Tela
  rotulo: string
  icone: NomeDoIcone
  permissao: string | null
  /** Texto do `aria-label` quando o menu está recolhido e só há ícone. */
  descricao: string
}

export const TELAS: ReadonlyArray<DescricaoDaTela> = [
  {
    tela: 'inicio',
    rotulo: 'Início',
    icone: 'casa',
    permissao: 'reports:read',
    descricao: 'Início — resumo da unidade',
  },
  {
    tela: 'pedidos',
    rotulo: 'Pedidos',
    icone: 'sacola',
    permissao: 'orders:read',
    descricao: 'Pedidos — quadro da loja',
  },
  {
    tela: 'rota',
    rotulo: 'Em rota',
    icone: 'moto',
    permissao: 'orders:read',
    descricao: 'Em rota — entregas a caminho',
  },
  {
    tela: 'conversas',
    rotulo: 'Conversas',
    icone: 'balao',
    permissao: 'chat:read',
    descricao: 'Conversas com clientes',
  },
  {
    tela: 'cardapio',
    rotulo: 'Cardápio',
    icone: 'lista',
    permissao: 'catalog:read',
    descricao: 'Cardápio — itens disponíveis e pausados',
  },
  {
    tela: 'ajustes',
    rotulo: 'Ajustes',
    icone: 'engrenagem',
    permissao: null,
    descricao: 'Ajustes do aplicativo neste dispositivo',
  },
]

/**
 * As telas que este ator pode abrir.
 *
 * Item de menu que responde 403 ensina o operador a não confiar na navegação —
 * o oposto do que uma barra de navegação existe para fazer.
 */
export function telasPermitidas(permissoes: ReadonlySet<string>): DescricaoDaTela[] {
  return TELAS.filter((t) => t.permissao === null || permissoes.has(t.permissao))
}

/** A primeira tela que o ator pode ver, na ordem do menu. */
export function telaInicial(permissoes: ReadonlySet<string>): Tela {
  // Pedidos é o destino natural: o tablet de balcão é ligado para trabalhar
  // pedido. Só cai para outra coisa quem não tem `orders:read`.
  if (permissoes.has('orders:read')) return 'pedidos'
  return telasPermitidas(permissoes)[0]?.tela ?? 'ajustes'
}
