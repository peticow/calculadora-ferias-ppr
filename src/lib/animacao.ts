import { useEffect, useRef, useState } from 'react';

/** Respeita a preferência do sistema por menos movimento. */
export function preferemenosMovimento(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Saída exponencial: corre no começo e assenta no fim, como um mostrador
// mecânico parando. Linear parece robótico num número de dinheiro.
const suavizar = (t: number) => 1 - Math.pow(2, -10 * t);

/**
 * Devolve `alvo` percorrido por animação quando ele muda.
 *
 * Só o valor em destaque usa isto — o total a receber. Animar cada linha do
 * demonstrativo deixaria a tela inteira tremendo a cada tecla digitada.
 *
 * Quem pede menos movimento, ou quem chega com o primeiro valor, recebe o
 * número direto: a contagem existe para mostrar que algo *mudou*, e na
 * primeira pintura não mudou nada.
 */
export function useContagem(alvo: number, duracao = 520): number {
  const [valor, setValor] = useState(alvo);
  const anterior = useRef(alvo);
  const quadro = useRef<number>();

  useEffect(() => {
    const de = anterior.current;
    anterior.current = alvo;

    if (de === alvo) return;
    if (preferemenosMovimento()) {
      setValor(alvo);
      return;
    }

    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min((agora - inicio) / duracao, 1);
      setValor(de + (alvo - de) * suavizar(t));
      if (t < 1) quadro.current = requestAnimationFrame(passo);
      else setValor(alvo);
    };
    quadro.current = requestAnimationFrame(passo);

    return () => {
      if (quadro.current !== undefined) cancelAnimationFrame(quadro.current);
    };
  }, [alvo, duracao]);

  return valor;
}
