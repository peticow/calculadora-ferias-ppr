import { brl } from '../calc/ferias';
import { calcularPPR, type ResultadoPPR } from '../calc/ppr';
import { useCalculo } from '../hooks/useCalculo';
import { digitosParaNumero, textoParaNumero } from '../lib/moeda';
import { MESES } from '../lib/opcoes';
import { Campo, CampoDecimal, CampoMoeda, Select } from './Campos';
import {
  Accordion,
  Avisos,
  BotaoLimpar,
  PainelResultado,
  Caixa,
  type LinhaResultado,
} from './Estrutura';

export interface EstadoPPR {
  salario: string;
  /** O salario espelha a aba de ferias ate o usuario editar este campo. */
  salarioEditado: boolean;
  target: string;
  meses: string;
  resultadoEmpresa: string;
  reducaoSancao: string;
}

export const ESTADO_PPR_INICIAL: EstadoPPR = {
  salario: '',
  salarioEditado: false,
  target: '',
  meses: '',
  resultadoEmpresa: '',
  reducaoSancao: '0',
};

/** O mesmo aviso que fechava a tela no rodapé, agora dentro da lista. */
const AVISO_SIMULACAO =
  'Simulação para auxílio no planejamento. Não conte com esses valores como reais ou ' +
  'definitivos. Os valores oficiais serão conhecidos somente na folha de pagamento.';

const ehAlerta = (a: string) => a.includes('venceram') || a.includes('só valem a partir');

const pct = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(v);

export default function AbaPPR({
  estado,
  setEstado,
  salarioDasFerias,
}: {
  estado: EstadoPPR;
  setEstado: (e: EstadoPPR) => void;
  /** Digitos do salario informado na aba de ferias, para pre-preencher. */
  salarioDasFerias: string;
}) {
  // Pre-preenche com o salario da aba 1 enquanto este campo nao for editado.
  const salarioDigitos = estado.salarioEditado ? estado.salario : salarioDasFerias;

  const salarioBase = digitosParaNumero(salarioDigitos);
  const target = textoParaNumero(estado.target);
  const meses = estado.meses ? Number(estado.meses) : undefined;
  const resultadoEmpresa = textoParaNumero(estado.resultadoEmpresa);
  const reducaoSancao = textoParaNumero(estado.reducaoSancao) ?? 0;

  const pronto =
    salarioBase !== undefined &&
    salarioBase > 0 &&
    target !== undefined &&
    target > 0 &&
    meses !== undefined &&
    resultadoEmpresa !== undefined &&
    reducaoSancao >= 0 &&
    reducaoSancao <= 100;

  const { resultado } = useCalculo<ResultadoPPR>(
    pronto
      ? () =>
          calcularPPR({
            salarioBase: salarioBase as number,
            target: target as number,
            mesesTrabalhados: meses as number,
            resultadoEmpresa: resultadoEmpresa as number,
            reducaoSancao,
          })
      : null,
    [salarioBase, target, meses, resultadoEmpresa, reducaoSancao, pronto],
  );

  const linhas: LinhaResultado[] = [
    { rotulo: 'Bruto', valor: resultado?.bruto ?? 0 },
    {
      rotulo: 'INSS',
      valor: 0,
      nota: 'Não incide INSS sobre PLR (Lei 10.101/2000, art. 3º).',
      negativo: true,
    },
    {
      rotulo: 'Imposto de Renda',
      valor: resultado?.irrf ?? 0,
      selo: resultado?.irrfDetalhe.isento ? 'Isento' : undefined,
      negativo: true,
    },
    { rotulo: 'Líquido a Receber', valor: resultado?.liquido ?? 0, destaque: true },
  ];

  const etapas = resultado
    ? [
        {
          rotulo: 'Salário × target',
          detalhe: `${brl(resultado.entrada.salarioBase)} × ${pct(resultado.entrada.target)}`,
          valor: resultado.etapas.salarioXTarget,
        },
        { rotulo: '÷ 12', detalhe: '12 meses', valor: resultado.etapas.divididoPor12 },
        {
          rotulo: '× meses trabalhados',
          detalhe: `${resultado.entrada.mesesTrabalhados} de 12`,
          valor: resultado.etapas.xMesesTrabalhados,
        },
        {
          rotulo: '× resultado da empresa',
          detalhe: `${pct(resultado.entrada.resultadoEmpresa)}%`,
          valor: resultado.etapas.xResultadoEmpresa,
        },
        {
          rotulo: '− redução por sanção',
          detalhe: `${pct(resultado.entrada.reducaoSancao)}%`,
          valor: resultado.etapas.menosSancao,
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <Caixa titulo="Seus dados">
        <div className="space-y-4">
          <Campo
            id="ppr-salario"
            rotulo="Salário bruto mensal"
            dica="O target é expresso em salários, então sem ele não há cálculo. Vem preenchido com o salário da aba de férias, mas você pode alterar só aqui."
          >
            <CampoMoeda
              id="ppr-salario"
              digitos={salarioDigitos}
              onChange={(salario) => setEstado({ ...estado, salario, salarioEditado: true })}
              pendente={salarioBase === undefined}
            />
          </Campo>

          <Campo
            id="ppr-target"
            rotulo="Target"
            dica="Multiplicador de salário definido pela empresa (ex.: 1,5)."
          >
            <CampoDecimal
              id="ppr-target"
              valor={estado.target}
              onChange={(target) => setEstado({ ...estado, target })}
              inteiros={1}
              decimais={1}
              sufixo="Salários"
              placeholder="0,0"
              pendente={target === undefined}
            />
          </Campo>

          <Campo id="ppr-doze" rotulo="/ 12">
            <input
              id="ppr-doze"
              type="text"
              value="12"
              readOnly
              tabIndex={-1}
              aria-label="Divisor fixo de 12 meses"
              className="campo valor cursor-default bg-recuo text-tinta-3"
            />
          </Campo>

          <Campo id="ppr-meses" rotulo="Meses trabalhados no ano anterior">
            <Select
              id="ppr-meses"
              valor={estado.meses}
              onChange={(m) => setEstado({ ...estado, meses: m })}
              opcoes={MESES}
              vazio="selecione"
              pendente={meses === undefined}
            />
          </Campo>

          <Campo
            id="ppr-resultado"
            rotulo="Resultado da Empresa"
            dica="Percentual divulgado pelo RH poucos dias antes do pagamento (ex.: 106,5). Muda todo ano — confirme antes de se planejar."
          >
            <CampoDecimal
              id="ppr-resultado"
              valor={estado.resultadoEmpresa}
              onChange={(resultadoEmpresa) => setEstado({ ...estado, resultadoEmpresa })}
              inteiros={3}
              decimais={1}
              sufixo="%"
              placeholder="000,0"
              pendente={resultadoEmpresa === undefined}
            />
          </Campo>

          <Accordion titulo="Mais Opções">
            <Campo
              id="ppr-sancao"
              rotulo="Redução por sanção disciplinar ou faltas (%)"
              dica="Última etapa do cálculo no folheto do RH. Deixe em 0 se não houver."
            >
              <CampoDecimal
                id="ppr-sancao"
                valor={estado.reducaoSancao}
                onChange={(reducaoSancao) => setEstado({ ...estado, reducaoSancao })}
                inteiros={3}
                decimais={1}
                sufixo="%"
                placeholder="0"
                pendente={reducaoSancao < 0 || reducaoSancao > 100}
              />
            </Campo>
          </Accordion>
        </div>
      </Caixa>

      <Caixa titulo="Etapas do cálculo">
        {resultado ? (
          <ol
            className="divide-y divide-filete overflow-hidden rounded-[3px] border border-filete
              bg-campo"
          >
            {etapas.map((e) => (
              <li
                key={e.rotulo}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5"
              >
                <span className="text-sm text-tinta-2">
                  {e.rotulo}
                  <span className="ml-1.5 text-dica text-tinta-3">{e.detalhe}</span>
                </span>
                <span className="valor text-sm font-semibold text-tinta">
                  {brl(e.valor)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="max-w-leitura text-dica text-tinta-3">
            Preencha salário, target, meses e o resultado da empresa para ver as etapas.
          </p>
        )}
      </Caixa>

      <Caixa titulo="Resultado">
        <PainelResultado linhas={linhas} />
      </Caixa>

      {resultado ? (
        <Avisos avisos={[...resultado.avisos, AVISO_SIMULACAO]} ehAlerta={ehAlerta} />
      ) : null}

      <div className="flex justify-end">
        <BotaoLimpar onClick={() => setEstado(ESTADO_PPR_INICIAL)} />
      </div>
    </div>
  );
}
