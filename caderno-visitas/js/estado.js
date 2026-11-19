// Estado compartilhado: lista de imóveis (com cópia no aparelho para uso sem sinal).
import { api } from './api.js';

const CHAVE_CACHE = 'cv-cache-imoveis';

export const estado = {
  imoveis: lerCache(),
  carregado: false,
  offline: false,
};

function lerCache() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CACHE)) || [];
  } catch {
    return [];
  }
}

export function guardarCache() {
  try {
    localStorage.setItem(CHAVE_CACHE, JSON.stringify(estado.imoveis));
  } catch {
    /* armazenamento cheio ou bloqueado */
  }
}

export async function carregarImoveis() {
  try {
    const r = await api('imoveis');
    estado.imoveis = r.imoveis;
    estado.carregado = true;
    estado.offline = false;
    guardarCache();
  } catch (e) {
    if (e.status === 0) estado.offline = true;
    else throw e;
  }
  return estado.imoveis;
}

export function substituirImovel(im) {
  const i = estado.imoveis.findIndex((x) => x.id === im.id);
  if (i >= 0) estado.imoveis[i] = im;
  else estado.imoveis.push(im);
  guardarCache();
}

export function removerImovel(id) {
  estado.imoveis = estado.imoveis.filter((x) => x.id !== id);
  guardarCache();
}
