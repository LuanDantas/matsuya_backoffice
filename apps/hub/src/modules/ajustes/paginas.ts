/**
 * As páginas de Ajustes e a navegação entre elas.
 *
 * Separado do componente porque o `vitest` deste repositório roda sem DOM: o
 * que estiver dentro do `.tsx` não tem como ser coberto. É o mesmo desenho de
 * `app/silenciados.ts` e de `modules/conversas/abas.ts`.
 */

export type PaginaDeAjustes =
  | 'som'
  | 'impressao'
  | 'agentes'
  | 'diagnostico'
  | 'conta'

export interface DescricaoDaPagina {
  chave: PaginaDeAjustes
  rotulo: string
  /** Título grande do painel — pode ser mais explícito que o item da lista. */
  titulo: string
  /** A linha de apoio sob o título. */
  resumo: string
  /**
   * Permissão exigida, ou `null` para qualquer sessão.
   *
   * Só "Agentes de impressão" exige uma: ela é por loja e passa pela API, com
   * `orders:read` do lado do servidor. O resto é preferência deste dispositivo,
   * e esconder ajuste de som de quem não tem permissão de pedido não faria
   * sentido nenhum.
   */
  permissao: string | null
}

export interface GrupoDeAjustes {
  rotulo: string
  paginas: DescricaoDaPagina[]
}

/**
 * Os grupos, na ordem em que aparecem.
 *
 * A ordem não é alfabética nem arbitrária: começa pelo que se mexe no dia a dia
 * (som), desce para o que se configura uma vez (impressão, agentes) e termina
 * no que quase nunca se toca (diagnóstico, conta). É a ordem da frequência de
 * uso, que é a que faz a primeira página aberta ser quase sempre a certa.
 */
export const GRUPOS: readonly GrupoDeAjustes[] = [
  {
    rotulo: 'Gestor de pedidos',
    paginas: [
      {
        chave: 'som',
        rotulo: 'Alertas de som',
        titulo: 'Alertas de som',
        resumo: 'Escolha o que faz barulho neste dispositivo, e quanto.',
        permissao: null,
      },
      {
        chave: 'impressao',
        rotulo: 'Impressão',
        titulo: 'Impressão',
        resumo: 'Como a comanda sai, e o que está acontecendo com ela agora.',
        permissao: null,
      },
    ],
  },
  {
    rotulo: 'Dispositivo',
    paginas: [
      {
        chave: 'agentes',
        rotulo: 'Agentes de impressão',
        titulo: 'Agentes de impressão',
        resumo: 'Os computadores da loja autorizados a imprimir comandas.',
        permissao: 'orders:read',
      },
      {
        chave: 'diagnostico',
        rotulo: 'Diagnóstico',
        titulo: 'Diagnóstico',
        resumo: 'O que este dispositivo está vendo do servidor. Nada aqui se edita.',
        permissao: null,
      },
    ],
  },
  {
    rotulo: 'Conta',
    paginas: [
      {
        chave: 'conta',
        rotulo: 'Minha conta',
        titulo: 'Minha conta',
        resumo: 'Quem está usando este Hub agora.',
        permissao: null,
      },
    ],
  },
]

/**
 * Os grupos que esta sessão pode ver, já sem as páginas que ela não alcança.
 *
 * Grupo que ficou vazio some inteiro — deixar o rótulo "Dispositivo" sozinho,
 * sem nenhum item embaixo, é pior do que não mostrar o grupo: parece defeito.
 */
export function gruposPermitidos(permissoes: ReadonlySet<string>): GrupoDeAjustes[] {
  return GRUPOS.map((grupo) => ({
    ...grupo,
    paginas: grupo.paginas.filter((p) => p.permissao === null || permissoes.has(p.permissao)),
  })).filter((grupo) => grupo.paginas.length > 0)
}

/** Todas as páginas visíveis, achatadas — é a lista que o teclado percorre. */
export function paginasPermitidas(permissoes: ReadonlySet<string>): DescricaoDaPagina[] {
  return gruposPermitidos(permissoes).flatMap((g) => g.paginas)
}

/**
 * A página ativa de verdade.
 *
 * A escolha só vale se ela ainda estiver visível: trocar de loja pode tirar uma
 * permissão, e apontar para uma página que sumiu deixaria o painel vazio sem
 * nada selecionado na lateral. Nesse caso cai para a primeira — que existe
 * sempre, porque "Alertas de som" não exige permissão nenhuma.
 */
export function paginaEfetiva(
  escolhida: PaginaDeAjustes | null,
  permissoes: ReadonlySet<string>
): PaginaDeAjustes {
  const visiveis = paginasPermitidas(permissoes)
  if (escolhida && visiveis.some((p) => p.chave === escolhida)) return escolhida
  return visiveis[0]?.chave ?? 'som'
}

/**
 * A página que a tecla alcança — ou `null` quando ela não navega.
 *
 * A lista é vertical, então Cima e Baixo, e não Esquerda e Direita. Dá a volta
 * nas duas pontas: com cinco itens, chegar ao fim e ter de subir tudo de novo é
 * atrito sem motivo.
 */
export function paginaVizinha(
  atual: PaginaDeAjustes,
  tecla: string,
  permissoes: ReadonlySet<string>
): PaginaDeAjustes | null {
  const visiveis = paginasPermitidas(permissoes)
  const indice = visiveis.findIndex((p) => p.chave === atual)
  if (indice === -1 || visiveis.length === 0) return null

  switch (tecla) {
    case 'ArrowDown':
      return visiveis[(indice + 1) % visiveis.length]!.chave
    case 'ArrowUp':
      return visiveis[(indice - 1 + visiveis.length) % visiveis.length]!.chave
    case 'Home':
      return visiveis[0]!.chave
    case 'End':
      return visiveis[visiveis.length - 1]!.chave
    default:
      return null
  }
}
