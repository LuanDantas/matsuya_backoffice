import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  build: {
    // O Hub roda num tablet de balcão que abre uma vez por turno e fica ligado.
    // O orçamento existe para que ninguém acrescente uma biblioteca de gráficos
    // aqui sem perceber — o quadro não desenha gráfico nenhum.
    chunkSizeWarningLimit: 400,
  },
})
