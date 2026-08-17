import type { DadosDaComanda, ItemDaComanda, LarguraDoPapel } from '@matsuya/printing/comanda'
import { paraCp850 } from './cp850'

/**
 * A comanda em bytes ESC/POS.
 *
 * O layout é o mesmo que `@matsuya/printing` já define para o navegador, e as
 * regras vêm de lá: quantidade antes do nome, o que preparar primeiro e grande,
 * endereço e valores no rodapé, item cancelado riscado. Aqui muda só o meio —
 * onde o HTML usa `font-size`, o papel usa `GS !`.
 *
 * A divisão é a do ADR-0017: o **modelo** da comanda é compartilhado e vive com
 * o frontend; a **emissão de bytes** vive onde está o hardware, porque é aqui
 * que importam codepage, corte e gaveta.
 */

const ESC = 0x1b
const GS = 0x1d

/** Colunas por largura de papel, na fonte A. */
const COLUNAS: Record<LarguraDoPapel, number> = { 58: 32, 80: 48 }

const comandos = {
  iniciar: Buffer.from([ESC, 0x40]),
  /**
   * `ESC t 2` seleciona CP850. Sem isto a impressora usa a tabela de fábrica
   * (quase sempre PC437, sem `ã` e sem `ç`) e todo acento vira símbolo.
   */
  codepage: Buffer.from([ESC, 0x74, 0x02]),
  alinhar: (n: 0 | 1 | 2) => Buffer.from([ESC, 0x61, n]),
  negrito: (ligado: boolean) => Buffer.from([ESC, 0x45, ligado ? 1 : 0]),
  /** `GS ! n`: nibble alto multiplica largura, nibble baixo altura. */
  tamanho: (largura: 1 | 2, altura: 1 | 2) =>
    Buffer.from([GS, 0x21, ((largura - 1) << 4) | (altura - 1)]),
  sublinhado: (ligado: boolean) => Buffer.from([ESC, 0x2d, ligado ? 1 : 0]),
  linha: Buffer.from([0x0a]),
  /** Avança o papel antes de cortar, senão o corte cai sobre a última linha. */
  cortar: Buffer.from([0x0a, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00]),
  /** Pulso na gaveta. Só o balcão usa. */
  gaveta: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]),
}

const moeda = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const texto = (s: string) => paraCp850(s)

/** Uma linha com rótulo à esquerda e valor à direita, preenchida com espaços. */
function emColunas(esquerda: string, direita: string, colunas: number): Buffer {
  const espacos = Math.max(1, colunas - esquerda.length - direita.length)
  return texto(`${esquerda}${' '.repeat(espacos)}${direita}`)
}

function regua(colunas: number): Buffer {
  return Buffer.concat([texto('-'.repeat(colunas)), comandos.linha])
}

/**
 * O item, que é a razão de a comanda existir.
 *
 * Quantidade antes do nome e em corpo duplo. Numa tela os dois formatos levam o
 * mesmo tempo para ler; num trilho com doze papéis, "3×" na frente é a
 * diferença entre conferir de relance e ter de pegar o papel na mão.
 */
function montarItem(item: ItemDaComanda, colunas: number): Buffer {
  const partes: Buffer[] = []
  const restante = item.qty - (item.cancelledQty ?? 0)

  partes.push(comandos.tamanho(1, 2), comandos.negrito(true))

  if (restante <= 0) {
    /*
     * Item inteiramente cancelado. Some da lista e a cozinha prepara o que já
     * foi cancelado — desperdício e atraso no mesmo movimento. O papel não tem
     * como riscar, então o rótulo faz o trabalho.
     */
    partes.push(texto(`CANCELADO: ${item.qty}x ${item.productName}`), comandos.linha)
  } else {
    partes.push(texto(`${restante}x ${item.productName}`), comandos.linha)

    if (item.cancelledQty) {
      partes.push(
        comandos.tamanho(1, 1),
        comandos.negrito(false),
        texto(`   (${item.cancelledQty}x cancelado)`),
        comandos.linha
      )
    }
  }

  partes.push(comandos.tamanho(1, 1), comandos.negrito(false))

  for (const opcao of item.opcoes ?? []) {
    partes.push(texto(`   + ${opcao}`), comandos.linha)
  }

  if (item.observacao) {
    // A observação é o que mais dá errado quando passa despercebida.
    partes.push(comandos.negrito(true), texto(`   ! ${item.observacao}`), comandos.negrito(false), comandos.linha)
  }

  partes.push(comandos.linha)

  return Buffer.concat(partes)
}

export type PapelDaImpressora = 'cozinha' | 'balcao'

/**
 * Monta a comanda.
 *
 * `cozinha` não recebe preço nenhum, e isso é regra e não economia de papel:
 * quem monta o prato não decide nada com o valor, e o número a mais é uma linha
 * a mais para varrer com os olhos. O balcão recebe tudo, porque é dali que sai
 * a conferência com o cliente.
 */
export function montarBytes(
  dados: DadosDaComanda,
  opcoes: { largura?: LarguraDoPapel; papel?: PapelDaImpressora } = {}
): Buffer {
  const largura = opcoes.largura ?? 80
  const papel = opcoes.papel ?? 'balcao'
  const colunas = COLUNAS[largura]

  const partes: Buffer[] = [comandos.iniciar, comandos.codepage]

  // Cabeçalho
  partes.push(comandos.alinhar(1), comandos.tamanho(2, 2), comandos.negrito(true))
  partes.push(texto(dados.code), comandos.linha)
  partes.push(comandos.tamanho(1, 1))

  if (dados.reimpressao) {
    // Precisa saltar aos olhos: sem isto a cozinha prepara o mesmo pedido duas
    // vezes, e a segunda comanda parece tão nova quanto a primeira.
    partes.push(comandos.sublinhado(true), texto('*** REIMPRESSAO ***'), comandos.sublinhado(false), comandos.linha)
  }

  partes.push(comandos.negrito(false))
  partes.push(texto(dados.deliveryType === 'delivery' ? 'ENTREGA' : 'RETIRADA'), comandos.linha)
  partes.push(texto(dados.unidade), comandos.linha)
  partes.push(texto(dados.criadoEm), comandos.linha)

  partes.push(comandos.alinhar(0), regua(colunas))

  for (const item of dados.itens) partes.push(montarItem(item, colunas))

  if (dados.observacaoDoPedido) {
    partes.push(regua(colunas))
    partes.push(comandos.negrito(true), comandos.tamanho(1, 2))
    partes.push(texto('OBS DO PEDIDO'), comandos.linha)
    partes.push(comandos.tamanho(1, 1), texto(dados.observacaoDoPedido), comandos.linha)
    partes.push(comandos.negrito(false))
  }

  /*
   * Daqui para baixo é expedição, não preparo. A cozinha para aqui — endereço,
   * telefone e totais só atrapalham quem está montando o prato.
   */
  if (papel === 'balcao') {
    partes.push(regua(colunas))

    if (dados.cliente) partes.push(texto(dados.cliente), comandos.linha)
    if (dados.telefone) partes.push(texto(dados.telefone), comandos.linha)
    if (dados.endereco) partes.push(texto(dados.endereco), comandos.linha)

    partes.push(regua(colunas))
    partes.push(emColunas('Subtotal', moeda(dados.subtotal), colunas), comandos.linha)

    if (dados.taxaDeEntrega > 0) {
      partes.push(emColunas('Entrega', moeda(dados.taxaDeEntrega), colunas), comandos.linha)
    }

    partes.push(comandos.negrito(true), comandos.tamanho(1, 2))
    partes.push(emColunas('TOTAL', moeda(dados.total), colunas), comandos.linha)
    partes.push(comandos.tamanho(1, 1), comandos.negrito(false))

    partes.push(texto(dados.formaDePagamento), comandos.linha)

    // O estado do pagamento é a informação que evita o constrangimento na
    // porta. Em negrito quando é "a receber", porque é a que exige ação.
    partes.push(
      dados.pago ? texto('PAGO') : Buffer.concat([comandos.negrito(true), texto('A RECEBER'), comandos.negrito(false)]),
      comandos.linha
    )
  }

  partes.push(comandos.cortar)

  return Buffer.concat(partes)
}
