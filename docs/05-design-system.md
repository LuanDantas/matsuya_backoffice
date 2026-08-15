# 05 — Design System (`packages/ui`)

> Seção 8 do briefing. Hoje o admin web não tem design system algum: o `tailwind.config.js` é o default intocado, a identidade da marca é string literal repetida em dezenas de arquivos (`bg-gradient-to-r from-orange-500 to-red-600`), e não existe `Button`, `Input`, `Modal`, `Table`, `Pagination`, `Badge`, `EmptyState` nem `Skeleton` — a marcação de modal está copiada e colada em 14 páginas. Três aplicações sobre essa base seriam três cópias das mesmas strings.

---

## 1. Arquitetura de tokens

Três camadas. **Só a camada 3 aparece em código de feature.**

### Camada 1 — primitivos (escalas cruas, sem significado)

Ancorados na paleta que o app mobile já usa (`src/styles/colors.ts`), para que app do cliente e suíte administrativa concordem em vez de inventarem uma terceira paleta.

| Escala | Passos | Âncora |
|---|---|---|
| `vermillion` (marca) | 50…950 | `500 = #E4502B` — o acento do Delivery no app mobile |
| `sumi` (neutro, com viés quente) | 0, 50…950, 1000 | Substitui o cinza puro do Tailwind: superfícies escuras precisam de neutro quente, senão a tela da cozinha lê como azul-frio |
| `jade` (sucesso) | 50…900 | do `emerald` mobile |
| `amber` (atenção) | 50…900 | reuso |
| `crimson` (perigo) | 50…900 | do `red` mobile |
| `azure` (informação) | 50…900 | do `blue` mobile |

O gradiente `from-orange-500 to-red-600` vira **um único token**, `--gradient-brand`, permitido apenas em: hero do login, CTA principal de superfícies de marca, e badges de nível. Botões usam `--color-brand-solid` chapado. **Gradiente em todo botão é o que torna dark mode e estado desabilitado insolúveis.**

### Camada 2 — aliases semânticos (CSS custom properties, redefinidos por tema)

| Alias | Claro | Escuro (padrão do Hub) |
|---|---|---|
| `--bg-canvas` | `sumi-50` | `sumi-950` |
| `--bg-surface` | `#fff` | `sumi-900` |
| `--bg-raised` | `#fff` | `sumi-850` |
| `--bg-sunken` | `sumi-100` | `sumi-1000` |
| `--border-subtle` / `--border-strong` | `sumi-200` / `sumi-300` | `sumi-800` / `sumi-700` |
| `--text-primary` / `--text-secondary` / `--text-muted` | `sumi-900` / `sumi-600` / `sumi-500` | `sumi-50` / `sumi-300` / `sumi-400` |
| `--brand-solid` / `--brand-hover` / `--brand-subtle-bg` / `--brand-on` | `vermillion-600` / `700` / `50` / `#fff` | `vermillion-500` / `400` / `vermillion-950` / `sumi-1000` |
| `--focus-ring` | `vermillion-500`, 2 px + 2 px de offset | `vermillion-400` |
| `--status-{success,warning,danger,info}-{bg,fg,border}` | — | — |

### Camada 3 — tokens de componente

`--button-primary-bg: var(--brand-solid)` — só onde um componente precisa desviar do alias semântico.

**Entrega:** `packages/ui/tokens.css` define as variáveis em `:root` e `[data-theme="dark"]`; `packages/config/tailwind-preset.js` mapeia os nomes de cor do Tailwind para `var(--…)`, de modo que `bg-surface`, `text-muted` e `ring-focus` sejam a **única** forma de escrever cor de marca. **Utilitários de cor literal (`bg-orange-500`) são proibidos por regra de ESLint.**

### Demais escalas

| Grupo | Definição |
|---|---|
| Tipografia | Inter (UI) + `tabular-nums` para dinheiro e cronômetros. Escala herdada do mobile: 12/14/16/18/20/24/30/36/48. Pesos 400/500/600/700. Alturas de linha 1,2 / 1,5 / 1,75. **O Hub sobe a base para 16 px mínimo e cronômetros em 24–36 px** |
| Espaçamento | Base 4 px, reutilizando a escala mobile `0,1,2,3,4,5,6,8,10,12,16,20,24` |
| Raio | `sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · full` (paridade com o mobile) |
| Elevação | Claro: 4 níveis de sombra. **Escuro: elevação é passo de luminosidade da superfície, não sombra** (sombra é invisível no escuro). Os tokens `--elev-0..3` resolvem para o mecanismo certo em cada tema |
| Movimento | `fast 120 ms`, `base 180 ms`, `slow 280 ms`; easings `standard cubic-bezier(.2,0,0,1)`, `enter`, `exit`. A animação de chegada de pedido é a única acima de 280 ms. Suporte integral a `prefers-reduced-motion` |
| Dark mode | `data-theme` no `<html>`, com valores `light \| dark \| system`. **Hub em `dark` por padrão** (ofuscamento no balcão, turnos noturnos, burn-in); Console em `light` com alternância. Todo par de token verificado em contraste AA |
| Z-index | Escala nomeada: `dropdown 1000, sticky 1100, drawer 1200, modal 1300, toast 1400, alert-critical 1500` — **a barra de offline vence o modal** |
| Densidade | `comfortable` (Console) / `touch` (Hub, alvos ≥ 44 px) como atributo de dado que dirige os tokens de padding |

---

## 2. Base headless: Radix Primitives no padrão shadcn

| Opção | Avaliação |
|---|---|
| **Radix Primitives com componentes copiados para dentro de `packages/ui`** ✅ | Acessibilidade e gestão de foco resolvidas; nativo de Tailwind; somos donos do código-fonte, então adaptar densidade de toque para o Hub é editar o nosso arquivo, não lutar contra uma API de tema; sem CSS-in-JS em runtime |
| react-aria / React Aria Components | Melhor a11y e i18n do mercado, mas superfície de API maior e mais cerimônia do que um esforço de UI de 1 a 2 pessoas sustenta |
| Ark UI | Sólido (máquinas de estado Zag), mas ecossistema React menor e menos exemplos para os padrões de que precisamos |
| MUI / Mantine / AntD | Rejeitados: runtime pesado, sistemas de tema que brigam com nossos tokens, e uma aparência que gastaríamos meses sobrescrevendo |

**Distinção importante em relação ao shadcn padrão:** os componentes são **publicados a partir de `packages/ui` como um pacote interno versionado**, não copiados por app. O "copiar para dentro" vale para o *código-fonte inicial*, não para o consumo — do contrário recriaríamos exatamente o problema de copiar-e-colar que o admin atual tem com modais.

---

## 3. Inventário de componentes

| Componente | Primitivo que embrulha | Props que importam | Observações |
|---|---|---|---|
| `Button` | `<button>` + `cva` | `variant` (primary/secondary/ghost/danger/link), `size` (sm/md/lg/touch), `loading`, `iconLeft/Right`, `fullWidth` | `loading` trava a largura para não deslocar o layout; `danger` exige `ConfirmDialog` por convenção |
| `IconButton` | `<button>` | `label` (obrigatório, a11y), `size`, `variant` | Força nome acessível |
| `Input` | `<input>` | `label`, `hint`, `error`, `prefix/suffix`, `mask` | Máscaras CPF/CNPJ/telefone/CEP/moeda portadas de `cpfMask.ts` |
| `Textarea` | `<textarea>` | `maxLength`, `showCount`, `autoGrow` | Observações de pedido, motivos de cancelamento |
| `NumberInput` / `CurrencyInput` | `<input inputmode>` | `min/max/step`, `currency='BRL'` | **Guarda centavos como inteiro; nunca aritmética de ponto flutuante em dinheiro** |
| `Select` | Radix Select | `options`, `groups`, `placeholder`, `clearable` | Até 20 opções |
| `Combobox` | Radix Popover + `cmdk` | `onSearch` (assíncrono), `loading`, `renderOption`, `emptyMessage` | Busca no servidor: produtos, clientes, unidades |
| `MultiSelect` | Combobox + chips | `max`, `summaryLabel` | Filtros de unidade ("3 unidades selecionadas") |
| `Checkbox` / `Radio` / `Switch` | Radix | `label`, `description`, `indeterminate` | `Switch` reservado a alternâncias de efeito imediato |
| `Modal` | Radix Dialog | `size`, `title`, `description`, `dismissible`, `footer` | Elimina a marcação duplicada em 14 páginas |
| `Drawer` | Radix Dialog, variante lateral | `side`, `size` | Detalhe de pedido, painéis de filtro em tablet |
| `ConfirmDialog` | Modal | `tone`, `confirmLabel`, `requireTyping` | `requireTyping` para ações destrutivas de alcance de rede |
| `Toast` | Radix Toast | `tone`, `title`, `description`, `action`, `duration` | `action` viabiliza "Reimprimir"/"Desfazer" |
| `Alert` | div + `role` | `tone`, `title`, `dismissible`, `inline` | Inclui a variante de barra persistente de conexão/offline |
| `Badge` | span | `tone`, `size`, `dot` | Contagens e tags |
| `StatusPill` | Badge | `status: OrderStatus \| PaymentStatus`, `showIcon` | **Único consumidor** dos mapas de rótulo/cor de `contracts` — fonte única de "Aguardando confirmação" |
| `Table` / `DataGrid` | TanStack Table (headless) | `columns`, `data`, `pagination` (servidor), `sorting` (servidor), `rowSelection`, `emptyState`, `loading`, `stickyHeader`, `onRowClick`, `density` | **Server-driven por padrão**; escotilha `clientSide` limitada a 500 linhas com aviso em dev. Substitui diretamente a ordenação/paginação/agregação no cliente do admin atual |
| `Pagination` | botões | `page`, `pageSize`, `total`, `pageSizeOptions` | Lê metadados do servidor; exibe "1–20 de 348" |
| `Card` | div | `padding`, `elevation`, `header`, `footer`, `interactive` | Substitui a string repetida `bg-white rounded-xl shadow-sm border` |
| `KpiTile` | Card | `label`, `value`, `delta`, `trend`, `format`, `loading`, `hint` | Evolução do `StatCard`; `format` usa moeda/percentual pt-BR |
| `PageHeader` | — | `title`, `subtitle`, `breadcrumbs`, `actions`, `scopeBadge` | `scopeBadge` mostra a unidade/rede ativa **em todas as páginas** |
| `FilterBar` | — | `filters[]` (dirigido por schema), `value`, `onChange`, `presets`, `onClear` | Sincroniza com search params; vira Drawer abaixo de `md` |
| `Tabs` | Radix Tabs | `items`, `value`, opção de sincronizar com URL | |
| `Dropdown` | Radix DropdownMenu | itens com `disabledReason` | `disabledReason` renderiza tooltip explicando a permissão faltante |
| `DatePicker` / `DateRangePicker` | `react-day-picker` + Popover | `presets` (Hoje, Ontem, 7 dias, Mês atual), `maxRange`, `locale=ptBR` | Presets evitam consulta acidental de 12 meses |
| `EmptyState` | — | `illustration`, `title`, `description`, `action` | **Distingue "sem dados" de "sem resultado para o filtro"** |
| `Skeleton` | — | `variant` (text/rect/circle), `lines` | Composições prontas para tabela, card e KPI |
| `Tooltip` | Radix Tooltip | `content`, `side`; em toque, pressionar e segurar | |
| `Stepper` | — | `steps`, `current`, `orientation` | Formulários multietapa (regra de cashback, criação de unidade) |
| `Timeline` | — | `events`, `renderEvent`, `dense` | `statusEvents` do pedido, timeline de promoção |
| `Avatar` | Radix Avatar | `name` (iniciais como fallback), `size`, `src` | |
| `Charts` | Wrappers de Recharts | `Line/Bar/Area/Pie/Composed`, `data`, `series`, `format`, `emptyState`, `height` | Chunk lazy; cores por token e eixos com dark mode; rampa categórica fixa de 8 cores |
| `SoundToggle`, `ConnectionIndicator`, `OfflineBar` | — | orientados ao Hub, mas vivem em `ui` | Compartilhados com as telas ao vivo do Console |

**`Toast`:** migrar de `react-hot-toast` para Radix Toast por acessibilidade (`role="status"`), botões de ação e tokens de dark mode — com um módulo adaptador, para que os pontos de chamada continuem escrevendo `toast.success('…')`.

---

## 4. Storybook — sim, restrito a `packages/ui`

| O que ganha | Custo |
|---|---|
| Revisar 30 componentes em tema claro **e** escuro sem logar numa app nem semear pedidos | ~1 dia de setup, ~10 min por componente |
| `@storybook/addon-a11y` pega defeitos de contraste e rótulo na hora da autoria — o admin atual não tem verificação de a11y nenhuma | Manutenção se as stories apodrecerem → o CI builda o Storybook em todo PR que toca `ui`, então apodrecimento quebra o build |
| É o artefato contra o qual a migração é revisada ("este é o botão novo; aqui estão todos os estados") | |
| Testes de interação (`play`) cobrem foco preso no Modal e navegação por teclado no Combobox | |

**Sem stories para telas de aplicação** — elas precisam de dados, auth e socket; isso é trabalho do Playwright. Regressão visual (Chromatic) fica adiada até o conjunto de componentes estabilizar.

---

## 5. Acessibilidade — linha de base

WCAG 2.1 AA como piso:

- Contraste de texto 4,5:1 em **ambos** os temas — tokens validados no CI por um script de contraste.
- Anel de foco visível em todo elemento interativo; **nunca `outline: none` sem substituto**.
- Operação completa por teclado em Modal, Drawer, Dropdown, Combobox e Table.
- `aria-live="polite"` para os anúncios de pedido novo no Hub, e `assertive` para o alerta de offline.
- Todo botão só-ícone tem rótulo.
- **Estado nunca é comunicado só por cor** — o `StatusPill` sempre carrega texto e ícone.
- Alvos de no mínimo 44×44 px na densidade `touch`.
- `prefers-reduced-motion` respeitado.

---

## 6. Ícones e gráficos

**Ícones:** manter `lucide-react` (já em uso, tree-shakeable, mais de 1000 ícones). `packages/ui/icons.ts` reexporta um conjunto semântico curado (`IconOrder`, `IconUnit`, `IconCashback`, `IconPrinter`), para que o mesmo conceito nunca ganhe dois glifos diferentes entre as apps.

**Gráficos:** manter **Recharts**. O time conhece, já é dependência, e as necessidades (linha/barra/área/pizza sobre ≤ 500 pontos) estão confortavelmente dentro do envelope da biblioteca. Vai em chunk lazy e é embrulhado para que nenhum código de feature a importe diretamente. Reavaliar só se um gráfico precisar de mais de 5 mil pontos ou de renderização em canvas — aí, `visx` ou `echarts`.
