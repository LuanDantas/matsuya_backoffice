import { useMemo, useRef, useState } from 'react'
import { Botao, Icone } from '@matsuya/ui'
import type { Identidade } from '@matsuya/api-client'
import { config } from '../../app/config'
import {
  cartoesDeDiagnostico,
  textoDoDesvio,
  textoDoDiagnostico,
  type SinaisDoDiagnostico,
} from './sinais'

/**
 * Diagnóstico do dispositivo.
 *
 * ## Para quem
 *
 * Para a loja resolver sozinha ou pedir ajuda com precisão — daí os cartões
 * trazerem **o que fazer**, e não só o nome do estado, e daí o botão que copia
 * tudo pronto para colar num chamado. Os números crus ficam recolhidos: quem
 * abriu procurando outra coisa não precisa atravessá-los.
 *
 * ## Nada aqui é editável
 *
 * É leitura. Toda ação que existiria a partir daqui — recarregar, verificar o
 * agente, reenviar a fila — já mora onde ela é feita, e duplicá-la criaria dois
 * lugares para a mesma coisa dar errado.
 */

const ICONE_DA_SAUDE = {
  ok: 'check',
  atencao: 'alerta',
  ruim: 'alerta',
  neutro: 'relogio',
} as const

export function Diagnostico({
  sinais,
  desvioMs,
  cursores,
  nomesDasUnidades,
  identidade,
}: {
  sinais: SinaisDoDiagnostico
  /**
   * Diferença entre o relógio do servidor e o deste dispositivo.
   *
   * Medida a cada batida do heartbeat e **nunca aplicada** — ver a ressalva
   * escrita na tela, logo abaixo.
   */
  desvioMs: number
  cursores: ReadonlyMap<number, number>
  nomesDasUnidades: ReadonlyMap<number, string>
  identidade: Identidade | null
}) {
  const [copiado, definirCopiado] = useState(false)
  const campo = useRef<HTMLTextAreaElement>(null)

  const cartoes = useMemo(() => cartoesDeDiagnostico(sinais), [sinais])

  const alcance = identidade?.scope.network
    ? 'Rede'
    : `${identidade?.units.length ?? 0} loja(s)`

  const texto = () =>
    textoDoDiagnostico({
      sinais,
      desvioMs,
      cursores,
      nomesDasLojas: nomesDasUnidades,
      apiBaseUrl: config.apiBaseUrl,
      socketUrl: config.socketUrl,
      larguraDoPapel: config.larguraDoPapel ?? 80,
      impressaoAutomatica: config.impressaoAutomatica ?? 'agente',
      temAgente: Boolean(config.urlDoAgenteDeImpressao),
      usuario: identidade?.user.email ?? null,
      alcance,
      navegador: typeof navigator === 'undefined' ? '—' : navigator.userAgent,
      agora: new Date(),
    })

  /**
   * Copia, ou mostra o texto para copiar à mão.
   *
   * Mesmo cuidado do token do agente: a área de transferência exige contexto
   * seguro e pode ser negada. Um botão que não faz nada e não explica seria
   * pior do que não ter botão.
   */
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto())
      definirCopiado(true)
    } catch {
      const el = campo.current
      if (!el) return
      el.value = texto()
      el.hidden = false
      el.select()
      definirCopiado(false)
    }
  }

  return (
    <>
      <section className="ajustes__secao">
        <div className="diag__cabecalho">
          <h3 className="ajustes__rotulo">Estado deste dispositivo</h3>
          <Botao
            enfase={copiado ? 'sucesso' : 'secundaria'}
            icone={copiado ? 'check' : 'lista'}
            onClick={() => void copiar()}
          >
            {copiado ? 'Copiado' : 'Copiar diagnóstico'}
          </Botao>
        </div>

        {/* Só aparece quando a área de transferência foi negada. */}
        <textarea
          className="diag__texto"
          ref={campo}
          hidden
          readOnly
          rows={6}
          aria-label="Diagnóstico para copiar"
        />

        <ul className="diag__cartoes">
          {cartoes.map((cartao) => (
            <li className="diag__cartao" key={cartao.chave} data-saude={cartao.saude}>
              <span className="diag__topo">
                <span className="diag__marca" aria-hidden="true">
                  <Icone nome={ICONE_DA_SAUDE[cartao.saude]} tamanho={14} />
                </span>
                <span className="diag__rotulo">{cartao.rotulo}</span>
              </span>

              {/*
                Estado e frase são irmãos, e a frase nunca falta: uma tela que diz
                "degradado" e para aí transfere o problema para quem menos pode
                resolvê-lo.
              */}
              <strong className="diag__estado">{cartao.estado}</strong>
              <span className="diag__frase">{cartao.frase}</span>
            </li>
          ))}
        </ul>
      </section>

      {/*
        `details` nativo: teclado e leitor de tela de graça, sem estado em React
        e sem nenhuma linha de JavaScript para abrir e fechar.
      */}
      <details className="ajustes__detalhes">
        <summary>Detalhes técnicos</summary>

        <dl className="diag__lista">
          <div>
            <dt>Relógio</dt>
            <dd>
              {textoDoDesvio(desvioMs)}
              {/*
                A ressalva importa: o desvio é medido a cada batida e **não é
                aplicado** em lugar nenhum — os prazos dos cartões contam pelo
                relógio local. Sem dizer isso, a linha prometeria uma correção
                que não acontece.
              */}
              <span className="diag__nota">
                Medido a cada 15 s. Os prazos dos pedidos contam pelo relógio
                deste dispositivo, sem essa correção.
              </span>
            </dd>
          </div>

          {cursores.size > 0 && (
            <div>
              <dt>Cursor do diário</dt>
              <dd>
                {[...cursores].map(([id, cursor]) => (
                  <span className="diag__cursor" key={id}>
                    {nomesDasUnidades.get(id) ?? `Unidade ${id}`}
                    <span className="num">#{cursor}</span>
                  </span>
                ))}
                {/*
                  Ele só se move quando a loja é recarregada inteira — não com os
                  eventos. Sem esta ressalva, um número parado leva à conclusão
                  errada de que a sincronia travou. Quem responde isso de verdade
                  é o cartão de Sincronia acima.
                */}
                <span className="diag__nota">
                  Instantâneo do último carregamento. Para saber se o Hub está em
                  dia, olhe o cartão Sincronia.
                </span>
              </dd>
            </div>
          )}

          <div>
            <dt>Servidor</dt>
            <dd className="num">
              {config.apiBaseUrl}
              <span className="diag__nota num">{config.socketUrl}/ops</span>
            </dd>
          </div>

          <div>
            <dt>Impressão neste dispositivo</dt>
            <dd>
              Bobina de {config.larguraDoPapel ?? 80} mm · automática:{' '}
              {config.impressaoAutomatica ?? 'agente'}
              <span className="diag__nota">
                {config.urlDoAgenteDeImpressao
                  ? `Agente em ${config.urlDoAgenteDeImpressao}`
                  : 'Sem agente local configurado.'}
              </span>
            </dd>
          </div>

          <div>
            <dt>Sessão</dt>
            <dd>
              {identidade?.user.email ?? '—'} · {alcance}
              {identidade?.roles && identidade.roles.length > 0 && (
                <span className="diag__nota">
                  {identidade.roles
                    .map((p) =>
                      p.expiresAt
                        ? `${p.name} (até ${new Date(p.expiresAt).toLocaleDateString('pt-BR')})`
                        : p.name
                    )
                    .join(' · ')}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </details>
    </>
  )
}
