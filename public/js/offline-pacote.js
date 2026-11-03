// O pacote do modo offline: tudo o que a página e os jogos de cartas pedem (a lista vem do
// /offline-lista, ver pagina.js), guardado no cache 'sala3d-offline'. O service worker (sw.js)
// entrega dali quando não há internet. Pequeno e sem three.js: o formulário de entrada usa.
//
// Atualizar não apaga nada antes da hora: baixa o que mudou, grava a página ('/') por último e só
// então tira o que saiu da lista. Se a internet cair no meio, a página velha continua com os
// módulos dela no cache.

export const CACHE_OFFLINE = 'sala3d-offline';
const MARCA = '/offline-pacote.json'; // a versão baixada, guardada como uma resposta neste endereço
const SIMULTANEOS = 6;
// endereços que nunca mudam de conteúdo (a versão está no endereço): já guardado, não baixa de novo
const FIXO = /[?&]v=|^\/vendor\/(three|socket\.io)@/;

const temCache = () => typeof caches !== 'undefined';

// a versão do pacote guardado no aparelho (null: não baixou)
export async function versaoBaixada() {
  if (!temCache()) return null;
  try {
    const c = await caches.open(CACHE_OFFLINE);
    const r = await c.match(MARCA);
    return r ? (await r.json()).versao || null : null;
  } catch {
    return null;
  }
}

// a versão que o servidor tem agora (null: sem internet)
export async function listaDoServidor() {
  try {
    const r = await fetch('/offline-lista', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// Baixa (ou atualiza) o pacote. aoProgredir(fração 0–1). Lança erro se a internet cair.
export async function baixarPacote(aoProgredir = () => {}, lista = null) {
  if (!temCache()) throw new Error('Este navegador não guarda arquivos para usar offline.');
  lista ||= await listaDoServidor();
  if (!lista?.urls?.length) throw new Error('Sem internet para baixar agora.');
  // pede para o navegador não apagar o pacote quando faltar espaço (Android com o app instalado aceita)
  navigator.storage?.persist?.().catch(() => {});
  const cache = await caches.open(CACHE_OFFLINE);
  const chave = (r) => {
    const u = new URL(r.url);
    return u.pathname + u.search;
  };
  const tenho = new Set((await cache.keys()).map(chave));
  const quer = lista.urls;
  const fila = quer.filter((u) => u !== '/' && !(FIXO.test(u) && tenho.has(u)));
  const total = fila.length + 1;
  let feitos = 0;
  const um = async (u) => {
    // no-cache: confere com o servidor (304 se nada mudou), sem pegar uma cópia velha do navegador
    const r = await fetch(u, { cache: 'no-cache', credentials: 'same-origin' });
    if (!r.ok) throw new Error(`${u}: ${r.status}`);
    await cache.put(u, r);
    aoProgredir(++feitos / total);
  };
  let i = 0;
  const trabalhador = async () => {
    while (i < fila.length) await um(fila[i++]);
  };
  await Promise.all(Array.from({ length: SIMULTANEOS }, trabalhador));
  await um('/'); // por último: a página nova só entra com tudo dela já guardado
  const lista2 = new Set(quer);
  for (const r of await cache.keys()) {
    const k = chave(r);
    if (k !== MARCA && !lista2.has(k)) await cache.delete(r);
  }
  await cache.put(MARCA, new Response(JSON.stringify({ versao: lista.versao, em: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
  aoProgredir(1);
  return lista.versao;
}

export async function apagarPacote() {
  if (temCache()) await caches.delete(CACHE_OFFLINE).catch(() => {});
}
