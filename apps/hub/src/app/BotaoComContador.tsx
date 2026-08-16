import { Icone, type NomeDoIcone } from '@matsuya/ui'

/**
 * Botão quadrado com distintivo numérico, como os do canto da referência.
 *
 * O distintivo pulsa só enquanto há o que atender, e **para com movimento
 * reduzido**. Uma animação infinita no campo periférico de quem trabalha seis
 * horas vira desconforto, e desconforto vira "eu já vi, ignora" — o oposto do
 * que um contador de pendência existe para fazer.
 */
export function BotaoComContador({
  icone,
  rotulo,
  contagem,
  aoClicar,
}: {
  icone: NomeDoIcone
  rotulo: string
  contagem: number
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      className="contador"
      onClick={aoClicar}
      // O rótulo acessível carrega o número: um leitor de tela não vê o
      // distintivo, e "Exceções" sozinho não diz que há três esperando.
      aria-label={
        contagem > 0 ? `${rotulo} — ${contagem} aguardando` : `${rotulo} — nada aguardando`
      }
      title={rotulo}
    >
      <Icone nome={icone} tamanho={20} />
      {contagem > 0 && (
        <span className="contador__distintivo num" aria-hidden="true">
          {contagem > 9 ? '9+' : contagem}
        </span>
      )}
    </button>
  )
}
