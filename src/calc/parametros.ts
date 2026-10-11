/**
 * parametros.ts — Carregamento e validação dos parâmetros fiscais.
 *
 * ESTRATÉGIA (leia antes de mexer)
 * ────────────────────────────────
 * Não existe API oficial do governo que devolva as tabelas de INSS e IRRF em
 * JSON. As fontes oficiais são páginas HTML (gov.br) que mudam de layout e
 * bloqueiam scraping. Por isso o app NÃO consulta o gov.br em runtime.
 *
 * O modelo é: um único `parametros.json` versionado, servido de uma URL fixa
 * sob seu controle (CDN / pasta `public/` / GitHub Raw). O app busca esse
 * arquivo a cada simulação (com cache), e tem 3 camadas de segurança:
 *
 *   1. REMOTO   — busca a URL fixa. É o que você atualiza 1x por ano.
 *   2. CACHE    — última versão bem-sucedida em localStorage (offline).
 *   3. EMBUTIDO — o parametros.json compilado no bundle (nunca falha).
 *
 * E, o mais importante, a GUARDA DE VIGÊNCIA: se a data de hoje estiver fora
 * de `vigencia`, o cálculo continua, mas `resultado.avisos` traz um alerta que
 * a UI DEVE exibir. É isso que impede o app de mentir silenciosamente em
 * janeiro, quando as tabelas mudam.
 */

import embutido from './parametros.json';

// ─────────────────────────────── Tipos ───────────────────────────────

export interface FaixaINSS { ate: number; aliquota: number }
export interface FaixaIRRF { ate: number | null; aliquota: number; deducao: number }

export interface Parametros {
  versao: string;
  vigencia: { inicio: string; fim: string };
  verificadoEm: string;
  fontes: Record<string, { nome: string; url: string; normaLegal: string; normaUrl?: string }>;
  salarioMinimo: number;
  constantes: { diasMes: number; horasMes: number; diasAbonoPecuniario: number };
  inss: { tetoSalarioContribuicao: number; faixas: FaixaINSS[] };
  irrf: {
    faixas: FaixaIRRF[];
    deducaoPorDependente: number;
    descontoSimplificado: number;
    reducao: {
      limiteIsencaoTotal: number;
      limiteSuperior: number;
      coeficienteA: number;
      coeficienteB: number;
    };
  };
  abonoPecuniario: { isentoINSS: boolean; isentoIRRF: boolean; fundamento: string };
  ppr: { incideINSS: boolean }; plr: { faixas: FaixaIRRF[] };
}

// ───────────────────────────── Configuração ─────────────────────────────

/**
 * Troque pela URL onde você hospedar o parametros.json.
 * Lido de VITE_URL_PARAMETROS quando definido; o default serve o arquivo da
 * pasta public/ na raiz do site — que é o que se atualiza em janeiro sem
 * recompilar o bundle.
 */
export const URL_PARAMETROS =
  (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_URL_PARAMETROS ?? '/parametros.json';

const CHAVE_CACHE = 'ferias:parametros';
const TTL_MS = 1000 * 60 * 60 * 12; // revalida a cada 12h

export const PARAMETROS_EMBUTIDOS = embutido as unknown as Parametros;

// ─────────────────────────────── Validação ───────────────────────────────

/** Rejeita um JSON remoto malformado antes que ele contamine o cálculo. */
export function validarParametros(p: unknown): p is Parametros {
  const o = p as Parametros;
  return !!(
    o &&
    typeof o.versao === 'string' &&
    o.vigencia?.inicio &&
    o.vigencia?.fim &&
    o.inss?.faixas?.length >= 1 &&
    o.inss.tetoSalarioContribuicao > 0 &&
    o.irrf?.faixas?.length >= 2 &&
    o.irrf.descontoSimplificado >= 0 &&
    o.irrf.deducaoPorDependente >= 0 &&
    o.irrf.reducao &&
    o.constantes?.diasMes === 30 &&
    // faixas de INSS estritamente crescentes
    o.inss.faixas.every((f, i, a) => f.ate > 0 && (i === 0 || f.ate > a[i - 1].ate))
  );
}

export interface StatusVigencia {
  vigente: boolean;
  /** Mensagem pronta para exibir na UI. `null` quando está tudo em ordem. */
  aviso: string | null;
}

export function conferirVigencia(p: Parametros, hoje = new Date()): StatusVigencia {
  const dia = hoje.toISOString().slice(0, 10);
  if (dia < p.vigencia.inicio) {
    return {
      vigente: false,
      aviso:
        `As tabelas carregadas (versão ${p.versao}) só valem a partir de ` +
        `${br(p.vigencia.inicio)}. O resultado pode estar incorreto.`,
    };
  }
  if (dia > p.vigencia.fim) {
    return {
      vigente: false,
      aviso:
        `As tabelas de INSS e IRRF usadas neste cálculo venceram em ` +
        `${br(p.vigencia.fim)} (versão ${p.versao}). O governo reajusta os ` +
        `valores em janeiro — o resultado é uma estimativa com a tabela antiga. ` +
        `Confira em ${p.fontes.irrf.url}`,
    };
  }
  return { vigente: true, aviso: null };
}

function br(iso: string) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

// ─────────────────────────────── Carregamento ───────────────────────────────

interface Envelope { p: Parametros; em: number }

function lerCache(): Envelope | null {
  try {
    const raw = globalThis.localStorage?.getItem(CHAVE_CACHE);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    return validarParametros(env.p) ? env : null;
  } catch {
    return null;
  }
}

function gravarCache(p: Parametros) {
  try {
    globalThis.localStorage?.setItem(
      CHAVE_CACHE,
      JSON.stringify({ p, em: Date.now() } satisfies Envelope),
    );
  } catch {
    /* modo privado / storage cheio — segue sem cache */
  }
}

export interface ParametrosCarregados {
  parametros: Parametros;
  origem: 'remoto' | 'cache' | 'embutido';
  status: StatusVigencia;
}

/**
 * Busca os parâmetros para uma simulação. Nunca lança: sempre devolve algo
 * calculável, informando de onde veio e se está vigente.
 *
 * @param opts.forcar ignora o TTL do cache e vai direto ao remoto.
 */
export async function carregarParametros(
  opts: { forcar?: boolean; hoje?: Date } = {},
): Promise<ParametrosCarregados> {
  const cache = lerCache();
  const cacheFresco = cache && !opts.forcar && Date.now() - cache.em < TTL_MS;

  if (cacheFresco) {
    return {
      parametros: cache!.p,
      origem: 'cache',
      status: conferirVigencia(cache!.p, opts.hoje),
    };
  }

  try {
    const resp = await fetch(URL_PARAMETROS, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!validarParametros(json)) throw new Error('parametros.json inválido');
    gravarCache(json);
    return { parametros: json, origem: 'remoto', status: conferirVigencia(json, opts.hoje) };
  } catch {
    const p = cache?.p ?? PARAMETROS_EMBUTIDOS;
    return {
      parametros: p,
      origem: cache ? 'cache' : 'embutido',
      status: conferirVigencia(p, opts.hoje),
    };
  }
}

/**
 * TAREFA ANUAL (janeiro) — checklist para atualizar o parametros.json:
 *
 *  1. INSS  → abrir `fontes.inss.url` e copiar as 4 faixas e o teto do
 *             salário de contribuição da nova Portaria Interministerial.
 *  2. IRRF  → abrir `fontes.irrf.url` e copiar a Tabela de Incidência Mensal
 *             (faixas, alíquotas, parcela a deduzir), a dedução por
 *             dependente, o limite do desconto simplificado e a Tabela de
 *             Redução Mensal (limites e coeficientes).
 *  3. Atualizar `salarioMinimo`, `versao`, `vigencia` e `verificadoEm`.
 *  4. Rodar `npm test` — os testes-âncora vão falhar de propósito; conferir
 *     cada número novo à mão antes de atualizar os valores esperados.
 *  5. Publicar o JSON na URL fixa. Os clientes pegam em até 12h (TTL).
 */
