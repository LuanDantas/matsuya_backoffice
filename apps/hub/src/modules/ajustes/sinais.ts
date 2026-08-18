import type { NomeDoIcone } from '@matsuya/ui'
import type { EstadoDeSincronia } from '@matsuya/realtime'
import type { EstadoDaConexao } from '../../dados/conexao'
import type { SaudeDoAgente } from '../../impressao/saudeDoAgente'

/**
 * O diagnóstico do dispositivo — o que está bem, o que não está, e o que fazer.
 *
 * ## Para quem esta página é
 *
 * Para a loja resolver sozinha ou pedir ajuda com precisão. Por isso cada
 * cartão traz **uma frase dizendo o que fazer**, e não só o nome do estado: uma
 * tela que diz "degradado" e para por aí transfere o problema para quem menos
 * pode resolvê-lo.
 *
 * ## Por que este arquivo se chama `sinais` e não `diagnostico`
 *
 * O componente ao lado é `Diagnostico.tsx`, e dois arquivos que diferem só na
 * caixa não convivem: o sistema de arquivos do macOS não os distingue, e o
 * TypeScript recusa o programa inteiro. `sinais` também é mais honesto — o que
 * está aqui são os sinais crus virando estado legível, não a tela.
 *
 * ## Por que a regra mora aqui
 *
 * O `vitest` deste repositório roda sem DOM, então o que estiver dentro do
 * `.tsx` não tem como ser coberto. Mesmo desenho de `app/silenciados.ts` e
 * `modules/conversas/abas.ts`.
 */

export type Saude = 'ok' | 'atencao' | 'ruim' | 'neutro'

export interface CartaoDeDiagnostico {
  chave: 'conexao' | 'sincronia' | 'impressao' | 'fila'
  rotulo: string
  saude: Saude
  /** O estado, em uma ou duas palavras. */
  estado: string
  /** O que fazer, ou o que está acontecendo. Sempre presente. */
  frase: string
  icone: NomeDoIcone
}

/** Tudo o que a página lê. Um objeto só, para o texto da cópia usar o mesmo. */
export interface SinaisDoDiagnostico {
  conexao: EstadoDaConexao
  sincronia: EstadoDeSincronia
  agente: SaudeDoAgente['estado']
  agentePendentes: number
  agenteFalhas: number
  filaPendentes: number
  /** `false` quando o IndexedDB não abriu — ver `cartaoDaFila`. */
  filaDisponivel: boolean
}

function cartaoDaConexao(estado: EstadoDaConexao): CartaoDeDiagnostico {
  const base = { chave: 'conexao' as const, rotulo: 'Conexão' }

  switch (estado) {
    case 'ao-vivo':
      return {
        ...base,
        saude: 'ok',
        estado: 'Ao vivo',
        frase: 'Os pedidos chegam sozinhos, sem precisar atualizar.',
        icone: 'wifi',
      }
    case 'degradado':
      return {
        ...base,
        saude: 'atencao',
        estado: 'Modo degradado',
        frase:
          'O tempo real caiu e o Hub está buscando os pedidos a cada 10 segundos. Dá para trabalhar, mas confira a internet da loja.',
        icone: 'wifi',
      }
    case 'desconectado':
      return {
        ...base,
        saude: 'ruim',
        estado: 'Sem conexão',
        frase:
          'Nada novo está chegando. Confira a internet da loja — o Hub volta sozinho assim que ela voltar.',
        icone: 'wifi-cortado',
      }
    default:
      return {
        ...base,
        saude: 'neutro',
        estado: 'Conectando',
        frase: 'Abrindo a ligação com o servidor.',
        icone: 'wifi',
      }
  }
}

/**
 * Sincronia é cartão próprio, e não um detalhe da conexão.
 *
 * São perguntas diferentes: conexão é "o cano está aberto?", sincronia é "estou
 * em dia com o que passou por ele?". É comum a conexão estar viva e a sincronia
 * se recuperando — e o cabeçalho do Hub, nesse caso, continua dizendo "Ao vivo",
 * porque ele só olha a primeira.
 *
 * Este estado é **calculado desde sempre e nunca foi mostrado em lugar nenhum**.
 */
function cartaoDaSincronia(estado: EstadoDeSincronia): CartaoDeDiagnostico {
  const base = { chave: 'sincronia' as const, rotulo: 'Sincronia', icone: 'atualizar' as const }

  switch (estado) {
    case 'sincronizado':
      return {
        ...base,
        saude: 'ok',
        estado: 'Em dia',
        frase: 'Nenhum evento se perdeu no caminho.',
      }
    case 'recuperando':
      return {
        ...base,
        saude: 'atencao',
        estado: 'Recuperando',
        frase:
          'O Hub percebeu que perdeu eventos e está buscando o intervalo. Costuma resolver em segundos, sozinho.',
      }
    case 'recarga-necessaria':
      return {
        ...base,
        saude: 'ruim',
        estado: 'Precisa recarregar',
        frase:
          'O intervalo perdido é grande demais para ser buscado. Recarregue a página para o quadro voltar a ficar confiável.',
      }
    default:
      return {
        ...base,
        saude: 'neutro',
        estado: 'Iniciando',
        frase: 'Ainda não houve evento para acompanhar.',
      }
  }
}

function cartaoDaImpressao(
  estado: SaudeDoAgente['estado'],
  pendentes: number,
  falhas: number
): CartaoDeDiagnostico {
  const base = { chave: 'impressao' as const, rotulo: 'Impressão', icone: 'impressora' as const }

  if (estado === 'nao_configurado') {
    return {
      ...base,
      saude: 'neutro',
      estado: 'Sem agente',
      frase:
        'Este dispositivo não tem agente local. A comanda abre o diálogo do navegador e alguém precisa confirmar a cada pedido.',
    }
  }

  if (estado === 'verificando') {
    return { ...base, saude: 'neutro', estado: 'Verificando', frase: 'Perguntando ao agente.' }
  }

  if (estado === 'ausente') {
    return {
      ...base,
      saude: 'ruim',
      estado: 'Sem resposta',
      frase:
        'O agente está configurado e não respondeu. Confira se o serviço está rodando no computador da loja.',
    }
  }

  // Ativo, mas com trabalho preso: pendentes e falhas são somados numa insígnia
  // só no cabeçalho. Aqui eles aparecem separados, porque pedem coisas
  // diferentes — pendente costuma resolver sozinho, falha não.
  if (falhas > 0 || pendentes > 0) {
    return {
      ...base,
      saude: 'atencao',
      estado: 'Com pendência',
      frase: fraseDaFilaDoAgente(pendentes, falhas),
    }
  }

  return { ...base, saude: 'ok', estado: 'Ativo', frase: 'A comanda sai sem diálogo.' }
}

function fraseDaFilaDoAgente(pendentes: number, falhas: number): string {
  const partes: string[] = []
  if (pendentes > 0) partes.push(`${pendentes} ${pendentes === 1 ? 'comanda' : 'comandas'} na fila`)
  if (falhas > 0) partes.push(`${falhas} ${falhas === 1 ? 'falha' : 'falhas'}`)

  return `${partes.join(' e ')} no agente. Se não drenar sozinho, confira a impressora.`
}

/**
 * A fila offline.
 *
 * **`disponivel: false` é o caso que ninguém vê hoje.** Quando o IndexedDB não
 * abre — modo privado, armazenamento cheio, política do navegador —, o modo
 * offline simplesmente não existe: as ações feitas sem rede se perdem em vez de
 * ficarem guardadas. Nada no Hub avisa isso, e é justamente o tipo de coisa que
 * só se descobre depois de ter perdido um pedido.
 */
function cartaoDaFila(pendentes: number, disponivel: boolean): CartaoDeDiagnostico {
  const base = { chave: 'fila' as const, rotulo: 'Fila offline', icone: 'lista' as const }

  if (!disponivel) {
    return {
      ...base,
      saude: 'ruim',
      estado: 'Indisponível',
      frase:
        'Este navegador não deixou abrir o armazenamento local. Sem ele, ações feitas sem internet se perdem em vez de ficarem guardadas.',
    }
  }

  if (pendentes > 0) {
    return {
      ...base,
      saude: 'atencao',
      estado: `${pendentes} ${pendentes === 1 ? 'pendente' : 'pendentes'}`,
      frase: 'Ações feitas sem internet, esperando para serem enviadas.',
    }
  }

  return { ...base, saude: 'ok', estado: 'Vazia', frase: 'Nada esperando para ser enviado.' }
}

export function cartoesDeDiagnostico(sinais: SinaisDoDiagnostico): CartaoDeDiagnostico[] {
  return [
    cartaoDaConexao(sinais.conexao),
    cartaoDaSincronia(sinais.sincronia),
    cartaoDaImpressao(sinais.agente, sinais.agentePendentes, sinais.agenteFalhas),
    cartaoDaFila(sinais.filaPendentes, sinais.filaDisponivel),
  ]
}

/** O pior estado entre os cartões — o resumo de uma palavra do topo. */
export function saudeGeral(cartoes: readonly CartaoDeDiagnostico[]): Saude {
  if (cartoes.some((c) => c.saude === 'ruim')) return 'ruim'
  if (cartoes.some((c) => c.saude === 'atencao')) return 'atencao'
  if (cartoes.every((c) => c.saude === 'ok')) return 'ok'
  return 'neutro'
}

/**
 * O desvio do relógio, em texto.
 *
 * **Abaixo de dois segundos não vale reportar.** O cálculo já embute meia
 * viagem de rede, então centenas de milissegundos são ruído da própria medição
 * — mostrar "+180 ms" convidaria alguém a investigar uma diferença que não
 * existe.
 */
export function textoDoDesvio(desvioMs: number): string {
  const segundos = desvioMs / 1000
  if (Math.abs(segundos) < 2) return 'Sincronizado com o servidor'

  const sinal = segundos > 0 ? 'atrasado' : 'adiantado'
  const valor = Math.abs(segundos)
  const medida =
    valor >= 60
      ? `${Math.round(valor / 60)} min`
      : `${valor.toFixed(valor < 10 ? 1 : 0).replace('.', ',')} s`

  return `Relógio deste dispositivo ${sinal} ${medida}`
}

export interface DadosDaCopia {
  sinais: SinaisDoDiagnostico
  desvioMs: number
  cursores: ReadonlyMap<number, number>
  nomesDasLojas: ReadonlyMap<number, string>
  apiBaseUrl: string
  socketUrl: string
  larguraDoPapel: number
  impressaoAutomatica: string
  temAgente: boolean
  usuario: string | null
  alcance: string
  navegador: string
  agora: Date
}

/**
 * O bloco de texto do "Copiar diagnóstico".
 *
 * É o que transforma esta página de "números para alguém soletrar no telefone"
 * numa ação: uma tecla, e o chamado já vai com tudo.
 *
 * Texto puro e não JSON: quem lê do outro lado costuma ser gente, e um objeto
 * colado num aplicativo de mensagem vira uma parede ilegível.
 */
export function textoDoDiagnostico(dados: DadosDaCopia): string {
  const cartoes = cartoesDeDiagnostico(dados.sinais)

  const linhas: string[] = [
    'DIAGNÓSTICO DO GESTOR DE PEDIDOS',
    dados.agora.toLocaleString('pt-BR'),
    '',
  ]

  for (const cartao of cartoes) {
    linhas.push(`${cartao.rotulo}: ${cartao.estado} — ${cartao.frase}`)
  }

  linhas.push('', 'DETALHES')
  linhas.push(`Relógio: ${textoDoDesvio(dados.desvioMs)}`)

  if (dados.cursores.size > 0) {
    const cursores = [...dados.cursores]
      .map(([id, c]) => `${dados.nomesDasLojas.get(id) ?? `Unidade ${id}`} #${c}`)
      .join(', ')
    linhas.push(`Cursores (do último carregamento): ${cursores}`)
  }

  linhas.push(`API: ${dados.apiBaseUrl}`)
  linhas.push(`Socket: ${dados.socketUrl}/ops`)
  linhas.push(`Bobina: ${dados.larguraDoPapel} mm`)
  linhas.push(`Impressão automática: ${dados.impressaoAutomatica}`)
  linhas.push(`Agente local: ${dados.temAgente ? 'configurado' : 'não configurado'}`)
  linhas.push(`Usuário: ${dados.usuario ?? '—'} (${dados.alcance})`)
  linhas.push(`Navegador: ${dados.navegador}`)

  return linhas.join('\n')
}
