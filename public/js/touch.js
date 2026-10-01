// Controles de toque para celular: analógico de movimento, botões de ação e tela cheia.

export const isTouch = (() => {
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
    el.setPointerCapture(e.pointerId);
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
function setupButton(el, { onPress, onRelease }) {
  let id = null;
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    el.setPointerCapture(e.pointerId);
    el.classList.add('held');
    onPress?.();
    e.preventDefault();
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    el.classList.remove('held');
    onRelease?.();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
}

// ------------------------------------------------------------------ tela cheia
export function toggleFullscreen() {
  const doc = document;
  const el = doc.documentElement;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
    return false;
  }
  (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' });
  // trava em paisagem quando o navegador permite (Android/Chrome)
  screen.orientation?.lock?.('landscape').catch(() => {});
  return true;
}

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

  for (const [id, fn] of Object.entries({
    '#tb-use': actions.use,
    '#tb-view': actions.view,
    '#tb-respawn': actions.respawn,
    '#tb-full': actions.fullscreen,
  })) {
    const el = root.querySelector(id);
    if (el && fn) setupButton(el, { onPress: fn });
  }

  return {
    reset: () => { stick.reset(); player.jumpHeld = false; },
    show(on) { root.hidden = !on; },
    // o botão de ação só aparece quando há algo pra usar (uma tela, o telão)
    setUseTarget(label) {
      const el = root.querySelector('#tb-use');
      el.hidden = !label;
      el.querySelector('.tb-label').textContent = label ? 'Ver' : '';
    },
  };
}
