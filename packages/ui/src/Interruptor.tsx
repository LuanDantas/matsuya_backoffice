/**
 * Interruptor de ligar/desligar.
 *
 * ## `role="switch"`, e não um botão com `aria-pressed`
 *
 * Este repositório já usa `aria-pressed` em botões que alternam — o filtro de
 * alertas do `PainelDeSecao`, os chips de aba. Aquilo é um **botão que fica
 * apertado**: a leitura é "este filtro está aplicado".
 *
 * Aqui é outra coisa. Numa tela de ajustes, cada linha é uma preferência que
 * vale ligada ou desligada, e `switch` é o papel que o leitor de tela anuncia
 * como "ligado/desligado" em vez de "pressionado". A diferença aparece
 * exatamente onde importa: percorrendo trinta linhas iguais de configuração.
 *
 * ## O rótulo vem de fora
 *
 * `rotuladoPor` aponta para o `id` do título da linha. Um interruptor que
 * anuncia só "ligado" numa lista de trinta é inútil — o leitor de tela precisa
 * dizer **o quê** está ligado, e o título já está ali ao lado, escrito.
 *
 * ## Por que não um `<input type="checkbox">`
 *
 * Caixa de seleção e interruptor não significam a mesma coisa: a primeira é
 * escolha que só vale quando o formulário é enviado, o segundo tem efeito
 * imediato. Aqui o efeito é imediato — o som muda no próximo alerta —, e não há
 * formulário nenhum para enviar.
 */

export interface PropsDoInterruptor {
  ligado: boolean
  /** `id` do elemento que dá nome a este interruptor. */
  rotuladoPor: string
  desabilitado?: boolean
  /** Explica por que está desabilitado, quando estiver. */
  dica?: string
  aoAlternar: (ligado: boolean) => void
}

export function Interruptor({
  ligado,
  rotuladoPor,
  desabilitado = false,
  dica,
  aoAlternar,
}: PropsDoInterruptor) {
  return (
    <button
      type="button"
      role="switch"
      className="ui-interruptor"
      aria-checked={ligado}
      aria-labelledby={rotuladoPor}
      disabled={desabilitado}
      title={dica}
      onClick={() => aoAlternar(!ligado)}
    >
      {/*
        O carrinho é `aria-hidden`: quem lê a tela recebe o estado pelo
        `aria-checked`, e um `span` vazio anunciado no meio disso só atrapalha.
      */}
      <span className="ui-interruptor__trilho" aria-hidden="true">
        <span className="ui-interruptor__carrinho" />
      </span>
    </button>
  )
}
