import { readFile } from 'node:fs/promises'
import { FilaDeImpressao } from './fila'
import { criarServidor, PORTA_PADRAO } from './servidor'
import { ServidorRemoto } from './servidorRemoto'
import type { Impressora } from './transporte'

/**
 * O agente de impressão da loja (ADR-0017).
 *
 * Roda no PC do balcão ou numa caixinha sempre ligada. Recebe comandas do Hub
 * pela LAN e fala ESC/POS com as impressoras térmicas — que é o que o navegador
 * não consegue fazer, porque ele não abre socket cru na 9100.
 *
 * O que ele compra, em uma frase: **a impressão continua funcionando com a
 * internet da loja fora**, porque o caminho Hub → agente não sai da LAN.
 *
 *     pnpm --filter @matsuya/agente-de-impressao dev
 *
 * A configuração é um JSON ao lado do executável (ou em `AGENTE_CONFIG`).
 * Formato mínimo:
 *
 *     {
 *       "porta": 9110,
 *       "servidor": {
 *         "url": "https://mastsuya-api.onrender.com",
 *         "token": "<token do dispositivo, exibido uma vez no registro>",
 *         "unityId": 8
 *       },
 *       "impressoras": [
 *         { "nome": "Cozinha", "papel": "cozinha", "largura": 80,
 *           "destino": { "tipo": "rede", "host": "192.168.0.50" } },
 *         { "nome": "Balcao", "papel": "balcao", "largura": 80,
 *           "destino": { "tipo": "dispositivo", "caminho": "/dev/usb/lp0" } }
 *       ]
 *     }
 */

interface Configuracao {
  porta?: number
  impressoras: Impressora[]
  /**
   * A ligação com o backend. Ausente ⇒ o agente funciona só pela LAN, que é o
   * modo de piloto: dá para instalar numa loja e imprimir antes de existir
   * dispositivo registrado.
   */
  servidor?: { url: string; token: string; unityId: number }
}

const CAMINHO_PADRAO = 'agente.config.json'

async function carregarConfiguracao(): Promise<Configuracao> {
  const caminho = process.env.AGENTE_CONFIG ?? CAMINHO_PADRAO

  try {
    return JSON.parse(await readFile(caminho, 'utf8')) as Configuracao
  } catch {
    /*
     * Sem configuração o agente **sobe assim mesmo**, com zero impressoras.
     * `/saude` responde e diz que não há nenhuma, que é o diagnóstico que
     * alguém instalando na loja precisa ver. Sair com erro deixaria a pessoa
     * com um serviço morto e nenhuma pista.
     */
    console.warn(
      `[agente] configuração não encontrada em ${caminho} — subindo sem impressoras. ` +
        'Consulte /saude.'
    )
    return { impressoras: [] }
  }
}

async function principal(): Promise<void> {
  const config = await carregarConfiguracao()

  const fila = new FilaDeImpressao({
    impressoras: config.impressoras,
    aoMudar: (trabalhos) => {
      const falhas = trabalhos.filter((t) => t.estado === 'falhou')
      for (const f of falhas) {
        console.error(`[agente] ${f.impressora}: comanda ${f.comanda.code} falhou — ${f.ultimoErro}`)
      }
    },
  })

  const { escutar, parar } = criarServidor({
    fila,
    impressoras: config.impressoras,
    porta: config.porta ?? PORTA_PADRAO,
  })

  const porta = await escutar()

  /*
   * Dois caminhos de entrada, e é de propósito: o Hub alcança o agente pela
   * LAN mesmo com a internet da loja fora, e o servidor alcança mesmo com o
   * Hub fechado. A fila deduplica quando os dois chegam.
   */
  const remoto = config.servidor
    ? new ServidorRemoto({
        ...config.servidor,
        fila,
        impressoras: config.impressoras,
      })
    : null

  remoto?.conectar()

  console.log(`[agente] escutando em http://0.0.0.0:${porta}`)
  console.log(
    remoto
      ? `[agente] ligado ao servidor ${config.servidor!.url} (unidade ${config.servidor!.unityId})`
      : '[agente] sem ligação com o servidor — só o caminho pela LAN'
  )
  console.log(
    config.impressoras.length > 0
      ? `[agente] impressoras: ${config.impressoras.map((i) => `${i.nome} (${i.papel})`).join(', ')}`
      : '[agente] nenhuma impressora configurada'
  )

  const encerrar = async () => {
    console.log('[agente] encerrando; aguardando a fila esvaziar')
    // Sair no meio de uma comanda deixaria meia comanda no papel, e a outra
    // metade em lugar nenhum.
    remoto?.desconectar()
    await fila.aguardar()
    await parar()
    process.exit(0)
  }

  process.on('SIGINT', () => void encerrar())
  process.on('SIGTERM', () => void encerrar())
}

void principal()
