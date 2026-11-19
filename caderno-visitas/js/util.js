// Constantes, formatação e componentes de interface compartilhados.

export const TIPOS = {
  casa_edicula: 'Casa com edícula/quarto externo',
  casa: 'Casa',
  apto_baixo: 'Apto térreo ou 1º andar',
  apto_alto: 'Apto outros andares',
};
export const TIPO_CURTO = {
  casa_edicula: 'Casa c/ edícula',
  casa: 'Casa',
  apto_baixo: 'Apto térreo/1º',
  apto_alto: 'Apto andar alto',
};
export const grupoTipo = (t) => (t === 'casa' || t === 'casa_edicula' ? 'casa' : t ? 'apto' : '');

export const STATUS = {
  a_visitar: 'A visitar',
  agendado: 'Agendado',
  visitado: 'Visitado',
  descartado: 'Descartado',
  proposta: 'Proposta enviada',
  fechado: 'Fechado',
};

export const CHECKLIST = {
  suite: 'Suíte',
  garagem_coberta: 'Garagem coberta',
  edicula: 'Edícula ou quarto externo',
  acesso_idoso: 'Acesso sem degraus para idoso',
  banheiro_idoso: 'Banheiro adaptável para idoso',
  tomadas_127v: 'Tomadas e voltagem 127V ok',
  ar_condicionado: 'Ar-condicionado ou pontos de ar',
  sol_manha: 'Sol da manhã',
  rua_silenciosa: 'Rua silenciosa',
  sem_umidade: 'Sem umidade ou infiltração',
  pressao_agua: 'Pressão da água boa',
  sinal_celular: 'Sinal de celular e internet',
  rua_segura: 'Rua segura',
};

export const LIMITE_ALUGUEL = 4200;

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const reais = (n) => fmtBRL.format(Number(n) || 0);
export const numBR = (n) =>
  n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Aceita "1.500", "1500", "1.500,50", "1500.5", "R$ 1.500,00". */
export function lerDinheiro(txt) {
  let s = String(txt ?? '').replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export const ehLink = (s) => /^https?:\/\//i.test(String(s || '').trim());

export function linkWhats(numero) {
  let d = String(numero || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  return 'https://wa.me/' + d;
}

export function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizarLink(u) {
  if (!ehLink(u)) return '';
  try {
    const url = new URL(u.trim());
    [...url.searchParams.keys()].forEach((k) => /^(utm_|fbclid|gclid)/i.test(k) && url.searchParams.delete(k));
    return (url.host.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '') + url.search).toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

export function normalizarEndereco(e) {
  let s = ' ' + semAcento(e).toLowerCase().replace(/[.,;:/\\\-–()#º°ª]/g, ' ') + ' ';
  s = s.replace(/\s(r)\s/g, ' rua ').replace(/\s(av)\s/g, ' avenida ').replace(/\s(n|no|num|numero)\s/g, ' ');
  s = s.replace(/\s(aracruz|es|espirito santo)\s/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9-]/g, '');

export function estrelas(n) {
  n = Number(n) || 0;
  if (!n) return '';
  return '<span class="estrelas" aria-label="' + n + ' de 5 estrelas">' + '★'.repeat(n) + '<span class="apagada">' + '★'.repeat(5 - n) + '</span></span>';
}

export function chipStatus(s) {
  return s ? `<span class="chip st-${esc(s)}">${esc(STATUS[s] || s)}</span>` : '';
}

// ── Toast ──
let toastTimer;
export function toast(msg, tipo = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast visivel ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
}

// ── Modal de confirmação próprio (nada de alert/confirm) ──
export function confirmar({ titulo, texto = '', ok = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt">
        <h2 id="mt">${esc(titulo)}</h2>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
        <div class="modal-acoes">
          <button type="button" class="btn sec" data-r="0">Cancelar</button>
          <button type="button" class="btn ${perigo ? 'perigo' : 'pri'}" data-r="1">${esc(ok)}</button>
        </div>
      </div>`;
    const fechar = (r) => {
      fundo.remove();
      document.removeEventListener('keydown', tecla);
      resolve(r);
    };
    const tecla = (e) => e.key === 'Escape' && fechar(false);
    fundo.addEventListener('click', (e) => {
      if (e.target === fundo) fechar(false);
      const b = e.target.closest('[data-r]');
      if (b) fechar(b.dataset.r === '1');
    });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(fundo);
    fundo.querySelector('[data-r="1"]').focus();
  });
}
