import type { ReactNode } from 'react'
import { Icone } from '@matsuya/ui'
import { useFonteDaEntrada } from './fonteDaEntrada'

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
  useFonteDaEntrada()

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

        <div className="entrada__pilha">
          <CartaoDeAmostra />
          <CartaoDeTurno />
        </div>

        <p className="entrada__rodape">
          O quadro que a loja opera: pedidos ao vivo, entregas e comandas no
          mesmo lugar, com prazo que cobra sozinho.
        </p>
      </aside>
    </div>
  )
}

/**
 * Os itens da amostra.
 *
 * Produtos e fotos que existem no catálogo de verdade — as mesmas URLs que o
 * seeder grava em `products.image_url`. Não são imagens escolhidas para a tela
 * de login: são o cardápio da casa, e é isso que faz o cartão parecer um pedido
 * e não uma maquete.
 *
 * `w=200` porque a miniatura tem 44px: pedir a versão de 600 para exibir em 44
 * seria baixar catorze vezes mais pixel do que a tela usa, na primeira coisa
 * que a loja abre.
 */
const ITENS = [
  {
    qtd: 1,
    nome: 'Combinado Matsuya (20 peças)',
    foto: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200&auto=format&fit=crop',
  },
  {
    qtd: 2,
    nome: 'Temaki Salmão',
    foto: 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=200&auto=format&fit=crop',
  },
  {
    qtd: 1,
    nome: 'Guioza (6 un)',
    foto: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=200&auto=format&fit=crop',
  },
]

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
        {ITENS.map((item) => (
          <li key={item.nome}>
            {/*
              A miniatura tem um fundo tingido por baixo, e é ele que aparece se
              a foto não carregar. Esta é a primeira imagem de rede do Hub
              inteiro, na tela que abre quando a internet da loja está pior —
              um quadrado de ícone quebrado seria a primeira impressão do
              produto.

              Dimensões declaradas para o espaço já existir antes de a foto
              chegar: sem isso a lista pula quando as três carregam.
            */}
            <img
              className="amostra__foto"
              src={item.foto}
              alt=""
              width={44}
              height={44}
              decoding="async"
              referrerPolicy="no-referrer"
            />
            <span className="amostra__qtd num">{item.qtd}×</span>
            <span className="amostra__nome">{item.nome}</span>
          </li>
        ))}
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

/**
 * O segundo cartão: o resumo do turno.
 *
 * Diagonal ao primeiro e passando por baixo dele, com uma sobreposição
 * pequena. A profundidade é o que faz os dois lerem como uma pilha de coisas
 * reais em cima de uma mesa, e não como dois retângulos alinhados.
 *
 * Traz números, e não outro pedido, de propósito: dois cartões iguais só
 * dobrariam a mesma informação. O primeiro mostra **o que a loja faz** — um
 * pedido concreto, com fotos; este mostra **como ela está indo** — que é a
 * outra metade do que o Hub entrega, e a que justifica abri-lo de manhã.
 */
function CartaoDeTurno() {
  return (
    <div className="turno">
      <p className="turno__titulo">Hoje até agora</p>

      <div className="turno__numeros">
        <span>
          <strong className="num">38</strong>
          pedidos
        </span>
        <span>
          <strong className="num">4min</strong>
          aceite médio
        </span>
      </div>

      <div className="turno__barra" aria-hidden="true">
        <span className="turno__fatia turno__fatia--pronto" style={{ width: '62%' }} />
        <span className="turno__fatia turno__fatia--preparo" style={{ width: '28%' }} />
        <span className="turno__fatia turno__fatia--atraso" style={{ width: '10%' }} />
      </div>

      {/* Cada par ponto+rótulo é um grupo próprio: soltos, o navegador quebrava
          a linha entre o ponto e a palavra dele. */}
      <p className="turno__legenda">
        <span className="turno__item">
          <i className="turno__ponto turno__ponto--pronto" />
          entregues
        </span>
        <span className="turno__item">
          <i className="turno__ponto turno__ponto--preparo" />
          preparo
        </span>
        <span className="turno__item">
          <i className="turno__ponto turno__ponto--atraso" />
          atrasados
        </span>
      </p>
    </div>
  )
}
