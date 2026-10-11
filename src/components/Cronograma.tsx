import { brl, type Periodo } from '../calc/ferias';
import { cronogramaDeFerias, type PagamentoPrevisto } from '../calc/mensal';
import { useParametros } from '../hooks/useCalculo';
import { Accordion } from './Estrutura';

/**
 * "Como ficam meus pagamentos na época das férias?"
 *
 * Responde a pergunta que o recibo não responde: sair de férias muda o
 * adiantamento do dia 15 e o fechamento do mês, e é aí que o planejamento
 * quebra. O dinheiro das férias cai ANTES de você sair e precisa cobrir um
 * mês que vem muito menor.
 *
 * As regras estão em src/calc/mensal.ts, conferidas contra os contracheques
 * reais de 2026.
 */

function Linha({ p, primeiro }: { p: PagamentoPrevisto; primeiro: boolean }) {
  return (
    <li className={`px-3.5 py-3 ${primeiro ? '' : 'border-t border-filete'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-tinta">{p.rotulo}</span>
          <span className="ml-2 text-dica text-tinta-3">{p.quando}</span>
        </div>
        <span
          className={`valor shrink-0 text-[0.9375rem] font-semibold ${
            p.tipo === 'recibo' ? 'text-latao' : 'text-tinta'
          }`}
        >
          {brl(p.valor)}
        </span>
      </div>
      {p.nota ? <p className="mt-1 max-w-leitura text-dica text-tinta-3">{p.nota}</p> : null}
    </li>
  );
}

export default function Cronograma({
  periodo,
  inicio,
  salario,
}: {
  periodo: Periodo;
  /** "aaaa-mm-dd" da saída. Vazio enquanto a pessoa não escolheu a data. */
  inicio: string;
  salario: number;
}) {
  const p = useParametros();

  return (
    <Accordion titulo="Como ficam meus pagamentos na época das férias?">
      {!inicio ? (
        <p className="max-w-leitura text-dica text-tinta-2">
          Preencha a data de início deste período, lá em cima, para ver o cronograma. Sem a data
          não dá para saber em que meses os dias de férias caem — e é isso que muda o adiantamento
          do dia 15 e o fechamento do mês.
        </p>
      ) : (
        <>
          <p className="max-w-leitura text-dica leading-relaxed text-tinta-2">
            O dinheiro das férias cai <strong className="font-semibold">antes</strong> de você sair,
            no fechamento do mês anterior. Depois disso o mês das férias vem menor: você trabalha
            menos dias, e 40% deles já saíram no adiantamento do dia 15.
          </p>

          <ol className="mt-3 overflow-hidden rounded-[3px] border border-filete bg-campo">
            {cronogramaDeFerias(
              {
                salario,
                inicio,
                dias: periodo.dias,
                feriasMaisUmTerco: periodo.ferias + periodo.umTerco,
                inssDoRecibo: periodo.inss,
                irrfDoRecibo: periodo.irrf,
                liquidoDoRecibo: periodo.liquido,
              },
              p,
            ).map((pg, i) => (
              <Linha key={`${pg.tipo}-${pg.quando}`} p={pg} primeiro={i === 0} />
            ))}
          </ol>

          <p className="mt-2.5 max-w-leitura text-dica text-tinta-3">
            Valores aproximados, para planejamento. Não entram a coparticipação do plano de saúde
            nem o vale alimentação — variam com o seu uso e não dá para prever. No histórico de
            2026 elas somaram entre R$ 24 e R$ 157 por mês, sempre para menos.
          </p>
        </>
      )}
    </Accordion>
  );
}
