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
