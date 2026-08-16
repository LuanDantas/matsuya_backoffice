import { useEffect, useState } from 'react'
import { Botao, Faixa } from '@matsuya/ui'
import { useSessao } from '../dados/useSessao'
import { Casca } from './Casca'
import { Entrada } from '../modules/sessao/Entrada'
import { EscolhaDeUnidade } from '../modules/sessao/EscolhaDeUnidade'

/**
 * Raiz do Order Hub.
 *
 * Só decide qual das quatro situações está valendo: verificando sessão, sem
 * sessão, sem unidade escolhida, ou trabalhando. Tudo o que acontece dentro da
 * quarta mora na `Casca` — este arquivo já foi o componente que sabia tudo, e
 * passou de quinhentas linhas antes de alguém notar.
 */

/**
 * Redesenha uma vez por segundo, só para os cronômetros andarem.
 *
 * Fica na raiz porque `agora` desce para todas as telas: o quadro, a home e a
 * lista de entregas contam o mesmo tempo, e dois relógios independentes na
 * mesma tela mostram segundos diferentes lado a lado.
 */
function useTique(): number {
  const [agora, definirAgora] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => definirAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  return agora
}

export function App() {
  const sessao = useSessao()
  const agora = useTique()

  if (sessao.estado === 'verificando') {
    return (
      <main className="carregando">
        <span className="carregando__giro" aria-hidden="true" />
        <p role="status">Verificando seu acesso…</p>
      </main>
    )
  }

  if (sessao.estado === 'anonima' || !sessao.identidade) {
    return <Entrada aoEntrar={sessao.entrar} erro={sessao.erro} />
  }

  if (sessao.estado === 'falha') {
    return (
      <main className="carregando">
        <Faixa tom="perigo" icone="alerta">
          {sessao.erro ?? 'Não foi possível carregar seu acesso.'}
        </Faixa>
        <Botao enfase="secundaria" icone="atualizar" onClick={() => window.location.reload()}>
          Tentar de novo
        </Botao>
      </main>
    )
  }

  if (sessao.unidadesAtuais.length === 0) {
    return (
      <EscolhaDeUnidade
        identidade={sessao.identidade}
        aoEscolher={(id) => sessao.escolherUnidades([id])}
        aoSair={sessao.sair}
      />
    )
  }

  return <Casca sessao={sessao} agora={agora} />
}
