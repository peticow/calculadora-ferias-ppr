import { useRef, type KeyboardEvent } from 'react';
import guilhoche from './guilloche.svg?raw';
import { BotaoTema } from './Estrutura';

/**
 * A chapa: bloco de tinta calcográfica com a roseta de guilhoché gravada,
 * o título e as abas penduradas na borda de baixo.
 *
 * O guilhoché não é ornamento genérico — é o desenho que impressoras de
 * segurança usam em papel-moeda e cheque, gerado aqui pela mesma curva
 * (hipotrocoide). O assunto do app é dinheiro; a textura vem daí.
 */

interface CabecalhoProps<T extends string> {
  abas: ReadonlyArray<{ id: T; texto: string }>;
  ativa: T;
  onTrocar: (id: T) => void;
  tema: 'claro' | 'escuro';
  onTema: () => void;
}

export default function Cabecalho<T extends string>({
  abas,
  ativa,
  onTrocar,
  tema,
  onTema,
}: CabecalhoProps<T>) {
  const tiras = useRef<Array<HTMLButtonElement | null>>([]);

  /*
   * Só a aba ativa fica no caminho do Tab (tabIndex 0); as outras saem dele e
   * são alcançadas pelas setas. É o padrão do WAI-ARIA para tablist, e sem o
   * tratamento de teclado abaixo o tabIndex -1 deixaria a segunda aba
   * inalcançável para quem não usa mouse.
   */
  const navegar = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = abas.findIndex((a) => a.id === ativa);
    let destino = -1;
    if (e.key === 'ArrowRight') destino = (i + 1) % abas.length;
    else if (e.key === 'ArrowLeft') destino = (i - 1 + abas.length) % abas.length;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = abas.length - 1;
    if (destino < 0) return;

    e.preventDefault();
    onTrocar(abas[destino]!.id);
    tiras.current[destino]?.focus();
  };

  return (
    <header className="relative overflow-hidden rounded-t-[4px] bg-bloco shadow-chapa">
      {/*
        A roseta sangra pela direita e pelo topo de propósito: cortada, lê
        como impressão contínua; inteira e centralizada, lia como logotipo.

        A máscara radial não é enfeite — resolve um defeito da curva. O
        hipotrocoide deixa um disco vazio de raio |(R−r)−d| no meio, e a
        densidade se acumula na borda desse vazio: aparecia um buraco escuro
        com um anel brilhante em volta, que puxava o olho para longe do
        título. A máscara apaga miolo e anel e deixa só a renda externa.
      */}
      {/*
        Duas camadas de propósito. A de fora centraliza com `translate`; a de
        dentro anima. Numa só, o `transform` do keyframe `gravar` sobrescreve
        o `-translate-x-1/2 -translate-y-1/2` do Tailwind — as duas coisas
        disputam a MESMA propriedade — e a roseta escorrega para o canto
        inferior direito, com o canto dela pousado no centro do cabeçalho.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2
          -translate-y-1/2 sm:h-[54rem] sm:w-[54rem]"
      >
        <div
          className="h-full w-full animate-gravar text-bloco-latao opacity-[0.42] [animation-delay:120ms]
            [mask-image:radial-gradient(closest-side,transparent_30%,#000_52%,#000_86%,transparent_100%)]
            [-webkit-mask-image:radial-gradient(closest-side,transparent_30%,#000_52%,#000_86%,transparent_100%)]"
          dangerouslySetInnerHTML={{ __html: guilhoche }}
        />
      </div>
      {/*
        Véu que apaga a roseta sob o texto, senão o título perde contraste.
        Radial, e não da esquerda para a direita: com o título centralizado a
        proteção precisa ser no meio, onde o texto está.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0
          bg-[radial-gradient(58%_78%_at_50%_46%,rgb(var(--bloco))_0%,rgb(var(--bloco)/0.92)_46%,rgb(var(--bloco)/0.35)_80%,transparent_100%)]"
      />

      <div className="relative px-5 pb-8 pt-11 text-center sm:px-9 sm:pb-11 sm:pt-16">
        <h1 className="didone animate-subir text-display font-medium text-bloco-texto">
          <span className="block">Férias</span>
          <span className="block">
            {/* O e-comercial itálico é a forma clássica do caractere. */}
            <span className="italic">&amp;</span> PPR
          </span>
        </h1>

        {/* origin-center: o filete abre do meio para os lados, não da esquerda. */}
        <div
          aria-hidden="true"
          className="mx-auto mt-6 h-px w-28 origin-center animate-filete bg-bloco-latao
            [animation-delay:420ms] sm:mt-7 sm:w-36"
        />

        <p className="mx-auto mt-5 max-w-leitura animate-subir text-[0.9375rem] leading-relaxed text-bloco-3 [animation-delay:260ms]">
          Simulação com as tabelas vigentes de INSS, IRRF e PLR. Tudo roda no seu navegador —
          nenhum dado é armazenado nem enviado para lugar nenhum.
        </p>
      </div>

      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <BotaoTema tema={tema} onClick={onTema} />
      </div>

      {/*
        Abas na borda de baixo: a ativa vira papel e se emenda ao painel.

        A faixa sob as abas e mais escura que a chapa: a aba ativa sobe dela
        para a cor do painel e ganha uma aresta de latao no topo. Assim a ativa
        e a mais clara das duas nos DOIS temas — so a cor de fundo nao bastava,
        porque no tema escuro o painel e escuro.
      */}
      <div
        role="tablist"
        aria-label="Cálculos"
        onKeyDown={navegar}
        className="relative flex gap-1 bg-bloco-2 px-3 pt-1.5 sm:px-5"
      >
        {abas.map((a, i) => {
          const selecionada = ativa === a.id;
          return (
            <button
              key={a.id}
              ref={(el) => {
                tiras.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`aba-${a.id}`}
              aria-selected={selecionada}
              aria-controls={`painel-${a.id}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => onTrocar(a.id)}
              className={`flex-1 rounded-t-[3px] px-4 pb-3 pt-2.5 text-sm font-semibold
                transition-colors duration-200 focus-visible:outline-offset-[-3px] ${
                  selecionada
                    ? 'border-t-2 border-bloco-latao bg-painel pt-2 text-tinta'
                    : 'border-t-2 border-transparent text-bloco-3 hover:text-bloco-texto'
                }`}
            >
              {a.texto}
            </button>
          );
        })}
      </div>
    </header>
  );
}
