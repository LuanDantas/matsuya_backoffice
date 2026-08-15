# 18 — Segurança

> PARTE 18 do briefing. Começa pela **Fase 0**, que é bloqueante: não faz sentido publicar três painéis administrativos novos contra uma API cujo token qualquer pessoa consegue forjar.

---

## 1. Fase 0 — remediação obrigatória

Nada aqui entrega funcionalidade. **Tudo aqui precisa estar no ar antes de a primeira aplicação administrativa tocar produção.** Ordenado por risco, com nota de compatibilidade em cada item — porque vários podem quebrar o app mobile em produção se aplicados sem cuidado.

| # | Item | Risco se ignorado | Nota de compatibilidade |
|---|---|---|---|
| 1 | **Segredo do JWT para variável de ambiente.** `src/services/jwtService.ts:3` é `const secret = 'chave-do-jwt'`, e o repositório circula | **Tomada de conta total** de qualquer usuário, inclusive administradores | **Rotacionar o segredo invalida todo token vivo → desloga todos os usuários do app.** Mitigação: verificação dupla por 48 h (aceitar o segredo antigo, assinar só com o novo), avisar, depois remover o antigo. Fazer às 04:00. `JWT_SECRET` com ≥ 32 bytes aleatórios precisa existir em todo ambiente antes do deploy, ou a aplicação não sobe — por projeto |
| 2 | **Expurgar e rotacionar segredos versionados.** O `.gitignore` cobre só `node_modules/` e `.env`; `.env.development` e `.env.production` estão rastreados | Credenciais de banco, Twilio, Comtele, token do WhatsApp e SMTP todos comprometidos | Rotacionar a senha do banco exige restart coordenado. Rotacionar Twilio/Comtele/WhatsApp quebra SMS e WhatsApp temporariamente — fazer um de cada vez, verificando. **Assumir comprometimento prévio**: revisar logs de acesso ao banco e uso dos provedores |
| 3 | **Autenticar os 9 endpoints de escrita abertos** (`POST/PUT /plans`, `/benefits`, `POST /points`, `GET /points/list`, `POST/PUT /vouchers`, `POST/PUT /promotions`, `POST/PUT /promotion_timeline`, `POST /cashback/redeem`, `POST /push-notification/new-points`) | Qualquer pessoa na internet pode **cunhar cashback**, criar cupons, baixar a lista de pontos (PII) e disparar push para toda a base. **É o defeito de maior impacto do sistema** | **Verificar cada um contra o app e o admin antes de aplicar `ensureAuth`.** `POST /cashback/redeem` e `POST /points` são os perigosos — podem ser chamados por um fluxo não autenticado de loja. Estratégia: publicar primeiro em **modo apenas-log** (registrar `{route, hasAuthHeader, ua}` por 72 h), depois impor nas rotas comprovadamente autenticadas, e dar um **token de serviço** às genuinamente máquina-a-máquina. `GET /points/list` também precisa de paginação — hoje é, com alta probabilidade, um dump ilimitado de PII |
| 4 | **`ensureAuth` falha aberta.** `src/middlewares/auth.ts:26-28` define `req.user = null` quando o usuário não existe e **ainda chama `next()`** | O token ainda válido de um usuário excluído ou desativado passa pela autenticação; qualquer handler que não cheque defensivamente roda como fantasma | Correção é `if (!user) return res.status(401)`. Baixo risco, mas varrer handlers que tratam `req.user == null` como "modo público" — esses passariam a devolver 401. Aproveitar e adicionar `users.disabled_at`, rejeitando usuários desativados aqui |
| 5 | **`cookiePassword` do AdminJS para env** + credenciais fortes + flags `secure`/`sameSite` | Forja de sessão administrativa → acesso total ao banco pelo `/admin` | Rotacionar desloga apenas as sessões atuais do AdminJS. Sem impacto no app |
| 6 | **Validação de configuração + `.env.example`.** Env parseada por zod, boot falha em chave ausente | Má configuração silenciosa; a chave faltante aparece como um 500 no pior momento possível | Um deploy passa a **falhar rápido** se faltar variável — que é o objetivo, mas revisar a lista de variáveis de cada ambiente antes do merge, ou um deploy quebra |
| 7 | **Destrackear `dist/`, trocar para `node dist/server.js`** | Build velho versionado servido em produção; deriva entre fonte e runtime | Verificar que o build de CI produz um `dist/` funcional **antes** de remover — o `dist/` atual pode conter edições manuais. Diferenciar a saída do `tsc` contra o `dist/` versionado primeiro |
| 8 | **Helmet + rate limiting + CORS por env.** Limitar `/auth/*` (5/min/IP), `/auth/password/*`, endpoints de SMS e o webhook | Credential stuffing, abuso de custo de SMS (`POST /sms` e `/send-confirmation` são abertos), enumeração de conta | O CSP padrão do Helmet quebra o AdminJS e os estáticos de `public/` — desabilitar `contentSecurityPolicy` no mount do `/admin` inicialmente. Os limites precisam ser generosos o bastante para não derrubar uma loja atrás de NAT compartilhado: **começar em modo apenas-log por uma semana** |
| 9 | **Middleware de erro + `asyncHandler` + pino** | Rejeição não tratada derruba o processo; stack traces vazam; sem forense | O formato do corpo de erro muda nas rotas **legadas** se normalizado — então o middleware precisa **preservar a forma legada `{ message: '…' }`** no roteador legado, e usar o envelope v1 só sob `/api/v1` |
| 10 | **Corrigir `orders.address_snapshot`** NOT NULL vs. modelo anulável | Criação de pedido de **retirada falha no banco** hoje | Migration remove o NOT NULL; nenhuma mudança de cliente. Verificar que nada lê `addressSnapshot` sem guarda de nulo |
| 11 | **Dinheiro de `FLOAT` para centavos inteiros** em `orders` e `products` | Ponto flutuante em dinheiro produz deriva de centavos; com cashback e estorno chegando, isso vira erro de conciliação e disputa financeira real. **Corrigir antes de existir pagamento, não depois** | Expand/contract: adicionar `*_cents bigint`, escrever nos dois, backfill, trocar leituras, remover. O Sequelize devolve `DECIMAL` como **string** — auditar todo consumidor, e as respostas JSON precisam continuar emitindo número para o app (serializar com `Number(...)` na fronteira). É o item de maior esforço da Fase 0; pode escorregar para a Fase 1, **mas não para depois de pagamentos** |
| 12 | **Backup, ensaio de restauração e ambiente de staging** | Nenhum caminho de recuperação verificado | Nenhuma. Adição pura |
| 13 | **Testes de linha de base sobre o contrato legado congelado.** Snapshot da forma da resposta de login, das chaves do payload do JWT, e dos endpoints de delivery críticos ao app | Toda refatoração seguinte vira aposta | Nenhuma — é o cinto de segurança dos itens 1 a 11, e **deveria ser feito primeiro** |

---

## 2. Autenticação e sessão

| Aspecto | Decisão |
|---|---|
| Aplicações administrativas | Access token de **15 min** + **refresh token rotativo de 30 dias** em cookie `httpOnly`, `Secure`, `SameSite=Lax`, com **detecção de reuso** (usar um refresh já rotacionado revoga a família inteira de sessões) |
| App mobile | Mantém `POST /auth/login` com token de 1 dia e **sem refresh**. Introduzir refresh ali sem mudar o cliente quebraria o contrato "401 = logout definitivo" que ele implementa |
| Order Hub e agente de impressão | **Tokens de dispositivo** de longa duração, com escopo de unidade, revogáveis e sem sessão humana. O operador entra por **PIN** sobre a sessão de dispositivo — o que evita que um tablet de balcão seja jogado para a tela de login às 12h15 |
| Armazenamento no navegador | `localStorage` na mesma origem do admin legado (necessário para o compartilhamento de sessão da migração). O refresh fica em cookie `httpOnly`, fora do alcance de JavaScript |
| Revogação | Tabela `sessions` + `users.permissions_version`. Uma revogação derruba os sockets do usuário em **menos de um segundo** ([14 §3](./14-websockets.md)) |
| MFA | **TOTP obrigatório** para qualquer usuário com escopo `network` ou com as chaves `finance:*` / `users:*` / `wallet:adjust` / `cashback:config:write`. Reautenticação com MFA para ações marcadas `is_dangerous` |

---

## 3. Autorização

Coberta em detalhe em [15](./15-rbac.md). Os pontos de segurança que importam:

- **Negar por padrão.** Rota sem `requires` no manifesto é inalcançável; permissão sem `role_permissions` é negada.
- **Imposição na camada de query**, não no controller: `ScopedRepository` aplica o predicado de unidade **depois** da cláusula do chamador, de modo que um `unityId` vindo da requisição nunca sobrescreve o escopo.
- **Fora de escopo devolve 404, não 403** — para que um gerente não consiga enumerar ids de pedido de outras unidades sondando códigos de status.
- **Checagem no cliente é só UX.** O servidor é quem impõe, sempre.
- **Sem escalonamento de privilégio:** ninguém concede papel cujo conjunto de permissões não seja subconjunto do próprio, nem em escopo maior que o seu — validado no serviço.

---

## 4. OWASP Top 10 — tratamento

| Risco | Tratamento |
|---|---|
| **A01 Broken Access Control** | RBAC com escopo + `ScopedRepository` + RLS na Fase 3 + 404 em vez de 403. É o risco de maior exposição hoje e o mais trabalhado no desenho |
| **A02 Cryptographic Failures** | TLS obrigatório na borda; segredo de JWT com ≥ 32 bytes em env; senhas com bcrypt (já em uso, `User.ts:117`); **nenhum dado de cartão em repouso** |
| **A03 Injection** | Sequelize com bind de parâmetro em todos os caminhos; queries cruas só com `replacements`, nunca com interpolação de string; validação zod na entrada |
| **A04 Insecure Design** | Idempotência, lock otimista e ordem fixa de lock são decisões de projeto, não remendos ([06 §6](./06-arquitetura-backend.md)) |
| **A05 Security Misconfiguration** | Configuração validada por zod no boot, Helmet, CORS por env, `.env.example`, imagem Docker rodando como usuário `node` |
| **A06 Vulnerable Components** | `npm audit --audit-level=high` bloqueante no CI; Dependabot semanal |
| **A07 Identification & Auth Failures** | Rate limit em `/auth/*`, MFA para administradores, refresh rotativo com detecção de reuso, bloqueio progressivo por conta |
| **A08 Software & Data Integrity** | `dist/` deixa de ser versionado; imagem única promovida entre ambientes; migrations com lock consultivo |
| **A09 Logging & Monitoring Failures** | pino estruturado com request-id, `audit_logs` na mesma transação, Sentry, alertas de [19](./19-observabilidade.md) |
| **A10 SSRF** | Nenhuma entrada de usuário vira URL de saída. As integrações externas têm hosts fixos em configuração |

**Front-end:** XSS é mitigado pelo escape padrão do React (nenhum `dangerouslySetInnerHTML` em conteúdo de usuário) e por CSP na borda. CSRF não se aplica ao access token em header; **aplica-se ao cookie de refresh**, protegido por `SameSite=Lax` mais um endpoint de refresh que só aceita `POST` de origem conhecida.

---

## 5. LGPD

| Obrigação | Implementação |
|---|---|
| **Minimização** | PII do cliente aparece **mascarada por padrão** nas listas do Corporate (C-27). Revelar exige `customers:pii:read` **e** justificativa registrada |
| **Trilha de acesso** | Visualização de detalhe com PII e exportação com PII são **auditadas** — a exceção explícita à regra de não auditar leituras ([06 §7](./06-arquitetura-backend.md)) |
| **Portabilidade** | `GET /customers/:id/export` produz o pacote de dados do titular |
| **Eliminação** | `POST /customers/:id/anonymize` substitui os dados pessoais por marcadores, **preservando `audit_logs`** (o `actor_label` desnormalizado existe exatamente para isso) e preservando pedidos por prazo prescricional |
| **Retenção** | Pedido 5 anos; anexos de chat 90 dias; `store_change_log` 7 dias; outbox 14 dias; `job_executions` 30 dias; auditoria 12 meses quentes e 5 anos para ações financeiras e de identidade |
| **Reporte de erro** | `beforeSend` do Sentry **remove CPF, telefone, e-mail, endereço e qualquer campo `customer.*`** de payloads e breadcrumbs, e sanitiza parâmetros de URL. Requisito duro |
| **Consentimento** | `customer_consents` registra base legal e data por finalidade; marketing exige consentimento explícito |
| **Exportação** | Toda exportação é auditada com usuário, escopo, filtros e contagem de linhas |

---

## 6. PCI DSS

O escopo é mantido no **mínimo (SAQ A)** por uma decisão de arquitetura: **nenhum dado de cartão toca nossos servidores**. A tokenização acontece no cliente pelo SDK do Mercado Pago; recebemos apenas um `card_token`, e persistimos apenas `card_brand` e `card_last4` para exibição.

**Bloqueador ativo:** o app hoje guarda números de cartão **em texto puro no AsyncStorage**. Isso precisa ser **apagado, não migrado**, com uma purga única no upgrade, e tratado como incidente de segurança ([11 §0](./11-pagamentos.md)).

---

## 7. Auditoria

Especificada em [06 §7](./06-arquitetura-backend.md). Os três pontos de segurança:

1. A linha de auditoria é gravada **na mesma transação** da mutação — não existe mudança commitada sem registro, nem registro fantasma de mudança revertida.
2. A tabela é **append-only**: o papel da aplicação não tem grant de `UPDATE` nem `DELETE`.
3. `actor_label` é desnormalizado, então a trilha sobrevive à eliminação do usuário por LGPD.
