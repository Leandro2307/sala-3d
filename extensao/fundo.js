// Fundo da extensão: recebe os cliques/teclas que os amigos fazem na tela 3D e os repete na aba
// compartilhada, pelo protocolo de depuração do Chrome (chrome.debugger). Enquanto isso o Chrome
// mostra a barra amarela "começou a depurar este navegador" — fechar a barra corta o controle.
//
// Segurança: só os sites que você liberou no ícone da extensão podem pedir controle, e nunca da
// própria aba da sala.

const anexadas = new Map(); // aba -> { sala, vp: { w, h }, medido, medindo, dialogo }
const ultimoToque = new Map(); // aba -> quando chegou o último clique/Enter de quem controla
const avisarSala = (sala, m) => chrome.tabs.sendMessage(sala, m).catch(() => {});

// ------------------------------------------------------------------ estado da sessão
// O que precisa sobreviver ao service worker dormir fica no storage.session, com uma cópia aqui na
// memória: antes, cada aba atualizada e cada quadro aberto, no Chrome inteiro, lia o storage.
// - compartilhadas: { [aba]: aba da sala } — as abas que a sala está mostrando;
// - abasSala: as abas da Sala 3D liberada (é nelas que os sites das telas abrem);
// - salaAba: a sala liberada mais recente (para onde vão as abas do Alt+Shift+S);
// - ativas: { [janela]: { atual, anterior } } — a aba da frente em cada janela, e a de antes.
// Quem muda alguma coisa muda o objeto da sessão logo depois de lê-lo e grava: nada se perde
// entre duas mudanças ao mesmo tempo. A gravação espera a primeira leitura (feita quando o
// service worker acorda): senão a cópia velha do storage chegava depois e apagava a mudança.
const sessao = { compartilhadas: {}, abasSala: [], salaAba: null, ativas: {} };
const sessaoLida = chrome.storage.session.get(Object.keys(sessao)).then((r) => Object.assign(sessao, r), () => {});
async function lerSessao() {
  await sessaoLida;
  return sessao;
}
async function gravarSessao(mudou) {
  await sessaoLida;
  Object.assign(sessao, mudou);
  await chrome.storage.session.set(mudou).catch(() => {});
}

// Fica na memória: ler o storage a cada movimento do mouse atrasava todos eles. O popup grava
// a lista e o onChanged atualiza aqui.
let sitesCache = null; // Promise da lista (a rajada que chega antes da primeira leitura espera a mesma)
chrome.storage.onChanged.addListener((mudou, area) => {
  if (area === 'local' && mudou.sites) sitesCache = Promise.resolve(mudou.sites.newValue || []);
});
function sitesLiberados() {
  sitesCache ||= chrome.storage.local.get('sites').then((r) => r.sites || [], () => { sitesCache = null; return []; });
  return sitesCache;
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
  const ja = anexadas.get(aba);
  if (ja) {
    ja.sala = sala;
    return ja;
  }
  try {
    await chrome.debugger.attach({ tabId: aba }, '1.3');
  } catch (err) {
    // o service worker dormiu e esqueceu, mas continua anexado: confere mandando um comando
    if (!/already attached/i.test(String(err?.message))) throw err;
    await cdp(aba, 'Runtime.evaluate', { expression: '1' });
  }
  const info = { sala, vp: { w: 1280, h: 720 }, medido: 0, medindo: false, dialogo: null };
  anexadas.set(aba, info);
  await Promise.all([
    // a aba compartilhada quase nunca é a que está na frente: finge que ela tem o foco,
    // senão campo de texto não recebe o que é digitado
    cdp(aba, 'Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}),
    // os avisos do site (alert, confirm...) chegam como eventos: ver "avisos do site"
    cdp(aba, 'Page.enable').catch(() => {}),
    medir(aba).catch(() => {}),
  ]);
  listasNaPagina(aba, true);
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

// Movimento e roda não esperam medir a página (era uma ida à aba antes de cada um): a medida
// se renova por trás, no máximo uma vez por segundo.
function remedir(aba, info) {
  if (info.medindo || Date.now() - info.medido < 1000) return;
  info.medindo = true;
  medir(aba).catch(() => {}).finally(() => { info.medindo = false; });
}

// Uma fila por aba: cada evento chega numa mensagem separada e cada um espera coisas diferentes
// (ligar o depurador, medir a página). Sem a fila, um "soltar" podia passar na frente do
// "apertar" e o clique se perdia. Movimento que ficou para trás de outro mais novo é pulado:
// todo clique, soltura e giro leva a própria posição, então só o último movimento importa.
const filas = new Map(); // aba -> Promise do último evento
const movimentoMaisNovo = new Map(); // aba -> número do último movimento que entrou na fila
let numMovimento = 0;
function enfileirar(aba, ev, tarefa) {
  const n = ev.t === 'mouse' && ev.a === 'move' ? ++numMovimento : 0;
  if (n) movimentoMaisNovo.set(aba, n);
  const rodar = () => (n && movimentoMaisNovo.get(aba) !== n ? null : tarefa());
  const vez = (filas.get(aba) || Promise.resolve()).then(rodar, rodar);
  filas.set(aba, vez.catch(() => {}));
  return vez;
}

// A faixa "começou a depurar este navegador" fica enquanto a extensão está ligada na aba. Sem
// ninguém mexendo por SOLTAR_MS, desliga sozinha (a faixa some); o próximo clique liga de novo.
// Um minuto: com 15 s a faixa ia e voltava enquanto a pessoa lia a página — e cada vez que ela
// aparece ou some, a página muda de altura e o vídeo da aba pula.
const SOLTAR_MS = 60_000;
const timersSoltar = new Map();
function agendarSoltura(aba) {
  clearTimeout(timersSoltar.get(aba));
  timersSoltar.set(aba, setTimeout(() => {
    timersSoltar.delete(aba);
    // um aviso do site esperando resposta segura o depurador (é por ele que a resposta vai)
    if (anexadas.get(aba)?.dialogo) return agendarSoltura(aba);
    soltar(aba);
  }, SOLTAR_MS));
}

// Rolagem suave. Despachado de uma vez, cada clique da roda (100 px) fazia a página pular 100 px
// num quadro só e ficar parada até o próximo: dentro da sala parecia travando (medido num vídeo:
// 8 a 13 quadros diferentes por segundo, contra 30 a 60 rolando a aba direto no Chrome, que
// anima esses pulos). Aqui também: o giro entra num "falta rolar" que sai em pedaços, um a cada
// quadro, começando rápido e desacelerando (~160 ms por clique). Giro novo no meio só soma.
const rolagens = new Map(); // aba -> { x, y, dx, dy, mod, rodando }
const QUADRO_MS = 16;
const pedaco = (v) => (Math.abs(v) <= 4 ? v : v * 0.22 + Math.sign(v) * 2);

function rolar(aba, x, y, dx, dy, mod) {
  let r = rolagens.get(aba);
  if (!r) rolagens.set(aba, (r = { dx: 0, dy: 0, rodando: false }));
  Object.assign(r, { x, y, mod });
  r.dx += dx;
  r.dy += dy;
  if (!r.rodando) animarRolagem(aba, r);
}

async function animarRolagem(aba, r) {
  r.rodando = true;
  try {
    while (anexadas.has(aba) && (Math.abs(r.dx) >= 0.5 || Math.abs(r.dy) >= 0.5)) {
      const inicio = Date.now();
      const px = pedaco(r.dx);
      const py = pedaco(r.dy);
      r.dx -= px;
      r.dy -= py;
      await cdp(aba, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.x, y: r.y, deltaX: px, deltaY: py, modifiers: r.mod });
      const falta = QUADRO_MS - (Date.now() - inicio);
      if (falta > 0) await new Promise((ok) => setTimeout(ok, falta));
    }
  } catch { /* aba fechou ou o controle foi solto */ } finally {
    r.dx = 0;
    r.dy = 0;
    r.rodando = false;
  }
}

async function soltar(aba) {
  if (!anexadas.has(aba)) return;
  anexadas.delete(aba);
  clearTimeout(timersSoltar.get(aba));
  timersSoltar.delete(aba);
  listasNaPagina(aba, false);
  await chrome.debugger.detach({ tabId: aba }).catch(() => {});
}

// Controle cortado (a barra amarela fechada, ou "Cortar o controle" no ícone): os eventos que já
// estavam a caminho não ligam o depurador de novo — senão a barra voltava logo depois de fechada.
// Até a sala desligar a permissão, que é questão de instantes.
const bloqueadas = new Map(); // aba -> até quando
const bloquear = (aba) => bloqueadas.set(aba, Date.now() + 3000);
const bloqueada = (aba) => (bloqueadas.get(aba) || 0) > Date.now();

const BOTAO = { left: 'left', right: 'right', middle: 'middle' };
const BOTOES = { left: 1, right: 2, middle: 4 };
const num = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));

async function despachar(aba, ev) {
  const info = anexadas.get(aba);
  const modifiers = num(ev.mod, 0, 15) | 0;
  if ((ev.t === 'mouse' && ev.a === 'down') || (ev.t === 'tecla' && ev.a === 'down' && ev.key === 'Enter')) ultimoToque.set(aba, Date.now());
  if (ev.t === 'mouse' || ev.t === 'wheel') {
    // o clique mede antes (a faixa amarela do depurador pode ter acabado de mudar a altura)
    if (ev.a === 'down') await medir(aba).catch(() => {});
    else remedir(aba, info);
    const x = num(ev.x, 0, 1) * info.vp.w;
    const y = num(ev.y, 0, 1) * info.vp.h;
    if (ev.t === 'wheel') {
      const dx = num(ev.dx, -3000, 3000);
      const dy = num(ev.dy, -3000, 3000);
      // Ctrl + roda é zoom: esse vai de uma vez
      if (modifiers & 2) return cdp(aba, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx, deltaY: dy, modifiers });
      return rolar(aba, x, y, dx, dy, modifiers);
    }
    const type = { down: 'mousePressed', up: 'mouseReleased', move: 'mouseMoved' }[ev.a];
    if (!type) return;
    if (ev.a === 'down' && ev.b === 'right') await semMenuDoChrome(aba);
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
    // AltGr (Ctrl+Alt no Windows) que dá um caractere — @, €, ° e, no ABNT2, / e ?: vai como texto
    // e sem o Ctrl+Alt (como atalho, o Chrome não escreveria nada)
    const umCaractere = [...key].length === 1;
    const altGr = !!ev.ag && umCaractere;
    const mods = altGr ? modifiers & ~3 : modifiers;
    if (ev.a === 'up') return cdp(aba, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers: mods });
    const imprimivel = umCaractere && (altGr || !(modifiers & (2 | 4))); // Ctrl/Cmd + letra é atalho
    const texto = imprimivel ? key : key === 'Enter' ? '\r' : '';
    // Ctrl+C / Ctrl+X: o que está selecionado volta na resposta, para a área de transferência de
    // quem controla. Lido antes da tecla — o Ctrl+X apaga a seleção.
    const copiar = (modifiers & (2 | 4)) && !(modifiers & 1) && (windowsVirtualKeyCode === 67 || windowsVirtualKeyCode === 88);
    const copia = copiar ? await selecionado(aba) : '';
    await cdp(aba, 'Input.dispatchKeyEvent', {
      type: texto ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode, modifiers: mods,
      text: texto || undefined, unmodifiedText: texto || undefined,
    });
    return copia ? { copia } : null;
  }
  if (ev.t === 'texto') return cdp(aba, 'Input.insertText', { text: String(ev.s || '').slice(0, 2000) });
}

// Clique direito de quem controla: o menu do Chrome é outra janela, fora da página — não sai no
// vídeo da aba, e ficaria aberto na tela de quem compartilha. Este ouvinte, o último a rodar,
// cancela só esse menu; o site que tem menu próprio já cancelou o do Chrome e mostra o dele.
function semMenuDoChrome(aba) {
  return chrome.scripting.executeScript({
    target: { tabId: aba },
    func: () => {
      const f = (e) => {
        removeEventListener('contextmenu', f);
        e.preventDefault();
      };
      addEventListener('contextmenu', f);
      setTimeout(() => removeEventListener('contextmenu', f), 10_000);
    },
  }).catch(() => {});
}

// O texto selecionado na aba, ou no campo com o cursor (até dentro de quadro do mesmo site e de
// shadow DOM). Campo de senha nunca.
const LER_SELECAO = `(() => {
  let doc = document;
  let el = doc.activeElement;
  for (let i = 0; i < 8 && el; i++) {
    if (el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    else if (/^i?frame$/i.test(el.tagName) && el.contentDocument) { doc = el.contentDocument; el = doc.activeElement; }
    else break;
  }
  if (el && el.type === 'password') return '';
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
    try { return el.value.slice(el.selectionStart, el.selectionEnd); } catch (e) { return ''; }
  }
  return String(doc.getSelection());
})()`;
async function selecionado(aba) {
  const r = await cdp(aba, 'Runtime.evaluate', { expression: LER_SELECAO, returnByValue: true }).catch(() => null);
  const s = r?.result?.value;
  return typeof s === 'string' ? s.slice(0, 20_000) : '';
}

// ------------------------------------------------------------------ avisos do site
// alert, confirm, prompt e o "sair do site?" (beforeunload) são janelas do Chrome: não aparecem
// no vídeo da aba, e a página fica parada até alguém responder. Com a aba sob controle, a
// extensão conta para a sala (que mostra a pergunta a quem mexeu por último) e responde com o
// que vier de lá. Quem compartilha também pode responder no Chrome: aí o aviso some na sala.
chrome.debugger.onEvent.addListener(({ tabId }, metodo, p) => {
  const info = anexadas.get(tabId);
  if (!info) return;
  if (metodo === 'Page.javascriptDialogOpening') {
    info.dialogo = { tipo: String(p.type || 'alert'), msg: String(p.message || '').slice(0, 500), padrao: String(p.defaultPrompt || '').slice(0, 200) };
    avisarSala(info.sala, { tipo: 'dialogo', aba: tabId, dialogo: info.dialogo, site: siteDe(p.url || '') });
  } else if (metodo === 'Page.javascriptDialogClosed' && info.dialogo) {
    info.dialogo = null;
    avisarSala(info.sala, { tipo: 'dialogo', aba: tabId, dialogo: null });
  }
});

// A resposta passa por fora da fila da aba: o clique que abriu o aviso fica preso nela (a página
// está parada) até o aviso fechar.
async function responderDialogo(aba, ev) {
  const d = anexadas.get(aba)?.dialogo;
  if (!d) return { erro: 'sem-dialogo' };
  const texto = d.tipo === 'prompt' && ev.aceitar ? { promptText: String(ev.texto ?? '').slice(0, 2000) } : {};
  await cdp(aba, 'Page.handleJavaScriptDialog', { accept: !!ev.aceitar, ...texto });
  return { ok: true };
}

// ------------------------------------------------------------------ listas (<select>) na aba controlada
// A lista que abre ao clicar num <select> é uma janelinha do Chrome, fora da página: não sai no
// vídeo da aba, e o clique de quem controla nem chega nela (testado: só fecha a lista). Enquanto a
// aba está sob controle, a extensão liga o <select> personalizável do Chrome (appearance:
// base-select): a lista é desenhada dentro da página — todo mundo vê, e o clique escolhe a opção.
// Como folha do usuário, o !important vence até o do site.
const CSS_LISTAS = 'select:not([multiple]):not([size]), select[size="1"]:not([multiple]), ::picker(select) { appearance: base-select !important; }';
function listasNaPagina(aba, ligar, frameIds = null) {
  const opcoes = { target: frameIds ? { tabId: aba, frameIds } : { tabId: aba, allFrames: true }, css: CSS_LISTAS, origin: 'USER' };
  (ligar ? chrome.scripting.insertCSS(opcoes) : chrome.scripting.removeCSS(opcoes)).catch(() => {});
}
// página nova (ou quadro novo) numa aba sob controle: a folha vai junto
chrome.webNavigation?.onCommitted.addListener(({ tabId, frameId }) => {
  if (anexadas.has(tabId)) listasNaPagina(tabId, true, [frameId]);
});

// ------------------------------------------------------------------ abas compartilhadas
// A sala avisa quais abas está compartilhando (pedido "abas").
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
  avisarSala(sala, { tipo: 'aba-mudou', aba: t.id, site: siteDe(t.url || ''), titulo: t.title || '' });
}

async function registrarAbas(sala, abas) {
  const s = await lerSessao();
  const mudaram = new Set();
  for (const [aba, dona] of Object.entries(s.compartilhadas)) {
    if (dona !== sala) continue;
    delete s.compartilhadas[aba];
    mudaram.add(Number(aba));
  }
  const novas = abas.filter((a) => Number.isInteger(a) && a !== sala);
  for (const aba of novas) {
    s.compartilhadas[aba] = sala;
    mudaram.add(aba);
  }
  gravarSessao({ compartilhadas: s.compartilhadas });
  for (const aba of mudaram) marcarAba(aba);
  for (const aba of novas) chrome.tabs.get(aba).then((t) => contarPagina(t, sala), () => {});
}

chrome.tabs.onUpdated.addListener(async (aba, mudou, t) => {
  if (!('url' in mudou) && !('title' in mudou) && !('status' in mudou)) return;
  const s = await lerSessao();
  // A aba da sala foi para outro site: os quadros dela voltam a ter as travas de sempre (sem
  // isso, o site novo ficava com os cabeçalhos de proteção tirados até a aba fechar).
  if ('url' in mudou && s.abasSala.includes(aba) && !(await liberado(mudou.url))) quadrosDaSala(aba, false);
  const sala = s.compartilhadas[aba];
  if (sala == null) return;
  if ('url' in mudou || 'title' in mudou) contarPagina(t, sala);
  // o Chrome apaga o que a extensão pôs no ícone de uma aba quando ela troca de página
  if ('status' in mudou || 'url' in mudou) marcarAba(aba);
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
  const s = await lerSessao();
  const j = s.ativas[windowId] || {};
  if (j.atual === tabId) return;
  s.ativas[windowId] = { atual: tabId, anterior: j.atual ?? null };
  gravarSessao({ ativas: s.ativas });
});
chrome.windows.onRemoved.addListener(async (janela) => {
  const s = await lerSessao();
  if (!(janela in s.ativas)) return;
  delete s.ativas[janela];
  gravarSessao({ ativas: s.ativas });
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
  if ((await lerSessao()).compartilhadas[origem] == null) return;
  const deQuemControla = Date.now() - (ultimoToque.get(origem) || 0) < 1500;
  if (!nova.active && !deQuemControla) return;
  const dona = await chrome.tabs.get(origem).catch(() => null);
  if (!dona || dona.windowId !== nova.windowId) return;
  const pronto = nova.pendingUrl || nova.url || '';
  const url = siteDe(pronto) ? pronto : await primeiroEndereco(nova.id);
  if (!url) return;
  // quem estava na frente antes da aba nova aparecer
  const j = sessao.ativas[nova.windowId] || {};
  const voltarPara = j.atual === nova.id ? j.anterior : j.atual;
  await chrome.tabs.update(origem, { url });
  await chrome.tabs.remove(nova.id).catch(() => {});
  if (nova.active && voltarPara != null && voltarPara !== nova.id) chrome.tabs.update(voltarPara, { active: true }).catch(() => {});
});

// ------------------------------------------------------------------ o ícone nas abas que estão na sala
// Pela extensão (Alt+Shift+S) não aparece a faixa "Compartilhando..." do Chrome: o lembrete de que
// a aba está na sala é um ponto vermelho no ícone, enquanto ela estiver lá. Os avisos passageiros
// (…, ok, !) ficam por cima uns segundos e depois o ponto volta.
const TITULO = 'Sala 3D — controle das abas';
const passageiros = new Map(); // aba -> timer do aviso passageiro
function marcarAba(aba) {
  if (passageiros.has(aba)) return;
  const naSala = sessao.compartilhadas[aba] != null;
  chrome.action.setBadgeText({ tabId: aba, text: naSala ? '●' : '' }).catch(() => {});
  if (naSala) chrome.action.setBadgeBackgroundColor({ tabId: aba, color: '#dc2626' }).catch(() => {});
  chrome.action.setTitle({ tabId: aba, title: naSala ? `${TITULO}\nEsta aba está na Sala 3D` : TITULO }).catch(() => {});
}
function avisoNoIcone(aba, texto, cor, titulo, ms) {
  clearTimeout(passageiros.get(aba));
  chrome.action.setBadgeText({ tabId: aba, text: texto }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId: aba, color: cor }).catch(() => {});
  chrome.action.setTitle({ tabId: aba, title: titulo }).catch(() => {});
  passageiros.set(aba, setTimeout(() => {
    passageiros.delete(aba);
    marcarAba(aba);
  }, ms));
}

// ------------------------------------------------------------------ janelas e telas
// O Chrome só deixa a extensão clicar em ABAS. Para janela ou tela inteira ela passa os eventos ao
// ajudante nativo (pasta nativo/, instalado pelo instalar.bat), que mexe no mouse e no teclado
// de verdade, sempre dentro da janela/tela compartilhada.
const NATIVO = 'com.sala3d.controle';
let nativo = null; // { porta, ok: null|true|false, chegou, alvo, definindo, semAlvo, respostaAlvo, sala, admin }

// o que se sabe do ajudante, da última vez que ele abriu (ou não): { ok, versao, erro, quando }
let nativoInfo; // undefined: ainda não leu do storage; null: nunca tentou abrir
async function nativoConhecido() {
  if (nativoInfo === undefined) nativoInfo = (await chrome.storage.local.get('nativo').catch(() => ({}))).nativo ?? null;
  return nativoInfo;
}
async function lembrarNativo(info) {
  nativoInfo = { ...info, quando: Date.now() };
  chrome.storage.local.set({ nativo: nativoInfo }).catch(() => {});
  // o guia da sala mostra se ele está instalado
  const { salaAba } = await lerSessao();
  if (salaAba != null) avisarSala(salaAba, { tipo: 'status-mudou' });
}

function conectarNativo() {
  if (nativo) return nativo;
  let porta;
  try {
    porta = chrome.runtime.connectNative(NATIVO);
  } catch {
    return null;
  }
  let chegou;
  const n = { porta, ok: null, alvo: null, definindo: null, semAlvo: null, respostaAlvo: null, sala: null, admin: null, chegou: new Promise((r) => { chegou = r; }) };
  porta.onMessage.addListener((m) => {
    if (m?.tipo === 'oi') {
      n.ok = true;
      chegou();
      lembrarNativo({ ok: true, versao: String(m.versao || '') });
    }
    if (m?.tipo === 'alvo') n.respostaAlvo?.(m);
    // a janela que recebe a entrada está como administrador (ajudante 1.5+): o Windows não deixa o
    // ajudante mexer nela. Vai na resposta de cada evento (ver janela()), e a sala avisa.
    if (m?.tipo === 'admin') n.admin = m.admin ? { titulo: String(m.titulo || '').slice(0, 120) } : null;
    // Ctrl+Alt+End no teclado de quem compartilha: avisa a sala para desligar a permissão
    if (m?.tipo === 'parado' && n.sala != null) avisarSala(n.sala, { tipo: 'desligou', janela: true });
  });
  porta.onDisconnect.addListener(() => {
    // "Specified native messaging host not found": o ajudante não foi instalado
    const erro = String(chrome.runtime.lastError?.message || '');
    if (n.ok === null) lembrarNativo({ ok: false, erro: /not found/i.test(erro) ? 'ausente' : 'falhou' });
    n.ok = false;
    chegou();
    n.respostaAlvo?.(null);
    if (nativo === n) nativo = null;
  });
  nativo = n;
  return n;
}

// Na primeira vez depois de instalar ou atualizar, o ajudante se compila (PowerShell + o
// compilador do .NET do Windows): alguns segundos, mais num PC lento. Espera até ESPERA_NATIVO; se
// o "oi" chegar depois disso, a próxima tentativa já o encontra pronto (antes, um começo lento
// deixava o ajudante "ausente" até o Chrome reabrir).
const ESPERA_NATIVO = 12_000;
async function nativoPronto() {
  const n = conectarNativo();
  if (!n) return false;
  if (n.ok === null) await Promise.race([n.chegou, new Promise((r) => setTimeout(r, ESPERA_NATIVO))]);
  return n.ok === true && nativo === n;
}

// Troca a janela/tela de que o ajudante cuida e espera ele dizer se achou (a janela pode ter
// fechado, ou o rótulo não bater com nenhuma). Não achou: por uns segundos nem pergunta de novo — a
// cada movimento do mouse ele procuraria a janela entre todas as do Windows.
function definirAlvo(n, rotulo, superficie) {
  if (n.alvo === rotulo) return Promise.resolve(true);
  if (n.definindo?.rotulo === rotulo) return n.definindo.promessa;
  if (n.semAlvo?.rotulo === rotulo && Date.now() < n.semAlvo.ate) return Promise.resolve(false);
  const promessa = new Promise((r) => {
    // null: o ajudante fechou. Resposta de outro rótulo é de um pedido que já desistiu.
    n.respostaAlvo = (m) => (!m || m.rotulo === rotulo) && r(!!m?.ok);
    setTimeout(() => r(false), 4000);
  }).then((ok) => {
    if (n.definindo?.promessa === promessa) {
      n.definindo = null;
      n.respostaAlvo = null;
    }
    if (ok) n.alvo = rotulo;
    else n.semAlvo = { rotulo, ate: Date.now() + 3000 };
    return ok;
  });
  n.definindo = { rotulo, promessa };
  n.alvo = null;
  n.porta.postMessage({ tipo: 'alvo', rotulo, superficie });
  return promessa;
}

// Os eventos das janelas vão um de cada vez: com duas janelas controladas, um evento não pode
// cair na outra enquanto o ajudante troca de alvo.
let filaNativo = Promise.resolve();
// alvo = { superficie: 'window'|'monitor', rotulo } — o rótulo do vídeo capturado
function janela(alvo, ev, sala) {
  const vez = filaNativo.then(async () => {
    if (!(await nativoPronto())) return { erro: 'ajudante-ausente' };
    const rotulo = String(alvo?.rotulo || '').slice(0, 300);
    if (!rotulo) return { erro: 'alvo-invalido' };
    const n = nativo;
    n.sala = sala;
    if (!(await definirAlvo(n, rotulo, alvo.superficie === 'monitor' ? 'monitor' : 'window'))) return { erro: 'alvo-nao-achado' };
    if (ev) n.porta.postMessage({ tipo: 'entrada', ev });
    return n.admin ? { ok: true, admin: n.admin } : { ok: true };
  });
  filaNativo = vez.catch(() => {});
  return vez;
}

function soltarJanela(cortar = false) {
  if (!nativo) return;
  // "parar" (ajudante 1.3+) segura o ajudante como o Ctrl+Alt+End: só volta quando liberarem de novo
  nativo.porta.postMessage({ tipo: cortar ? 'parar' : 'soltar' });
  if (cortar) nativo.porta.postMessage({ tipo: 'soltar' }); // o ajudante de antes só conhece este
  nativo.alvo = null;
  nativo.definindo = null;
  nativo.semAlvo = null;
  nativo.admin = null;
}

async function tratar(m, sender) {
  if (m.tipo === 'meu-id') return { aba: sender.tab?.id };
  if (m.tipo === 'vivo') return { ok: true }; // a sala aberta mantém o fundo acordado
  // Pedidos do popup (página da própria extensão — o conteudo.js manda com o endereço do site). Só
  // ele: o clique no ícone é o que libera a captura da aba, e o "cortar" é de quem está no computador.
  if (m.tipo === 'compartilhar-aba' || m.tipo === 'painel' || m.tipo === 'cortar') {
    if (sender.id !== chrome.runtime.id || !String(sender.url || '').startsWith(chrome.runtime.getURL(''))) return { erro: 'pedido-invalido' };
    if (m.tipo === 'painel') return painel(Number(m.aba));
    if (m.tipo === 'cortar') return cortarTudo();
    const r = await compartilharEAvisar(Number(m.aba));
    return r.ok ? r : { erro: r.msg || mensagemDeErro(r.erro) };
  }
  // não abre o ajudante aqui: ele só sobe quando alguém liga o controle de uma janela
  if (m.tipo === 'status') {
    const ok = await liberado(sender.url);
    // a sala liberada mais recente é para onde vão as abas do Alt+Shift+S
    if (ok && sender.tab) gravarSessao({ salaAba: sender.tab.id });
    if (sender.tab) quadrosDaSala(sender.tab.id, ok);
    if (ok) cookiesNaSala(sender.url);
    return { liberado: ok, salaAba: true, quadros: ok, atalho: await atalho(), nativo: await nativoConhecido() };
  }
  if (!sender.tab || !(await liberado(sender.url))) return { erro: 'site-nao-liberado' };
  if (m.tipo === 'abas') {
    await registrarAbas(sender.tab.id, Array.isArray(m.abas) ? m.abas.map(Number) : []);
    return { ok: true };
  }
  // a sala precisa que a pessoa escolha alguma coisa (a tela da aba do Alt+Shift+S): vem para a frente
  if (m.tipo === 'mostrar-sala') {
    await chrome.tabs.update(sender.tab.id, { active: true }).catch(() => {});
    await chrome.windows.update(sender.tab.windowId, { focused: true }).catch(() => {});
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
    soltarJanela();
    return { ok: true };
  }
  // o guia confere se o ajudante está instalado (abre ele, sem destravar nada)
  if (m.tipo === 'nativo-conferir') return { ok: await nativoPronto(), nativo: await nativoConhecido() };
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
    if (bloqueada(aba)) return { erro: 'cortado' };
    if (m.ev.t === 'nav') {
      await navegar(aba, m.ev);
      return { ok: true };
    }
    if (m.ev.t === 'dialogo') return responderDialogo(aba, m.ev);
    const sala = sender.tab.id;
    const r = await enfileirar(aba, m.ev, async () => {
      await anexar(aba, sala);
      return despachar(aba, m.ev);
    });
    agendarSoltura(aba);
    return typeof r?.copia === 'string' ? { ok: true, copia: r.copia } : { ok: true };
  }
  return { erro: 'pedido-invalido' };
}

// ------------------------------------------------------------------ navegador dentro das telas
// O navegador das telas da sala (public/js/navegador.js) abre os sites em iframes. Muitos sites
// (YouTube, Google, WhatsApp...) mandam X-Frame-Options ou CSP frame-ancestors, e o Chrome se
// recusa a mostrá-los dentro de outra página. Nas abas da Sala 3D — só nelas, e só se o site da
// sala foi liberado no ícone — a extensão tira esses dois cabeçalhos dos quadros internos, e o
// site abre na tela do jogo como numa aba normal. As outras abas do Chrome não mudam em nada.
// O iframe da sala vem com sandbox sem "allow-top-navigation": o site lá dentro não consegue
// tirar a pessoa da sala.
const REGRA_QUADROS = 1;
let filaQuadros = Promise.resolve();
function quadrosDaSala(aba, ligar) {
  filaQuadros = filaQuadros.then(async () => {
    if (!chrome.declarativeNetRequest) return; // permissão nova ainda não aplicada
    const s = await lerSessao();
    if (s.abasSala.includes(aba) === ligar) return;
    const abas = ligar ? [...s.abasSala, aba] : s.abasSala.filter((a) => a !== aba);
    await gravarSessao({ abasSala: abas });
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [REGRA_QUADROS],
      addRules: abas.length ? [{
        id: REGRA_QUADROS,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options', operation: 'remove' },
            { header: 'content-security-policy', operation: 'remove' },
          ],
        },
        condition: { resourceTypes: ['sub_frame'], tabIds: abas },
      }] : [],
    });
    ouvirCookies(aba, ligar);
  }).catch((err) => console.warn('[quadros]', err));
}

// ------------------------------------------------------------------ login dentro das telas
// O site numa tela é um quadro de outro site (a sala), e aí o Chrome não grava nem manda cookie
// SameSite=Lax/Strict — o padrão de quase todo cookie de sessão. O login até dava certo no
// servidor, mas o cookie da sessão era jogado fora e o site voltava deslogado. A extensão:
// - lê o Set-Cookie das respostas dos sites nas telas da sala (só nas abas da sala) e grava o
//   cookie de novo como SameSite=None, que vale dentro de quadro;
// - faz o mesmo com os cookies que o site já tinha (logado antes numa aba normal do Chrome);
// - libera cookies de terceiros com a sala como página principal (Chrome que bloqueia);
// - recarrega o quadro uma vez quando o cookie chegou tarde (o login que redireciona: a página
//   seguinte foi pedida antes de a extensão gravar).
// Os cookies regravados valem no Chrome todo (é o mesmo cookie), só que sem a trava SameSite.
const ouvintes = new Map(); // aba da sala -> ouvinte do webRequest
const pendentes = new Map(); // "aba:quadro" -> Promise<bool>: gravou cookie que a página não levou
const recarregados = new Map(); // "aba:quadro" -> quando recarregou (no máximo 1 a cada 15 s)

function ouvirCookies(aba, ligar) {
  if (!chrome.webRequest || !chrome.cookies) return; // permissão nova ainda não aplicada
  const velho = ouvintes.get(aba);
  if (velho) chrome.webRequest.onHeadersReceived.removeListener(velho);
  ouvintes.delete(aba);
  if (!ligar) return;
  const ouvinte = (d) => {
    if (d.frameId === 0) return; // a própria sala
    const linhas = (d.responseHeaders || [])
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .flatMap((h) => String(h.value || '').split('\n'));
    if (!linhas.length) return;
    const gravou = Promise.all(linhas.map((l) => regravarCookie(d.url, l))).then((r) => r.some(Boolean));
    // redirecionou (o login com formulário): a página seguinte já foi pedida sem o cookie
    if (d.type === 'sub_frame' && d.statusCode >= 300 && d.statusCode < 400) pendentes.set(`${d.tabId}:${d.frameId}`, gravou);
  };
  chrome.webRequest.onHeadersReceived.addListener(ouvinte, { urls: ['https://*/*'], tabId: aba, types: ['sub_frame', 'xmlhttprequest'] }, ['responseHeaders', 'extraHeaders']);
  ouvintes.set(aba, ouvinte);
}
// o service worker dormiu e acordou: volta a ouvir as abas da sala
lerSessao().then((s) => s.abasSala.forEach((a) => ouvirCookies(a, true)));

// Set-Cookie que o Chrome recusou dentro do quadro -> o mesmo cookie com SameSite=None
async function regravarCookie(url, linha) {
  const [par, ...resto] = linha.split(';');
  const i = par.indexOf('=');
  if (i < 0) return false;
  const nome = par.slice(0, i).trim();
  const valor = par.slice(i + 1).trim();
  const at = {};
  for (const a of resto) {
    const j = a.indexOf('=');
    at[(j < 0 ? a : a.slice(0, j)).trim().toLowerCase()] = j < 0 ? '' : a.slice(j + 1).trim();
  }
  if ('partitioned' in at) return false; // cookie feito para quadro (CHIPS): já vale
  if (at.samesite?.toLowerCase() === 'none' && 'secure' in at) return false; // já vale em quadro
  const u = new URL(url);
  const caminho = at.path?.startsWith('/') ? at.path : u.pathname.slice(0, Math.max(1, u.pathname.lastIndexOf('/')));
  const alvo = `https://${u.host}${caminho}`;
  let expira;
  if (at['max-age'] !== undefined && /^-?\d+$/.test(at['max-age'])) expira = Date.now() / 1000 + Number(at['max-age']);
  else if (at.expires) expira = Date.parse(at.expires) / 1000 || undefined;
  try {
    if (expira !== undefined && expira <= Date.now() / 1000) {
      await chrome.cookies.remove({ url: alvo, name: nome }); // o site apagou (sair da conta)
      return true;
    }
    await chrome.cookies.set({
      url: alvo,
      name: nome,
      value: valor,
      path: caminho,
      ...(at.domain ? { domain: at.domain } : {}),
      secure: true,
      httpOnly: 'httponly' in at,
      sameSite: 'no_restriction',
      ...(expira ? { expirationDate: expira } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

// um cookie que já existe, de novo com SameSite=None (devolve se regravou)
const jaValeEmQuadro = (c) => !!c.partitionKey || (c.sameSite === 'no_restriction' && c.secure);
async function liberarCookie(c) {
  if (jaValeEmQuadro(c)) return false;
  try {
    await chrome.cookies.set({
      url: `https://${c.domain.replace(/^\./, '')}${c.path}`,
      name: c.name,
      value: c.value,
      path: c.path,
      ...(c.hostOnly ? {} : { domain: c.domain }),
      secure: true,
      httpOnly: c.httpOnly,
      sameSite: 'no_restriction',
      ...(c.session ? {} : { expirationDate: c.expirationDate }),
      storeId: c.storeId,
    });
    return true;
  } catch {
    return false; // cookie que o Chrome não deixa regravar
  }
}

// os cookies que o site já tem (de uma aba normal do Chrome) passam a valer no quadro também
async function liberarCookiesDe(url) {
  if (!chrome.cookies || !/^https:/.test(url)) return false;
  const todos = await chrome.cookies.getAll({ url }).catch(() => []);
  const r = await Promise.all(todos.map(liberarCookie));
  return r.some(Boolean);
}

// Login que abre numa janelinha (Google, Microsoft...) ou numa aba normal: o cookie é gravado lá
// fora, como Lax. Se for de um site aberto numa tela, já vira SameSite=None.
const sitesNasTelas = new Set(); // endereços (host) abertos nas telas da sala
function cookieMudou({ removed, cookie }) {
  if (removed || jaValeEmQuadro(cookie)) return;
  const d = cookie.domain.replace(/^\./, '');
  for (const h of sitesNasTelas) {
    if (h === d || h.endsWith(`.${d}`)) return void liberarCookie(cookie);
  }
}
function siteNaTela(url) {
  if (!chrome.cookies) return;
  if (!sitesNasTelas.size) chrome.cookies.onChanged.addListener(cookieMudou); // só com site aberto
  sitesNasTelas.add(new URL(url).hostname);
}

// Chrome com cookies de terceiros bloqueados: liberados só com a sala como página principal. Uma
// vez por endereço da sala (antes ia a cada "status" — com o guia aberto, de 1,5 em 1,5 s).
const salasComCookies = new Set();
function cookiesNaSala(url) {
  try {
    const u = new URL(url);
    if (salasComCookies.has(u.host)) return;
    salasComCookies.add(u.host);
    chrome.contentSettings?.cookies.set({ primaryPattern: 'https://*/*', secondaryPattern: `${u.protocol}//${u.host}/*`, setting: 'allow' })
      .catch((err) => {
        salasComCookies.delete(u.host);
        console.warn('[cookies]', err);
      });
  } catch { /* endereço estranho */ }
}

// o site de uma tela vai abrir: os cookies dele já valendo (o pedido em si quase sempre sai antes
// disso, por isso o recarregar uma vez lá embaixo)
chrome.webNavigation?.onBeforeNavigate.addListener(async ({ tabId, frameId, parentFrameId, url }) => {
  if (frameId === 0 || parentFrameId !== 0 || !/^https:/.test(url)) return;
  if (!(await lerSessao()).abasSala.includes(tabId)) return;
  siteNaTela(url);
  const chave = `${tabId}:${frameId}`;
  const antes = pendentes.get(chave);
  const agora = liberarCookiesDe(url);
  pendentes.set(chave, antes ? Promise.all([antes, agora]).then((r) => r.some(Boolean)) : agora);
});

// Cada site que abre numa tela (quadro direto da aba da sala) ganha o quadro.js: conta o
// endereço e o título para a barra do navegador, obedece voltar/avançar, abre os links de aba
// nova como aba do navegador da sala e repassa teclas e mouse (teclado e mouse do posto).
chrome.webNavigation?.onDOMContentLoaded.addListener(async ({ tabId, frameId, parentFrameId }) => {
  if (frameId === 0) return;
  const chave = `${tabId}:${frameId}`;
  const pendente = pendentes.get(chave);
  pendentes.delete(chave);
  if (pendente && (await pendente) && !(performance.now() - (recarregados.get(chave) ?? -Infinity) < 15_000)) {
    // a página veio sem o cookie que acabou de ser gravado: carrega de novo, agora com ele
    recarregados.set(chave, performance.now());
    chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, func: () => location.reload() }).catch(() => {});
    return;
  }
  if (parentFrameId !== 0) return;
  if (!(await lerSessao()).abasSala.includes(tabId)) return;
  chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['quadro.js'] }).catch(() => {});
});

// ------------------------------------------------------------------ compartilhar aba sem a barra
// O seletor do navegador (getDisplayMedia) põe a faixa "Compartilhando ... com esta guia" no topo
// da Sala 3D, uma por aba, e o site não consegue esconder. Pelo chrome.tabCapture não tem faixa:
// a pessoa aperta Alt+Shift+S (ou clica no ícone) na aba que quer mostrar, a extensão gera um id
// de captura daquela aba que só a aba da sala pode usar, e a sala abre o vídeo com getUserMedia.
// O Chrome só deixa capturar a aba em que a extensão foi chamada — por isso o atalho/ícone.
// Na aba que já está na sala, o mesmo atalho tira ela de lá.
async function salaAberta() {
  const { salaAba } = await lerSessao();
  if (salaAba == null) return null;
  const t = await chrome.tabs.get(salaAba).catch(() => null);
  return t && (await liberado(t.url)) ? t : null;
}

// Pede algo à aba da sala e espera a resposta dela (a ponte é o conteudo.js de lá). A sala de
// antes (protocolo 1) não responde: o conteudo.js responde por ela na hora, como sempre foi.
async function pedirSala(sala, m) {
  try {
    const r = await chrome.tabs.sendMessage(sala, m);
    return r && typeof r === 'object' ? r : { ok: true };
  } catch {
    return { erro: 'sala-sem-ponte' };
  }
}

async function compartilharAba(alvo) {
  const sala = await salaAberta();
  if (!sala) return { erro: 'sem-sala' };
  if (!Number.isInteger(alvo) || alvo === sala.id) return { erro: 'aba-da-sala' };
  const t = await chrome.tabs.get(alvo).catch(() => null);
  if (!t || !/^https?:|^file:/.test(t.url || t.pendingUrl || '')) return { erro: 'aba-interna' };
  if ((await lerSessao()).compartilhadas[alvo] != null) return pedirSala(sala.id, { tipo: 'parar-aba', aba: alvo });
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: alvo, consumerTabId: sala.id });
  } catch (err) {
    return { erro: String(err?.message || err) };
  }
  const r = await pedirSala(sala.id, { tipo: 'capturar-aba', streamId, aba: alvo, titulo: t.title || '', site: siteDe(t.url || '') });
  return r.ok ? { ...r, sala: sala.title } : r;
}

// O andamento e o resultado também aparecem no ícone: pelo atalho não há popup, e o popup fecha
// sozinho quando a sala vem para a frente (para escolher a tela).
async function compartilharEAvisar(aba) {
  avisoNoIcone(aba, '…', '#475569', 'Mandando para a Sala 3D…', 200_000);
  const r = await compartilharAba(aba).catch((err) => ({ erro: String(err?.message || err) }));
  if (!r.ok) avisoNoIcone(aba, '!', '#dc2626', r.msg || mensagemDeErro(r.erro), 6000);
  else if (r.parou) avisoNoIcone(aba, 'off', '#475569', 'A aba saiu da Sala 3D', 3000);
  else avisoNoIcone(aba, 'ok', '#16a34a', `Aba na Sala 3D${r.onde ? ` (${r.onde})` : ''}`, 3000);
  return r;
}

chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === 'compartilhar-aba' && tab) compartilharEAvisar(tab.id);
});

function mensagemDeErro(erro) {
  if (erro === 'sem-sala') return 'Abra a Sala 3D (e libere o site no ícone da extensão) antes de compartilhar.';
  if (erro === 'aba-da-sala') return 'Esta é a aba da própria sala: vá para a aba que quer mostrar.';
  if (erro === 'aba-interna') return 'O Chrome não deixa compartilhar esta página.';
  if (erro === 'sala-sem-ponte') return 'Recarregue a página da Sala 3D e tente de novo.';
  if (erro === 'sala-antiga') return 'Para tirar a aba, use o X da tela na sala (ou recarregue a sala).';
  if (erro === 'sem-resposta') return 'A sala não respondeu. Veja se ela está aberta e tente de novo.';
  if (/active stream/i.test(String(erro))) return 'Esta aba já está sendo compartilhada.';
  return `Não deu para compartilhar: ${erro}`;
}

// ------------------------------------------------------------------ popup
// o atalho de verdade (a pessoa pode ter trocado, ou outra extensão ficou com ele: aí vem vazio)
async function atalho() {
  const cmds = await chrome.commands.getAll().catch(() => []);
  return cmds.find((c) => c.name === 'compartilhar-aba')?.shortcut ?? '';
}

async function painel(aba) {
  const s = await lerSessao();
  const sala = await salaAberta();
  const controladas = [];
  for (const id of anexadas.keys()) {
    const t = await chrome.tabs.get(id).catch(() => null);
    if (t) controladas.push(t.title || siteDe(t.url || '') || 'uma aba');
  }
  if (nativo?.alvo) controladas.push(nativo.alvo.startsWith('screen:') ? 'a tela inteira' : 'uma janela');
  return { sala: sala ? sala.title || 'Sala 3D' : null, compartilhada: s.compartilhadas[aba] != null, atalho: await atalho(), nativo: await nativoConhecido(), controladas };
}

// "Cortar o controle agora", no popup: ninguém mexe em mais nada (como fechar a barra amarela, de
// uma vez para todas as abas e janelas). A sala desliga a permissão; quem compartilha liga de novo.
async function cortarTudo() {
  for (const [aba, info] of [...anexadas]) {
    bloquear(aba);
    await soltar(aba);
    avisarSala(info.sala, { tipo: 'desligou', aba, motivo: 'cortado' });
  }
  if (nativo?.alvo || nativo?.definindo) {
    soltarJanela(true);
    if (nativo.sala != null) avisarSala(nativo.sala, { tipo: 'desligou', janela: true, motivo: 'cortado' });
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((m, sender, responder) => {
  tratar(m || {}, sender).then(responder, (err) => responder({ erro: String(err?.message || err) }));
  return true; // resposta assíncrona
});

// fechou a barra amarela, fechou a aba...: avisa a sala
chrome.debugger.onDetach.addListener(({ tabId }, motivo) => {
  const info = anexadas.get(tabId);
  anexadas.delete(tabId);
  clearTimeout(timersSoltar.get(tabId));
  timersSoltar.delete(tabId);
  if (!info) return;
  if (motivo === 'canceled_by_user') bloquear(tabId);
  listasNaPagina(tabId, false);
  if (info.dialogo) avisarSala(info.sala, { tipo: 'dialogo', aba: tabId, dialogo: null });
  avisarSala(info.sala, { tipo: 'desligou', aba: tabId, motivo });
});
chrome.tabs.onRemoved.addListener(async (aba) => {
  quadrosDaSala(aba, false);
  anexadas.delete(aba);
  ultimoToque.delete(aba);
  filas.delete(aba);
  movimentoMaisNovo.delete(aba);
  rolagens.delete(aba);
  bloqueadas.delete(aba);
  clearTimeout(timersSoltar.get(aba));
  timersSoltar.delete(aba);
  clearTimeout(passageiros.get(aba));
  passageiros.delete(aba);
  // fechou a aba compartilhada ou a da sala: esquece as duas pontas
  const s = await lerSessao();
  let mudou = false;
  for (const [a, dona] of Object.entries(s.compartilhadas)) {
    if (Number(a) === aba || dona === aba) {
      delete s.compartilhadas[a];
      if (Number(a) !== aba) marcarAba(Number(a));
      mudou = true;
    }
  }
  if (mudou) gravarSessao({ compartilhadas: s.compartilhadas });
  if (s.salaAba === aba) gravarSessao({ salaAba: null });
});

// Acabou de instalar ou de atualizar: as abas que já estavam abertas não têm o script desta versão.
// Injeta nelas, para não precisar recarregar nada — nem a sala (o script de antes, órfão, sai do
// caminho: ver conteudo.js).
chrome.runtime.onInstalled.addListener(async () => {
  for (const t of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['conteudo.js'] }).catch(() => {});
  }
});
