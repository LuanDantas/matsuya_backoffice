/**
 * O cartão enquanto os dados não chegaram.
 *
 * Esqueleto, e não um giro no centro da tela. A diferença é o que acontece
 * quando os dados chegam: com o giro, a tela inteira é substituída e o quadro
 * salta; com o esqueleto, cada bloco cinza vira o cartão que estava no lugar
 * dele, as colunas não se movem e o olho não perde a posição.
 *
 * A forma imita o cartão de verdade — chip, herói, faixa, rodapé — porque é
 * isso que faz o esqueleto informar em vez de só ocupar espaço: quem olha já
 * sabe o que vai aparecer ali, e começa a ler a coluna antes de o conteúdo
 * existir.
 *
 * `aria-hidden`: não há nada aqui para anunciar. Quem usa leitor de tela ouve
 * o `role="status"` da coluna dizendo que o quadro está carregando, uma vez —
 * e não doze blocos vazios.
 */
export function CartaoEsqueleto({ atraso = 0 }: { atraso?: number }) {
  return (
    <div
      className="esqueleto"
      aria-hidden="true"
      style={{ '--atraso': `${atraso}ms` } as React.CSSProperties}
    >
      <span className="esqueleto__bloco esqueleto__chip" />
      <span className="esqueleto__bloco esqueleto__heroi" />
      <span className="esqueleto__bloco esqueleto__faixa" />
      <span className="esqueleto__bloco esqueleto__rodape" />
    </div>
  )
}

/**
 * Uma pilha de esqueletos com entrada escalonada.
 *
 * O atraso crescente por cartão faz a coluna se montar de cima para baixo, na
 * mesma ordem em que ela é lida. Todos surgindo juntos parece um piscar; um a
 * um, parece carregamento.
 *
 * Três é o suficiente: o esqueleto sugere que há conteúdo vindo, não promete
 * quantidade. Encher a coluna com dez e entregar dois seria mentir sobre o
 * movimento da loja.
 */
export function PilhaDeEsqueletos({ quantidade = 3 }: { quantidade?: number }) {
  return (
    <>
      {Array.from({ length: quantidade }, (_, i) => (
        <CartaoEsqueleto key={i} atraso={i * 90} />
      ))}
    </>
  )
}
