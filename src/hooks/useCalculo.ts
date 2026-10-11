import { useEffect, useRef, useState } from 'react';
import {
  carregarParametros,
  PARAMETROS_EMBUTIDOS,
  type Parametros,
} from '../calc/parametros';

/**
 * Executa um cálculo assíncrono a cada mudança das dependências.
 *
 * Os pontos de entrada (`calcularFerias` / `calcularPPR`) buscam os parâmetros
 * a cada simulação — remoto -> cache -> embutido, como manda a §2 do documento.
 * O contador de geração garante que uma resposta atrasada não sobrescreva o
 * resultado de uma digitação mais recente.
 *
 * `fn` nulo significa "faltam campos obrigatórios": o resultado vira null e a
 * UI mostra tudo zerado.
 */
export function useCalculo<T>(
  fn: (() => Promise<T>) | null,
  deps: unknown[],
): { resultado: T | null; erro: string | null } {
  const [estado, setEstado] = useState<{ resultado: T | null; erro: string | null }>({
    resultado: null,
    erro: null,
  });
  const geracao = useRef(0);

  useEffect(() => {
    const minha = ++geracao.current;
    if (!fn) {
      setEstado({ resultado: null, erro: null });
      return;
    }
    fn().then(
      (r) => {
        if (geracao.current === minha) setEstado({ resultado: r, erro: null });
      },
      (e: unknown) => {
        if (geracao.current === minha) {
          setEstado({ resultado: null, erro: e instanceof Error ? e.message : String(e) });
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return estado;
}

/**
 * Parâmetros vigentes, só para alimentar textos de ajuda da interface
 * (valor do desconto simplificado, dedução por dependente). O cálculo em si
 * nunca usa este hook — ele carrega os parâmetros por conta própria.
 */
export function useParametros(): Parametros {
  const [p, setP] = useState<Parametros>(PARAMETROS_EMBUTIDOS);
  useEffect(() => {
    let vivo = true;
    carregarParametros().then((c) => {
      if (vivo) setP(c.parametros);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return p;
}
