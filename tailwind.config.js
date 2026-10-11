/** @type {import('tailwindcss').Config} */

/*
 * As cores saem de variaveis CSS (src/index.css), nao de valores fixos aqui.
 * Motivo: o tema escuro vira UM bloco de variaveis em vez de um `dark:` em
 * cada elemento. A sintaxe `rgb(var(--x) / <alpha-value>)` preserva os
 * modificadores de opacidade do Tailwind (bg-tinta/10 continua funcionando).
 */
const cor = (nome) => `rgb(var(--${nome}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 'class' e nao 'media': o botao de tema precisa vencer a preferencia do SO.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Superficies: o papel de seguranca e o painel impresso sobre ele.
        papel: cor('papel'),
        painel: cor('painel'),
        recuo: cor('recuo'),
        campo: cor('campo'),

        // Tinta calcografica, em tres pesos.
        tinta: cor('tinta'),
        'tinta-2': cor('tinta-2'),
        'tinta-3': cor('tinta-3'),

        // Latao: so trabalho de linha e um acento. Nunca preenchimento.
        latao: cor('latao'),
        'latao-linha': cor('latao-linha'),
        filete: cor('filete'),

        // O bloco de tinta do cabecalho nao troca com o tema: e a chapa
        // impressa, igual nos dois modos. Por isso tokens proprios.
        bloco: cor('bloco'),
        'bloco-2': cor('bloco-2'),
        'bloco-texto': cor('bloco-texto'),
        'bloco-3': cor('bloco-3'),
        'bloco-latao': cor('bloco-latao'),
        destaque: cor('destaque'),

        ok: {
          fundo: cor('ok-fundo'),
          texto: cor('ok-texto'),
        },
        alerta: {
          fundo: cor('alerta-fundo'),
          texto: cor('alerta-texto'),
          borda: cor('alerta-borda'),
        },
      },
      fontFamily: {
        // Plex carrega todo o texto: tem algarismos tabulares de verdade,
        // necessarios para a coluna de valores fechar.
        sans: [
          'IBM Plex Sans Variable',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Bodoni so no titulo e no valor do total. Didone de alto contraste
        // quebra abaixo de ~28px, entao nao deve escapar desses dois lugares.
        titulo: ['Bodoni Moda Variable', 'Bodoni MT', 'Didot', 'Georgia', 'serif'],
      },
      fontSize: {
        // Escala de terca maior (1.25) a partir de 16px, com 13px para as
        // dicas — 12px nao passava no contraste minimo em texto longo.
        dica: ['0.8125rem', { lineHeight: '1.55' }],
        display: ['clamp(3.25rem, 13vw, 5.5rem)', { lineHeight: '0.88', letterSpacing: '-0.02em' }],
      },
      maxWidth: {
        // Menos de 80 caracteres por linha, como manda a medida classica.
        leitura: '62ch',
      },
      boxShadow: {
        // Uma sombra so no app inteiro, sob a chapa. O resto separa por
        // filete, nao por elevacao.
        chapa: '0 18px 40px -24px rgb(var(--sombra) / 0.55), 0 2px 6px -2px rgb(var(--sombra) / 0.25)',
      },
      keyframes: {
        gravar: {
          '0%': { opacity: '0', transform: 'scale(1.06) rotate(-6deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        subir: {
          '0%': { opacity: '0', transform: 'translateY(0.6em)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        filete: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        surgir: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        gravar: 'gravar 1400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        subir: 'subir 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
        filete: 'filete 800ms cubic-bezier(0.16, 1, 0.3, 1) both',
        surgir: 'surgir 220ms ease-out both',
      },
    },
  },
  plugins: [],
};
