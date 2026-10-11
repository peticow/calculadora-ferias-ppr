/**
 * tema.ts — Claro / escuro.
 *
 * Sem escolha salva, segue o sistema operacional e continua seguindo: quem
 * troca o tema do celular à noite vê o app acompanhar. O clique no botão fixa
 * a preferência e encerra esse acompanhamento.
 *
 * A chave do localStorage é lida também pelo script inline do index.html, que
 * roda antes da primeira pintura para não piscar branco. Se mudar o nome aqui,
 * mude lá — o valor está duplicado de propósito, porque aquele script não pode
 * depender do bundle.
 */

import { useEffect, useState } from 'react';

export const CHAVE_TEMA = 'ferias-ppr:tema';

export type Tema = 'claro' | 'escuro';

const CONSULTA_ESCURO = '(prefers-color-scheme: dark)';

/** localStorage falha em janela anônima e com cookies bloqueados. */
function lerSalvo(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === 'claro' || v === 'escuro' ? v : null;
  } catch {
    return null;
  }
}

function salvar(t: Tema): void {
  try {
    localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    // Preferência não persiste; o app continua funcionando.
  }
}

function preferenciaDoSistema(): Tema {
  return typeof matchMedia === 'function' && matchMedia(CONSULTA_ESCURO).matches
    ? 'escuro'
    : 'claro';
}

export function temaInicial(): Tema {
  return lerSalvo() ?? preferenciaDoSistema();
}

function aplicar(t: Tema): void {
  const raiz = document.documentElement;
  raiz.classList.toggle('dark', t === 'escuro');
  // Faz o navegador pintar barras de rolagem e campos nativos no tom certo.
  raiz.style.colorScheme = t === 'escuro' ? 'dark' : 'light';
}

export function useTema(): { tema: Tema; alternar: () => void } {
  const [tema, setTema] = useState<Tema>(temaInicial);
  const [fixado, setFixado] = useState<boolean>(() => lerSalvo() !== null);

  useEffect(() => {
    aplicar(tema);
  }, [tema]);

  // Enquanto o usuário não escolher, acompanha o sistema.
  useEffect(() => {
    if (fixado || typeof matchMedia !== 'function') return;
    const mq = matchMedia(CONSULTA_ESCURO);
    const ouvir = (e: MediaQueryListEvent) => setTema(e.matches ? 'escuro' : 'claro');
    mq.addEventListener('change', ouvir);
    return () => mq.removeEventListener('change', ouvir);
  }, [fixado]);

  return {
    tema,
    alternar: () => {
      setTema((t) => {
        const novo: Tema = t === 'escuro' ? 'claro' : 'escuro';
        salvar(novo);
        return novo;
      });
      setFixado(true);
    },
  };
}
