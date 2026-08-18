import { describe, expect, it } from 'vitest'
import {
  cartoesDeDiagnostico,
  saudeGeral,
  textoDoDesvio,
  textoDoDiagnostico,
  type SinaisDoDiagnostico,
} from './sinais'

const TUDO_BEM: SinaisDoDiagnostico = {
  conexao: 'ao-vivo',
  sincronia: 'sincronizado',
  agente: 'ativo',
  agentePendentes: 0,
  agenteFalhas: 0,
  filaPendentes: 0,
  filaDisponivel: true,
}

const de = (over: Partial<SinaisDoDiagnostico> = {}) => ({ ...TUDO_BEM, ...over })
const cartao = (sinais: SinaisDoDiagnostico, chave: string) =>
  cartoesDeDiagnostico(sinais).find((c) => c.chave === chave)!

describe('cartoesDeDiagnostico', () => {
  it('devolve sempre os quatro, na mesma ordem', () => {
    // Cartão que some quando está tudo bem faria a página mudar de forma a cada
    // abertura, e quem procura um estado teria de descobrir se ele sumiu ou se
    // está bem.
    expect(cartoesDeDiagnostico(TUDO_BEM).map((c) => c.chave)).toEqual([
      'conexao',
      'sincronia',
      'impressao',
      'fila',
    ])
  })

  it('todo cartão tem uma frase, sempre', () => {
    // A frase é o que diz o que fazer. Um cartão que mostra só o nome do estado
    // transfere o problema para quem menos pode resolvê-lo.
    for (const sinais of [
      TUDO_BEM,
      de({ conexao: 'desconectado', sincronia: 'recarga-necessaria' }),
      de({ agente: 'ausente', filaDisponivel: false }),
      de({ conexao: 'conectando', sincronia: 'inicial', agente: 'verificando' }),
    ]) {
      for (const c of cartoesDeDiagnostico(sinais)) {
        expect(c.frase.length).toBeGreaterThan(10)
        expect(c.estado.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('conexão e sincronia são cartões separados', () => {
  it('conexão viva com sincronia se recuperando', () => {
    /*
     * O caso que motiva os dois cartões: o cabeçalho do Hub olha só a conexão,
     * então ele diz "Ao vivo" enquanto o quadro pode estar recuperando eventos
     * perdidos. São perguntas diferentes — "o cano está aberto?" e "estou em dia
     * com o que passou por ele?".
     */
    const sinais = de({ conexao: 'ao-vivo', sincronia: 'recuperando' })
    expect(cartao(sinais, 'conexao').saude).toBe('ok')
    expect(cartao(sinais, 'sincronia').saude).toBe('atencao')
  })

  it('recarga necessária é o pior estado da sincronia', () => {
    expect(cartao(de({ sincronia: 'recarga-necessaria' }), 'sincronia').saude).toBe('ruim')
  })

  it('degradado é atenção, não falha — dá para trabalhar', () => {
    expect(cartao(de({ conexao: 'degradado' }), 'conexao').saude).toBe('atencao')
  })
})

describe('impressão', () => {
  it('sem agente é neutro, e não erro', () => {
    // Não ter agente é uma escolha de instalação, não um defeito: a comanda sai
    // pelo diálogo do navegador. Pintar de vermelho ensinaria a ignorar.
    expect(cartao(de({ agente: 'nao_configurado' }), 'impressao').saude).toBe('neutro')
  })

  it('configurado e sem responder é falha', () => {
    expect(cartao(de({ agente: 'ausente' }), 'impressao').saude).toBe('ruim')
  })

  it('separa pendentes de falhas na frase', () => {
    // No cabeçalho os dois são somados numa insígnia só; aqui eles pedem coisas
    // diferentes — pendente costuma drenar sozinho, falha não.
    const c = cartao(de({ agentePendentes: 2, agenteFalhas: 1 }), 'impressao')
    expect(c.saude).toBe('atencao')
    expect(c.frase).toContain('2 comandas')
    expect(c.frase).toContain('1 falha')
  })

  it('concorda em número', () => {
    expect(cartao(de({ agentePendentes: 1 }), 'impressao').frase).toContain('1 comanda na fila')
    expect(cartao(de({ agenteFalhas: 3 }), 'impressao').frase).toContain('3 falhas')
  })
})

describe('fila offline', () => {
  it('armazenamento indisponível é falha, mesmo com a fila vazia', () => {
    /*
     * O caso que ninguém vê hoje: sem IndexedDB o modo offline não existe, e as
     * ações feitas sem rede se PERDEM em vez de ficarem guardadas. Fila vazia
     * ali não é boa notícia — é a ausência do mecanismo.
     */
    const c = cartao(de({ filaDisponivel: false, filaPendentes: 0 }), 'fila')
    expect(c.saude).toBe('ruim')
    expect(c.frase).toContain('se perdem')
  })

  it('pendente é atenção', () => {
    expect(cartao(de({ filaPendentes: 3 }), 'fila').saude).toBe('atencao')
  })
})

describe('saudeGeral', () => {
  it('o pior manda', () => {
    expect(saudeGeral(cartoesDeDiagnostico(TUDO_BEM))).toBe('ok')
    expect(saudeGeral(cartoesDeDiagnostico(de({ filaPendentes: 1 })))).toBe('atencao')
    expect(
      saudeGeral(cartoesDeDiagnostico(de({ filaPendentes: 1, conexao: 'desconectado' })))
    ).toBe('ruim')
  })

  it('não diz que está tudo bem quando algo é apenas neutro', () => {
    // "Sem agente" não é bom nem ruim; anunciar "tudo certo" com ele na tela
    // seria afirmar mais do que se sabe.
    expect(saudeGeral(cartoesDeDiagnostico(de({ agente: 'nao_configurado' })))).toBe('neutro')
  })
})

describe('textoDoDesvio', () => {
  it('cala abaixo de dois segundos', () => {
    // O cálculo embute meia viagem de rede: centenas de milissegundos são ruído
    // da própria medição, e mostrá-los convidaria a investigar o que não existe.
    expect(textoDoDesvio(0)).toBe('Sincronizado com o servidor')
    expect(textoDoDesvio(1200)).toBe('Sincronizado com o servidor')
    expect(textoDoDesvio(-1900)).toBe('Sincronizado com o servidor')
  })

  it('diz o lado do desvio', () => {
    expect(textoDoDesvio(5000)).toContain('atrasado')
    expect(textoDoDesvio(-5000)).toContain('adiantado')
  })

  it('vira minutos quando é grande', () => {
    expect(textoDoDesvio(180_000)).toContain('3 min')
  })

  it('usa vírgula decimal', () => {
    expect(textoDoDesvio(3500)).toContain('3,5 s')
  })
})

describe('textoDoDiagnostico', () => {
  const dados = {
    sinais: de({ conexao: 'degradado' as const }),
    desvioMs: 4200,
    cursores: new Map([[2, 18432]]),
    nomesDasLojas: new Map([[2, 'Santana']]),
    apiBaseUrl: 'https://api.exemplo/api/v1',
    socketUrl: 'https://api.exemplo',
    larguraDoPapel: 80,
    impressaoAutomatica: 'agente',
    temAgente: true,
    usuario: 'ana@matsuya',
    alcance: 'Rede',
    navegador: 'Chrome/140',
    agora: new Date('2026-08-18T15:00:00'),
  }

  it('traz os quatro estados e os detalhes', () => {
    const texto = textoDoDiagnostico(dados)

    expect(texto).toContain('Conexão: Modo degradado')
    expect(texto).toContain('Sincronia: Em dia')
    expect(texto).toContain('Impressão:')
    expect(texto).toContain('Fila offline:')
    expect(texto).toContain('Santana #18432')
    expect(texto).toContain('https://api.exemplo/api/v1')
    expect(texto).toContain('/ops')
    expect(texto).toContain('ana@matsuya')
    expect(texto).toContain('Chrome/140')
  })

  it('diz que o cursor é do último carregamento', () => {
    // Ele NÃO se move com os eventos — só quando a loja recarrega inteira.
    // Colar um número parado num chamado sem essa ressalva levaria quem lê a
    // concluir que a sincronia travou.
    expect(textoDoDiagnostico(dados)).toContain('último carregamento')
  })

  it('omite a linha de cursores quando não há nenhum', () => {
    const texto = textoDoDiagnostico({ ...dados, cursores: new Map() })
    expect(texto).not.toContain('Cursores')
  })

  it('não quebra sem usuário', () => {
    expect(() => textoDoDiagnostico({ ...dados, usuario: null })).not.toThrow()
  })

  it('cabe numa mensagem', () => {
    // O texto existe para ser colado num chamado. Passando de umas poucas
    // dezenas de linhas, ninguém cola — resume ou manda print.
    expect(textoDoDiagnostico(dados).split('\n').length).toBeLessThan(25)
  })
})
