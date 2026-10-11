import {
  brl,
  calcularFerias,
  MODALIDADES,
  type Modalidade,
  type Periodo,
  type Resultado,
} from '../calc/ferias';
import { useCalculo, useParametros } from '../hooks/useCalculo';
import { ajustarInicios, avisosDasDatas, datarPeriodo, formatarBR } from '../lib/datas';
import { digitosParaNumero } from '../lib/moeda';
import { DEPENDENTES, modalidadeCompativel, opcoesDeModalidade } from '../lib/opcoes';
import { Campo, CampoData, CampoMoeda, Select, SimNao } from './Campos';
import Cronograma from './Cronograma';
import {
  Accordion,
  Avisos,
  BotaoLimpar,
  Caixa,
  PainelRateio,
  PainelResultado,
  TituloEntreCaixas,
  type LinhaResultado,
} from './Estrutura';

export interface EstadoFerias {
  salario: string;
  vendeu10Dias: boolean;
  modalidade: string;
  adiantamento13: boolean;
  dependentes: string;
  outrasDeducoes: string;
  /** Data de início de cada período, na ordem da modalidade. "" = em branco. */
  inicios: string[];
}

export const ESTADO_FERIAS_INICIAL: EstadoFerias = {
  salario: '',
  vendeu10Dias: false,
  modalidade: '',
  adiantamento13: false,
  dependentes: '',
  outrasDeducoes: '',
  inicios: [],
};

/**
 * Aviso da secao 14.1: o app nao pede medias de variaveis de proposito, e a
 * consequencia precisa ficar visivel junto do resultado, nao num rodape.
 */
const AVISO_VARIAVEIS =
  'Se você recebe horas extras, adicionais (noturno, insalubridade, ' +
  'periculosidade) ou comissões, o valor real será MAIOR que o simulado: ' +
  'essas médias integram a base das férias (CLT art. 142) e só o RH sabe ' +
  'quanto são.';

/**
 * Era o rodapé da tela. Virou o terceiro aviso da lista: solto lá embaixo, fora
 * das caixas, ninguém associava a ressalva ao número que tinha acabado de ler.
 */
const AVISO_SIMULACAO =
  'Simulação para auxílio no planejamento. Não conte com esses valores como reais ou ' +
  'definitivos. Os valores oficiais serão conhecidos somente na folha de pagamento.';

const ehAlerta = (a: string) =>
  a.includes('venceram') ||
  a.includes('só valem a partir') ||
  a.includes('salário mínimo') ||
  a.includes('art. 134') ||
  a.includes('sobrepor');

/** Resume o criterio de IRRF dos periodos num rotulo so. */
function criterioAplicado(r: Resultado): string {
  const criterios = new Set(r.periodos.map((p) => p.irrfDetalhe.criterioAplicado));
  if (criterios.size > 1) return 'misto entre os períodos';
  return criterios.has('simplificado')
    ? 'desconto simplificado'
    : 'deduções legais (INSS, dependentes e outros descontos)';
}

/**
 * As linhas de um período, na ordem da planilha: o que entra, o que sai e o
 * que sobra. Adiantamento do 13º e abono só aparecem quando existem — linha
 * zerada é ruído.
 */
function linhasDoPeriodo(per: Periodo): LinhaResultado[] {
  const l: LinhaResultado[] = [{ rotulo: `Horas ${per.dias} dias`, valor: per.ferias }];
  if (per.adiantamento13 > 0) {
    l.push({ rotulo: 'Adiantamento 13º', valor: per.adiantamento13 });
  }
  l.push({ rotulo: '1/3 férias', valor: per.umTerco });
  if (per.abono > 0) {
    l.push({ rotulo: 'Abono (10 dias vendidos)', valor: per.abono, selo: 'Isento' });
  }
  l.push({ rotulo: 'Receitas totais', valor: per.receitasBrutas, subtotal: true });
  l.push({ rotulo: 'INSS férias', valor: per.inss, negativo: true });
  l.push({ rotulo: 'IRRF férias', valor: per.irrf, negativo: true });
  l.push({ rotulo: 'Descontos totais', valor: per.descontos, negativo: true, subtotal: true });
  l.push({ rotulo: 'Total a receber', valor: per.liquido, destaque: true });
  return l;
}

export default function AbaFerias({
  estado,
  setEstado,
}: {
  estado: EstadoFerias;
  setEstado: (e: EstadoFerias) => void;
}) {
  const p = useParametros();

  const salarioBase = digitosParaNumero(estado.salario);
  const outrasDeducoes = digitosParaNumero(estado.outrasDeducoes) ?? 0;
  const dependentes = estado.dependentes ? Number(estado.dependentes) : 0;
  const modalidadeOk = modalidadeCompativel(estado.modalidade, estado.vendeu10Dias);
  const pronto = salarioBase !== undefined && salarioBase > 0 && modalidadeOk;

  // Dias de cada período da modalidade escolhida: [30], [20, 10], [15, 5]...
  const diasPorPeriodo = modalidadeOk ? MODALIDADES[estado.modalidade as Modalidade].dias : [];

  const { resultado } = useCalculo<Resultado>(
    pronto
      ? () =>
          calcularFerias({
            salarioBase: salarioBase as number,
            modalidade: estado.modalidade as Modalidade,
            adiantamento13: estado.adiantamento13,
            dependentes,
            outrasDeducoes,
          })
      : null,
    [salarioBase, estado.modalidade, estado.adiantamento13, dependentes, outrasDeducoes, pronto],
  );

  // As datas não entram na conta: elas dizem QUANDO cada pagamento cai.
  const datas = diasPorPeriodo.map((dias, i) =>
    datarPeriodo(estado.inicios[i] ?? '', dias, i + 1),
  );

  const total = {
    bruto: resultado?.totalBruto ?? 0,
    inss: resultado?.periodos.reduce((a, x) => a + x.inss, 0) ?? 0,
    irrf: resultado?.periodos.reduce((a, x) => a + x.irrf, 0) ?? 0,
    liquido: resultado?.totalLiquido ?? 0,
  };

  /**
   * As linhas do total. O Bruto deixou de ser um número solto: as parcelas que
   * o formam vêm acima dele, e ele fecha o bloco como subtotal. Sem isso ficava
   * impossível conferir de onde saiu o valor.
   */
  const linhas = (v: {
    bruto: number;
    inss: number;
    irrf: number;
    liquido: number;
  }): LinhaResultado[] => {
    const l: LinhaResultado[] = [];
    if (resultado) {
      const soma = (f: (p: Periodo) => number) =>
        resultado.periodos.reduce((a, x) => a + f(x), 0);
      const totalFerias = soma((x) => x.ferias);
      const totalUmTerco = soma((x) => x.umTerco);
      const total13 = soma((x) => x.adiantamento13);
      const totalAbono = soma((x) => x.abono);

      l.push({ rotulo: `Horas ${resultado.diasGozados} dias`, valor: totalFerias });
      if (total13 > 0) l.push({ rotulo: 'Adiantamento 13º', valor: total13 });
      l.push({ rotulo: '1/3 férias', valor: totalUmTerco });
      if (totalAbono > 0) {
        l.push({
          rotulo: `Abono (${resultado.diasVendidos} dias vendidos)`,
          valor: totalAbono,
          selo: 'Isento',
        });
      }
    }
    l.push({ rotulo: 'Bruto', valor: v.bruto, subtotal: true });
    l.push({ rotulo: 'INSS', valor: v.inss, negativo: true });
    l.push({ rotulo: 'Imposto de Renda', valor: v.irrf, negativo: true });
    l.push({ rotulo: 'Líquido a Receber', valor: v.liquido, destaque: true });
    return l;
  };

  // Trocar a venda recarrega o dropdown: as duas listas sao disjuntas.
  const trocarVenda = (v: boolean) =>
    setEstado({ ...estado, vendeu10Dias: v, modalidade: '', inicios: [] });

  // Trocar a modalidade muda a quantidade de periodos; preserva o que couber.
  const trocarModalidade = (modalidade: string) => {
    const dias = modalidadeCompativel(modalidade, estado.vendeu10Dias)
      ? MODALIDADES[modalidade].dias.length
      : 0;
    setEstado({ ...estado, modalidade, inicios: ajustarInicios(estado.inicios, dias) });
  };

  const trocarInicio = (indice: number, valor: string) => {
    const inicios = ajustarInicios(estado.inicios, diasPorPeriodo.length);
    inicios[indice] = valor;
    setEstado({ ...estado, inicios });
  };

  const umPeriodo = resultado?.periodos.length === 1;

  return (
    <div className="space-y-5">
      {/* ── Caixa 1: o que a pessoa informa ── */}
      <Caixa titulo="Seus dados">
        <div className="space-y-4">
          <Campo id="fer-salario" rotulo="Salário bruto mensal">
            <CampoMoeda
              id="fer-salario"
              digitos={estado.salario}
              onChange={(salario) => setEstado({ ...estado, salario })}
              pendente={salarioBase === undefined}
            />
          </Campo>

          <Campo
            id="fer-venda"
            rotulo="Venda de 10 dias?"
            dica="Abono pecuniário (CLT art. 143): você recebe 10 dias + 1/3 sobre eles, isentos de INSS e de Imposto de Renda, e goza 20 dias."
          >
            <SimNao nome="Venda de 10 dias" valor={estado.vendeu10Dias} onChange={trocarVenda} />
          </Campo>

          <Campo
            id="fer-modalidade"
            rotulo="Como vai dividir as férias?"
            dica={
              estado.vendeu10Dias
                ? 'Vendendo 10 dias, restam 20 dias de gozo.'
                : 'Sem venda, são 30 dias de gozo.'
            }
          >
            <Select
              id="fer-modalidade"
              valor={estado.modalidade}
              onChange={trocarModalidade}
              opcoes={opcoesDeModalidade(estado.vendeu10Dias).map((o) => ({
                valor: o.valor,
                texto: o.texto,
              }))}
              vazio="selecione"
              pendente={!modalidadeOk}
            />
          </Campo>

          {/* Uma caixa de data por periodo, na ordem da modalidade escolhida. */}
          {diasPorPeriodo.map((dias, i) => (
            <Campo
              key={i}
              id={`fer-inicio-${i}`}
              rotulo={`Início do período de ${dias} dias`}
              dica={
                datas[i]
                  ? `Termina em ${formatarBR(datas[i]!.fim)}, você volta em ` +
                    `${formatarBR(datas[i]!.retorno)} e o dinheiro cai no final de ` +
                    `${datas[i]!.mesDoCredito}.`
                  : 'Opcional — diz em que mês o pagamento cai. Não altera os valores.'
              }
            >
              <CampoData
                id={`fer-inicio-${i}`}
                valor={estado.inicios[i] ?? ''}
                onChange={(v) => trocarInicio(i, v)}
              />
            </Campo>
          ))}

          <Campo
            id="fer-13"
            rotulo="Adiantamento 13º Salário"
            dica="São 50% do 13º pagos junto das férias. O imposto dele não sai agora: é apurado depois, na 2ª parcela, em dezembro."
          >
            <SimNao
              nome="Adiantamento do 13º"
              valor={estado.adiantamento13}
              onChange={(adiantamento13) => setEstado({ ...estado, adiantamento13 })}
            />
          </Campo>

          <Accordion titulo="Mais Opções">
            <Campo
              id="fer-dependentes"
              rotulo="Nº de dependentes"
              dica={`Cada dependente abate ${brl(
                p.irrf.deducaoPorDependente,
              )} da base do IRRF. Só muda o resultado quando as deduções legais (INSS + dependentes + outros descontos) superam o desconto simplificado de ${brl(
                p.irrf.descontoSimplificado,
              )} — o app aplica sempre o que der menos imposto.`}
            >
              <Select
                id="fer-dependentes"
                valor={estado.dependentes}
                onChange={(dependentes) => setEstado({ ...estado, dependentes })}
                opcoes={DEPENDENTES}
                vazio="nenhum"
              />
            </Campo>

            <Campo
              id="fer-outras"
              rotulo="Outros descontos mensais"
              dica="Previdência privada, pensão alimentícia judicial e outras deduções legais."
            >
              <CampoMoeda
                id="fer-outras"
                digitos={estado.outrasDeducoes}
                onChange={(outrasDeducoes) => setEstado({ ...estado, outrasDeducoes })}
              />
            </Campo>
          </Accordion>
        </div>
      </Caixa>

      {/* ── Caixa 2: o total, com as parcelas que formam o bruto ── */}
      <Caixa titulo={resultado ? 'Resultado — total' : 'Resultado'}>
        <PainelResultado linhas={linhas(total)} />
        {resultado ? (
          <p className="mt-2 max-w-leitura text-dica text-tinta-3">
            IRRF apurado por{' '}
            <strong className="font-medium">{criterioAplicado(resultado)}</strong>
            {` · ${resultado.diasGozados} dias gozados`}
            {resultado.diasVendidos > 0 ? ` + ${resultado.diasVendidos} vendidos` : ''}
          </p>
        ) : (
          <p className="mt-2 max-w-leitura text-dica text-tinta-3">
            Preencha o salário e a divisão das férias para ver o cálculo.
          </p>
        )}
      </Caixa>

      {resultado ? (
        <>
          {/* ── Título solto: separa o total das caixas de cada período ── */}
          <TituloEntreCaixas titulo={umPeriodo ? 'Seu pagamento' : 'Pagamento por período'}>
            {umPeriodo ? null : (
              <p className="max-w-leitura text-dica leading-relaxed text-tinta-3">
                São dois pagamentos, em meses diferentes, apurados isoladamente — é por isso que
                dividir as férias reduz o imposto: duas bases menores caem em faixas mais baixas
                do que uma base única.
              </p>
            )}
          </TituloEntreCaixas>

          {/* ── Uma caixa por período de férias ── */}
          {resultado.periodos.map((per) => {
            const d = datas[per.ordem - 1] ?? null;
            return (
              <Caixa
                key={per.ordem}
                titulo={`${umPeriodo ? 'Férias' : `Férias ${per.ordem}`} — ${per.dias} dias`}
              >
                <div className="space-y-2.5">
                  {d ? (
                    <p className="-mt-1 max-w-leitura text-dica text-tinta-3">
                      Saída em <strong className="font-medium">{formatarBR(d.inicio)}</strong>,
                      último dia {formatarBR(d.fim)}, volta em {formatarBR(d.retorno)}.
                    </p>
                  ) : null}

                  {d ? (
                    <p
                      className="rounded-[3px] border-l-2 border-latao-linha bg-campo px-3.5 py-2.5
                        text-sm font-medium text-tinta"
                    >
                      Férias na conta: <strong>final de {d.mesDoCredito}</strong>
                    </p>
                  ) : null}

                  <PainelResultado linhas={linhasDoPeriodo(per)} />

                  <PainelRateio
                    parte13={per.rateio.parte13}
                    guardar={per.rateio.guardar}
                    gastar={per.rateio.gastar}
                  />

                  {/*
                    O cronograma vai em CADA período, não só no primeiro: quem
                    divide as férias tem duas saídas, em meses diferentes, e
                    cada uma mexe nos pagamentos à sua volta.
                  */}
                  <Cronograma
                    periodo={per}
                    inicio={estado.inicios[per.ordem - 1] ?? ''}
                    salario={salarioBase ?? 0}
                  />
                </div>
              </Caixa>
            );
          })}

          <p className="max-w-leitura px-1 text-dica leading-relaxed text-tinta-3">
            O salário é o que paga as contas do mês da volta: as férias adiantam a remuneração,
            então o mês seguinte vem sem ela. O adiantamento do 13º e o 1/3 constitucional são o
            dinheiro que sobra para gastar.
          </p>

          <Avisos
            avisos={[
              ...resultado.avisos,
              ...avisosDasDatas(datas),
              AVISO_VARIAVEIS,
              AVISO_SIMULACAO,
            ]}
            ehAlerta={ehAlerta}
          />
        </>
      ) : null}

      <div className="flex justify-end px-1">
        <BotaoLimpar onClick={() => setEstado(ESTADO_FERIAS_INICIAL)} />
      </div>
    </div>
  );
}
