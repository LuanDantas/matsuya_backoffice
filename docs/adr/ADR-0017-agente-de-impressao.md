# ADR-0017 — Agente local de impressão, com fallback pelo navegador

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [04 §7](../04-arquitetura-frontend.md)

## Contexto
Navegador não abre TCP 9100. WebUSB é só Chrome, exige gesto por sessão e perde o dispositivo num refresh. Serviço de impressão em nuvem falha exatamente quando a internet da loja falha — o pior cenário.

## Decisão
Agente Node local por loja, autenticado por token de dispositivo, com dois caminhos de entrada: push por socket e HTTP na LAN. Fallback universal: comanda em CSS impressa pelo navegador. Fila autoritativa no agente, com deduplicação por `jobId`.

## Alternativas consideradas
- **Só impressão pelo navegador:** sem ACK, exige confirmação humana a cada pedido.
- **Serviço em nuvem:** custo por impressora e falha na queda de internet.

## Consequências
20 a 40 minutos de instalação por loja, uma vez. Em troca, a impressão continua funcionando com a internet fora, e falha de impressão nunca bloqueia o fluxo do pedido.
