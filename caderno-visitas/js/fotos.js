// Fotos: compressão no aparelho e fila offline (IndexedDB) com reenvio automático.
import { api } from './api.js';
import { uid } from './util.js';

const LADO_MAX = 1600;
const QUALIDADE = 0.8;

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

/** Coloca a foto na fila. imovelId null = imóvel novo ainda não salvo. */
export async function enfileirar(blob, imovelId) {
  const item = { uid: uid(), imovel_id: imovelId, blob, criado: Date.now() };
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
        const form = new FormData();
        form.append('uid', it.uid);
        form.append('foto', it.blob, 'foto.jpg');
        try {
          const r = await api(`imoveis/${it.imovel_id}/fotos`, { metodo: 'POST', form });
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
