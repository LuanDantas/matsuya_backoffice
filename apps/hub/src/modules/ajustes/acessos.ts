import { PERMISSOES, DANGEROUS_PERMISSION_KEYS } from '@matsuya/contracts'
import type { Identidade } from '@matsuya/api-client'
import { TELAS, type DescricaoDaTela } from '../../app/telas'
import { nomeDaLoja } from '../../app/loja'

/**
 * O que esta conta alcança — telas, permissões, papéis e lojas.
 *
 * ## Por que existe um módulo para isto
 *
 * `/auth/me` é chamado a cada entrada e devolve seis campos que **nunca
 * chegaram a pixel nenhum** no Hub: a lista de permissões (que só virava um
 * `Set` de porteiro), as permissões sensíveis (zero referências no repositório
 * inteiro), `scope.unitIds`, e `key`/`scopeKind`/`scopeId` de cada papel. Esta
 * é a primeira tela que os mostra, e a regra de como mostrá-los é testável sem
 * DOM — que é a única coisa que o vitest daqui roda.
 *
 * ## Nomes
 *
 * **Não crie `conta.ts`**: no macOS o sistema de arquivos ignora maiúsculas e
 * ele seria o mesmo caminho de `Conta.tsx`, com o TypeScript recusando o
 * programa inteiro. É o mesmo motivo pelo qual `sinais.ts` não se chama
 * `diagnostico.ts`.
 */

// ── Telas ─────────────────────────────────────────────────────────────────

export interface TelaDaConta {
  tela: DescricaoDaTela
  aberta: boolean
  /** Só nas fechadas: a permissão que falta, já com a frase que dá para ler. */
  falta: { chave: string; descricao: string | null } | null
}

/**
 * As telas do Hub, separadas entre as que abrem e as que não.
 *
 * A pergunta que as pessoas realmente fazem não é "quais permissões eu tenho?",
 * é **"por que eu não vejo Cardápio?"**. Esta função responde a segunda, e
 * responde com a frase do catálogo em português, não com a chave — `catalog:read`
 * não explica nada a quem está no balcão.
 *
 * A fonte é `TELAS`, o mesmo registro que monta o menu lateral: assim a lista
 * daqui não pode discordar do que a barra mostra.
 */
export function telasDaConta(permissoes: ReadonlySet<string>): TelaDaConta[] {
  return TELAS.map((tela) => {
    const aberta = tela.permissao === null || permissoes.has(tela.permissao)

    return {
      tela,
      aberta,
      falta:
        aberta || tela.permissao === null
          ? null
          : { chave: tela.permissao, descricao: descricaoDaPermissao(tela.permissao) },
    }
  })
}

// ── Permissões ────────────────────────────────────────────────────────────

export interface PermissaoDaConta {
  chave: string
  /** Frase do catálogo, ou `null` quando a chave não está nele. */
  descricao: string | null
  sensivel: boolean
}

export interface GrupoDePermissoes {
  /** O domínio da chave: `orders`, `chat`, `catalog`… */
  dominio: string
  rotulo: string
  permissoes: PermissaoDaConta[]
}

const ROTULO_DO_DOMINIO: Record<string, string> = {
  orders: 'Pedidos',
  chat: 'Conversas',
  catalog: 'Cardápio',
  stores: 'Loja',
  delivery: 'Entrega',
  courier: 'Entregadores',
  wallet: 'Carteira',
  cashback: 'Cashback',
  payments: 'Pagamentos',
  finance: 'Financeiro',
  promotions: 'Promoções',
  coupons: 'Cupons',
  loyalty: 'Fidelidade',
  notifications: 'Avisos',
  customers: 'Clientes',
  reviews: 'Avaliações',
  reports: 'Relatórios',
  users: 'Pessoas',
  roles: 'Papéis',
  audit: 'Auditoria',
  settings: 'Configuração',
  devices: 'Dispositivos',
  print: 'Impressão',
  shift: 'Turno',
  orderhub: 'Order Hub',
  validator: 'Validador',
}

/**
 * As permissões desta sessão, agrupadas por domínio.
 *
 * Percorre o **catálogo** e não a resposta do servidor, de propósito: o catálogo
 * já vem agrupado por assunto, e seguir a ordem em que a API respondeu deixaria
 * "Pedidos" espalhado entre "Carteira" e "Auditoria".
 *
 * Uma chave que a sessão tem e o catálogo não conhece **não desaparece** — ela
 * cai num grupo pelo próprio prefixo, com `descricao: null`. Sumir em silêncio
 * seria o pior comportamento possível numa tela cujo assunto é justamente "o
 * que eu posso".
 */
export function permissoesDaConta(identidade: Identidade): GrupoDePermissoes[] {
  const tem = new Set(identidade.permissions)

  /*
   * `dangerousPermissions` é a resposta do servidor e manda. Quando ele vem
   * vazio — sessão sem nenhuma sensível, ou versão antiga da API — a lista
   * gerada do catálogo responde. Não é redundância: sem o segundo caminho, uma
   * permissão perigosa apareceria como comum.
   */
  const sensiveis = new Set<string>(
    identidade.dangerousPermissions.length > 0
      ? identidade.dangerousPermissions
      : DANGEROUS_PERMISSION_KEYS
  )

  const grupos = new Map<string, GrupoDePermissoes>()

  const guardar = (chave: string, descricao: string | null) => {
    const dominio = chave.split(':')[0] ?? 'outros'
    let grupo = grupos.get(dominio)

    if (!grupo) {
      grupo = { dominio, rotulo: ROTULO_DO_DOMINIO[dominio] ?? dominio, permissoes: [] }
      grupos.set(dominio, grupo)
    }

    grupo.permissoes.push({ chave, descricao, sensivel: sensiveis.has(chave) })
  }

  const conhecidas = new Set<string>()

  for (const permissao of PERMISSOES) {
    conhecidas.add(permissao.chave)
    if (tem.has(permissao.chave)) guardar(permissao.chave, permissao.descricao)
  }

  for (const chave of identidade.permissions) {
    if (!conhecidas.has(chave)) guardar(chave, null)
  }

  return [...grupos.values()]
}

function descricaoDaPermissao(chave: string): string | null {
  return PERMISSOES.find((p) => p.chave === chave)?.descricao ?? null
}

// ── Papéis ────────────────────────────────────────────────────────────────

export interface PapelDaConta {
  chave: string
  nome: string
  /** Onde ele vale, já escrito por extenso. */
  onde: string
  expiraEm: string | null
  vencido: boolean
}

/**
 * Os papéis desta conta, com escopo e validade.
 *
 * `roles[]` é buscado a cada entrada e hoje só aparece dentro de um `<details>`
 * **fechado** da página de Diagnóstico, colado com um `·` na linha "Sessão". É
 * a resposta para "com que autoridade eu estou aqui" e merece estar em primeiro
 * plano na página da conta.
 *
 * O papel vencido continua na lista em vez de sumir: a API já para de honrá-lo
 * (toda consulta filtra por `expires_at`), e quem perdeu acesso ontem precisa
 * ver **por quê** — não uma lista que encolheu sem explicação.
 */
export function papeisDaConta(identidade: Identidade, agora: number): PapelDaConta[] {
  const nomeDaUnidade = new Map(identidade.units.map((u) => [u.id, u.name]))

  return identidade.roles.map((papel) => {
    const vencido = papel.expiresAt !== null && new Date(papel.expiresAt).getTime() <= agora

    return {
      chave: papel.key,
      nome: papel.name,
      onde: ondeVale(papel.scopeKind, papel.scopeId, nomeDaUnidade),
      expiraEm: papel.expiresAt,
      vencido,
    }
  })
}

function ondeVale(
  escopo: 'network' | 'group' | 'unit',
  id: number | null,
  nomes: ReadonlyMap<number, string>
): string {
  if (escopo === 'network') return 'em toda a rede'

  // Grupos de loja existem no banco da API e o Hub nunca recebeu os nomes deles.
  // Dizer "num grupo de lojas" é impreciso e verdadeiro; inventar um nome seria
  // preciso e falso.
  if (escopo === 'group') return 'num grupo de lojas'

  const nome = id === null ? null : nomes.get(id)
  return nome ? `em ${nomeDaLoja(nome).principal}` : 'numa loja'
}

// ── Lojas ─────────────────────────────────────────────────────────────────

export interface LojaDaConta {
  id: number
  nome: string
  /** Bairro, quando o nome começa com a marca. */
  apoio: string | null
  /** Este dispositivo está acompanhando o quadro dela. */
  acompanhando: boolean
  /** Escolhida neste dispositivo, mas fora do alcance atual da conta. */
  orfa: boolean
}

/**
 * As lojas desta conta, separando **alcance** de **acompanhamento**.
 *
 * São coisas diferentes e a tela antiga fundia as duas num selo só. Alcance vem
 * do papel e do servidor; acompanhamento é preferência deste tablete, guardada
 * em `localStorage`. Quem tem nove lojas e segue duas precisa enxergar as duas
 * respostas.
 *
 * A loja **órfã** — escolhida aqui e que saiu do alcance — aparece marcada. O
 * saneamento no boot já a descartaria, mas quem tem o acesso revogado no meio do
 * expediente ficaria com uma loja sumindo do quadro sem nenhuma explicação.
 */
export function lojasDaConta(
  identidade: Identidade,
  unidadesAtuais: readonly number[]
): LojaDaConta[] {
  const acompanhadas = new Set(unidadesAtuais)
  const alcancaveis = new Set(identidade.units.map((u) => u.id))

  const lista: LojaDaConta[] = identidade.units.map((unidade) => {
    const { principal, apoio } = nomeDaLoja(unidade.name)

    return {
      id: unidade.id,
      nome: principal,
      apoio,
      acompanhando: acompanhadas.has(unidade.id),
      orfa: false,
    }
  })

  for (const id of unidadesAtuais) {
    if (alcancaveis.has(id)) continue
    lista.push({ id, nome: `Unidade ${id}`, apoio: null, acompanhando: true, orfa: true })
  }

  return lista
}
