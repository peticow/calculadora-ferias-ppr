/**
 * datas.ts — Datas dos períodos de férias.
 *
 * As datas NÃO entram no cálculo do dinheiro: a remuneração das férias depende
 * do salário e dos dias gozados, não de quando eles caem. O que elas fazem é
 * dizer *quando* cada pagamento acontece e apontar escolhas que o RH recusaria.
 *
 * Tudo em UTC de propósito. `new Date('2026-01-15')` já é UTC; usar getDate()
 * em fuso negativo devolveria o dia 14. Aqui só existe getUTC*.
 */

/** Data no formato do <input type="date">: "aaaa-mm-dd". */
export type DataISO = string;

const MS_DIA = 86_400_000;

const FORMATO_BR = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const FORMATO_DIA_SEMANA = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  timeZone: 'UTC',
});

/** true para "aaaa-mm-dd" que existe no calendário. "2026-02-30" é falso. */
export function ehDataISO(v: string): v is DataISO {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(v + 'T00:00:00Z');
  if (Number.isNaN(t)) return false;
  // Date.parse aceita "2026-02-30" em alguns motores, normalizando para março.
  // A ida e volta pega isso.
  return new Date(t).toISOString().slice(0, 10) === v;
}

function paraData(iso: DataISO): Date {
  return new Date(iso + 'T00:00:00Z');
}

function paraISO(d: Date): DataISO {
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: DataISO, dias: number): DataISO {
  return paraISO(new Date(paraData(iso).getTime() + dias * MS_DIA));
}

/** "2026-01-15" -> "15/01/2026" */
export function formatarBR(iso: DataISO): string {
  return FORMATO_BR.format(paraData(iso));
}

/** "2026-01-15" -> "quinta-feira" */
export function diaDaSemana(iso: DataISO): string {
  return FORMATO_DIA_SEMANA.format(paraData(iso));
}

/** 0 = domingo … 6 = sábado. */
export function indiceDiaDaSemana(iso: DataISO): number {
  return paraData(iso).getUTCDay();
}

/**
 * Último dia de férias. O dia de início conta, então 10 dias a partir de
 * 15/01 terminam em 24/01 — não em 25/01.
 */
export function fimDoPeriodo(inicio: DataISO, dias: number): DataISO {
  return somarDias(inicio, dias - 1);
}

/** Primeiro dia de trabalho depois das férias. */
export function retornoAoTrabalho(inicio: DataISO, dias: number): DataISO {
  return somarDias(inicio, dias);
}

/**
 * Prazo legal do pagamento: até 2 dias antes do início das férias
 * (CLT art. 145). É prazo máximo, não data marcada — a folha pode antecipar.
 */
export function pagamentoAte(inicio: DataISO): DataISO {
  return somarDias(inicio, -2);
}

const FORMATO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

/**
 * Mês em que as férias caem na conta: o fim do mês ANTERIOR ao do início.
 * Sair em 23/05 significa receber no final de abril.
 *
 * É a prática da folha da empresa, não a lei. A CLT (art. 145) só exige o
 * pagamento até 2 dias antes do início — a empresa antecipa para o
 * fechamento do mês anterior, que é sempre igual ou melhor que o prazo legal.
 *
 * O ano entra no rótulo só quando difere do ano das férias, que é o caso que
 * confunde: férias em janeiro caem no final de dezembro do ano passado.
 */
export function mesDoCredito(inicio: DataISO): string {
  const d = paraData(inicio);
  const anoFerias = d.getUTCFullYear();
  const mesAnterior = new Date(Date.UTC(anoFerias, d.getUTCMonth() - 1, 1));
  const nome = FORMATO_MES.format(mesAnterior);
  return mesAnterior.getUTCFullYear() === anoFerias ? nome : `${nome} de ${mesAnterior.getUTCFullYear()}`;
}

export interface PeriodoDatado {
  ordem: number;
  dias: number;
  inicio: DataISO;
  fim: DataISO;
  retorno: DataISO;
  pagamentoAte: DataISO;
  /** "fevereiro", ou "dezembro de 2025" quando vira o ano. */
  mesDoCredito: string;
}

/** Monta as datas de um período. Devolve null se o início não estiver preenchido. */
export function datarPeriodo(
  inicio: string,
  dias: number,
  ordem: number,
): PeriodoDatado | null {
  if (!ehDataISO(inicio)) return null;
  return {
    ordem,
    dias,
    inicio,
    fim: fimDoPeriodo(inicio, dias),
    retorno: retornoAoTrabalho(inicio, dias),
    pagamentoAte: pagamentoAte(inicio),
    mesDoCredito: mesDoCredito(inicio),
  };
}

/**
 * Avisos sobre as datas escolhidas. São orientações, não bloqueios: o app
 * simula, quem aprova férias é o RH.
 *
 * Não conferimos feriados — exigiria uma tabela municipal que envelheceria
 * sozinha. Por isso o texto da regra fala em feriado sem afirmar que não há um.
 */
export function avisosDasDatas(periodos: Array<PeriodoDatado | null>): string[] {
  const avisos: string[] = [];

  for (const p of periodos) {
    if (!p) continue;
    const dia = indiceDiaDaSemana(p.inicio);
    // CLT art. 134 §3: vedado iniciar nos 2 dias que antecedem repouso semanal
    // ou feriado. Com repouso no domingo, isso barra sexta e sábado; domingo
    // é o próprio repouso.
    if (dia === 5 || dia === 6 || dia === 0) {
      avisos.push(
        `O ${p.ordem}º período começa numa ${diaDaSemana(p.inicio)} ` +
          `(${formatarBR(p.inicio)}). A CLT (art. 134, §3º) proíbe começar as ` +
          `férias nos dois dias que antecedem o repouso semanal ou um feriado — ` +
          `na prática, o RH costuma exigir início de segunda a quinta.`,
      );
    }
  }

  const datados = periodos.filter((p): p is PeriodoDatado => p !== null);
  for (let i = 1; i < datados.length; i++) {
    const anterior = datados[i - 1];
    const atual = datados[i];
    if (atual.inicio <= anterior.fim) {
      avisos.push(
        `O ${atual.ordem}º período começa em ${formatarBR(atual.inicio)}, ` +
          `antes de o ${anterior.ordem}º terminar (${formatarBR(anterior.fim)}). ` +
          `Os períodos não podem se sobrepor.`,
      );
    }
  }

  return avisos;
}

/**
 * Ajusta a lista de datas quando a modalidade muda: mantém o que já foi
 * digitado nas posições que continuam existindo e completa o resto em branco.
 */
export function ajustarInicios(inicios: string[], quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => inicios[i] ?? '');
}

/**
 * Máscara do campo de data digitado: "11102026" -> "11/10/2026", com as
 * barras aparecendo conforme os dígitos chegam. Só dígitos entram, no máximo 8.
 */
export function mascaraData(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "11/10/2026" -> "2026-10-11". Incompleta ou inexistente ("31/02/2026") -> null. */
export function textoBRParaISO(texto: string): DataISO | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return ehDataISO(iso) ? iso : null;
}
