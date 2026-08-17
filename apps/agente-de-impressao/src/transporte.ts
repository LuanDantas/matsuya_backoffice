import { createConnection } from 'node:net'
import { open } from 'node:fs/promises'

/**
 * Como os bytes chegam à impressora.
 *
 * Dois caminhos, porque as lojas têm os dois tipos de máquina:
 *
 * - **TCP 9100** — impressora de rede. É o motivo de o navegador não conseguir
 *   imprimir sozinho: ele não abre socket cru, e este agente existe para abrir.
 * - **Dispositivo** — USB ou serial exposta pelo sistema (`/dev/usb/lp0`,
 *   `\\.\COM3`). Escrita direta no arquivo do dispositivo.
 *
 * Nenhum dos dois tem retry aqui. Reenviar no transporte duplicaria a comanda
 * quando a falha acontecesse **depois** de a impressora já ter recebido os
 * bytes — e comanda duplicada na cozinha é prato feito duas vezes. Quem repete
 * é a fila, que sabe se o trabalho chegou a ser aceito.
 */

export interface Impressora {
  nome: string
  papel: 'cozinha' | 'balcao'
  largura: 58 | 80
  destino: { tipo: 'rede'; host: string; porta?: number } | { tipo: 'dispositivo'; caminho: string }
}

/** Uma impressora que não responde em 8 s está sem papel, travada ou desligada. */
const TEMPO_LIMITE_MS = 8_000

export async function enviarBytes(impressora: Impressora, bytes: Buffer): Promise<void> {
  if (impressora.destino.tipo === 'dispositivo') {
    const arquivo = await open(impressora.destino.caminho, 'w')
    try {
      await arquivo.write(bytes)
    } finally {
      await arquivo.close()
    }
    return
  }

  const { host, porta = 9100 } = impressora.destino

  await new Promise<void>((resolver, rejeitar) => {
    const conexao = createConnection({ host, port: porta })
    let encerrado = false

    const encerrar = (erro?: Error) => {
      if (encerrado) return
      encerrado = true
      conexao.destroy()
      erro ? rejeitar(erro) : resolver()
    }

    conexao.setTimeout(TEMPO_LIMITE_MS, () =>
      encerrar(new Error(`${impressora.nome} não respondeu em ${TEMPO_LIMITE_MS / 1000}s`))
    )

    conexao.on('error', (erro) => encerrar(erro))

    conexao.on('connect', () => {
      /*
       * `end` e não `write` seguido de `destroy`: a impressora precisa receber
       * o FIN para saber que a comanda terminou. Fechar à força pode cortar os
       * últimos bytes no buffer do sistema — e os últimos bytes são justamente
       * o comando de corte.
       */
      conexao.end(bytes, () => encerrar())
    })
  })
}

/**
 * A impressora está viva?
 *
 * Abre e fecha a conexão sem mandar nada. Serve para o heartbeat acender o
 * indicador **antes** do primeiro pedido falhar, que é a diferença entre a loja
 * descobrir o problema às 11h e descobrir com o salão cheio.
 */
export async function estaOnline(impressora: Impressora): Promise<boolean> {
  if (impressora.destino.tipo === 'dispositivo') {
    try {
      const arquivo = await open(impressora.destino.caminho, 'r+')
      await arquivo.close()
      return true
    } catch {
      return false
    }
  }

  const { host, porta = 9100 } = impressora.destino

  return new Promise<boolean>((resolver) => {
    const conexao = createConnection({ host, port: porta })
    let respondido = false

    const responder = (vivo: boolean) => {
      if (respondido) return
      respondido = true
      conexao.destroy()
      resolver(vivo)
    }

    conexao.setTimeout(2_000, () => responder(false))
    conexao.on('error', () => responder(false))
    conexao.on('connect', () => responder(true))
  })
}
