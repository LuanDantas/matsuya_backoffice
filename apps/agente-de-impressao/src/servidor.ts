import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { DadosDaComanda, LarguraDoPapel } from '@matsuya/printing/comanda'
import type { FilaDeImpressao } from './fila'
import { estaOnline, type Impressora } from './transporte'

/**
 * O endpoint na LAN.
 *
 * ## A porta é 9110, e não 9100
 *
 * O ADR-0017 pede 9110. O comentário de exemplo em `@matsuya/printing` dizia
 * 9100, e 9100 é a porta do protocolo de impressão bruta (JetDirect) — a mesma
 * que as impressoras de rede escutam. Um agente rodando num PC da mesma LAN
 * numa porta com esse nome é confusão garantida no dia em que alguém for
 * diagnosticar, e colisão real se o PC tiver serviço de impressão. Fica 9110, e
 * o exemplo do pacote foi corrigido junto.
 *
 * ## O caminho é `/imprimir`
 *
 * O ADR fala em `POST /jobs`. O Hub **já implementa** `POST /imprimir` com
 * corpo `{ largura, comanda }` (`packages/printing/src/impressora.ts`), e é
 * código que roda. Entre o documento e o cliente que existe, o agente obedece
 * ao cliente — trocar o caminho agora quebraria o Hub para ganhar aderência a
 * um texto.
 *
 * ## Por que a resposta é imediata
 *
 * O Hub desiste em 4 s e cai para a impressão pelo navegador. Se o agente
 * segurasse a resposta até o papel sair, uma impressora lenta faria o Hub
 * imprimir **também** pelo navegador — comanda em duplicidade, que é o defeito
 * que a dedupe existe para evitar. Então: aceita, enfileira, responde. A fila
 * daqui é que garante a entrega.
 */

const PORTA_PADRAO = 9110

interface CorpoDeImpressao {
  largura?: LarguraDoPapel
  comanda?: DadosDaComanda
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const pedacos: Buffer[] = []
  for await (const pedaco of req) pedacos.push(pedaco as Buffer)
  if (pedacos.length === 0) return null
  return JSON.parse(Buffer.concat(pedacos).toString('utf8'))
}

function responder(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    /*
     * O Hub roda em https e chama http na LAN. Sem CORS o navegador barra a
     * resposta antes de o código vê-la, e o operador só percebe que "não
     * imprime" — sem nenhuma pista de que a comanda chegou.
     */
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  })
  res.end(texto)
}

export interface OpcoesDoServidor {
  fila: FilaDeImpressao
  impressoras: Impressora[]
  porta?: number
}

export function criarServidor(opcoes: OpcoesDoServidor) {
  const servidor = createServer((req, res) => {
    void tratar(req, res, opcoes).catch((erro) => {
      responder(res, 500, { erro: erro instanceof Error ? erro.message : String(erro) })
    })
  })

  return {
    servidor,
    escutar: () =>
      new Promise<number>((resolver) => {
        const porta = opcoes.porta ?? PORTA_PADRAO
        servidor.listen(porta, () => resolver(porta))
      }),
    parar: () => new Promise<void>((r) => servidor.close(() => r())),
  }
}

async function tratar(
  req: IncomingMessage,
  res: ServerResponse,
  opcoes: OpcoesDoServidor
): Promise<void> {
  if (req.method === 'OPTIONS') return responder(res, 204, null)

  const rota = (req.url ?? '').split('?')[0]

  if (req.method === 'POST' && rota === '/imprimir') {
    const corpo = (await lerCorpo(req)) as CorpoDeImpressao | null

    if (!corpo?.comanda?.code) {
      return responder(res, 400, { erro: 'corpo precisa de `comanda` com `code`' })
    }

    const trabalhos = opcoes.fila.enfileirar(corpo.comanda)

    /*
     * Zero trabalhos com impressoras configuradas significa duplicata — e
     * duplicata é **sucesso**: a comanda já está na fila ou já saiu, e devolver
     * erro faria o Hub cair para o navegador e imprimir de novo.
     */
    if (trabalhos.length === 0 && opcoes.impressoras.length === 0) {
      return responder(res, 503, { erro: 'nenhuma impressora configurada' })
    }

    return responder(res, 202, {
      aceito: true,
      duplicata: trabalhos.length === 0,
      trabalhos: trabalhos.map((t) => ({ id: t.id, impressora: t.impressora, papel: t.papel })),
    })
  }

  if (req.method === 'GET' && rota === '/saude') {
    const impressoras = await Promise.all(
      opcoes.impressoras.map(async (i) => ({
        nome: i.nome,
        papel: i.papel,
        online: await estaOnline(i),
      }))
    )

    const pendentes = opcoes.fila.pendentes.length
    const falhas = opcoes.fila.todos.filter((t) => t.estado === 'falhou').length

    return responder(res, 200, { versao: 1, impressoras, pendentes, falhas })
  }

  if (req.method === 'POST' && rota === '/reimprimir') {
    const corpo = (await lerCorpo(req)) as { id?: string } | null
    if (!corpo?.id) return responder(res, 400, { erro: 'informe `id`' })

    // Uma chamada só: `reenfileirar` muda o estado do trabalho, e chamá-la de
    // novo para montar o corpo devolveria `false` contradizendo o próprio
    // status da resposta.
    const reenfileirado = opcoes.fila.reenfileirar(corpo.id)

    return responder(res, reenfileirado ? 202 : 404, { reenfileirado })
  }

  responder(res, 404, { erro: 'rota desconhecida' })
}

export { PORTA_PADRAO }
