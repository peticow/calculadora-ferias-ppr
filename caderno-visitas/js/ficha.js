// Ficha do imóvel: mesma tela para cadastrar e editar.
import { api } from './api.js';
import { estado, carregarImoveis, substituirImovel, removerImovel } from './estado.js';
import { comprimir, enfileirar, listarFila, removerDaFila, vincularNovas, enviarPendentes } from './fotos.js';
import {
  $, $$, esc, reais, numBR, lerDinheiro, ehLink, linkWhats, normalizarLink, normalizarEndereco,
  debounce, toast, confirmar, TIPOS, STATUS, CHECKLIST, LIMITE_ALUGUEL, grupoTipo,
} from './util.js';

const CAMPOS_TEXTO = ['link', 'corretor', 'imobiliaria', 'whatsapp', 'endereco', 'bairro', 'maps_link', 'visita_em', 'motivo_descarte', 'anotacoes'];
const CAMPOS_DINHEIRO = ['aluguel', 'condominio', 'iptu', 'taxa_lixo', 'area'];
const VALORES = ['aluguel', 'condominio', 'iptu', 'taxa_lixo'];
const CAMPOS_INTEIROS = ['quartos', 'suites', 'banheiros', 'vagas', 'andar', 'minutos_terminal'];
const CAMPOS_RADIO = ['tipo', 'elevador', 'mobiliado', 'status'];

const unicos = (campo) =>
  [...new Set(estado.imoveis.map((i) => (i[campo] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

const radios = (nome, opcoes, classe = '') =>
  `<div class="opcoes ${classe}" role="radiogroup">${Object.entries(opcoes)
    .map(([v, r]) => `<label><input type="radio" name="${nome}" value="${v}"><span>${esc(r)}</span></label>`)
    .join('')}</div>`;

const campo = (nome, rotulo, extra = '') =>
  `<label class="campo"><span>${rotulo}</span><input name="${nome}" ${extra}></label>`;

export async function abrirFicha(app, id) {
  let im = id ? estado.imoveis.find((x) => x.id === id) || null : null;
  if (id) {
    try {
      im = (await api('imoveis/' + id)).imovel;
      substituirImovel(im);
    } catch (e) {
      if (e.status === 404) {
        toast('Esse imóvel não existe mais.', 'erro');
        location.replace('#/');
        return null;
      }
      if (!im) {
        app.innerHTML = `<header class="topo"><a href="#/" class="icone voltar" aria-label="Voltar">←</a><h1>Imóvel</h1></header><div class="vazio"><p>${esc(e.message)}</p></div>`;
        return null;
      }
    }
  }
  if (!estado.carregado) carregarImoveis().catch(() => {});

  const chaveRascunho = 'cv-rascunho-' + (id || 'novo');
  let rascunho = null;
  try {
    rascunho = JSON.parse(localStorage.getItem(chaveRascunho));
  } catch {}
  const base = im || { status: 'a_visitar', checklist: {} };
  const valores = rascunho ? { ...base, ...rascunho.valores } : base;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  app.innerHTML = `
    <header class="topo">
      <a href="#/" class="icone voltar" aria-label="Voltar para a lista">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
      <h1>${im ? esc(im.codigo) : 'Novo imóvel'}</h1>
    </header>
    <div class="pendentes" hidden></div>
    <div class="aviso-rascunho" id="aviso-rascunho" ${rascunho ? '' : 'hidden'}>
      <span>Rascunho não salvo restaurado deste aparelho.</span>
      <button type="button" class="link-btn" id="descartar-rascunho">Descartar</button>
    </div>
    <form class="ficha" id="ficha" novalidate autocomplete="off">
      ${im ? '' : '<p class="dica">O código (AR-…) é gerado ao salvar.</p>'}

      <section class="bloco">
        <h2>Anúncio e contato</h2>
        <div class="com-botao">
          ${campo('link', 'Link do anúncio', 'type="url" inputmode="url" placeholder="https://…"')}
          <button type="button" class="btn sec" id="abrir-link">Abrir</button>
        </div>
        ${campo('corretor', 'Corretor', 'list="dl-corretor" autocapitalize="words"')}
        ${campo('imobiliaria', 'Imobiliária', 'list="dl-imobiliaria" autocapitalize="words"')}
        <div class="com-botao">
          ${campo('whatsapp', 'WhatsApp', 'type="tel" inputmode="tel" placeholder="(27) 99999-9999"')}
          <button type="button" class="btn whats" id="abrir-whats">WhatsApp</button>
        </div>
        <div class="alerta-dup" id="dup" hidden></div>
      </section>

      <section class="bloco">
        <h2>Imóvel</h2>
        <div class="campo"><span>Tipo</span>${radios('tipo', TIPOS, 'grade2')}</div>
        ${campo('endereco', 'Endereço', 'autocapitalize="words"')}
        ${campo('bairro', 'Bairro', 'list="dl-bairro" autocapitalize="words"')}
        <div class="grade2c igual">
          ${campo('aluguel', 'Aluguel/mês (R$)', 'inputmode="decimal" class="dinheiro"')}
          ${campo('condominio', 'Condomínio/mês', 'inputmode="decimal" class="dinheiro"')}
          ${campo('iptu', 'IPTU/mês', 'inputmode="decimal" class="dinheiro"')}
          ${campo('taxa_lixo', 'Taxa de lixo/ano', 'inputmode="decimal" class="dinheiro"')}
        </div>
        <p class="alerta-caro" id="alerta-caro" hidden>Aluguel acima de ${reais(LIMITE_ALUGUEL)}</p>
        <div class="total" id="total"></div>
        <div class="grade3">
          ${campo('quartos', 'Quartos', 'type="number" inputmode="numeric" min="0"')}
          ${campo('suites', 'Suítes', 'type="number" inputmode="numeric" min="0"')}
          ${campo('banheiros', 'Banheiros', 'type="number" inputmode="numeric" min="0"')}
          ${campo('vagas', 'Vagas', 'type="number" inputmode="numeric" min="0"')}
          ${campo('area', 'Área (m²)', 'inputmode="decimal"')}
        </div>
        <div class="so-apto grade2c">
          ${campo('andar', 'Andar', 'type="number" inputmode="numeric" min="0"')}
          <div class="campo"><span>Elevador</span>${radios('elevador', { sim: 'Sim', nao: 'Não' })}</div>
        </div>
        <div class="campo"><span>Mobiliado</span>${radios('mobiliado', { nao: 'Não', semi: 'Semi', sim: 'Sim' })}</div>
      </section>

      <section class="bloco">
        <h2>Localização</h2>
        ${campo('maps_link', 'Link do Google Maps', 'type="url" inputmode="url" placeholder="Cole o link aqui"')}
        <div class="botoes2">
          <button type="button" class="btn sec" id="minha-loc">📍 Usar minha localização</button>
          <button type="button" class="btn sec" id="abrir-maps">🗺️ Abrir no Maps</button>
        </div>
      </section>

      <section class="bloco">
        <h2>Fotos</h2>
        <div class="botoes2">
          <label class="btn pri"><input type="file" accept="image/*" capture="environment" multiple id="in-camera" hidden>📷 Câmera</label>
          <label class="btn sec"><input type="file" accept="image/*" multiple id="in-galeria" hidden>🖼️ Galeria</label>
        </div>
        <p class="dica" id="status-fotos"></p>
        <div class="galeria" id="galeria"></div>
      </section>

      <section class="bloco">
        <h2>Checklist da visita</h2>
        <div class="checklist">
          ${Object.entries(CHECKLIST)
            .map(
              ([k, r]) => `<div class="item-check"><span>${esc(r)}</span>${radios('ck_' + k, { sim: 'Sim', nao: 'Não', nao_vi: 'Não vi' }, 'tri')}</div>`,
            )
            .join('')}
        </div>
        ${campo('minutos_terminal', 'Minutos até o terminal (Barra do Riacho)', 'type="number" inputmode="numeric" min="0"')}
      </section>

      <section class="bloco">
        <h2>Avaliação</h2>
        <div class="campo"><span>Status</span>${radios('status', STATUS, 'chips-status')}</div>
        ${campo('visita_em', 'Data e hora da visita', 'type="datetime-local"')}
        <div class="campo"><span>Nota</span>
          <div class="nota" id="nota" role="radiogroup" aria-label="Nota">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n} estrela${n > 1 ? 's' : ''}">★</button>`).join('')}
          </div>
        </div>
        <label class="campo so-descarte"><span>Motivo do descarte</span><textarea name="motivo_descarte" rows="2"></textarea></label>
      </section>

      <section class="bloco">
        <h2>Anotações</h2>
        <textarea name="anotacoes" rows="8" class="anotacoes" placeholder="Impressões da visita, combinados com o corretor…"></textarea>
        ${
          SR
            ? `<button type="button" class="btn sec mic" id="mic" aria-pressed="false">🎤 Ditar</button><p class="parcial" id="parcial" aria-live="polite"></p>`
            : '<p class="dica">Para ditar, use o microfone do teclado.</p>'
        }
      </section>

      <datalist id="dl-bairro">${unicos('bairro').map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      <datalist id="dl-corretor">${unicos('corretor').map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
      <datalist id="dl-imobiliaria">${unicos('imobiliaria').map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
    </form>
    <div class="barra-acoes">
      ${im ? '<button type="button" class="btn perigo-contorno" id="excluir">Excluir</button>' : ''}
      <button type="button" class="btn pri grande" id="salvar">Salvar</button>
    </div>`;

  const form = $('#ficha');
  const el = (nome) => form.elements[nome];

  // ── Preenche ──
  let nota = Number(valores.nota) || 0;
  function preencher(v) {
    CAMPOS_TEXTO.forEach((c) => (el(c).value = v[c] ?? ''));
    VALORES.forEach((c) => (el(c).value = numBR(v[c])));
    el('area').value = v.area == null || v.area === '' ? '' : String(v.area).replace('.', ',');
    CAMPOS_INTEIROS.forEach((c) => (el(c).value = v[c] ?? ''));
    CAMPOS_RADIO.forEach((c) => $$(`input[name="${c}"]`, form).forEach((r) => (r.checked = r.value === v[c])));
    Object.keys(CHECKLIST).forEach((k) =>
      $$(`input[name="ck_${k}"]`, form).forEach((r) => (r.checked = r.value === (v.checklist || {})[k])),
    );
    nota = Number(v.nota) || 0;
    atualizarTudo();
  }

  // ── Coleta ──
  function coletar() {
    const d = {};
    CAMPOS_TEXTO.forEach((c) => (d[c] = el(c).value.trim() || null));
    d.anotacoes = el('anotacoes').value || null;
    CAMPOS_DINHEIRO.forEach((c) => (d[c] = lerDinheiro(el(c).value)));
    CAMPOS_INTEIROS.forEach((c) => {
      const n = parseInt(el(c).value, 10);
      d[c] = Number.isFinite(n) && n >= 0 ? n : null;
    });
    CAMPOS_RADIO.forEach((c) => (d[c] = $(`input[name="${c}"]:checked`, form)?.value || null));
    d.checklist = {};
    Object.keys(CHECKLIST).forEach((k) => {
      const v = $(`input[name="ck_${k}"]:checked`, form)?.value;
      if (v) d.checklist[k] = v;
    });
    d.nota = nota || null;
    if (grupoTipo(d.tipo) !== 'apto') {
      d.andar = null;
      d.elevador = null;
    }
    if (d.status !== 'descartado') d.motivo_descarte = null;
    return d;
  }

  // ── Campos calculados e condicionais ──
  function atualizarTudo() {
    const d = coletar();
    const total = (d.aluguel || 0) + (d.condominio || 0) + (d.iptu || 0) + (d.taxa_lixo || 0) / 12;
    $('#total').innerHTML = `<span>Total mensal${d.taxa_lixo ? '<small>inclui lixo ÷ 12</small>' : ''}</span><b>${reais(total)}</b>`;
    const caro = (d.aluguel || 0) > LIMITE_ALUGUEL;
    el('aluguel').classList.toggle('alerta', caro);
    $('#total').classList.toggle('caro', caro);
    $('#alerta-caro').hidden = !caro;
    form.classList.toggle('eh-apto', grupoTipo(d.tipo) === 'apto');
    form.classList.toggle('eh-descarte', d.status === 'descartado');
    $$('#nota button').forEach((b) => {
      const ativo = Number(b.dataset.n) <= nota;
      b.classList.toggle('ativa', ativo);
      b.setAttribute('aria-checked', String(Number(b.dataset.n) === nota));
    });
    verificarDuplicados(d);
  }

  function verificarDuplicados(d) {
    const link = normalizarLink(d.link);
    const end = normalizarEndereco(d.endereco);
    const achados = [];
    for (const o of estado.imoveis) {
      if (o.id === id) continue;
      const motivos = [];
      if (link && normalizarLink(o.link) === link) motivos.push('mesmo link');
      if (end.length >= 8 && normalizarEndereco(o.endereco) === end) motivos.push('mesmo endereço');
      if (motivos.length) achados.push(`<a href="#/imovel/${o.id}">${esc(o.codigo)}</a> (${motivos.join(' e ')})`);
    }
    const box = $('#dup');
    box.hidden = !achados.length;
    box.innerHTML = achados.length ? `⚠️ Possível duplicado: ${achados.join(', ')}` : '';
  }

  // ── Rascunho automático ──
  let sujo = false;
  const salvarRascunho = debounce(() => {
    try {
      localStorage.setItem(chaveRascunho, JSON.stringify({ valores: coletar(), base: im?.atualizado_em || null, ts: Date.now() }));
    } catch {}
  }, 400);
  const mudou = () => {
    sujo = true;
    atualizarTudo();
    salvarRascunho();
  };
  form.addEventListener('input', mudou);
  form.addEventListener('change', mudou);
  VALORES.forEach((c) =>
    el(c).addEventListener('blur', () => {
      const n = lerDinheiro(el(c).value);
      if (n !== null) el(c).value = numBR(n);
    }),
  );
  window.addEventListener('pagehide', salvarRascunhoJa);
  function salvarRascunhoJa() {
    if (!sujo) return;
    try {
      localStorage.setItem(chaveRascunho, JSON.stringify({ valores: coletar(), base: im?.atualizado_em || null, ts: Date.now() }));
    } catch {}
  }

  $('#descartar-rascunho').onclick = async () => {
    const ok = await confirmar({
      titulo: 'Descartar rascunho?',
      texto: id ? 'A ficha volta a mostrar o que está salvo no servidor.' : 'O formulário fica em branco e as fotos ainda não enviadas deste cadastro são apagadas.',
      ok: 'Descartar',
      perigo: true,
    });
    if (!ok) return;
    localStorage.removeItem(chaveRascunho);
    sujo = false;
    if (!id) for (const it of (await listarFila()).filter((i) => !i.imovel_id)) await removerDaFila(it.uid);
    $('#aviso-rascunho').hidden = true;
    preencher(base);
    desenharGaleria();
  };

  // ── Nota ──
  $('#nota').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const n = Number(b.dataset.n);
    nota = nota === n ? 0 : n;
    mudou();
  });

  // ── Botões de abrir ──
  const abrir = (url) => window.open(url, '_blank', 'noopener');
  $('#abrir-link').onclick = () => (ehLink(el('link').value) ? abrir(el('link').value.trim()) : toast('Cole um link começando com https://', 'erro'));
  $('#abrir-whats').onclick = () => {
    const u = linkWhats(el('whatsapp').value);
    u ? abrir(u) : toast('Digite o número do WhatsApp.', 'erro');
  };
  $('#abrir-maps').onclick = () => {
    const l = el('maps_link').value.trim();
    if (ehLink(l)) return abrir(l);
    const e = el('endereco').value.trim();
    if (e) return abrir('https://maps.google.com/?q=' + encodeURIComponent(`${e}, ${el('bairro').value}, Aracruz - ES`));
    toast('Cole o link do Maps ou preencha o endereço.', 'erro');
  };
  $('#minha-loc').onclick = () => {
    if (!navigator.geolocation) return toast('Este aparelho não informa a localização.', 'erro');
    const btn = $('#minha-loc');
    btn.disabled = true;
    btn.textContent = 'Localizando…';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        el('maps_link').value = `https://maps.google.com/?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`;
        mudou();
        toast(`Localização registrada (precisão ~${Math.round(p.coords.accuracy)} m).`);
        btn.disabled = false;
        btn.textContent = '📍 Usar minha localização';
      },
      (err) => {
        toast(err.code === 1 ? 'Permita o acesso à localização nas configurações do navegador.' : 'Não consegui obter a localização. Tente ao ar livre.', 'erro');
        btn.disabled = false;
        btn.textContent = '📍 Usar minha localização';
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  // ── Fotos ──
  const urlsLocais = new Map();
  let itensGaleria = [];

  async function desenharGaleria() {
    const fila = (await listarFila()).filter((i) => (id ? i.imovel_id === id : !i.imovel_id));
    const doServidor = (im?.fotos || []).map((f) => ({ tipo: 'servidor', id: f.id, url: f.url, capa: f.id === im.capa_foto_id }));
    const pendentes = fila.map((i) => {
      if (!urlsLocais.has(i.uid)) urlsLocais.set(i.uid, URL.createObjectURL(i.blob));
      return { tipo: 'pendente', uid: i.uid, url: urlsLocais.get(i.uid), capa: false };
    });
    if (!doServidor.length && pendentes.length) pendentes[0].capa = true;
    itensGaleria = [...doServidor, ...pendentes];
    $('#galeria').innerHTML = itensGaleria
      .map(
        (f, i) => `<button type="button" class="miniatura" data-i="${i}" aria-label="Ver foto ${i + 1}">
          <img src="${esc(f.url)}" alt="" loading="lazy">
          ${f.capa ? '<span class="selo capa">Capa</span>' : ''}
          ${f.tipo === 'pendente' ? `<span class="selo pend">${id ? 'pendente' : 'envia ao salvar'}</span>` : ''}
        </button>`,
      )
      .join('');
    const nPend = pendentes.length;
    $('#status-fotos').textContent = itensGaleria.length
      ? `${itensGaleria.length} foto${itensGaleria.length > 1 ? 's' : ''}${nPend ? ` · ${nPend} aguardando envio` : ''} · toque para ampliar`
      : '';
  }

  $('#galeria').addEventListener('click', (e) => {
    const b = e.target.closest('.miniatura');
    if (b) abrirVisor(Number(b.dataset.i));
  });

  async function receberArquivos(lista) {
    const arquivos = [...lista].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    if (!arquivos.length) return;
    const st = $('#status-fotos');
    let feitas = 0;
    for (const f of arquivos) {
      st.textContent = `Preparando foto ${++feitas} de ${arquivos.length}…`;
      try {
        await enfileirar(await comprimir(f), id || null);
      } catch {
        toast('Uma das fotos não pôde ser lida.', 'erro');
      }
    }
    if (!id) {
      sujo = true;
      salvarRascunhoJa();
    }
    desenharGaleria();
  }
  ['#in-camera', '#in-galeria'].forEach((s) =>
    $(s).addEventListener('change', (e) => {
      receberArquivos(e.target.files);
      e.target.value = '';
    }),
  );

  function recalcularCapa() {
    const c = im.fotos.find((f) => f.id === im.capa_foto_id) || im.fotos[0];
    im.capa_foto_id = c?.id ?? null;
    im.capa_url = c?.url ?? null;
  }

  const aoEnviar = (e) => {
    if (!im || e.detail.imovel_id !== id) return;
    if (!im.fotos.some((f) => f.id === e.detail.foto.id)) im.fotos.push(e.detail.foto);
    const u = urlsLocais.get(e.detail.uid);
    if (u) URL.revokeObjectURL(u), urlsLocais.delete(e.detail.uid);
    recalcularCapa();
    substituirImovel(im);
    desenharGaleria();
  };
  const aoErro = (e) => toast('Foto recusada pelo servidor: ' + e.detail.msg, 'erro');
  const aoFila = () => desenharGaleria();
  window.addEventListener('foto-enviada', aoEnviar);
  window.addEventListener('foto-erro', aoErro);
  window.addEventListener('fila-fotos', aoFila);

  // ── Visualizador em tela cheia (deslizar) ──
  function abrirVisor(inicio) {
    const v = document.createElement('div');
    v.className = 'visor';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-label', 'Fotos');
    v.innerHTML = `
      <div class="visor-topo">
        <button type="button" class="icone claro" data-a="fechar" aria-label="Fechar">✕</button>
        <span class="visor-cont"></span>
        <span></span>
      </div>
      <div class="visor-trilho">${itensGaleria.map((f) => `<div class="visor-slide"><img src="${esc(f.url)}" alt=""></div>`).join('')}</div>
      <div class="visor-acoes">
        <button type="button" class="btn claro" data-a="capa">★ Marcar como capa</button>
        <button type="button" class="btn perigo" data-a="excluir">Excluir</button>
      </div>`;
    document.body.appendChild(v);
    document.body.classList.add('travado');
    const trilho = $('.visor-trilho', v);
    const atual = () => Math.round(trilho.scrollLeft / trilho.clientWidth);
    const atualizarVisor = () => {
      const i = Math.min(atual(), itensGaleria.length - 1);
      const f = itensGaleria[i];
      if (!f) return;
      $('.visor-cont', v).textContent = `${i + 1} / ${itensGaleria.length}`;
      const bc = $('[data-a="capa"]', v);
      bc.disabled = f.capa || f.tipo === 'pendente';
      bc.textContent = f.capa ? '★ É a capa' : f.tipo === 'pendente' ? 'Aguardando envio' : '★ Marcar como capa';
    };
    trilho.addEventListener('scroll', debounce(atualizarVisor, 60));
    requestAnimationFrame(() => {
      trilho.scrollLeft = inicio * trilho.clientWidth;
      atualizarVisor();
    });
    const fechar = () => {
      v.remove();
      document.body.classList.remove('travado');
      document.removeEventListener('keydown', tecla);
    };
    const tecla = (e) => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'ArrowRight') trilho.scrollBy({ left: trilho.clientWidth, behavior: 'smooth' });
      if (e.key === 'ArrowLeft') trilho.scrollBy({ left: -trilho.clientWidth, behavior: 'smooth' });
    };
    document.addEventListener('keydown', tecla);

    v.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'fechar') return fechar();
      const f = itensGaleria[atual()];
      if (!f) return;
      if (a === 'capa' && f.tipo === 'servidor') {
        try {
          im = (await api(`imoveis/${id}/capa`, { metodo: 'POST', corpo: { foto_id: f.id } })).imovel;
          substituirImovel(im);
          await desenharGaleria();
          atualizarVisor();
          toast('Capa definida.');
        } catch (err) {
          toast(err.status === 0 ? 'Sem conexão — tente de novo.' : err.message, 'erro');
        }
      }
      if (a === 'excluir') {
        const ok = await confirmar({ titulo: 'Excluir esta foto?', texto: 'Não dá para desfazer.', ok: 'Excluir', perigo: true });
        if (!ok) return;
        try {
          if (f.tipo === 'servidor') {
            await api(`fotos/${f.id}/excluir`, { metodo: 'POST' });
            im.fotos = im.fotos.filter((x) => x.id !== f.id);
            recalcularCapa();
            substituirImovel(im);
          } else {
            await removerDaFila(f.uid);
          }
          fechar();
          desenharGaleria();
          toast('Foto excluída.');
        } catch (err) {
          toast(err.status === 0 ? 'Sem conexão — tente de novo.' : err.message, 'erro');
        }
      }
    });
  }

  // ── Ditado (Web Speech API) ──
  let rec = null;
  let ouvindo = false;
  function acrescentar(txt) {
    txt = txt.trim();
    if (!txt) return;
    const ta = el('anotacoes');
    const atual = ta.value.replace(/\s+$/, '');
    const inicioFrase = !atual || /[.!?\n]$/.test(atual);
    if (inicioFrase) txt = txt.charAt(0).toUpperCase() + txt.slice(1);
    ta.value = atual + (atual ? (atual.endsWith('\n') ? '' : ' ') : '') + txt;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function pararDitado() {
    ouvindo = false;
    try {
      rec?.stop();
    } catch {}
    const b = $('#mic');
    if (b) {
      b.classList.remove('gravando');
      b.setAttribute('aria-pressed', 'false');
      b.textContent = '🎤 Ditar';
    }
    const p = $('#parcial');
    if (p) p.textContent = '';
  }
  if (SR) {
    $('#mic').onclick = () => {
      if (ouvindo) return pararDitado();
      rec = new SR();
      rec.lang = 'pt-BR';
      rec.interimResults = true;
      rec.continuous = false; // reinicia a cada frase: evita texto duplicado no Android
      rec.onresult = (e) => {
        let final = '';
        let parcial = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t;
          else parcial += t;
        }
        $('#parcial').textContent = parcial;
        if (final) acrescentar(final);
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          toast('Permita o uso do microfone para ditar.', 'erro');
          pararDitado();
        } else if (e.error === 'network') {
          toast('O ditado precisa de internet.', 'erro');
          pararDitado();
        }
      };
      rec.onend = () => {
        if (!ouvindo) return;
        try {
          rec.start();
        } catch {
          pararDitado();
        }
      };
      try {
        rec.start();
        ouvindo = true;
        const b = $('#mic');
        b.classList.add('gravando');
        b.setAttribute('aria-pressed', 'true');
        b.textContent = '⏹ Parar ditado';
      } catch {
        toast('Não consegui iniciar o microfone.', 'erro');
      }
    };
  }

  // ── Salvar ──
  $('#salvar').onclick = async () => {
    const d = coletar();
    for (const [c, nome] of [['link', 'Link do anúncio'], ['maps_link', 'Link do Maps']]) {
      if (d[c] && !ehLink(d[c])) {
        toast(`${nome}: precisa começar com https://`, 'erro');
        el(c).focus();
        return;
      }
    }
    const btn = $('#salvar');
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    try {
      const r = await api(id ? 'imoveis/' + id : 'imoveis', { metodo: 'POST', corpo: d });
      localStorage.removeItem(chaveRascunho);
      sujo = false;
      substituirImovel(r.imovel);
      if (!id) {
        vincularNovas(r.imovel.id);
        toast(`Salvo como ${r.imovel.codigo} ✓`, 'ok');
        location.replace('#/imovel/' + r.imovel.id);
        return;
      }
      im = r.imovel;
      $('#aviso-rascunho').hidden = true;
      toast('Salvo ✓', 'ok');
    } catch (e) {
      salvarRascunhoJa();
      toast(e.status === 0 ? 'Sem sinal. Está tudo guardado no aparelho — toque em Salvar quando a conexão voltar.' : e.message, 'erro');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar';
    }
  };

  // ── Excluir ──
  $('#excluir')?.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: `Excluir ${im.codigo}?`,
      texto: 'O imóvel e todas as fotos dele serão apagados. Não dá para desfazer. O código não será reutilizado.',
      ok: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api(`imoveis/${id}/excluir`, { metodo: 'POST' });
      localStorage.removeItem(chaveRascunho);
      for (const it of (await listarFila()).filter((i) => i.imovel_id === id)) await removerDaFila(it.uid);
      removerImovel(id);
      sujo = false;
      toast(`${im.codigo} excluído.`);
      location.hash = '#/';
    } catch (e) {
      toast(e.status === 0 ? 'Sem conexão — tente de novo.' : e.message, 'erro');
    }
  });

  preencher(valores);
  desenharGaleria();
  if (id) enviarPendentes();

  return () => {
    salvarRascunhoJa();
    pararDitado();
    window.removeEventListener('pagehide', salvarRascunhoJa);
    window.removeEventListener('foto-enviada', aoEnviar);
    window.removeEventListener('foto-erro', aoErro);
    window.removeEventListener('fila-fotos', aoFila);
    urlsLocais.forEach((u) => URL.revokeObjectURL(u));
    $('.visor')?.remove();
    document.body.classList.remove('travado');
  };
}
