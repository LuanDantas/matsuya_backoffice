# ADR-0015 — Monorepo com dois deployables e três experiências

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [04 §1](../04-arquitetura-frontend.md)

## Contexto
Corporate e Portal da Unidade são o mesmo produto em dois níveis de escopo — cerca de 70% de sobreposição. O Order Hub tem restrições de runtime genuinamente diferentes.

## Decisão
Um monorepo pnpm + Turborepo. `apps/console` atende Corporate e Portal da Unidade, com comportamento derivado de permissões e escopo; `apps/hub` é separado. Uma terceira URL para franqueados custa apenas uma variável de build.

## Alternativas consideradas
- **Três repositórios:** triplica a deriva de design system e de contrato.
- **Microfrontends:** resolve independência organizacional que não temos, ao custo de version skew e singletons compartilhados.
- **Uma app única para as três:** força o Hub a carregar o bundle do console e a compartilhar cadência de deploy.

## Consequências
As três experiências continuam bem delimitadas para o usuário. Se o Portal divergir além de 40% de telas exclusivas, extraí-lo é 1 a 2 semanas, porque os pacotes já são compartilhados.
