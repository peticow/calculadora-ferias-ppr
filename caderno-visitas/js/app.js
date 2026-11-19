// Caderno de Visitas — roteamento, login, lista com filtros e reordenação.
import { api, definirAoDeslogar } from './api.js';
import { estado, carregarImoveis, guardarCache } from './estado.js';
import { listarFila, enviarPendentes } from './fotos.js';
import { abrirFicha } from './ficha.js';
import { $, $$, esc, reais, estrelas, chipStatus, toast, TIPO_CURTO, grupoTipo, LIMITE_ALUGUEL } from './util.js';

const app = $('#app');
let logado = null; // null = ainda não sabemos
let limpar = null; // limpeza da tela atual
let sortable = null;

// ───────── Filtros (salvos no aparelho) ─────────
const CHAVE_FILTROS = 'cv-filtros';
const filtros = Object.assign(
  { bairro: '', corretor: '', tipo: '', ocultarDescartados: false },
  (() => {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_FILTROS)) || {};
    } catch {
      return {};
    }
  })(),
);
const salvarFiltros = () => {
  try {
    localStorage.setItem(CHAVE_FILTROS, JSON.stringify(filtros));
  } catch {}
};

function passaFiltro(im) {
  if (filtros.bairro && (im.bairro || '') !== filtros.bairro) return false;
  if (filtros.corretor && (im.corretor || '') !== filtros.corretor) return false;
  if (filtros.tipo && grupoTipo(im.tipo) !== filtros.tipo) return false;
  if (filtros.ocultarDescartados && im.status === 'descartado') return false;
  return true;
}

const unicos = (campo) =>
  [...new Set(estado.imoveis.map((i) => (i[campo] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

// ───────── Indicador de fotos pendentes ─────────
export async function atualizarPendentes() {
  const n = (await listarFila()).length;
  $$('.pendentes').forEach((el) => {
    el.hidden = n === 0;
    el.textContent = `⏳ ${n} ${n > 1 ? 'arquivos pendentes' : 'arquivo pendente'} de envio`;
  });
}
window.addEventListener('fila-fotos', atualizarPendentes);

// ───────── Login ─────────
function telaLogin() {
  app.innerHTML = `
    <main class="login">
      <img src="icons/icon-192.png" alt="" width="96" height="96">
      <h1>Caderno de Visitas</h1>
      <p>Prospecção de imóveis — Aracruz/ES</p>
      <form id="form-login">
        <label for="senha">Senha</label>
        <input id="senha" type="password" autocomplete="current-password" required>
        <button class="btn pri grande" type="submit">Entrar</button>
        <p class="erro" id="erro-login" role="alert"></p>
      </form>
    </main>`;
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || $('#form-login button');
    btn.disabled = true;
    $('#erro-login').textContent = '';
    try {
      await api('login', { metodo: 'POST', corpo: { senha: $('#senha').value } });
      logado = true;
      await carregarImoveis();
      enviarPendentes();
      rotear();
    } catch (err) {
      $('#erro-login').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('#senha').focus();
}

definirAoDeslogar(() => {
  if (logado !== false) {
    logado = false;
    rotear();
  }
});

// ───────── Lista ─────────
function cartao(im) {
  const capa = im.capa_url
    ? `<img src="${esc(im.capa_url)}" alt="" loading="lazy">`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const caro = (im.aluguel || 0) > LIMITE_ALUGUEL;
  return `
    <li class="card ${im.status === 'descartado' ? 'descartado' : ''}" data-id="${im.id}">
      <div class="thumb">${capa}</div>
      <div class="info">
        <div class="l1"><b class="cod">${esc(im.codigo)}</b>${im.tipo ? `<span class="tipo">${esc(TIPO_CURTO[im.tipo])}</span>` : ''}</div>
        <div class="bairro">${esc(im.bairro || 'Bairro não informado')}</div>
        <div class="valor ${caro ? 'caro' : ''}">${im.total ? reais(im.total) + '<small>/mês</small>' : '<small>Valor não informado</small>'}</div>
        ${im.corretor ? `<div class="corretor">${esc(im.corretor)}</div>` : ''}
        <div class="l5">${chipStatus(im.status)}${estrelas(im.nota)}</div>
      </div>
      <button type="button" class="alca" aria-label="Arrastar ${esc(im.codigo)} para reordenar">
        <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></g></svg>
      </button>
    </li>`;
}

function opcoes(lista, atual) {
  const ops = lista.map((v) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(v)}</option>`).join('');
  // Mantém a opção salva mesmo se o último imóvel com ela sumiu.
  const extra = atual && !lista.includes(atual) ? `<option value="${esc(atual)}" selected>${esc(atual)}</option>` : '';
  return `<option value="">Todos</option>${ops}${extra}`;
}

function telaLista() {
  app.innerHTML = `
    <header class="topo">
      <h1>Caderno de Visitas</h1>
      <button type="button" class="icone" id="btn-menu" aria-label="Menu" aria-haspopup="true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></g></svg>
      </button>
    </header>
    <div class="pendentes" hidden></div>
    <div class="aviso-offline" ${estado.offline ? '' : 'hidden'}>Sem conexão — mostrando a última lista salva no aparelho.</div>
    <section class="filtros" aria-label="Filtros">
      <div class="linha2">
        <label>Bairro<select id="f-bairro"></select></label>
        <label>Corretor<select id="f-corretor"></select></label>
      </div>
      <div class="linha2">
        <div class="seg" role="radiogroup" aria-label="Tipo">
          ${[['', 'Todos'], ['casa', 'Casa'], ['apto', 'Apto']]
            .map(([v, r]) => `<button type="button" role="radio" data-tipo="${v}">${r}</button>`)
            .join('')}
        </div>
        <label class="chave"><input type="checkbox" id="f-desc"><span class="trilho"></span>Ocultar descartados</label>
      </div>
    </section>
    <p class="contagem" id="contagem"></p>
    <ul class="lista" id="lista"></ul>
    <div class="vazio" id="vazio" hidden></div>
    <a href="#/novo" class="fab" aria-label="Cadastrar imóvel">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>
    </a>`;

  const desenhar = () => {
    $('#f-bairro').innerHTML = opcoes(unicos('bairro'), filtros.bairro);
    $('#f-corretor').innerHTML = opcoes(unicos('corretor'), filtros.corretor);
    $$('.seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tipo === filtros.tipo)));
    $('#f-desc').checked = filtros.ocultarDescartados;

    const visiveis = estado.imoveis.filter(passaFiltro);
    $('#lista').innerHTML = visiveis.map(cartao).join('');
    const vazio = $('#vazio');
    if (!estado.imoveis.length) {
      vazio.hidden = false;
      vazio.innerHTML = '<p>Nenhum imóvel ainda — toque no <b>+</b> para cadastrar</p>';
    } else if (!visiveis.length) {
      vazio.hidden = false;
      vazio.innerHTML = '<p>Nenhum imóvel com esses filtros.</p><button type="button" class="btn sec" id="limpar-filtros">Limpar filtros</button>';
      $('#limpar-filtros').onclick = () => {
        Object.assign(filtros, { bairro: '', corretor: '', tipo: '', ocultarDescartados: false });
        salvarFiltros();
        desenhar();
      };
    } else vazio.hidden = true;
    const n = estado.imoveis.length;
    $('#contagem').textContent = n ? (visiveis.length === n ? `${n} imóve${n > 1 ? 'is' : 'l'} · arraste ⠿ para priorizar` : `${visiveis.length} de ${n} imóveis`) : '';
  };

  $('#f-bairro').onchange = (e) => ((filtros.bairro = e.target.value), salvarFiltros(), desenhar());
  $('#f-corretor').onchange = (e) => ((filtros.corretor = e.target.value), salvarFiltros(), desenhar());
  $('#f-desc').onchange = (e) => ((filtros.ocultarDescartados = e.target.checked), salvarFiltros(), desenhar());
  $$('.seg button').forEach((b) => (b.onclick = () => ((filtros.tipo = b.dataset.tipo), salvarFiltros(), desenhar())));

  $('#lista').addEventListener('click', (e) => {
    if (e.target.closest('.alca')) return;
    const card = e.target.closest('.card');
    if (card) location.hash = '#/imovel/' + card.dataset.id;
  });
  $('#btn-menu').onclick = abrirMenu;

  if (window.Sortable) {
    sortable = Sortable.create($('#lista'), {
      handle: '.alca',
      animation: 160,
      forceFallback: true,
      fallbackTolerance: 3,
      ghostClass: 'fantasma',
      chosenClass: 'escolhido',
      dragClass: 'arrastando',
      scroll: true,
      bubbleScroll: true,
      onEnd: (ev) => {
        if (ev.oldIndex === ev.newIndex) return;
        reordenar($$('#lista .card').map((el) => Number(el.dataset.id)));
      },
    });
  }

  desenhar();
  atualizarPendentes();

  // Atualiza do servidor em segundo plano.
  carregarImoveis()
    .then(() => {
      if (location.hash.slice(1) === '/' || !location.hash) {
        desenhar();
        $('.aviso-offline').hidden = !estado.offline;
      }
    })
    .catch((e) => toast(e.message, 'erro'));

  return () => {
    sortable?.destroy();
    sortable = null;
  };
}

/**
 * Reordena só os visíveis: os imóveis ocultos pelo filtro ficam nas mesmas
 * posições, e os visíveis ocupam as "vagas" deles na nova ordem.
 */
async function reordenar(visiveisNovaOrdem) {
  const conjunto = new Set(visiveisNovaOrdem);
  let k = 0;
  const ids = estado.imoveis.map((im) => (conjunto.has(im.id) ? visiveisNovaOrdem[k++] : im.id));
  const porId = new Map(estado.imoveis.map((im) => [im.id, im]));
  const anterior = estado.imoveis;
  estado.imoveis = ids.map((id) => porId.get(id));
  guardarCache();
  try {
    await api('ordem', { metodo: 'POST', corpo: { ids } });
  } catch (e) {
    estado.imoveis = anterior;
    guardarCache();
    toast(e.status === 0 ? 'Sem conexão — a nova ordem não foi salva.' : e.message, 'erro');
    rotear();
  }
}

// ───────── Menu ─────────
function abrirMenu() {
  const fundo = document.createElement('div');
  fundo.className = 'folha-fundo';
  fundo.innerHTML = `
    <div class="folha" role="menu">
      <a role="menuitem" href="api.php?r=exportar&formato=json" download>Exportar dados (JSON)</a>
      <a role="menuitem" href="api.php?r=exportar&formato=csv" download>Exportar planilha (CSV)</a>
      <button role="menuitem" type="button" data-acao="atualizar">Atualizar lista</button>
      <button role="menuitem" type="button" data-acao="sair" class="perigo-txt">Sair</button>
      <button role="menuitem" type="button" data-acao="fechar" class="cancelar">Fechar</button>
    </div>`;
  const fechar = () => fundo.remove();
  fundo.addEventListener('click', async (e) => {
    if (e.target === fundo) return fechar();
    const el = e.target.closest('[data-acao], a');
    if (!el) return;
    fechar();
    const acao = el.dataset.acao;
    if (acao === 'atualizar') {
      await carregarImoveis().catch((err) => toast(err.message, 'erro'));
      rotear();
      toast(estado.offline ? 'Sem conexão.' : 'Lista atualizada.');
    } else if (acao === 'sair') {
      try {
        await api('logout', { metodo: 'POST' });
      } catch {}
      logado = false;
      rotear();
    }
  });
  document.body.appendChild(fundo);
}

// ───────── Roteador ─────────
async function rotear() {
  limpar?.();
  limpar = null;
  window.scrollTo(0, 0);
  if (logado === false) return telaLogin();
  const h = location.hash.slice(1) || '/';
  const m = h.match(/^\/imovel\/(\d+)$/);
  if (h === '/novo') limpar = await abrirFicha(app, null);
  else if (m) limpar = await abrirFicha(app, Number(m[1]));
  else limpar = telaLista();
  atualizarPendentes();
}
window.addEventListener('hashchange', rotear);

async function iniciar() {
  try {
    const r = await api('sessao');
    logado = r.autenticado;
  } catch (e) {
    // Sem sinal: abre com os dados guardados no aparelho.
    logado = e.status === 0;
    estado.offline = e.status === 0;
    if (e.status === 503) {
      app.innerHTML = `<main class="login"><h1>Caderno de Visitas</h1><p>${esc(e.message)}</p><a class="btn pri grande" href="setup.php">Configurar</a></main>`;
      return;
    }
  }
  if (logado) enviarPendentes();
  rotear();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar();
