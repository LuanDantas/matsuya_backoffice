#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RAIZ } from './api-fonte.mjs'

/**
 * Confere o contraste de cada par cor/fundo que o design system realmente usa.
 *
 * Existe porque contraste é a regra de acessibilidade mais fácil de quebrar sem
 * perceber: ninguém escolhe uma cor ilegível de propósito, mas um esmeralda que
 * parecia ótimo no monitor do escritório reprova em 3,77:1 — e a descoberta
 * normalmente acontece quando alguém não consegue ler o botão no balcão.
 *
 * Os pares são declarados aqui à mão, e não extraídos do CSS: o que importa é a
 * combinação **usada**, e um analisador de CSS não sabe qual texto cai sobre
 * qual superfície.
 */

const TOKENS = resolve(RAIZ, 'packages/ui/src/tokens.css')

function lerTokens(tema) {
  const css = readFileSync(TOKENS, 'utf8')
  const bloco =
    tema === 'dark'
      ? css.match(/\n\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)
      : css.match(/:root,\s*\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/)

  if (!bloco) throw new Error(`Não encontrei o bloco de tokens do tema ${tema}.`)

  const tokens = {}
  for (const [, nome, valor] of bloco[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[nome] = valor
  }
  return tokens
}

const luminancia = (hex) => {
  const h = hex.replace('#', '')
  const canais = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const [r, g, b] = canais.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const razao = (a, b) => {
  const [la, lb] = [luminancia(a), luminancia(b)]
  const [alto, baixo] = la > lb ? [la, lb] : [lb, la]
  return (alto + 0.05) / (baixo + 0.05)
}

/**
 * `texto` = 4,5:1 (WCAG AA para texto normal).
 * `grafico` = 3:1 (AA para elemento não textual: borda, ícone, indicador).
 */
const PARES = [
  ['texto sobre superfície 1', 'texto', 'superficie-1', 4.5],
  ['texto sobre superfície 2', 'texto', 'superficie-2', 4.5],
  ['texto sobre superfície 3', 'texto', 'superficie-3', 4.5],
  ['texto fraco sobre superfície 1', 'texto-fraco', 'superficie-1', 4.5],
  ['texto fraco sobre superfície 2', 'texto-fraco', 'superficie-2', 4.5],
  ['botão primário (texto sobre marca)', 'texto-inverso', 'marca', 4.5],
  // Painel da marca na entrada. Conferido nas duas paradas do gradiente,
  // porque um texto que passa no topo pode reprovar no rodapé.
  ['entrada: título sobre o topo do painel', 'entrada-painel-texto', 'entrada-painel-de', 4.5],
  ['entrada: título sobre a base do painel', 'entrada-painel-texto', 'entrada-painel-ate', 4.5],
  ['entrada: apoio sobre o topo do painel', 'entrada-painel-fraco', 'entrada-painel-de', 4.5],
  ['entrada: apoio sobre a base do painel', 'entrada-painel-fraco', 'entrada-painel-ate', 4.5],
  ['botão primário em hover', 'texto-inverso', 'marca-hover', 4.5],
  ['botão destrutivo (texto sobre superfície 2)', 'perigo', 'superficie-2', 4.5],
  ['botão destrutivo em hover', 'perigo', 'perigo-suave', 4.5],
  ['selo sucesso', 'sucesso', 'sucesso-suave', 4.5],
  // O alarme em voz baixa: entregador esperando, corrida sem entregador.
  ['chip de alarme suave', 'alarme-suave-texto', 'alarme-suave', 4.5],
  // O check da loja selecionada, preenchido na cor da marca.
  ['check de loja selecionada', 'texto-inverso', 'marca', 4.5],
  ['selo informativo', 'info', 'info-suave', 4.5],
  ['selo atenção', 'atencao', 'atencao-suave', 4.5],
  ['selo perigo', 'perigo', 'perigo-suave', 4.5],
  ['selo urgente', 'urgente', 'urgente-suave', 4.5],
  ['faixa informativa', 'texto', 'info-suave', 4.5],
  ['faixa de atenção', 'texto', 'atencao-suave', 4.5],
  ['faixa de perigo', 'texto', 'perigo-suave', 4.5],
  ['anel de foco sobre a superfície base', 'foco', 'superficie-base', 3],
  ['anel de foco sobre superfície 1', 'foco', 'superficie-1', 3],
  ['borda forte sobre superfície 1', 'borda-forte', 'superficie-1', 1.3],

  // Acrescentados no redesenho sobre as referências.
  ['texto de corpo sobre superfície 1', 'texto-corpo', 'superficie-1', 4.5],
  ['texto de corpo sobre superfície 3 (pílula)', 'texto-corpo', 'superficie-3', 4.5],
  // `--texto-apagado` é cor de ÍCONE e placeholder, não de texto corrido:
  // mínimo de elemento gráfico, 3:1. Onde havia texto apagado, agora há
  // `--texto-fraco`, que é medido como texto abaixo.
  ['ícone apagado sobre superfície 1', 'texto-apagado', 'superficie-1', 3],
  ['texto fraco sobre superfície 3 (pílula)', 'texto-fraco', 'superficie-3', 4.5],
  ['pílula de atraso (o único preenchimento sólido)', 'atraso-texto', 'atraso-fundo', 4.5],
  // O chip de atraso, no cabeçalho da coluna e no cartão. Antes era
  // `var(--perigo)` com `#fff` cravado no CSS — 2.77:1 no tema escuro, e
  // invisível para este verificador porque a cor do texto não era um token.
  ['chip de alarme (coluna e cartão)', 'alarme-texto', 'alarme-fundo', 4.5],
  ['badge de contagem', 'contagem-texto', 'contagem-fundo', 4.5],

  // Barra de prazo do cartão de aceite. O rótulo fica sobre o preenchimento
  // quando há tempo e sobre o fundo claro quando a barra esvazia — precisa
  // passar nos dois, senão vira ilegível justamente no fim do prazo.
  ['barra de aceite, sobre o preenchimento', 'alarme-texto', 'alarme-fundo', 4.5],
  ['barra de aceite, sobre o trilho vazio', 'atraso-fundo', 'aceite-trilho', 4.5],
  ['trilho da barra de aceite sobre o cartão', 'aceite-trilho', 'superficie-1', 1.3],

  // A faixa de contagem do preparo, em âmbar sólido. Dois degraus, e os dois
  // com o mesmo texto escuro — o segundo existe para separar "faltam 12 min"
  // de "faltam 2 min", e não adianta separar se um deles não se lê.
  ['faixa de preparo (com folga)', 'preparo-texto', 'preparo-fundo', 4.5],
  ['faixa de preparo (últimos minutos)', 'preparo-texto', 'preparo-fundo-aperto', 4.5],
  ['painel da seção sobre a página', 'superficie-2', 'superficie-base', 1.08],
  ['cartão sobre o painel da seção', 'superficie-1', 'superficie-2', 1.05],

  // A ação primária do cartão. É o alvo mais tocado do turno, e o verde é
  // deliberadamente mais vivo que `--marca` — este par é o que impede a
  // vivacidade de virar ilegibilidade num tablet com reflexo de janela.
  ['ação primária do cartão', 'acao-texto', 'acao', 4.5],
  ['ação primária do cartão, sob o ponteiro', 'acao-texto', 'acao-hover', 4.5],

  // Farol com alerta: a pílula inteira inverte, e cada pedaço do conteúdo cai
  // sobre um fundo diferente. Todos precisam passar, senão o alerta que existe
  // para ser lido de longe é o único que não se lê.
  ['farol com alerta (texto sobre a pílula)', 'farol-alerta-texto', 'farol-alerta-fundo', 4.5],
  ['farol com alerta (chip âmbar)', 'farol-chip-texto', 'farol-chip-fundo', 4.5],
  ['farol com alerta (ponto sobre a pílula)', 'farol-chip-fundo', 'farol-alerta-fundo', 3],

  // O painel do farol tem paleta própria, escura nos dois temas. Justamente
  // por não seguir as superfícies do tema, é o bloco onde uma cor escolhida a
  // olho passaria despercebida — então cada par dele é medido aqui.
  ['painel do farol: texto', 'painel-texto', 'painel-fundo', 4.5],
  ['painel do farol: texto sobre o cartão', 'painel-texto', 'painel-elevado', 4.5],
  ['painel do farol: texto fraco', 'painel-fraco', 'painel-fundo', 4.5],
  ['painel do farol: texto fraco sobre o cartão', 'painel-fraco', 'painel-elevado', 4.5],
  ['painel do farol: "Sem alerta"', 'painel-ok', 'painel-fundo', 4.5],
  ['painel do farol: alerta', 'painel-alerta', 'painel-fundo', 4.5],
  ['painel do farol: crítico sobre o cartão', 'painel-critico', 'painel-elevado', 4.5],
  ['painel do farol: chip claro do cabeçalho', 'painel-elevado', 'painel-texto', 4.5],
  ['painel do farol: divisória', 'painel-borda', 'painel-fundo', 1.3],
  ['painel do farol: cartão sobre o fundo', 'painel-elevado', 'painel-fundo', 1.05],

  // Balões de dica. Dois pares porque a posição muda o fundo em que caem: o
  // escuro sobre o cabeçalho claro, o claro ao lado do menu.
  ['dica do cabeçalho', 'dica-escura-texto', 'dica-escura-fundo', 4.5],
  ['dica do menu lateral', 'dica-clara-texto', 'dica-clara-fundo', 4.5],

  // O ponto verde do farol em repouso, sobre a pílula clara. Elemento
  // gráfico, 3:1 — e é o par que impede o verde de clarear até sumir na
  // tentativa de imitar o da referência, que reprova em 1,98:1.
  ['ponto do farol em repouso', 'farol-ok-ponto', 'superficie-3', 3],

  // Item corrente do menu. O par existe separado do vermelho de alarme, e é
  // aqui que ele fica preso ao mínimo: o #EA1D2C da referência reprova em
  // 4,04:1 sobre o próprio fundo suave.
  ['item corrente do menu', 'nav-ativo', 'nav-ativo-suave', 4.5],
]

let falhas = 0

for (const tema of ['dark', 'light']) {
  const tokens = lerTokens(tema)
  console.log(`\n  Tema ${tema === 'dark' ? 'escuro' : 'claro'}`)
  console.log('  ' + '─'.repeat(62))

  for (const [rotulo, frente, fundo, minimo] of PARES) {
    const corFrente = tokens[frente]
    const corFundo = tokens[fundo]

    // O tema claro não redefine todo token; herda o que não muda.
    if (!corFrente || !corFundo) {
      const escuro = lerTokens('dark')
      if (!corFrente && !escuro[frente]) {
        console.log(`  ?  ${rotulo}: token "${frente}" não existe`)
        falhas += 1
        continue
      }
      if (!corFundo && !escuro[fundo]) {
        console.log(`  ?  ${rotulo}: token "${fundo}" não existe`)
        falhas += 1
        continue
      }
    }

    const escuro = lerTokens('dark')
    const f = corFrente ?? escuro[frente]
    const b = corFundo ?? escuro[fundo]
    const r = razao(f, b)
    const ok = r >= minimo

    if (!ok) falhas += 1
    console.log(
      `  ${ok ? '✓' : '✗'}  ${rotulo.padEnd(42)} ${r.toFixed(2).padStart(6)}:1  (mín ${minimo})`
    )
  }
}

console.log()
if (falhas > 0) {
  console.error(
    `  ${falhas} par(es) abaixo do mínimo.\n` +
      `  Ninguém escolhe uma cor ilegível de propósito — por isso a checagem existe.\n`
  )
  process.exit(1)
}
console.log('  Contraste em dia nos dois temas.\n')
