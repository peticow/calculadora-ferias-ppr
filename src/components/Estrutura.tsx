import { useId, useState, type ReactNode } from 'react';
import { brl } from '../calc/ferias';
import { useContagem } from '../lib/animacao';

interface AccordionProps {
  titulo: string;
  children: ReactNode;
  /** Fechado por padrão, conforme a especificação da tela. */
  abertoInicial?: boolean;
}

export function Accordion({ titulo, children, abertoInicial = false }: AccordionProps) {
  const [aberto, setAberto] = useState(abertoInicial);
  const id = useId();
  return (
    <div className="rounded-[3px] border border-filete bg-recuo/60">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left text-sm
          font-semibold text-latao transition-colors duration-200 hover:text-tinta"
      >
        <span>{titulo}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition-transform duration-300 ${aberto ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <div id={id} hidden={!aberto} className="space-y-4 border-t border-filete px-3.5 py-4">
        {children}
      </div>
    </div>
  );
}

/**
 * Uma caixa: bloco fechado com título próprio.
 *
 * O app era um bloco contínuo e ficava difícil achar onde uma coisa termina e
 * a outra começa. Cada assunto agora mora numa caixa recuada no papel, com o
 * filete duplo do título fazendo a separação de dentro.
 */
export function Caixa({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children: ReactNode;
  /** Canto superior direito — o botão Limpar, por exemplo. */
  acao?: ReactNode;
}) {
  return (
    <section className="rounded-[3px] border border-filete bg-recuo/40 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-4">
        <h2 className="shrink-0 text-[1.0625rem] font-semibold tracking-[-0.01em] text-tinta">
          {titulo}
        </h2>
        <span aria-hidden="true" className="filete-duplo grow" />
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Título solto, sem caixa: separa dois grupos de caixas. */
export function TituloEntreCaixas({
  titulo,
  children,
}: {
  titulo: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-1 pt-1">
      <div className="flex items-center gap-4">
        <h2 className="shrink-0 text-[1.0625rem] font-semibold tracking-[-0.01em] text-tinta">
          {titulo}
        </h2>
        <span aria-hidden="true" className="filete-duplo grow" />
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export interface LinhaResultado {
  rotulo: string;
  valor: number;
  /** Texto curto ao lado do valor (ex.: "Isento"). */
  selo?: string;
  nota?: string;
  destaque?: boolean;
  negativo?: boolean;
  /** Fecha um bloco ("Receitas totais", "Descontos totais"): vem em negrito. */
  subtotal?: boolean;
}

/**
 * O valor em destaque — o único número animado do app.
 *
 * Componente próprio porque `useContagem` é um hook e não pode ser chamado
 * dentro do .map() das linhas.
 */
function ValorDestaque({ valor }: { valor: number }) {
  const animado = useContagem(valor);
  return (
    <span className="didone text-[1.875rem] font-medium leading-none text-bloco-latao sm:text-[2.375rem]">
      {brl(animado)}
    </span>
  );
}

/**
 * O demonstrativo: Bruto, INSS, Imposto de Renda e Líquido.
 * Zerados aparecem como R$ 0,00 — nunca em branco.
 *
 * Estrutura de extrato gravado: linhas separadas por filete fino, filete
 * duplo fechando cada bloco (receitas, descontos) e o total numa tarja de
 * tinta. O filete duplo não é enfeite — é a convenção de documento contábil
 * para "aqui somou".
 */
export function PainelResultado({ linhas }: { linhas: LinhaResultado[] }) {
  return (
    <dl className="overflow-hidden rounded-[3px] border border-filete bg-campo">
      {linhas.map((l, i) => {
        if (l.destaque) {
          return (
            <div
              key={l.rotulo}
              className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t-[3px]
                border-double border-latao-linha/70 bg-destaque px-4 py-4"
            >
              <dt className="text-sm font-semibold text-bloco-texto">
                {l.rotulo}
                {l.nota ? (
                  <span className="mt-0.5 block text-dica font-normal text-bloco-3">{l.nota}</span>
                ) : null}
              </dt>
              <dd className="valor">
                <ValorDestaque valor={l.valor} />
              </dd>
            </div>
          );
        }

        return (
          <div
            key={l.rotulo}
            className={`flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 px-4 py-2.5
              ${i === 0 ? '' : l.subtotal ? 'filete-duplo mt-1' : 'border-t border-filete'}
              ${l.subtotal ? 'pt-3' : ''}`}
          >
            <dt
              className={`text-sm ${
                l.subtotal ? 'font-semibold text-tinta' : 'font-medium text-tinta-2'
              }`}
            >
              {l.rotulo}
              {l.nota ? (
                <span className="mt-0.5 block max-w-leitura text-dica font-normal text-tinta-3">
                  {l.nota}
                </span>
              ) : null}
            </dt>
            <dd className="valor flex items-baseline gap-2">
              {l.selo ? <span className="selo bg-ok-fundo text-ok-texto">{l.selo}</span> : null}
              <span
                className={`text-[0.9375rem] ${
                  l.subtotal ? 'font-bold text-tinta' : 'font-semibold'
                } ${l.negativo ? 'text-tinta-2' : 'text-tinta'}`}
              >
                {l.negativo && l.valor > 0 ? '− ' : ''}
                {brl(l.valor)}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Faixa de avisos. Renderiza o array `resultado.avisos` inteiro, sem filtrar.
 * `alerta` marca os que precisam de destaque (vigência vencida, salário fora
 * do mínimo).
 */
export function Avisos({
  avisos,
  ehAlerta,
}: {
  avisos: string[];
  ehAlerta?: (aviso: string) => boolean;
}) {
  if (avisos.length === 0) return null;
  return (
    <ul className="space-y-2">
      {avisos.map((a, i) => {
        const alerta = ehAlerta?.(a) ?? false;
        return (
          <li
            key={i}
            className={`flex gap-2.5 rounded-[3px] border-l-2 py-2.5 pl-3 pr-3.5 text-dica ${
              alerta
                ? 'border-alerta-borda bg-alerta-fundo/60 text-alerta-texto'
                : 'border-filete bg-recuo/50 text-tinta-2'
            }`}
          >
            {/*
              Marcas desenhadas, e não os emoji ⚠️/ℹ️ que estavam aqui: emoji
              muda de desenho em cada sistema e traz cor própria, que brigava
              com a paleta.
            */}
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
              className="mt-px h-4 w-4 shrink-0 opacity-80"
            >
              {alerta ? (
                <>
                  <path d="M8 1.8 15 14.2H1z" strokeLinejoin="round" />
                  <path d="M8 6.4v3.2" strokeLinecap="round" />
                  <circle cx="8" cy="11.7" r=".7" fill="currentColor" stroke="none" />
                </>
              ) : (
                <>
                  <circle cx="8" cy="8" r="6.4" />
                  <path d="M8 7.4v3.9" strokeLinecap="round" />
                  <circle cx="8" cy="5.1" r=".7" fill="currentColor" stroke="none" />
                </>
              )}
            </svg>
            <span className="max-w-leitura leading-relaxed">{a}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Rateio do líquido do período (§8 do documento de regras): o adiantamento do
 * 13º sai inteiro, e o que sobra se divide em 2/3 de salário e 1/3 do terço
 * constitucional.
 *
 * A recomendação de guardar o salário não é financeira nem arbitrária: as
 * férias adiantam a remuneração do mês, então na volta o mês seguinte vem sem
 * ela — o dinheiro das contas já foi recebido.
 */
export function PainelRateio({
  parte13,
  guardar,
  gastar,
}: {
  parte13: number;
  guardar: number;
  gastar: number;
}) {
  // Ordem e nomes da planilha original: salário primeiro, porque é o único que
  // não se gasta. O conselho vem COLADO no rótulo, e não como selo na ponta
  // direita: ler "Salário — guardar para as contas" numa linha só dispensa
  // cruzar a tabela com os olhos para saber do que se trata.
  const linhas = [
    {
      rotulo: 'Salário',
      valor: guardar,
      conselho: 'Guardar para pagar as contas na volta',
      gastar: false,
    },
    { rotulo: 'Adiantamento 13º', valor: parte13, conselho: 'Pode gastar', gastar: true },
    { rotulo: '1/3 proporcional', valor: gastar, conselho: 'Pode gastar', gastar: true },
  ];
  return (
    <dl className="overflow-hidden rounded-[3px] border border-filete bg-recuo/45">
      {linhas.map((l, i) => {
        const vazia = l.valor <= 0;
        return (
          <div
            key={l.rotulo}
            className={`flex flex-wrap items-baseline justify-between gap-x-5 gap-y-0.5 px-4 py-2.5
              ${i === 0 ? '' : 'border-t border-filete'}`}
          >
            <dt className="min-w-0">
              <span
                className={`text-sm font-medium ${vazia ? 'text-tinta-3' : 'text-tinta-2'}`}
              >
                {l.rotulo}
              </span>
              {vazia ? null : (
                <span
                  className={`ml-2 text-dica font-semibold ${
                    l.gastar ? 'text-ok-texto' : 'text-alerta-texto'
                  }`}
                >
                  {l.conselho}
                </span>
              )}
            </dt>
            <dd className="valor">
              <span
                className={`text-[0.9375rem] font-semibold ${vazia ? 'text-tinta-3' : 'text-tinta'}`}
              >
                {vazia ? '—' : brl(l.valor)}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function BotaoTema({ tema, onClick }: { tema: 'claro' | 'escuro'; onClick: () => void }) {
  const indoParaEscuro = tema === 'claro';
  return (
    <button
      type="button"
      onClick={onClick}
      title={indoParaEscuro ? 'Mudar para o modo escuro' : 'Mudar para o modo claro'}
      aria-label={indoParaEscuro ? 'Mudar para o modo escuro' : 'Mudar para o modo claro'}
      /*
       * Fundo proprio: o botao fica sobre a parte densa do guilhoche e sem
       * uma base solida o icone se perde no meio das linhas.
       */
      className="rounded-[3px] border border-bloco-3/30 bg-bloco/80 p-2 text-bloco-3
        backdrop-blur-[2px] transition-colors duration-200
        hover:border-bloco-latao/60 hover:text-bloco-latao"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-[1.125rem] w-[1.125rem]">
        {indoParaEscuro ? (
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        ) : (
          <path
            fillRule="evenodd"
            d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm4.95 2.05a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zm-2.05 4.95a.75.75 0 01-1.06 0l-1.06-1.06a.75.75 0 111.06-1.06l1.06 1.06a.75.75 0 010 1.06zM10 16a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 16zm-4.95-1.05a.75.75 0 010-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0zM4 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 014 10zm2.11-3.89a.75.75 0 01-1.06 0L3.99 5.05A.75.75 0 015.05 3.99L6.11 5.05a.75.75 0 010 1.06zM10 6a4 4 0 100 8 4 4 0 000-8z"
            clipRule="evenodd"
          />
        )}
      </svg>
    </button>
  );
}

export function BotaoLimpar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[3px] border border-filete bg-campo px-5 py-2 text-sm font-semibold
        text-tinta-2 transition-colors duration-200
        hover:border-latao-linha/70 hover:text-tinta"
    >
      Limpar
    </button>
  );
}
