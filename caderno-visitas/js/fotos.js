// Fotos e vídeos: compressão das fotos no aparelho, fila offline (IndexedDB) com reenvio
// automático. Vídeos sobem em partes de 2 MB e retomam de onde pararam.
import { api } from './api.js';
import { uid } from './util.js';

const LADO_MAX = 1600;
const QUALIDADE = 0.8;
export const PARTE_VIDEO = 2 * 1024 * 1024;
export const VIDEO_MAX = 300 * 1024 * 1024;
export const progressoVideo = new Map(); // uid -> 0..100

/** Redimensiona para o lado maior com 1600 px e gera JPEG 0,8. */
export async function comprimir(arquivo) {
  let fonte, w, h;
  try {
    fonte = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    w = fonte.width;
    h = fonte.height;
  } catch {
    fonte = await new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => falha(new Error('Imagem ilegível'));
      img.src = URL.createObjectURL(arquivo);
    });
    w = fonte.naturalWidth;
    h = fonte.naturalHeight;
  }
  const esc = Math.min(1, LADO_MAX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * esc);
  canvas.height = Math.round(h * esc);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  if (fonte.close) fonte.close();
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE));
  if (!blob) throw new Error('Falha ao comprimir a foto');
  return blob;
}

// ── IndexedDB ──
let dbPromessa;
function abrir() {
  dbPromessa ??= new Promise((ok, falha) => {
    const req = indexedDB.open('caderno-visitas', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('fila', { keyPath: 'uid' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
  return dbPromessa;
}
async function tx(modo, fn) {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const t = db.transaction('fila', modo);
    const r = fn(t.objectStore('fila'));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => falha(t.error);
  });
}
export const listarFila = () => tx('readonly', (s) => s.getAll());
const gravar = (item) => tx('readwrite', (s) => s.put(item));
export const removerDaFila = (id) => tx('readwrite', (s) => s.delete(id));

const avisar = () => window.dispatchEvent(new CustomEvent('fila-fotos'));

/** Coloca foto ou vídeo na fila. imovelId null = imóvel novo ainda não salvo. */
export async function enfileirar(blob, imovelId, tipo = 'foto') {
  const item = { uid: uid(), imovel_id: imovelId, blob, tipo, parte: 0, criado: Date.now() };
  await gravar(item);
  avisar();
  if (imovelId) enviarPendentes();
  return item;
}

/** Depois que o imóvel novo é salvo, as fotos dele ganham o id e seguem. */
export async function vincularNovas(imovelId) {
  const novas = (await listarFila()).filter((i) => !i.imovel_id);
  await tx('readwrite', (s) => novas.forEach((it) => s.put({ ...it, imovel_id: imovelId })));
  avisar();
  if (enviando) await enviando.catch(() => {});
  return enviarPendentes();
}

async function enviarFoto(it) {
  const form = new FormData();
  form.append('uid', it.uid);
  form.append('foto', it.blob, 'foto.jpg');
  return api(`imoveis/${it.imovel_id}/fotos`, { metodo: 'POST', form });
}

async function enviarVideo(it) {
  const total = Math.max(1, Math.ceil(it.blob.size / PARTE_VIDEO));
  let parte = it.parte || 0;
  while (true) {
    const form = new FormData();
    form.append('uid', it.uid);
    form.append('parte', parte);
    form.append('total', total);
    form.append('arquivo', it.blob.slice(parte * PARTE_VIDEO, (parte + 1) * PARTE_VIDEO), 'parte.bin');
    let r;
    try {
      r = await api(`imoveis/${it.imovel_id}/video`, { metodo: 'POST', form });
    } catch (e) {
      if (e.status === 409 && Number.isInteger(e.dados?.proxima)) {
        parte = e.dados.proxima; // servidor diz onde parou
        continue;
      }
      throw e;
    }
    if (r.pronto) {
      progressoVideo.delete(it.uid);
      return r;
    }
    parte = r.proxima;
    // Guarda o avanço: se o sinal cair, recomeça desta parte.
    await tx('readwrite', (s) => s.put({ ...it, parte }));
    progressoVideo.set(it.uid, Math.round((parte / total) * 100));
    avisar();
  }
}

let enviando = null;
export function enviarPendentes() {
  enviando ??= (async () => {
    const tentadas = new Set();
    let semSinal = false;
    try {
      // Relê a fila a cada volta: fotos podem ter entrado (ou sido vinculadas) durante o envio.
      while (!semSinal) {
        const it = (await listarFila())
          .filter((i) => i.imovel_id && !tentadas.has(i.uid))
          .sort((a, b) => a.criado - b.criado)[0];
        if (!it) break;
        tentadas.add(it.uid);
        try {
          const r = it.tipo === 'video' ? await enviarVideo(it) : await enviarFoto(it);
          await removerDaFila(it.uid);
          window.dispatchEvent(new CustomEvent('foto-enviada', { detail: { imovel_id: it.imovel_id, uid: it.uid, foto: r.foto } }));
        } catch (e) {
          if (e.status === 0 || e.status >= 500 || e.status === 401) {
            semSinal = true; // tenta de novo quando a conexão voltar
            break;
          }
          // Erro definitivo (imóvel excluído, arquivo inválido): descarta.
          await removerDaFila(it.uid);
          window.dispatchEvent(new CustomEvent('foto-erro', { detail: { uid: it.uid, msg: e.message } }));
        }
        avisar();
      }
    } finally {
      enviando = null;
      avisar();
    }
  })();
  return enviando;
}

window.addEventListener('online', () => enviarPendentes());
setInterval(async () => {
  if ((await listarFila()).some((i) => i.imovel_id)) enviarPendentes();
}, 30000);
