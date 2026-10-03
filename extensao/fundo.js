// Fundo da extensão: recebe os cliques/teclas que os amigos fazem na tela 3D e os repete na aba
// compartilhada, pelo protocolo de depuração do Chrome (chrome.debugger). Enquanto isso o Chrome
// mostra a barra amarela "começou a depurar este navegador" — fechar a barra corta o controle.
//
// Segurança: só os sites que você liberou no ícone da extensão podem pedir controle, e nunca da
// própria aba da sala.

const anexadas = new Map(); // aba -> { sala, vp: { w, h }, medido }

async function sitesLiberados() {
  const { sites = [] } = await chrome.storage.local.get('sites');
  return sites;
}
async function liberado(url) {
  try {
    return (await sitesLiberados()).includes(new URL(url).origin);
  } catch {
    return false;
  }
}

const cdp = (aba, metodo, params = {}) => chrome.debugger.sendCommand({ tabId: aba }, metodo, params);

async function anexar(aba, sala) {
  if (anexadas.has(aba)) return anexadas.get(aba);
  try {
    await chrome.debugger.attach({ tabId: aba }, '1.3');
  } catch (err) {
    // o service worker dormiu e esqueceu, mas continua anexado: confere mandando um comando
    if (!/already attached/i.test(String(err?.message))) throw err;
    await cdp(aba, 'Runtime.evaluate', { expression: '1' });
  }
  // a aba compartilhada quase nunca é a que está na frente: finge que ela tem o foco,
  // senão campo de texto não recebe o que é digitado
  await cdp(aba, 'Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const info = { sala, vp: { w: 1280, h: 720 }, medido: 0 };
  anexadas.set(aba, info);
  await medir(aba);
  return info;
}

async function medir(aba) {
  const info = anexadas.get(aba);
  if (!info) return;
  const m = await cdp(aba, 'Page.getLayoutMetrics');
  const v = m.cssVisualViewport || m.cssLayoutViewport || m.layoutViewport;
  info.vp = { w: v.clientWidth, h: v.clientHeight };
  info.medido = Date.now();
}

async function soltar(aba) {
  if (!anexadas.has(aba)) return;
  anexadas.delete(aba);
  await chrome.debugger.detach({ tabId: aba }).catch(() => {});
}

const BOTAO = { left: 'left', right: 'right', middle: 'middle' };
const BOTOES = { left: 1, right: 2, middle: 4 };
const num = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));

async function despachar(aba, ev) {
  const info = anexadas.get(aba);
  const modifiers = num(ev.mod, 0, 15) | 0;
  if (ev.t === 'mouse' || ev.t === 'wheel') {
    if (ev.a === 'down' || Date.now() - info.medido > 2000) await medir(aba);
    const x = num(ev.x, 0, 1) * info.vp.w;
    const y = num(ev.y, 0, 1) * info.vp.h;
    if (ev.t === 'wheel') {
      return cdp(aba, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: num(ev.dx, -3000, 3000), deltaY: num(ev.dy, -3000, 3000), modifiers });
    }
    const type = { down: 'mousePressed', up: 'mouseReleased', move: 'mouseMoved' }[ev.a];
    if (!type) return;
    const button = ev.a === 'move' ? (ev.arrastando ? BOTAO[ev.b] || 'left' : 'none') : BOTAO[ev.b] || 'left';
    return cdp(aba, 'Input.dispatchMouseEvent', {
      type, x, y, button, modifiers,
      buttons: ev.a === 'up' ? 0 : ev.a === 'down' || ev.arrastando ? BOTOES[ev.b] || 1 : 0,
      clickCount: ev.a === 'move' ? 0 : num(ev.n, 1, 3),
    });
  }
  if (ev.t === 'tecla') {
    const key = String(ev.key || '').slice(0, 24);
    const code = String(ev.code || '').slice(0, 24);
    const windowsVirtualKeyCode = num(ev.kc, 0, 255) | 0;
    const imprimivel = key.length === 1 && !(modifiers & (2 | 4)); // Ctrl/Cmd + letra é atalho
    if (ev.a === 'up') return cdp(aba, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
    const texto = imprimivel ? key : key === 'Enter' ? '\r' : '';
    return cdp(aba, 'Input.dispatchKeyEvent', {
      type: texto ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode, modifiers,
      text: texto || undefined, unmodifiedText: texto || undefined,
    });
  }
  if (ev.t === 'texto') return cdp(aba, 'Input.insertText', { text: String(ev.s || '').slice(0, 2000) });
}

async function tratar(m, sender) {
  if (m.tipo === 'meu-id') return { aba: sender.tab?.id };
  if (m.tipo === 'status') return { liberado: await liberado(sender.url) };
  if (!sender.tab || !(await liberado(sender.url))) return { erro: 'site-nao-liberado' };
  const aba = Number(m.aba);
  if (!Number.isInteger(aba) || aba === sender.tab.id) return { erro: 'aba-invalida' };
  if (m.tipo === 'soltar') {
    await soltar(aba);
    return { ok: true };
  }
  if (m.tipo === 'aba-info') {
    const t = await chrome.tabs.get(aba).catch(() => null);
    return t ? { titulo: t.title, controlando: anexadas.has(aba) } : { erro: 'aba-fechada' };
  }
  if (m.tipo === 'entrada' && m.ev && typeof m.ev === 'object') {
    await anexar(aba, sender.tab.id);
    await despachar(aba, m.ev);
    return { ok: true };
  }
  return { erro: 'pedido-invalido' };
}

chrome.runtime.onMessage.addListener((m, sender, responder) => {
  tratar(m || {}, sender).then(responder, (err) => responder({ erro: String(err?.message || err) }));
  return true; // resposta assíncrona
});

// fechou a barra amarela, fechou a aba, abriu o DevTools nela...: avisa a sala
chrome.debugger.onDetach.addListener(({ tabId }, motivo) => {
  const info = anexadas.get(tabId);
  anexadas.delete(tabId);
  if (info) chrome.tabs.sendMessage(info.sala, { tipo: 'desligou', aba: tabId, motivo }).catch(() => {});
});
chrome.tabs.onRemoved.addListener((aba) => anexadas.delete(aba));

// Acabou de instalar: as abas que já estavam abertas não têm o script ainda. Injeta nelas,
// para não precisar recarregar tudo antes de compartilhar.
chrome.runtime.onInstalled.addListener(async () => {
  for (const t of await chrome.tabs.query({})) {
    if (!/^https?:/.test(t.url || '')) continue;
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['conteudo.js'] }).catch(() => {});
  }
});
