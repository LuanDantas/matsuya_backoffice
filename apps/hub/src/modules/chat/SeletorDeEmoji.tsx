import { useEffect, useRef } from 'react'
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react'

/**
 * O seletor de emoji.
 *
 * ## Carregado sob demanda, e é o que o torna viável
 *
 * A biblioteca tem ~290 kB minificados — mais da metade do chunk principal do
 * Hub, que já passa do teto de 400 kB. **Quem faz o `React.lazy` é o `Chat`,
 * sobre este arquivo inteiro**, e não este arquivo sobre a biblioteca.
 *
 * A diferença não é estilo: `EmojiStyle` e `Theme` são enums, ou seja, valores
 * em tempo de execução. Importá-los aqui em cima com um `lazy` lá embaixo
 * arrastaria o pacote todo para o chunk principal e o `lazy` não serviria de
 * nada — foi exatamente o que aconteceu na primeira tentativa, e custou 313 kB
 * sem nenhum aviso do compilador. Com a fronteira neste módulo, componente e
 * biblioteca saem juntos num arquivo só, buscado no primeiro clique e nunca por
 * quem só responde texto.
 *
 * ## `native`, e não a arte da Apple
 *
 * O padrão da biblioteca é `EmojiStyle.APPLE`, que **baixa cada emoji como
 * imagem do `cdn.jsdelivr.net`**. Numa retaguarda de restaurante isso é
 * dependência de rede para digitar — e este Hub tem fila offline justamente
 * porque a internet da loja cai.
 *
 * `native` desenha com a fonte do sistema: sem rede, sem CDN, e — o que mais
 * importa — é **o mesmo glifo que o destinatário vai ver**. O corpo da mensagem
 * é texto puro; escolher um emoji com a arte da Apple e mandar um caractere
 * que no Android aparece diferente seria mostrar ao operador algo que não é o
 * que ele enviou.
 *
 * ## Tema claro, fixo
 *
 * Era `AUTO`, que lê o `prefers-color-scheme` do sistema operacional — e abria
 * escuro para quem usa o computador em modo escuro, dentro de um Hub que roda
 * em claro. O painel ficava sendo a única coisa preta na tela. Fixo em `LIGHT`
 * ele acompanha o aplicativo; quando o tema escuro do Hub for ligado de fato,
 * isto passa a ler o tema **do Hub**, não o do sistema.
 */

export default function SeletorDeEmoji({
  aoEscolher,
  aoFechar,
}: {
  aoEscolher: (emoji: string) => void
  aoFechar: () => void
}) {
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      // Não deixa o Esc subir e fechar o drawer inteiro por baixo: quem apertou
      // queria fechar o seletor que acabou de abrir.
      evento.stopPropagation()
      aoFechar()
    }

    const aoClicarFora = (evento: MouseEvent) => {
      if (!painel.current?.contains(evento.target as Node)) aoFechar()
    }

    document.addEventListener('keydown', aoTeclar)
    // `mousedown` e não `click`: o `click` do próprio botão que abre chegaria
    // depois e fecharia o seletor no mesmo gesto que o abriu.
    document.addEventListener('mousedown', aoClicarFora)

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.removeEventListener('mousedown', aoClicarFora)
    }
  }, [aoFechar])

  return (
    <div className="emoji" ref={painel} role="dialog" aria-label="Escolher emoji">
      <EmojiPicker
        onEmojiClick={(dados: EmojiClickData) => aoEscolher(dados.emoji)}
        emojiStyle={EmojiStyle.NATIVE}
        theme={Theme.LIGHT}
        width={320}
        height={380}
        lazyLoadEmojis
        searchPlaceholder="Buscar emoji"
        previewConfig={{ showPreview: false }}
        skinTonesDisabled
      />
    </div>
  )
}
