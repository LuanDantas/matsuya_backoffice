import type { ReactNode } from 'react'
import { Icone } from '@matsuya/ui'

/**
 * O layout das telas de autenticação — entrada e recuperação de senha.
 *
 * Formulário à esquerda, com a marca numa barra no topo; painel decorativo à
 * direita. O painel some abaixo de 1024px, e some inteiro em vez de encolher:
 * num tablet o que sobra de espaço pertence ao formulário, e uma faixa
 * decorativa espremida só empurra os campos para baixo da dobra.
 *
 * ## Por que uma amostra do produto, e não uma ilustração
 *
 * O painel mostra um cartão do quadro em miniatura — o mesmo objeto que a
 * pessoa vai olhar o dia inteiro depois de entrar. Ilustração genérica diria
 * "isto é um software"; o cartão diz **qual**. E como ele é montado com os
 * mesmos tokens do quadro de verdade, envelhece junto: mudou a cor do chip de
 * preparo, mudou aqui também.
 *
 * É uma amostra estática, e não o componente `Cartao` real, de propósito —
 * aquele precisa de pedido, cronômetro, permissões e ações. Arrastar tudo isso
 * para uma tela onde ninguém está autenticado seria pagar caro por uma imagem.
 */
export function LayoutDeEntrada({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo: string
  children: ReactNode
}) {
  return (
    <div className="entrada">
      <div className="entrada__coluna">
        <header className="entrada__barra">
          <span className="entrada__marca">
            <Icone nome="loja" tamanho={26} />
            <span>
              <strong>Order Hub</strong>
              <small>Matsuya</small>
            </span>
          </span>
        </header>

        <main className="entrada__area">
          <div className="entrada__conteudo">
            <div className="entrada__titulo">
              <h1>{titulo}</h1>
              <p>{subtitulo}</p>
            </div>

            {children}
          </div>
        </main>
      </div>

      <aside className="entrada__painel" aria-hidden="true">
        {/* Formas geométricas. Recortadas com clip-path e não desenhadas em SVG:
            é a mesma figura por muito menos, e nada aqui precisa escalar. */}
        <span className="entrada__forma entrada__forma--um" />
        <span className="entrada__forma entrada__forma--dois" />
        <span className="entrada__forma entrada__forma--tres" />
        <span className="entrada__forma entrada__forma--quatro" />

        <CartaoDeAmostra />

        <p className="entrada__rodape">
          O quadro que a loja opera: pedidos ao vivo, entregas e comandas no
          mesmo lugar, com prazo que cobra sozinho.
        </p>
      </aside>
    </div>
  )
}

/** Miniatura de um cartão do quadro, montada com os tokens do quadro real. */
function CartaoDeAmostra() {
  return (
    <div className="amostra">
      <div className="amostra__topo">
        <span className="amostra__codigo num">4597</span>
        <span className="amostra__chip">Preparar em até 12min</span>
      </div>

      <p className="amostra__cliente">Ana Carolina · Entrega</p>

      <ul className="amostra__itens">
        <li>
          <span className="num">2×</span> Temaki de salmão
        </li>
        <li>
          <span className="num">1×</span> Uramaki filadélfia
        </li>
        <li>
          <span className="num">1×</span> Missoshiru
        </li>
      </ul>

      <div className="amostra__rodape">
        <span className="amostra__entregador">
          <Icone nome="capacete" tamanho={16} />
          Rafael a caminho
        </span>
        <span className="amostra__acao">Pronto</span>
      </div>
    </div>
  )
}
