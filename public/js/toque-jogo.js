// Controle de toque do modo jogo (celular): joga num PC de longe pela tela do celular.
//
// No computador o modo jogo prende o ponteiro e usa o teclado (ver controle.js). No celular não
// há nem um nem outro: por cima da tela vem um controle como o dos jogos de celular —
//   - analógico à esquerda: vira W A S D (empurrado até a borda para a frente, corre: Ctrl);
//   - arrastar o dedo no resto da tela: gira a câmera (o mesmo delta do mouse no modo jogo);
//   - botões à direita: pular (Espaço), bater/quebrar (botão esquerdo, segura para quebrar),
//     usar/colocar (botão direito), agachar (Shift, liga e desliga), trocar de item (roda);
//   - em cima: inventário (E), Esc (menu do jogo) e sair do modo jogo.
// Num menu do jogo (inventário, pausa) o PC mostra o cursor: arrastar o dedo move o cursor de lá
// e "Bater" clica onde ele está.
//
// Tudo vai por controle.mandar/mover: o modo jogo marca cada evento e o ajudante nativo do PC
// manda como scancode e movimento relativo, igual ao mouse e ao teclado de verdade.

const DEAD = 0.25; // zona morta do analógico
const CORRE = 0.95; // empurrar até a borda (para a frente) corre
const OLHAR = 2.2; // pixels do dedo -> pixels de mouse
const MOVE_MS = 16;

const TECLAS = {
  KeyW: { key: 'w', kc: 87 }, KeyA: { key: 'a', kc: 65 }, KeyS: { key: 's', kc: 83 }, KeyD: { key: 'd', kc: 68 },
  Space: { key: ' ', kc: 32 }, ShiftLeft: { key: 'Shift', kc: 16 }, ControlLeft: { key: 'Control', kc: 17 },
  KeyE: { key: 'e', kc: 69 }, Escape: { key: 'Escape', kc: 27 }, KeyQ: { key: 'q', kc: 81 },
};

export class ToqueJogo {
  constructor({ raiz, controle, onSair }) {
    this.raiz = raiz;
    this.controle = controle;
    this.onSair = onSair;
    this.key = null;
    this.apertadas = new Set(); // codes apertados agora (soltos todos ao sair)
    this.botoes = new Set(); // botões do mouse apertados
    this.agachado = false;
    this.montar();
  }

  montar() {
    const r = this.raiz;
    r.innerHTML = `
      <div class="tj-olhar"></div>
      <div class="tj-topo">
        <button type="button" data-tecla="KeyE">Inventário</button>
        <button type="button" data-tecla="KeyQ">Soltar</button>
        <button type="button" data-tecla="Escape">Esc</button>
        <button type="button" class="tj-sair">Sair do jogo</button>
      </div>
      <div class="tj-stick"><div class="tj-ring"></div><div class="tj-knob"></div></div>
      <div class="tj-acoes">
        <button type="button" class="tj-item" data-roda="-1" aria-label="Item anterior">◀</button>
        <button type="button" class="tj-item" data-roda="1" aria-label="Próximo item">▶</button>
        <button type="button" class="tj-agachar">Agachar</button>
        <button type="button" class="tj-usar" data-botao="right">Usar</button>
        <button type="button" class="tj-bater" data-botao="left">Bater</button>
        <button type="button" class="tj-pular" data-tecla="Space">Pular</button>
      </div>`;
    this.ligarStick(r.querySelector('.tj-stick'));
    this.ligarOlhar(r.querySelector('.tj-olhar'));
    for (const b of r.querySelectorAll('[data-tecla]')) this.segurar(b, () => this.tecla(b.dataset.tecla, true), () => this.tecla(b.dataset.tecla, false));
    for (const b of r.querySelectorAll('[data-botao]')) this.segurar(b, () => this.mouse(b.dataset.botao, true), () => this.mouse(b.dataset.botao, false));
    for (const b of r.querySelectorAll('[data-roda]')) {
      this.segurar(b, () => this.key && this.controle.mandar(this.key, { t: 'wheel', x: 0.5, y: 0.5, dx: 0, dy: Number(b.dataset.roda) * 100, mod: 0 }), () => {});
    }
    const agachar = r.querySelector('.tj-agachar');
    this.segurar(agachar, () => {
      this.agachado = !this.agachado;
      agachar.classList.toggle('on', this.agachado);
      this.tecla('ShiftLeft', this.agachado);
    }, () => {});
    this.segurar(r.querySelector('.tj-sair'), () => {}, () => this.onSair?.());
    // nada de menu de toque longo, seleção de texto ou zoom por cima do jogo
    r.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // botão que fica apertado enquanto o dedo está nele (pular segurando, quebrar bloco segurando)
  segurar(el, desce, sobe) {
    let id = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (id !== null) return;
      id = e.pointerId;
      try { el.setPointerCapture(id); } catch { /* ponteiro já solto */ }
      el.classList.add('apertado');
      navigator.vibrate?.(8);
      desce();
    });
    const solta = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove('apertado');
      sobe();
    };
    el.addEventListener('pointerup', solta);
    el.addEventListener('pointercancel', solta);
  }

  ligarStick(el) {
    const knob = el.querySelector('.tj-knob');
    let id = null;
    let cx = 0, cy = 0, raio = 60;
    const aplicar = (x, y) => {
      let dx = (x - cx) / raio;
      let dy = (y - cy) / raio;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = `translate(${dx * raio}px, ${dy * raio}px)`;
      const quer = new Set();
      if (len >= DEAD) {
        if (dy < -0.38) quer.add('KeyW');
        if (dy > 0.38) quer.add('KeyS');
        if (dx < -0.38) quer.add('KeyA');
        if (dx > 0.38) quer.add('KeyD');
        if (len >= CORRE && dy < -0.7) quer.add('ControlLeft');
      }
      el.classList.toggle('correndo', quer.has('ControlLeft'));
      // Ctrl desce antes do W (é assim que o Minecraft entende "correr")
      for (const c of ['ControlLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) {
        const tem = this.apertadas.has(c);
        if (quer.has(c) && !tem) this.tecla(c, true);
        else if (!quer.has(c) && tem) this.tecla(c, false);
      }
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      raio = r.width / 2;
      try { el.setPointerCapture(id); } catch { /* ponteiro já solto */ }
      el.classList.add('ativo');
      aplicar(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) aplicar(e.clientX, e.clientY);
    });
    const solta = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove('ativo');
      aplicar(cx, cy);
    };
    el.addEventListener('pointerup', solta);
    el.addEventListener('pointercancel', solta);
  }

  // arrastar = mexer o mouse (câmera no jogo, cursor nos menus). Só o primeiro dedo vale: o
  // segundo dedo está apertando um botão.
  ligarOlhar(el) {
    let id = null;
    let ux = 0, uy = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      ux = e.clientX;
      uy = e.clientY;
      try { el.setPointerCapture(id); } catch { /* ponteiro já solto */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || !this.key) return;
      // os pontos intermediários deixam o giro liso mesmo com o celular mandando poucos eventos
      const juntos = e.getCoalescedEvents?.();
      const pts = juntos?.length ? juntos : [e];
      let dx = 0, dy = 0;
      for (const p of pts) {
        dx += p.clientX - ux;
        dy += p.clientY - uy;
        ux = p.clientX;
        uy = p.clientY;
      }
      dx = Math.round(dx * OLHAR);
      dy = Math.round(dy * OLHAR);
      if (dx || dy) this.controle.mover(this.key, { t: 'mouse', a: 'move', dx, dy, b: 'left', arrastando: false, mod: 0 }, MOVE_MS);
    });
    const solta = (e) => { if (e.pointerId === id) id = null; };
    el.addEventListener('pointerup', solta);
    el.addEventListener('pointercancel', solta);
  }

  tecla(code, desce) {
    if (!this.key) return;
    const t = TECLAS[code];
    if (desce) this.apertadas.add(code); else this.apertadas.delete(code);
    this.controle.mandar(this.key, { t: 'tecla', a: desce ? 'down' : 'up', key: t.key, code, kc: t.kc, mod: 0 });
  }

  mouse(b, desce) {
    if (!this.key) return;
    if (desce) this.botoes.add(b); else this.botoes.delete(b);
    this.controle.mandar(this.key, { t: 'mouse', a: desce ? 'down' : 'up', x: 0.5, y: 0.5, b, n: 1, mod: 0 });
  }

  mostrar(key) {
    this.key = key;
    this.raiz.hidden = false;
    document.body.classList.add('toque-jogo');
  }

  esconder() {
    if (this.key) {
      for (const c of [...this.apertadas]) this.tecla(c, false);
      for (const b of [...this.botoes]) this.mouse(b, false);
    }
    this.agachado = false;
    this.raiz.querySelector('.tj-agachar')?.classList.remove('on');
    this.key = null;
    this.raiz.hidden = true;
    document.body.classList.remove('toque-jogo');
  }
}
