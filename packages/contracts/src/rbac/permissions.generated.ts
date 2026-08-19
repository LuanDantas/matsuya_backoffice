/**
 * ARQUIVO GERADO — não edite à mão.
 *
 * Fonte: `src/platform/rbac/catalog.json` no repositório da API.
 * Para atualizar: `node tooling/gerar-permissoes.mjs` na raiz do monorepo.
 *
 * A geração existe para que a união de chaves aqui e as linhas da tabela
 * `permissions` no banco sejam literalmente a mesma lista. Copiar à mão
 * diverge, e a divergência aparece como uma permissão que o TypeScript aceita e
 * que nunca é concedida a ninguém.
 *
 * **As descrições em pt-BR também vêm daqui.** Isso significa que corrigir uma
 * vírgula numa `description` no repositório da API reprova
 * `pnpm contracts:drift` até alguém regerar este arquivo. É o comportamento
 * certo — texto que aparece na tela é contrato como qualquer outro —, mas é
 * inesperado o bastante para merecer estar escrito: se o portão reprovou e você
 * não mexeu em nada aqui, rode o gerador.
 */

export const PERMISSION_KEYS = [
  'orders:read',
  'orders:accept',
  'orders:reject',
  'orders:ready',
  'orders:dispatch',
  'orders:eta:write',
  'orders:item:cancel',
  'orders:adjust',
  'orders:cancel',
  'orders:cancel:any',
  'orders:delivery:fail',
  'orders:autoaccept',
  'orders:refund',
  'chat:read',
  'chat:write',
  'chat:moderate',
  'catalog:read',
  'catalog:master:write',
  'catalog:availability:write',
  'catalog:price:write',
  'catalog:lock',
  'catalog:publish',
  'stores:settings:write',
  'stores:pause:write',
  'stores:hours:write',
  'stores:open_close',
  'delivery:zones:write',
  'courier:assign',
  'wallet:read',
  'wallet:adjust',
  'wallet:adjust:high',
  'cashback:config:write',
  'payments:refund',
  'finance:view',
  'finance:reconcile',
  'promotions:write',
  'coupons:read',
  'coupons:write',
  'loyalty:plans:write',
  'loyalty:benefits:write',
  'notifications:broadcast',
  'customers:read',
  'customers:pii:read',
  'customers:export',
  'customers:erase',
  'reviews:read',
  'reviews:reply',
  'reports:read',
  'reports:export',
  'reports:schedule',
  'users:read',
  'users:invite',
  'users:roles:write',
  'roles:manage',
  'audit:read',
  'audit:export',
  'settings:write',
  'devices:manage',
  'print:use',
  'shift:close',
  'orderhub:access',
  'validator:use',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/** Exigem reautenticação com MFA quando o fluxo existir. */
export const DANGEROUS_PERMISSION_KEYS = [
  'orders:cancel:any',
  'orders:refund',
  'wallet:adjust',
  'wallet:adjust:high',
  'cashback:config:write',
  'payments:refund',
  'customers:pii:read',
  'customers:export',
  'customers:erase',
  'users:invite',
  'users:roles:write',
  'roles:manage',
  'settings:write',
] as const satisfies ReadonlyArray<PermissionKey>

export const ROLE_KEYS = [
  'network_admin',
  'network_viewer',
  'finance',
  'marketing',
  'support',
  'regional_manager',
  'store_manager',
  'store_operator',
  'customer',
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

export interface Permissao {
  chave: PermissionKey
  /** Frase em pt-BR, escrita no catálogo da API. É o que a interface mostra. */
  descricao: string
  perigosa: boolean
}

/**
 * As permissões com o texto que dá para ler.
 *
 * Na ordem do catálogo, que já vem agrupada por domínio — reordenar aqui
 * desmancharia esse agrupamento e obrigaria cada tela a reinventá-lo.
 *
 * `chave: PermissionKey` é autoconferência: se o gerador emitir uma chave que
 * não está na união acima, o `typecheck` reprova sozinho.
 */
export const PERMISSOES: ReadonlyArray<Permissao> = [
  { chave: 'orders:read', descricao: 'Ver pedidos no escopo', perigosa: false },
  { chave: 'orders:accept', descricao: 'Aceitar pedido', perigosa: false },
  { chave: 'orders:reject', descricao: 'Recusar pedido antes do aceite', perigosa: false },
  { chave: 'orders:ready', descricao: 'Marcar pedido como pronto', perigosa: false },
  { chave: 'orders:dispatch', descricao: 'Despachar pedido para entrega', perigosa: false },
  { chave: 'orders:eta:write', descricao: 'Alterar a previsão de entrega', perigosa: false },
  { chave: 'orders:item:cancel', descricao: 'Cancelar item ou reduzir quantidade', perigosa: false },
  { chave: 'orders:adjust', descricao: 'Ajustar pedido após o aceite', perigosa: false },
  { chave: 'orders:cancel', descricao: 'Cancelar pedido após o aceite', perigosa: false },
  { chave: 'orders:cancel:any', descricao: 'Cancelar mesmo após sair para entrega', perigosa: true },
  { chave: 'orders:delivery:fail', descricao: 'Registrar falha na entrega', perigosa: false },
  { chave: 'orders:autoaccept', descricao: 'Ligar o aceite automático da unidade', perigosa: false },
  { chave: 'orders:refund', descricao: 'Estornar pedido', perigosa: true },
  { chave: 'chat:read', descricao: 'Ler a conversa com o cliente', perigosa: false },
  { chave: 'chat:write', descricao: 'Responder o cliente', perigosa: false },
  { chave: 'chat:moderate', descricao: 'Ocultar mensagem', perigosa: false },
  { chave: 'catalog:read', descricao: 'Ler o cardápio', perigosa: false },
  { chave: 'catalog:master:write', descricao: 'Editar o cardápio mestre da rede', perigosa: false },
  { chave: 'catalog:availability:write', descricao: 'Marcar item indisponível na unidade', perigosa: false },
  { chave: 'catalog:price:write', descricao: 'Sobrescrever preço na unidade', perigosa: false },
  { chave: 'catalog:lock', descricao: 'Travar campo do cardápio para as unidades', perigosa: false },
  { chave: 'catalog:publish', descricao: 'Publicar o cardápio para as unidades', perigosa: false },
  { chave: 'stores:settings:write', descricao: 'Alterar configurações da loja', perigosa: false },
  { chave: 'stores:pause:write', descricao: 'Pausar e retomar o recebimento de pedidos', perigosa: false },
  { chave: 'stores:hours:write', descricao: 'Alterar o horário de funcionamento', perigosa: false },
  { chave: 'stores:open_close', descricao: 'Abrir e fechar a loja', perigosa: false },
  { chave: 'delivery:zones:write', descricao: 'Editar zonas e taxas de entrega', perigosa: false },
  { chave: 'courier:assign', descricao: 'Atribuir entregador', perigosa: false },
  { chave: 'wallet:read', descricao: 'Ler carteira e extrato de cashback', perigosa: false },
  { chave: 'wallet:adjust', descricao: 'Ajustar saldo manualmente', perigosa: true },
  { chave: 'wallet:adjust:high', descricao: 'Ajuste manual acima do teto', perigosa: true },
  { chave: 'cashback:config:write', descricao: 'Alterar as regras do programa de cashback', perigosa: true },
  { chave: 'payments:refund', descricao: 'Estornar pagamento', perigosa: true },
  { chave: 'finance:view', descricao: 'Ver o painel financeiro', perigosa: false },
  { chave: 'finance:reconcile', descricao: 'Conciliar recebimentos', perigosa: false },
  { chave: 'promotions:write', descricao: 'Criar e editar promoções', perigosa: false },
  { chave: 'coupons:read', descricao: 'Ver cupons', perigosa: false },
  { chave: 'coupons:write', descricao: 'Criar e editar cupons', perigosa: false },
  { chave: 'loyalty:plans:write', descricao: 'Editar planos de fidelidade', perigosa: false },
  { chave: 'loyalty:benefits:write', descricao: 'Editar benefícios de plano', perigosa: false },
  { chave: 'notifications:broadcast', descricao: 'Disparar comunicação em massa', perigosa: false },
  { chave: 'customers:read', descricao: 'Ver clientes', perigosa: false },
  { chave: 'customers:pii:read', descricao: 'Ver dados pessoais do cliente', perigosa: true },
  { chave: 'customers:export', descricao: 'Exportar base de clientes', perigosa: true },
  { chave: 'customers:erase', descricao: 'Apagar dados do cliente (LGPD)', perigosa: true },
  { chave: 'reviews:read', descricao: 'Ler avaliações', perigosa: false },
  { chave: 'reviews:reply', descricao: 'Responder avaliações', perigosa: false },
  { chave: 'reports:read', descricao: 'Ver relatórios', perigosa: false },
  { chave: 'reports:export', descricao: 'Exportar relatórios', perigosa: false },
  { chave: 'reports:schedule', descricao: 'Agendar envio de relatórios', perigosa: false },
  { chave: 'users:read', descricao: 'Ver usuários administrativos', perigosa: false },
  { chave: 'users:invite', descricao: 'Convidar usuário', perigosa: true },
  { chave: 'users:roles:write', descricao: 'Conceder e revogar papéis', perigosa: true },
  { chave: 'roles:manage', descricao: 'Criar e editar papéis', perigosa: true },
  { chave: 'audit:read', descricao: 'Ler o log de auditoria', perigosa: false },
  { chave: 'audit:export', descricao: 'Exportar o log de auditoria', perigosa: false },
  { chave: 'settings:write', descricao: 'Alterar configurações da rede', perigosa: true },
  { chave: 'devices:manage', descricao: 'Gerenciar dispositivos e impressoras', perigosa: false },
  { chave: 'print:use', descricao: 'Imprimir comanda', perigosa: false },
  { chave: 'shift:close', descricao: 'Fechar o turno', perigosa: false },
  { chave: 'orderhub:access', descricao: 'Acessar o Order Hub', perigosa: false },
  { chave: 'validator:use', descricao: 'Usar os validadores de cashback e cupom', perigosa: false },
]

export interface Papel {
  chave: RoleKey
  nome: string
  escopo: 'network' | 'group' | 'unit'
}

/** Os papéis com nome legível — `/auth/me` devolve o nome, mas não o escopo do papel. */
export const PAPEIS: ReadonlyArray<Papel> = [
  { chave: 'network_admin', nome: 'Administrador da rede', escopo: 'network' },
  { chave: 'network_viewer', nome: 'Visualizador da rede', escopo: 'network' },
  { chave: 'finance', nome: 'Financeiro', escopo: 'network' },
  { chave: 'marketing', nome: 'Marketing', escopo: 'network' },
  { chave: 'support', nome: 'Suporte', escopo: 'network' },
  { chave: 'regional_manager', nome: 'Gerente regional', escopo: 'group' },
  { chave: 'store_manager', nome: 'Responsável da unidade', escopo: 'unit' },
  { chave: 'store_operator', nome: 'Atendente do Order Hub', escopo: 'unit' },
  { chave: 'customer', nome: 'Cliente', escopo: 'network' },
]
