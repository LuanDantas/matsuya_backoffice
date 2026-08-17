import { Icone, type NomeDoIcone } from '@matsuya/ui'

/**
 * Botão quadrado do cabeçalho, como os do canto da referência.
 *
 * Três deles hoje: exceções, conversas e som. Os dois primeiros carregam
 * contador; o terceiro não conta nada, e é por isso que `contagem` é opcional
 * em vez de aceitar zero — zero e "não se aplica" são coisas diferentes, e um
 * distintivo que nunca aparece por definição é código morto disfarçado de
 * estado.
 *
 * O distintivo pulsa só enquanto há o que atender, e **para com movimento
 * reduzido**. Uma animação infinita no campo periférico de quem trabalha seis
 * horas vira desconforto, e desconforto vira "eu já vi, ignora" — o oposto do
 * que um contador de pendência existe para fazer.
 */
export function BotaoComContador({
  icone,
  rotulo,
  dica,
  contagem,
  ativo = false,
  desabilitado = false,
  alinharDicaNoFim = false,
  aoClicar,
}: {
  icone: NomeDoIcone
  /** Nome curto do alvo. Vira o balão de dica quando não há `dica` própria. */
  rotulo: string
  /**
   * Texto do balão, quando ele precisa dizer mais que o nome.
   *
   * O som usa isto: o rótulo é "Som", mas o que ajuda a decidir é "Silenciar
   * os alertas" ou "Ligar o som" — o balão explica a **ação**, não o objeto.
   */
  dica?: string
  contagem?: number
  /** Marca o botão como estado ligado, ex.: som silenciado. */
  ativo?: boolean
  desabilitado?: boolean
  /**
   * Encosta o balão à direita do botão, para os controles do fim da barra.
   *
   * Centralizado, o balão de um botão colado na borda joga metade da própria
   * largura para fora da janela.
   */
  alinharDicaNoFim?: boolean
  aoClicar: () => void
}) {
  const temContador = typeof contagem === 'number'
  const balao = dica ?? rotulo

  return (
    <button
      type="button"
      className="contador"
      data-ativo={ativo || undefined}
      disabled={desabilitado}
      onClick={aoClicar}
      // O rótulo acessível carrega o número: um leitor de tela não vê o
      // distintivo, e "Exceções" sozinho não diz que há três esperando.
      aria-label={
        temContador
          ? contagem! > 0
            ? `${rotulo} — ${contagem} aguardando`
            : `${rotulo} — nada aguardando`
          : balao
      }
      // Sem `title`: o balão vem do `data-dica`, e os dois juntos fazem o
      // navegador desenhar duas dicas com meio segundo de diferença.
      data-dica={balao}
      data-dica-lado="abaixo"
      data-dica-alinhar={alinharDicaNoFim ? 'fim' : undefined}
    >
      <Icone nome={icone} tamanho={20} />
      {temContador && contagem! > 0 && (
        <span className="contador__distintivo num" aria-hidden="true">
          {contagem! > 9 ? '9+' : contagem}
        </span>
      )}
    </button>
  )
}
