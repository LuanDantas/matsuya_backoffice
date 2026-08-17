import { useCallback, useEffect, useState } from 'react'
import { Botao, CampoLinha, EstadoVazio, Modal, PainelDeSecao, Selo } from '@matsuya/ui'
import type { DispositivoDeImpressao, DispositivoRegistrado } from '@matsuya/api-client'
import { decorrido } from '../../app/formato'

/**
 * Os agentes de impressão registrados nesta loja.
 *
 * ## Por que esta tela existe
 *
 * Até ela, registrar um agente exigia `curl`. Instalar impressão numa loja
 * dependia de alguém com acesso a terminal e ao token de autenticação da API —
 * o que na prática significa que a instalação não acontecia sem um
 * desenvolvedor junto, e o portão da fase é operar duas lojas piloto.
 *
 * ## O token aparece uma vez
 *
 * E a tela precisa deixar isso brutalmente claro **antes** de a pessoa fechar
 * o diálogo. Não há recuperação: quem perder registra outro e revoga este. Um
 * aviso discreto aqui vira um chamado de suporte depois, com alguém já na loja
 * com a instalação pela metade.
 */
export function Dispositivos({
  api,
  unityId,
}: {
  api: {
    dispositivos: (unityId: number, signal?: AbortSignal) => Promise<DispositivoDeImpressao[]>
    registrar: (unityId: number, nome: string) => Promise<DispositivoRegistrado>
    revogar: (unityId: number, deviceId: string) => Promise<{ revogado: boolean }>
  }
  unityId: number
}) {
  const [lista, definirLista] = useState<DispositivoDeImpressao[] | null>(null)
  const [erro, definirErro] = useState<string | null>(null)
  const [nome, definirNome] = useState('')
  const [registrando, definirRegistrando] = useState(false)
  const [recemCriado, definirRecemCriado] = useState<DispositivoRegistrado | null>(null)

  const carregar = useCallback(
    async (signal?: AbortSignal) => {
      try {
        definirLista(await api.dispositivos(unityId, signal))
        definirErro(null)
      } catch (falha) {
        if (signal?.aborted) return
        definirErro(falha instanceof Error ? falha.message : 'Não consegui carregar.')
      }
    },
    [api, unityId]
  )

  useEffect(() => {
    const controle = new AbortController()
    void carregar(controle.signal)
    return () => controle.abort()
  }, [carregar])

  const registrar = async () => {
    if (nome.trim().length < 2) return

    definirRegistrando(true)
    try {
      definirRecemCriado(await api.registrar(unityId, nome.trim()))
      definirNome('')
      await carregar()
    } catch (falha) {
      definirErro(falha instanceof Error ? falha.message : 'Não consegui registrar.')
    } finally {
      definirRegistrando(false)
    }
  }

  const revogar = async (dispositivo: DispositivoDeImpressao) => {
    // Revogar derruba a impressão daquela loja até alguém reinstalar. Confirmar
    // não é burocracia: é a diferença entre um clique errado e uma cozinha sem
    // comanda no sábado à noite.
    const confirmado = window.confirm(
      `Revogar "${dispositivo.nome}"? O agente para de imprimir até ser registrado de novo.`
    )
    if (!confirmado) return

    try {
      await api.revogar(unityId, dispositivo.id)
      await carregar()
    } catch (falha) {
      definirErro(falha instanceof Error ? falha.message : 'Não consegui revogar.')
    }
  }

  return (
    <PainelDeSecao titulo="Agentes de impressão">
      {erro && (
        <p className="ajustes__nota" role="alert">
          {erro}
        </p>
      )}

      {lista !== null && lista.length === 0 && (
        <EstadoVazio
          titulo="Nenhum agente registrado"
          descricao="Sem agente, a comanda abre o diálogo do navegador e alguém precisa confirmar a cada pedido."
        />
      )}

      {lista?.map((d) => (
        <div className="ajustes__linha" key={d.id}>
          <div>
            <strong>{d.nome}</strong>
            <p>
              {d.online
                ? 'Comunicando com o servidor.'
                : d.lastSeenAt
                  ? `Sem sinal há ${decorrido(d.lastSeenAt, Date.now())}.`
                  : 'Nunca se comunicou. Confira se o agente está rodando na loja.'}
            </p>
            {d.impressoras.length > 0 && (
              <ul className="ajustes__impressoras">
                {d.impressoras.map((i) => (
                  <li key={i.nome}>
                    <Selo tom={i.online ? 'sucesso' : 'perigo'}>
                      {i.online ? 'ok' : 'sem resposta'}
                    </Selo>
                    {i.nome} <span className="ajustes__papel">({i.papel})</span>
                  </li>
                ))}
              </ul>
            )}
            {/* Sem exibir o token: o prefixo basta para identificar na lista. */}
            <p className="ajustes__nota">Token {d.tokenPrefix}…</p>
          </div>
          <div className="ajustes__acoes">
            <Selo tom={d.online ? 'sucesso' : 'perigo'}>{d.online ? 'Online' : 'Offline'}</Selo>
            <Botao enfase="secundaria" onClick={() => void revogar(d)}>
              Revogar
            </Botao>
          </div>
        </div>
      ))}

      <div className="ajustes__registro">
        <CampoLinha
          id="nome-do-dispositivo"
          rotulo="Registrar novo agente"
          ajuda="Um nome que diga onde ele está: “PC do balcão”, “Caixinha da cozinha”."
          value={nome}
          maxLength={60}
          onChange={(e) => definirNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void registrar()}
        />
        <Botao
          enfase="primaria"
          onClick={() => void registrar()}
          disabled={registrando || nome.trim().length < 2}
        >
          {registrando ? 'Registrando…' : 'Registrar'}
        </Botao>
      </div>

      <Modal
        aberto={recemCriado !== null}
        titulo="Token do agente"
        descricao="Copie agora. Ele não será exibido de novo."
        aoFechar={() => definirRecemCriado(null)}
        rodape={
          <Botao enfase="primaria" onClick={() => definirRecemCriado(null)}>
            Já copiei
          </Botao>
        }
      >
        <p>
          Cole no <code>agente.config.json</code> da loja, no campo{' '}
          <code>servidor.token</code>.
        </p>
        {/* `readOnly` e não `disabled`: campo desabilitado não deixa selecionar
            o texto, e copiar é a única coisa que se faz aqui. */}
        <textarea
          className="ajustes__token"
          readOnly
          rows={3}
          value={recemCriado?.token ?? ''}
          onFocus={(e) => e.currentTarget.select()}
        />
        <p className="ajustes__nota">
          Se perder, registre outro agente e revogue este. Não há como recuperá-lo.
        </p>
      </Modal>
    </PainelDeSecao>
  )
}
