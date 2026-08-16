/**
 * Modelo da comanda.
 *
 * Uma comanda não é uma versão impressa da tela. Ela é lida pendurada num
 * trilho, de relance, por alguém com as mãos ocupadas — e por isso obedece a
 * regras próprias:
 *
 * - **O que preparar vem primeiro e grande.** Endereço e valores são para a
 *   expedição, não para a cozinha; ficam no rodapé.
 * - **Quantidade antes do nome, sempre.** "3× Temaki" e "Temaki 3×" levam o
 *   mesmo tempo para ler na tela e tempos diferentes num trilho com doze papéis.
 * - **Item cancelado aparece riscado.** Some da lista, e a cozinha prepara o
 *   que já foi cancelado — que é desperdício e atraso no mesmo movimento.
 * - **Sem cor.** Impressora térmica só tem preto; hierarquia vem de tamanho,
 *   peso e régua.
 */

export interface ItemDaComanda {
  qty: number
  cancelledQty?: number
  productName: string
  /** Opções escolhidas, já em texto. */
  opcoes?: string[]
  observacao?: string | null
}

export interface DadosDaComanda {
  code: string
  unidade: string
  criadoEm: string
  deliveryType: 'delivery' | 'pickup'
  itens: ItemDaComanda[]
  observacaoDoPedido?: string | null
  cliente?: string | null
  endereco?: string | null
  telefone?: string | null
  subtotal: number
  taxaDeEntrega: number
  total: number
  formaDePagamento: string
  pago: boolean
  /** Impressa uma segunda vez: precisa ficar evidente no papel. */
  reimpressao?: boolean
}

export type LarguraDoPapel = 58 | 80

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const horario = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const ROTULO_DO_PAGAMENTO: Record<string, string> = {
  pix: 'PIX',
  card: 'CARTAO',
  on_delivery: 'NA ENTREGA',
}

/**
 * HTML da comanda, pronto para a janela de impressão.
 *
 * Autocontido — estilos embutidos, nenhuma fonte externa, nenhuma imagem. A
 * janela de impressão de um navegador em quiosque não tem acesso ao bundle da
 * aplicação, e uma folha de estilo que não carrega imprime uma parede de texto
 * sem formatação.
 */
export function montarComanda(dados: DadosDaComanda, largura: LarguraDoPapel = 80): string {
  const linhas = dados.itens
    .map((item) => {
      const cancelados = item.cancelledQty ?? 0
      const restantes = item.qty - cancelados
      const tudoCancelado = restantes <= 0

      const opcoes = (item.opcoes ?? [])
        .map((o) => `<div class="opcao">+ ${escapar(o)}</div>`)
        .join('')

      const observacao = item.observacao
        ? `<div class="obs-item">** ${escapar(item.observacao)}</div>`
        : ''

      const aviso =
        cancelados > 0 && !tudoCancelado
          ? `<div class="obs-item">** ${cancelados} CANCELADO(S)</div>`
          : ''

      return `
        <div class="item${tudoCancelado ? ' cancelado' : ''}">
          <div class="linha-item">
            <span class="qtd">${tudoCancelado ? item.qty : restantes}x</span>
            <span class="nome">${escapar(item.productName)}</span>
          </div>
          ${opcoes}${observacao}${aviso}
        </div>`
    })
    .join('')

  const bloco = (titulo: string, conteudo: string) =>
    conteudo ? `<div class="bloco"><div class="rotulo">${titulo}</div>${conteudo}</div>` : ''

  const entrega =
    dados.deliveryType === 'pickup'
      ? bloco('RETIRADA NO BALCAO', '<div>Cliente retira na loja</div>')
      : bloco(
          'ENTREGA',
          [
            dados.cliente ? `<div>${escapar(dados.cliente)}</div>` : '',
            dados.endereco ? `<div>${escapar(dados.endereco)}</div>` : '',
            dados.telefone ? `<div>${escapar(dados.telefone)}</div>` : '',
          ].join('')
        )

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Comanda ${escapar(dados.code)}</title>
<style>
  @page { size: ${largura}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 4mm 3mm;
    width: ${largura}mm;
    /* Monoespaçada: alinha quantidade e preço em coluna sem tabela, e é a
       fonte que toda impressora térmica renderiza igual. */
    font-family: ui-monospace, 'Courier New', monospace;
    font-size: ${largura === 58 ? '11px' : '12px'};
    line-height: 1.35;
    color: #000;
    background: #fff;
  }
  .centro { text-align: center; }
  .regua { border-top: 1px dashed #000; margin: 2mm 0; }
  .codigo { font-size: ${largura === 58 ? '20px' : '24px'}; font-weight: 700; letter-spacing: 1px; }
  .tipo { font-size: ${largura === 58 ? '13px' : '15px'}; font-weight: 700; margin-top: 1mm; }
  .reimpressao {
    border: 2px solid #000; padding: 1mm; margin-bottom: 2mm;
    font-weight: 700; text-align: center; letter-spacing: 1px;
  }
  .rotulo { font-size: 10px; font-weight: 700; letter-spacing: 1px; margin-bottom: 1mm; }
  .bloco { margin: 2mm 0; }
  .item { margin-bottom: 2mm; }
  .linha-item { display: flex; gap: 2mm; align-items: baseline; }
  .qtd { font-weight: 700; font-size: ${largura === 58 ? '14px' : '16px'}; min-width: 9mm; }
  .nome { font-weight: 700; font-size: ${largura === 58 ? '13px' : '15px'}; flex: 1; }
  .opcao { padding-left: 9mm; font-size: 11px; }
  .obs-item { padding-left: 9mm; font-weight: 700; }
  .cancelado { text-decoration: line-through; opacity: 0.75; }
  .obs-pedido { border: 1px solid #000; padding: 1.5mm; margin: 2mm 0; font-weight: 700; }
  .valores div { display: flex; justify-content: space-between; }
  .total { font-weight: 700; font-size: ${largura === 58 ? '14px' : '16px'}; margin-top: 1mm; }
  .pagamento { text-align: center; font-weight: 700; margin-top: 2mm; }
  .rodape { margin-top: 3mm; text-align: center; font-size: 10px; }
</style>
</head>
<body>
${dados.reimpressao ? '<div class="reimpressao">*** REIMPRESSAO ***</div>' : ''}

<div class="centro">
  <div class="codigo">${escapar(dados.code)}</div>
  <div class="tipo">${dados.deliveryType === 'pickup' ? 'RETIRADA' : 'ENTREGA'}</div>
  <div>${escapar(dados.unidade)} &middot; ${horario.format(new Date(dados.criadoEm))}</div>
</div>

<div class="regua"></div>
${linhas}
<div class="regua"></div>

${
  dados.observacaoDoPedido
    ? `<div class="obs-pedido">OBS: ${escapar(dados.observacaoDoPedido)}</div>`
    : ''
}

${entrega}

<div class="bloco valores">
  <div><span>Subtotal</span><span>${moeda.format(dados.subtotal)}</span></div>
  ${
    dados.taxaDeEntrega > 0
      ? `<div><span>Entrega</span><span>${moeda.format(dados.taxaDeEntrega)}</span></div>`
      : ''
  }
  <div class="total"><span>TOTAL</span><span>${moeda.format(dados.total)}</span></div>
</div>

<div class="pagamento">
  ${ROTULO_DO_PAGAMENTO[dados.formaDePagamento] ?? escapar(dados.formaDePagamento.toUpperCase())}
  &middot; ${dados.pago ? 'PAGO' : 'A RECEBER'}
</div>

<div class="rodape">${escapar(dados.code)}</div>
</body>
</html>`
}
