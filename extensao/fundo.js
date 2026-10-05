// Fundo da extensão: recebe os cliques/teclas que os amigos fazem na tela 3D e os repete na aba
// compartilhada, pelo protocolo de depuração do Chrome (chrome.debugger). Enquanto isso o Chrome
// mostra a barra amarela "começou a depurar este navegador" — fechar a barra corta o controle.
//
// Segurança: só os sites que você liberou no ícone da extensão podem pedir controle, e nunca da
// própria aba da sala.

const anexadas = new Map(); // aba -> { sala, vp: { w, h }, medido }
const ultimoToque = new Map(); // aba -> quando chegou o último clique/Enter de quem controla

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
  if ((ev.t === 'mouse' && ev.a === 'down') || (ev.t === 'tecla' && ev.a === 'down' && ev.key === 'Enter')) ultimoToque.set(aba, Date.now());
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

// ------------------------------------------------------------------ abas compartilhadas
// A sala avisa quais abas está compartilhando (pedido "abas"). Fica no storage.session porque o
// service worker dorme e esquece o que está só na memória.
async function compartilhadas() {
  const { compartilhadas: mapa = {} } = await chrome.storage.session.get('compartilhadas');
  return mapa; // { [aba]: aba da sala }
}

const siteDe = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
};

// conta para a sala em que página a aba está (só o domínio e o título)
function contarPagina(t, sala) {
  chrome.tabs.sendMessage(sala, { tipo: 'aba-mudou', aba: t.id, site: siteDe(t.url || ''), titulo: t.title || '' }).catch(() => {});
}

async function registrarAbas(sala, abas) {
  const mapa = await compartilhadas();
  for (const [aba, s] of Object.entries(mapa)) if (s === sala) delete mapa[aba];
  const novas = abas.filter((a) => Number.isInteger(a) && a !== sala);
  for (const aba of novas) mapa[aba] = sala;
  await chrome.storage.session.set({ compartilhadas: mapa });
  for (const aba of novas) chrome.tabs.get(aba).then((t) => contarPagina(t, sala), () => {});
}

chrome.tabs.onUpdated.addListener(async (aba, mudou, t) => {
  if (!('url' in mudou) && !('title' in mudou)) return;
  const sala = (await compartilhadas())[aba];
  if (sala != null) contarPagina(t, sala);
});

// barra de navegação de quem controla
async function navegar(aba, ev) {
  if (ev.a === 'voltar') return chrome.tabs.goBack(aba).catch(() => {}); // sem histórico: nada
  if (ev.a === 'avancar') return chrome.tabs.goForward(aba).catch(() => {});
  if (ev.a === 'recarregar') return chrome.tabs.reload(aba);
  if (ev.a === 'abrir' && siteDe(String(ev.url || ''))) return chrome.tabs.update(aba, { url: String(ev.url) });
}

// Qual aba estava na frente em cada janela, e qual estava antes dela: depois de fechar a aba que
// um link abriu, a pessoa volta para onde estava (e não para a aba compartilhada).
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const { ativas = {} } = await chrome.storage.session.get('ativas');
  const j = ativas[windowId] || {};
  if (j.atual === tabId) return;
  ativas[windowId] = { atual: tabId, anterior: j.atual ?? null };
  await chrome.storage.session.set({ ativas });
});

// endereço da aba nova (às vezes ela nasce em branco e só depois ganha o endereço)
function primeiroEndereco(aba) {
  return new Promise((resolve) => {
    const fim = (url) => {
      chrome.tabs.onUpdated.removeListener(ouvir);
      clearTimeout(limite);
      resolve(url);
    };
    const ouvir = (id, mudou) => {
      if (id === aba && siteDe(mudou.url || '')) fim(mudou.url);
    };
    const limite = setTimeout(() => fim(null), 3000);
    chrome.tabs.onUpdated.addListener(ouvir);
  });
}

// Link que abre aba nova a partir da aba compartilhada: quem está vendo não enxergaria a aba nova,
// porque o compartilhamento é só daquela aba. Então o endereço abre na própria aba compartilhada
// e a nova fecha — como numa janela. Ficam como sempre: aba aberta em segundo plano pelo dono
// (Ctrl+clique, botão do meio), janela nova (Shift+clique) e janelinha (login com Google,
// pagamento), que precisam ser separadas.
chrome.tabs.onCreated.addListener(async (nova) => {
  const origem = nova.openerTabId;
  if (origem == null) return;
  if ((await compartilhadas())[origem] == null) return;
  const deQuemControla = Date.now() - (ultimoToque.get(origem) || 0) < 1500;
  if (!nova.active && !deQuemControla) return;
  const dona = await chrome.tabs.get(origem).catch(() => null);
  if (!dona || dona.windowId !== nova.windowId) return;
  const pronto = nova.pendingUrl || nova.url || '';
  const url = siteDe(pronto) ? pronto : await primeiroEndereco(nova.id);
  if (!url) return;
  // quem estava na frente antes da aba nova aparecer
  const { ativas = {} } = await chrome.storage.session.get('ativas');
  const j = ativas[nova.windowId] || {};
  const voltarPara = j.atual === nova.id ? j.anterior : j.atual;
  await chrome.tabs.update(origem, { url });
  await chrome.tabs.remove(nova.id).catch(() => {});
  if (nova.active && voltarPara != null && voltarPara !== nova.id) chrome.tabs.update(voltarPara, { active: true }).catch(() => {});
});

// ------------------------------------------------------------------ janelas e telas
// O Chrome só deixa a extensão clicar em ABAS. Para janela ou tela inteira ela passa os eventos ao
// ajudante nativo (pasta nativo/, instalado pelo instalar.bat), que mexe no mouse e no teclado
// de verdade, sempre dentro da janela/tela compartilhada.
const NATIVO = 'com.sala3d.controle';
let nativo = null; // { porta, pronto: Promise<boolean>, alvo, sala }

function conectarNativo() {
  if (nativo) return nativo;
  let porta;
  try {
    porta = chrome.runtime.connectNative(NATIVO);
  } catch {
    return null;
  }
  let avisarPronto;
  const n = { porta, alvo: null, sala: null, pronto: new Promise((r) => { avisarPronto = r; }) };
  setTimeout(() => avisarPronto(false), 5000); // compilar o ajudante leva 1-2 s na primeira vez
  porta.onMessage.addListener((m) => {
    if (m?.tipo === 'oi') avisarPronto(true);
    // Ctrl+Alt+End no teclado de quem compartilha: avisa a sala para desligar a permissão
    if (m?.tipo === 'parado' && n.sala != null) chrome.tabs.sendMessage(n.sala, { tipo: 'desligou', janela: true }).catch(() => {});
  });
  porta.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // "host não encontrado" quando o ajudante não foi instalado
    avisarPronto(false);
    if (nativo === n) nativo = null;
  });
  nativo = n;
  return n;
}

async function nativoPronto() {
  const n = conectarNativo();
  return !!n && (await n.pronto) && nativo === n;
}

// alvo = { superficie: 'window'|'monitor', rotulo } — o rótulo do vídeo capturado
async function janela(alvo, ev, sala) {
  if (!(await nativoPronto())) return { erro: 'ajudante-ausente' };
  const rotulo = String(alvo?.rotulo || '').slice(0, 300);
  if (!rotulo) return { erro: 'alvo-invalido' };
  nativo.sala = sala;
  if (nativo.alvo !== rotulo) {
    nativo.porta.postMessage({ tipo: 'alvo', rotulo, superficie: alvo.superficie === 'monitor' ? 'monitor' : 'window' });
    nativo.alvo = rotulo;
  }
  if (ev) nativo.porta.postMessage({ tipo: 'entrada', ev });
  return { ok: true };
}

async function tratar(m, sender) {
  if (m.tipo === 'meu-id') return { aba: sender.tab?.id };
  // não abre o ajudante aqui: ele só sobe quando alguém liga o controle de uma janela
  if (m.tipo === 'status') return { liberado: await liberado(sender.url) };
  if (!sender.tab || !(await liberado(sender.url))) return { erro: 'site-nao-liberado' };
  if (m.tipo === 'abas') {
    await registrarAbas(sender.tab.id, Array.isArray(m.abas) ? m.abas.map(Number) : []);
    return { ok: true };
  }
  if (m.tipo === 'janela') return janela(m.alvo, m.ev && typeof m.ev === 'object' ? m.ev : null, sender.tab.id);
  // quem compartilha ligou "permitir controle" (de novo): destrava depois de um Ctrl+Alt+End
  if (m.tipo === 'janela-retomar') {
    if (!(await nativoPronto())) return { erro: 'ajudante-ausente' };
    nativo.porta.postMessage({ tipo: 'retomar' });
    return { ok: true };
  }
  if (m.tipo === 'janela-soltar') {
    if (nativo) {
      nativo.porta.postMessage({ tipo: 'soltar' });
      nativo.alvo = null;
    }
    return { ok: true };
  }
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
    if (m.ev.t === 'nav') {
      await navegar(aba, m.ev);
      return { ok: true };
    }
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
chrome.tabs.onRemoved.addListener(async (aba) => {
  anexadas.delete(aba);
  ultimoToque.delete(aba);
  // fechou a aba compartilhada ou a da sala: esquece as duas pontas
  const mapa = await compartilhadas();
  let mudou = false;
  for (const [a, s] of Object.entries(mapa)) {
    if (Number(a) === aba || s === aba) {
      delete mapa[a];
      mudou = true;
    }
  }
  if (mudou) await chrome.storage.session.set({ compartilhadas: mapa });
});

// Acabou de instalar: as abas que já estavam abertas não têm o script ainda. Injeta nelas,
// para não precisar recarregar tudo antes de compartilhar.
chrome.runtime.onInstalled.addListener(async () => {
  for (const t of await chrome.tabs.query({})) {
    if (!/^https?:/.test(t.url || '')) continue;
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['conteudo.js'] }).catch(() => {});
  }
});
