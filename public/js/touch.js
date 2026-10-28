// Controles de toque para celular: analógico de movimento, botões de ação e tela cheia.

export const isTouch = (() => {
  // ?toque=1 força a interface de celular no computador (para testar sem um aparelho)
  if (new URLSearchParams(window.location.search).get('toque') === '1') return true;
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches
      || (navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches);
  } catch {
    return 'ontouchstart' in window;
  }
})();

const DEAD = 0.14; // zona morta do analógico
const RUN_AT = 0.92; // empurrar até a borda faz correr

// ------------------------------------------------------------------ analógico
function setupStick(el, player) {
  const knob = el.querySelector('.stick-knob');
  let id = null;
  let cx = 0, cy = 0, radius = 48;

  const reset = () => {
    id = null;
    player.moveInput.x = 0;
    player.moveInput.y = 0;
    player.runInput = false;
    el.classList.remove('active');
    knob.style.transform = '';
  };

  const apply = (clientX, clientY) => {
    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    const mag = Math.min(1, len);
    if (mag < DEAD) {
      player.moveInput.x = 0;
      player.moveInput.y = 0;
      player.runInput = false;
    } else {
      // reescala pra que logo após a zona morta o movimento já responda
      const scaled = (mag - DEAD) / (1 - DEAD);
      const k = scaled / mag;
      player.moveInput.x = dx * k;
      player.moveInput.y = -dy * k;
      player.runInput = mag >= RUN_AT;
    }
    el.classList.toggle('running', player.runInput);
    knob.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
  };

  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    const r = el.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    radius = r.width / 2;
    try { el.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    el.classList.add('active');
    apply(e.clientX, e.clientY);
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    apply(e.clientX, e.clientY);
    e.preventDefault();
  });

  const end = (e) => { if (e.pointerId === id) reset(); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  window.addEventListener('blur', reset);
  return { reset };
}

// ------------------------------------------------------------------ botões
// "hold" = mantém pressionado (pular); os outros disparam uma vez por toque.
function setupButton(el, { onPress, onRelease, noSoltar }) {
  let id = null;
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    // a captura é um extra (o dedo pode escorregar para fora): se falhar, o botão funciona igual
    try { el.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    el.classList.add('held');
    onPress?.();
    e.preventDefault();
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    el.classList.remove('held');
    onRelease?.();
    noSoltar?.();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
}

// ------------------------------------------------------------------ tela cheia
// Tela cheia é assíncrona e pode ser recusada. Devolve o motivo para quem chamou
// poder avisar o usuário, em vez de simplesmente não acontecer nada.
export async function toggleFullscreen() {
  const doc = document;
  const el = doc.documentElement;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    await (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
    return { ok: true, cheia: false };
  }
  const pedir = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!pedir) return { ok: false, motivo: 'sem-suporte' };
  try {
    await pedir.call(el, { navigationUI: 'hide' });
  } catch (err) {
    return { ok: false, motivo: 'recusado', erro: err?.message || String(err) };
  }
  // a trava de orientação só vale depois que a tela cheia entrou
  try { await screen.orientation?.lock?.('landscape'); } catch { /* iOS e alguns Android não deixam */ }
  return { ok: true, cheia: true };
}

// iOS não tem tela cheia de documento — só de <video>. Serve para explicar o porquê.
export const temTelaCheia = !!(document.documentElement.requestFullscreen
  || document.documentElement.webkitRequestFullscreen);

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

// ------------------------------------------------------------------ montagem
export function setupTouchControls(player, actions = {}) {
  const root = document.getElementById('touch');
  if (!root) return null;

  const stick = setupStick(root.querySelector('#stick'), player);

  setupButton(root.querySelector('#tb-jump'), {
    onPress: () => { player.jumpHeld = true; player.jumpBuffer = 0.14; },
    onRelease: () => { player.jumpHeld = false; },
  });

  const runBtn = root.querySelector('#tb-run');
  setupButton(runBtn, {
    onPress: () => {
      player.runLock = !player.runLock;
      runBtn.classList.toggle('on', player.runLock);
      runBtn.setAttribute('aria-pressed', String(player.runLock));
    },
  });

  // pedais do carro: segurar acelera ou freia (e dá ré parado); soltar volta a deslizar
  const pedais = { acelera: false, freio: false };
  const atualizarPedal = () => { player.pedal = pedais.acelera ? 1 : pedais.freio ? -1 : 0; };
  for (const [id, nome] of [['#tb-acelera', 'acelera'], ['#tb-freio', 'freio']]) {
    const el = root.querySelector(id);
    if (!el) continue;
    setupButton(el, {
      onPress: () => { pedais[nome] = true; atualizarPedal(); },
      onRelease: () => { pedais[nome] = false; atualizarPedal(); },
    });
  }

  // voando, "descer" é segurar (como o pulo, que sobe)
  // tiro: segurar o botão dispara sem parar nas armas automáticas
  const tiro = root.querySelector('#tb-tiro');
  if (tiro && actions.tiro) setupButton(tiro, { onPress: actions.tiro, onRelease: actions.soltarTiro });
  // luneta da sniper: um toque liga, outro desliga
  const luneta = root.querySelector('#tb-luneta');
  if (luneta && actions.luneta) setupButton(luneta, { onPress: actions.luneta });

  // jogos do parque e quadras: o E e a ação (segurar carrega, soltar arremessa)
  const jogoE = root.querySelector('#tb-jogo-e');
  if (jogoE && actions.jogoE) setupButton(jogoE, { onPress: actions.jogoE });
  const jogoAcao = root.querySelector('#tb-jogo-acao');
  if (jogoAcao && actions.jogoAcao) setupButton(jogoAcao, { onPress: actions.jogoAcao, onRelease: actions.jogoSoltar });

  const descer = root.querySelector('#tb-descer');
  if (descer) {
    setupButton(descer, {
      onPress: () => { player.descerHeld = true; },
      onRelease: () => { player.descerHeld = false; },
    });
  }

  for (const [id, fn] of Object.entries({
    '#tb-use': actions.use,
    '#tb-voar': actions.voar,
    '#tb-pulo': actions.puloAlto,
    '#tb-view': actions.view,
    '#tb-respawn': actions.respawn,
    '#tb-sair-jogo': actions.sairJogo,
    '#tb-menu': actions.menu,
    '#tb-hud': actions.hud,
    '#tb-punch': actions.punch,
    '#tb-tapa': actions.tapa,
    '#tb-sit': actions.sit,
    '#tb-car': actions.car,
  })) {
    const el = root.querySelector(id);
    if (el && fn) setupButton(el, { onPress: fn });
  }

  // Tela cheia precisa sair de um gesto "completo": o navegador não concede a
  // permissão no pointerdown, só ao soltar o toque. Era por isso que nada acontecia.
  const cheia = root.querySelector('#tb-full');
  if (cheia && actions.fullscreen) {
    setupButton(cheia, { noSoltar: actions.fullscreen });
    cheia.addEventListener('click', (e) => e.preventDefault());
  }

  const $b = (id) => root.querySelector(id);
  return {
    reset: () => {
      stick.reset();
      player.jumpHeld = false;
      pedais.acelera = pedais.freio = false;
      atualizarPedal();
    },
    show(on) { root.hidden = !on; },
    // estado dos poderes nos botões (aceso = ligado); "descer" só aparece voando
    setPoderes({ voando, puloAlto, armado, sniper = false, luneta = false }) {
      const marcar = (sel, on) => {
        const el = $b(sel);
        el.classList.toggle('on', on);
        el.setAttribute('aria-pressed', String(on));
      };
      marcar('#tb-voar', voando);
      marcar('#tb-pulo', puloAlto);
      $b('#tb-descer').hidden = !voando;
      $b('#tb-tiro').hidden = !armado;
      root.classList.toggle('armado', !!armado); // o E dos jogos vai para o lado do tiro
      $b('#tb-luneta').hidden = !sniper;
      marcar('#tb-luneta', luneta);
      if (!voando) player.descerHeld = false;
    },
    // modo carro: pedais no lugar do pulo, o botão de correr vira turbo
    showCarro(on) {
      root.classList.toggle('carro', on);
      $b('#tb-punch').hidden = on; // de carro não dá para socar (nem dar tapa)
      $b('#tb-tapa').hidden = on;
      $b('#tb-acelera').hidden = !on;
      $b('#tb-freio').hidden = !on;
      $b('#tb-jump').hidden = on;
      const car = $b('#tb-car');
      car.classList.toggle('on', on);
      car.setAttribute('aria-pressed', String(on));
      car.setAttribute('aria-label', on ? 'Voltar a andar' : 'Virar carro');
      $b('#tb-run').setAttribute('aria-label', on ? 'Turbo' : 'Correr');
      $b('#tb-respawn').setAttribute('aria-label', on ? 'Voltar para a pista' : 'Voltar ao checkpoint');
      if (!on) {
        pedais.acelera = pedais.freio = false;
        atualizarPedal();
      }
    },
    // perto de um jogo: e = dá para entrar/sair com o E; acao = o botão de ação vale agora
    setJogo({ e = false, acao = false } = {}) {
      if ($b('#tb-jogo-e').hidden === !e && $b('#tb-jogo-acao').hidden === !acao) return;
      // o E e a ação ficam onde estavam voar e pulo alto: esses saem enquanto isso
      root.classList.toggle('perto-de-jogo', e || acao);
      $b('#tb-jogo-e').hidden = !e;
      $b('#tb-jogo-acao').hidden = !acao;
    },
    showPunch(on) {
      const el = root.querySelector('#tb-punch');
      if (el) el.hidden = !on;
    },
    // o botão de ação só aparece quando há algo pra usar (uma tela, o telão)
    setUseTarget(label) {
      const el = root.querySelector('#tb-use');
      el.hidden = !label;
      el.querySelector('.tb-label').textContent = label ? 'Ver' : '';
    },
  };
}
