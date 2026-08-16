import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createApiClient,
  criarApiDeIdentidade,
  FalhaDaApi,
  type Identidade,
} from '@matsuya/api-client'
import { config } from '../app/config'

/**
 * Sessão do Hub.
 *
 * O token continua vindo de um campo porque a API ainda não tem fluxo de login
 * próprio — mas tudo o mais agora vem de `/auth/me`: nome, permissões, escopo e
 * as unidades que a pessoa pode abrir.
 *
 * A diferença prática é grande. Antes o Hub assumia permissões amplas e deixava
 * a API recusar, o que produz o pior tipo de interface: aquela em que o botão
 * existe, o operador aperta, e recebe um erro que não tinha como prever.
 */

const CHAVE_TOKEN = 'matsuya.hub.token'
const CHAVE_UNIDADES = 'matsuya.hub.unidades'

export type EstadoDaSessao = 'verificando' | 'anonima' | 'ativa' | 'falha'

export interface Sessao {
  estado: EstadoDaSessao
  identidade: Identidade | null
  permissoes: ReadonlySet<string>
  /**
   * Lojas que o quadro está acompanhando.
   *
   * Vazio significa "ainda não escolheu" — a tela de escolha aparece. Depois de
   * escolher, nunca volta a ficar vazio: um quadro sem loja não é um estado
   * útil, é uma tela em branco que o operador não sabe desfazer.
   */
  unidadesAtuais: number[]
  erro: string | null
  token: string | null
  entrar: (token: string) => void
  sair: () => void
  escolherUnidades: (unityIds: number[]) => void
  pode: (permissao: string) => boolean
}

export function useSessao(): Sessao {
  const [token, definirToken] = useState<string | null>(
    () => localStorage.getItem(CHAVE_TOKEN)
  )
  const [estado, definirEstado] = useState<EstadoDaSessao>(
    () => (localStorage.getItem(CHAVE_TOKEN) ? 'verificando' : 'anonima')
  )
  const [identidade, definirIdentidade] = useState<Identidade | null>(null)
  const [unidadesAtuais, definirUnidadesAtuais] = useState<number[]>(() => {
    try {
      const guardadas = JSON.parse(localStorage.getItem(CHAVE_UNIDADES) ?? '[]')
      return Array.isArray(guardadas) ? guardadas.filter((n) => Number.isInteger(n)) : []
    } catch {
      return []
    }
  })
  const [erro, definirErro] = useState<string | null>(null)

  const tokenRef = useRef(token)
  tokenRef.current = token

  const api = useMemo(() => {
    const cliente = createApiClient({
      baseUrl: config.apiBaseUrl,
      obterToken: () => tokenRef.current,
    })
    return criarApiDeIdentidade(cliente)
  }, [])

  useEffect(() => {
    if (!token) {
      definirIdentidade(null)
      definirEstado('anonima')
      return
    }

    const controle = new AbortController()
    definirEstado('verificando')
    definirErro(null)

    api
      .eu(controle.signal)
      .then((eu) => {
        definirIdentidade(eu)
        definirEstado('ativa')

        // Unidade guardada que saiu do escopo — porque o acesso foi revogado,
        // ou porque o tablet trocou de dono — não pode continuar selecionada.
        // Sem esta checagem, o quadro abriria vazio e sem explicação.
        const permitidas = eu.units.map((u) => u.id)
        definirUnidadesAtuais((atuais) => {
          const validas = atuais.filter((id) => permitidas.includes(id))
          if (validas.length > 0) return validas
          // Com uma loja só não há escolha a fazer: abrir um seletor de um item
          // é pedir um toque que não decide nada.
          return permitidas.length === 1 ? [permitidas[0]!] : []
        })
      })
      .catch((falha) => {
        if (controle.signal.aborted) return

        if (falha instanceof FalhaDaApi && falha.status === 401) {
          // Token vencido ou revogado: limpa em vez de deixar o operador
          // batendo numa parede em toda ação.
          localStorage.removeItem(CHAVE_TOKEN)
          definirToken(null)
          definirEstado('anonima')
          definirErro('Sua sessão expirou. Entre novamente.')
          return
        }

        definirEstado('falha')
        definirErro(
          falha instanceof FalhaDaApi
            ? falha.message
            : 'Não foi possível falar com o servidor.'
        )
      })

    return () => controle.abort()
  }, [api, token])

  useEffect(() => {
    if (unidadesAtuais.length === 0) localStorage.removeItem(CHAVE_UNIDADES)
    else localStorage.setItem(CHAVE_UNIDADES, JSON.stringify(unidadesAtuais))
  }, [unidadesAtuais])

  const permissoes = useMemo(
    () => new Set(identidade?.permissions ?? []),
    [identidade]
  )

  const entrar = useCallback((novoToken: string) => {
    localStorage.setItem(CHAVE_TOKEN, novoToken)
    definirToken(novoToken)
  }, [])

  const sair = useCallback(() => {
    localStorage.removeItem(CHAVE_TOKEN)
    localStorage.removeItem(CHAVE_UNIDADES)
    definirToken(null)
    definirUnidadesAtuais([])
    definirIdentidade(null)
    definirErro(null)
  }, [])

  const pode = useCallback((permissao: string) => permissoes.has(permissao), [permissoes])

  return {
    estado,
    identidade,
    permissoes,
    unidadesAtuais,
    erro,
    token,
    entrar,
    sair,
    escolherUnidades: definirUnidadesAtuais,
    pode,
  }
}
