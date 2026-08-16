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
  ['botão primário em hover', 'texto-inverso', 'marca-hover', 4.5],
  ['botão destrutivo (texto sobre superfície 2)', 'perigo', 'superficie-2', 4.5],
  ['botão destrutivo em hover', 'perigo', 'perigo-suave', 4.5],
  ['selo sucesso', 'marca', 'marca-suave', 4.5],
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
  ['badge de contagem', 'contagem-texto', 'contagem-fundo', 4.5],

  // Barra de prazo do cartão de aceite. O rótulo fica sobre o preenchimento
  // quando há tempo e sobre o fundo claro quando a barra esvazia — precisa
  // passar nos dois, senão vira ilegível justamente no fim do prazo.
  ['barra de aceite, sobre o preenchimento', 'atraso-texto', 'atraso-fundo', 4.5],
  ['barra de aceite, sobre o trilho vazio', 'perigo', 'perigo-suave', 4.5],
  ['pílula de aviso (contagem regressiva)', 'atencao', 'atencao-suave', 4.5],
  ['painel da seção sobre a página', 'superficie-2', 'superficie-base', 1.08],
  ['cartão sobre o painel da seção', 'superficie-1', 'superficie-2', 1.05],
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
