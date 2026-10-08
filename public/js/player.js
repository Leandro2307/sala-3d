// Controle do jogador: física simples com caixas (AABB), pulo com "coyote time", câmera 1ª/3ª pessoa.
import * as THREE from 'three';
import { ROOM } from './world.js';

const HW = 0.36; // meia largura do jogador
const H = 1.8; // altura
const STEP = 0.42; // degrau que sobe sem pular
const GRAVITY = 30;
const JUMP = 11.5;
const WALK = 7.5;
const RUN = 11.5;
// carro: anda muito mais rápido, mas acelera e freia com inércia
const CARRO_TOPO = 46;
const CARRO_TURBO = 64;
const CARRO_RE = 9;
const CARRO_ACEL = 17;
const CARRO_FREIO = 26;
const CARRO_ATRITO = 1.6;
const CARRO_ESTERCO = 2.1; // radianos por segundo no volante
const EPS = 1e-4;
// 1ª pessoa: os olhos ficam sempre nesta altura acima do chão — em pé, sentado (no posto, no sofá)
// ou de carro. Sentado, antes ia para o assento + 1,28, mais alto que em pé (e acima dos monitores)
const OLHO = 1.62;

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export class Player {
  constructor(world, avatar) {
    this.world = world;
    this.avatar = avatar;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.12;
    this.bodyYaw = Math.PI;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.mode = 'third';
    this.camDist = 6;
    this.camDistCurrent = 6;
    this.sensitivity = 1;
    this.enabled = false;
    this.keys = new Set();
    this.moveInput = { x: 0, y: 0 }; // analógico do celular (-1..1), somado ao teclado
    this.runInput = false; // analógico empurrado até a borda
    this.runLock = false; // botão "correr" fixado
    this.jumpHeld = false; // botão de pulo mantido pressionado
    this.pedal = 0; // pedais do celular no modo carro: 1 acelera, -1 freia/ré
    // poderes
    this.voando = false; // sem gravidade: Espaço/pulo sobe, C/botão desce, Shift acelera
    this.puloAlto = false; // pulo com o dobro da força (~4x a altura)
    this.descerHeld = false; // botão "descer" do celular, voando
    this.touchLook = 1; // multiplicador do arrasto com o dedo
    this.sitting = false; // sentado num sofá/pufe
    this.veiculo = false; // transformado em carro
    // física de fora (o surf, em ceu.js): (dt, frente, lado, correndo) no lugar do passo normal
    this.fisicaExterna = null;
    this.travado = false; // nocauteado: fica onde caiu, sem andar nem pular (só olha em volta)
    this.volante = 0; // -1..1, só para animar as rodas
    this.velocidade = 0; // m/s na direção do carro
    this.shake = 0; // tremor da câmera (soco recebido)
    this.shakeSeed = Math.random() * 100;
    // balanço da visão (1ª pessoa, ver balancoDaVisao)
    this.balancoVisao = true; // ajuste do jogador: quem enjoa desliga
    this.mirando = false; // na luneta a mira balança com a respiração (main.js), não com o passo
    this.balanco = 0; // 0..1: quanto do balanço do passo está valendo
    this.passo = 0; // fase da passada
    this.forcaQueda = 0; // afundada da aterrissagem, em metros
    this.tQueda = 1;
    // altura dos olhos sem pulos: degrau subido sozinho e sentar/levantar viram um ajuste que se desfaz
    this.chaoSentado = null; // o chão embaixo do assento (o assento não é o chão)
    this.deOnde = null; // onde fica em pé ao levantar da cadeira (ver sentarEm)
    this.degrau = 0;
    this.ajusteOlho = 0;
    this.olhoAntes = null;
    this.sentadoAntes = false;
    this.override = null; // { position, target } para modo foco
    this.events = {};
    this.anim = 0;
    this.lookPoint = new THREE.Vector3();

    this.bindInput();
  }

  on(name, fn) { this.events[name] = fn; }
  emit(name, ...args) { this.events[name]?.(...args); }

  bindInput() {
    const typing = () => {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || typing()) return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.jumpBuffer = 0.14;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== this.world.canvas) return;
      this.look(e.movementX, e.movementY);
    });

    // arrastar (mouse ou dedo) gira a câmera sem travar o ponteiro.
    // Rastreia o pointerId pra que o dedo do analógico não atropele o dedo que olha.
    let drag = null;
    this.world.canvas.addEventListener('pointerdown', (e) => {
      if (document.pointerLockElement || drag) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, touch: e.pointerType === 'touch' };
      // o toque precisa de captura: o dedo costuma sair do canvas durante o arrasto
      if (drag.touch) {
        try { this.world.canvas.setPointerCapture(e.pointerId); } catch { /* ignorado */ }
        e.preventDefault();
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id || !this.enabled) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      const threshold = drag.touch ? 8 : 4; // o dedo tremer não deve virar a câmera
      if (drag.moved > threshold) {
        const gain = drag.touch ? 2.1 * this.touchLook : 1.4;
        this.look(dx * gain, dy * gain);
      }
    }, { passive: true });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tapped = drag.moved <= (drag.touch ? 8 : 4);
      const onCanvas = drag.touch || e.target === this.world.canvas;
      drag = null;
      if (tapped && onCanvas) this.emit('click');
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    this.world.canvas.addEventListener('wheel', (e) => {
      if (!this.enabled || this.mode !== 'third') return;
      this.camDist = THREE.MathUtils.clamp(this.camDist + Math.sign(e.deltaY) * 0.8, 2.2, 16);
    }, { passive: true });

    // pinça com dois dedos aproxima/afasta a câmera (3ª pessoa)
    let pinch = null;
    const pts = new Map();
    this.world.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), start: this.camDist };
      }
    });
    this.world.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || pts.size !== 2 || this.mode !== 'third') return;
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.dist > 0) this.camDist = THREE.MathUtils.clamp(pinch.start * (pinch.dist / d), 2.2, 16);
    }, { passive: true });
    const dropPt = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
    };
    window.addEventListener('pointerup', dropPt);
    window.addEventListener('pointercancel', dropPt);
  }

  look(dx, dy) {
    if (this.override) return;
    const s = 0.0022 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    const limit = this.mode === 'first' ? 1.45 : 1.1;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit * 0.9);
  }

  // Senta no assento em que o jogador está pisando.
  sit(assento) {
    if (!assento) return false;
    this.sitYaw = null;
    this.sitting = true;
    this.vel.set(0, 0, 0);
    this.chaoSentado = assento.min.y;
    this.deOnde = null;
    this.pos.y = assento.max.y;
    this.jumpBuffer = 0;
    this.emit('sit', true);
    return true;
  }

  // Senta num lugar marcado (cadeira de escritório, sofá): vai para o assento, virado para onde
  // ele está virado. Na cadeira de um posto a câmera vai para primeira pessoa, para ver os
  // monitores sem a própria cabeça na frente; ao levantar volta como estava.
  sentarEm(lugar) {
    // o chão é o de onde estava em pé, perto da cadeira. Em pé EM CIMA de um assento (a própria
    // cadeira, depois de levantar nela), vale o chão embaixo dele: senão os olhos subiam 0,62 m e o
    // posto ficava visto de cima, por cima dos monitores
    const g = this.grounded ? this.ground : null;
    const emCimaDoAssento = g?.data?.type === 'sofa' || g?.data?.type === 'puff';
    this.chaoSentado = Math.min(emCimaDoAssento ? g.min.y : this.pos.y, lugar.y);
    // ao levantar, volta para cá (de cima do assento: para o chão, atrás dele)
    this.deOnde = emCimaDoAssento
      ? new THREE.Vector3(lugar.x + Math.sin(lugar.yaw) * 0.75, this.chaoSentado, lugar.z + Math.cos(lugar.yaw) * 0.75)
      : this.pos.clone();
    this.pos.set(lugar.x, lugar.y, lugar.z);
    this.vel.set(0, 0, 0);
    this.yaw = lugar.yaw;
    // no posto, com os olhos na altura dos monitores, só um pouco para baixo: teclado e mouse também
    this.pitch = lugar.posto ? -0.16 : 0;
    this.sitYaw = Math.atan2(-Math.sin(lugar.yaw), -Math.cos(lugar.yaw));
    this.bodyYaw = this.sitYaw;
    this.jumpBuffer = 0;
    if (lugar.posto && this.mode !== 'first') {
      this.modoAntes = this.mode;
      this.mode = 'first';
    }
    this.sitting = true;
    this.emit('sit', true);
    return true;
  }

  stand() {
    if (!this.sitting) return false;
    this.sitting = false;
    this.sitYaw = null;
    // levanta onde estava em pé antes de sentar: a cadeira do posto ocupa o chão embaixo dela, e
    // levantar ali deixava o boneco em pé em cima do assento. Sem esse lugar (ou ocupado), no chão
    // de onde sentou, em vez de cair do assento (se ali não tiver nada no caminho)
    const chao = this.chaoSentado;
    const volta = this.deOnde;
    this.chaoSentado = null;
    this.deOnde = null;
    if (volta && Math.hypot(volta.x - this.pos.x, volta.z - this.pos.z) < 1.6 && !this.blockedAt(volta.x, volta.y + EPS, volta.z)) {
      this.pos.set(volta.x, volta.y + EPS, volta.z);
    } else if (chao != null && chao < this.pos.y && !this.blockedAt(this.pos.x, chao + EPS, this.pos.z)) this.pos.y = chao + EPS;
    if (this.modoAntes) {
      this.mode = this.modoAntes;
      this.modoAntes = null;
    }
    this.emit('sit', false);
    return true;
  }

  // Qualquer intenção de andar ou pular levanta: ninguém quer ficar preso no sofá.
  querSeMexer() {
    const k = this.keys;
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      if (k.has(code)) return true;
    }
    return !!(this.moveInput.x || this.moveInput.y || this.jumpBuffer > 0 || this.jumpHeld);
  }

  // Sacode a câmera. Usado quando se leva um soco: sem isso o golpe não "pesa".
  addShake(força = 1) {
    this.shake = Math.min(1.6, this.shake + força);
  }

  // Vira carro (ou volta a ser boneco). Em carro o controle é de direção:
  // W/S aceleram e freiam, A/D viram o volante — não dá para andar de lado.
  setVeiculo(on) {
    if (this.veiculo === !!on) return false;
    this.veiculo = !!on;
    this.stand();
    this.velocidade = 0;
    this.volante = 0;
    this.vel.set(0, this.vel.y, 0);
    this.emit('veiculo', this.veiculo);
    return true;
  }

  toggleMode() {
    this.modoAntes = null; // trocou na mão: ao levantar fica como escolheu
    this.mode = this.mode === 'third' ? 'first' : 'third';
    return this.mode;
  }

  teleport(pos, yaw = null) {
    this.pos.set(pos[0], pos[1] + 0.05, pos[2]);
    this.vel.set(0, 0, 0);
    this.velocidade = 0; // o carro não chega embalado
    if (yaw !== null) {
      this.yaw = yaw;
      this.bodyYaw = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    }
    this.ground = null;
    this.grounded = false;
    this.camDistCurrent = 0.5;
    // chegou em outro lugar: nada de deslizar da altura antiga nem de balançar o passo de lá
    this.degrau = 0;
    this.ajusteOlho = 0;
    this.olhoAntes = null;
    this.balanco = 0;
    this.forcaQueda = 0;
  }

  // ------------------------------------------------------------------ física
  overlaps(c, x, y, z) {
    return x + HW > c.min.x && x - HW < c.max.x
      && y + H > c.min.y && y < c.max.y
      && z + HW > c.min.z && z - HW < c.max.z;
  }

  blockedAt(x, y, z) {
    for (const c of this.world.colliders) if (this.overlaps(c, x, y, z)) return true;
    return false;
  }

  moveAxis(axis, amount) {
    const p = this.pos;
    p[axis] += amount;
    for (const c of this.world.colliders) {
      if (!this.overlaps(c, p.x, p.y, p.z)) continue;
      // sobe degraus baixos automaticamente
      const rise = c.max.y - p.y;
      if (rise > 0 && rise <= STEP && (this.grounded || this.coyote > 0) && !this.blockedAt(p.x, c.max.y + EPS, p.z)) {
        this.degrau += c.max.y + EPS - p.y; // a câmera sobe deslizando (updateCamera)
        p.y = c.max.y + EPS;
        continue;
      }
      let dirSign = Math.sign(amount);
      if (dirSign === 0 || c.data.move) {
        // empurrado por plataforma móvel: sai pelo lado mais próximo
        const center = (c.min[axis] + c.max[axis]) / 2;
        dirSign = p[axis] < center ? 1 : -1;
      }
      if (dirSign > 0) p[axis] = c.min[axis] - HW - EPS;
      else p[axis] = c.max[axis] + HW + EPS;
      this.vel[axis] = 0;
    }
  }

  moveVertical(amount) {
    const p = this.pos;
    p.y += amount;
    this.grounded = false;
    let ground = null;
    for (const c of this.world.colliders) {
      if (!this.overlaps(c, p.x, p.y, p.z)) continue;
      if (amount <= 0) {
        p.y = c.max.y;
        this.vel.y = 0;
        this.grounded = true;
        if (!ground || c.max.y >= ground.max.y) ground = c;
      } else {
        p.y = c.min.y - H - EPS;
        this.vel.y = 0;
      }
    }
    this.ground = ground;
  }

  physicsStep(dt) {
    const k = this.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    // analógico do celular assume quando o teclado está parado
    if (f === 0 && r === 0) {
      f = this.moveInput.y;
      r = this.moveInput.x;
    }
    // no carro, os pedais do celular mandam no acelerador; o analógico fica só de volante
    if (this.veiculo && this.pedal) f = this.pedal;
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.runInput || this.runLock;
    if (this.travado) {
      f = 0;
      r = 0;
      this.jumpBuffer = 0;
    }

    if (this.fisicaExterna) {
      this.fisicaExterna(dt, f, r, running);
      return;
    }
    if (this.veiculo) {
      this.passoCarro(dt, f, r, running);
      return;
    }

    const hasInput = (f !== 0 || r !== 0) && !this.override;

    if (this.voando) {
      this.passoVoo(dt, f, r, running, hasInput);
      return;
    }

    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    _dir.set(-sy * f + cy * r, 0, -cy * f - sy * r);
    if (_dir.lengthSq() > 0) _dir.normalize();
    // o analógico anda mais devagar quando empurrado só um pouco (o teclado sempre dá 1)
    const mag = Math.min(1, Math.hypot(f, r));
    const speed = (running ? RUN : WALK) * mag;
    const accel = this.grounded ? 14 : hasInput ? 5 : 0.6;
    const t = Math.min(1, accel * dt);
    this.vel.x += ((hasInput ? _dir.x * speed : 0) - this.vel.x) * t;
    this.vel.z += ((hasInput ? _dir.z * speed : 0) - this.vel.z) * t;

    // pulo (com buffer e coyote time)
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.override) {
      this.vel.y = JUMP * (this.puloAlto ? 2 : 1);
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.ground = null;
      this.emit('jump');
    }

    this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -45);

    const noAr = !this.grounded;
    const vy = this.vel.y;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveVertical(this.vel.y * dt);

    if (this.grounded) this.coyote = 0.11;

    const type = this.ground?.data.type;
    // aterrissou de um pulo ou queda (descer degrau não conta): a câmera afunda e volta.
    // No trampolim não: ele já joga para cima de novo
    if (noAr && this.grounded && vy < -6 && type !== 'pad') {
      this.forcaQueda = Math.min(0.12, (-vy - 6) * 0.006);
      this.tQueda = 0;
    }
    if (type === 'pad') {
      this.vel.y = this.ground.data.strength;
      this.grounded = false;
      this.emit('pad');
    } else if (type === 'teleport') {
      this.emit('teleport', this.ground.data.target);
    }
  }

  // Um passo de voo: anda na direção da câmera, sobe e desce por botão, sem gravidade.
  // As colisões continuam valendo (não atravessa parede nem chão).
  passoVoo(dt, f, r, running, hasInput) {
    const k = this.keys;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    _dir.set(-sy * f + cy * r, 0, -cy * f - sy * r);
    if (_dir.lengthSq() > 0) _dir.normalize();
    const mag = Math.min(1, Math.hypot(f, r));
    const speed = (running ? 30 : 15) * mag;
    const t = Math.min(1, 6 * dt);
    this.vel.x += ((hasInput ? _dir.x * speed : 0) - this.vel.x) * t;
    this.vel.z += ((hasInput ? _dir.z * speed : 0) - this.vel.z) * t;
    const sobe = (k.has('Space') || this.jumpHeld) && !this.override;
    const desce = (k.has('KeyC') || k.has('ControlLeft') || this.descerHeld) && !this.override;
    const vy = ((sobe ? 1 : 0) - (desce ? 1 : 0)) * (running ? 16 : 10);
    this.vel.y += (vy - this.vel.y) * t;
    this.jumpBuffer = 0;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveVertical(this.vel.y * dt);
  }

  // Um passo da física do carro. Mantido separado do boneco porque o modelo é
  // outro: a velocidade vive na direção em que o carro aponta, e virar o volante
  // gira o carro inteiro em vez de mudar a direção do passo.
  passoCarro(dt, acelerador, direcao, turbo) {
    if (this.override) {
      this.velocidade *= Math.max(0, 1 - dt * 4);
    } else {
      const topo = turbo ? CARRO_TURBO : CARRO_TOPO;
      if (acelerador > 0) this.velocidade += CARRO_ACEL * acelerador * dt;
      else if (acelerador < 0) {
        // S freia enquanto o carro anda para a frente; parado, engata a ré
        const taxa = this.velocidade > 0.5 ? CARRO_FREIO : CARRO_ACEL;
        this.velocidade -= taxa * -acelerador * dt;
      } else {
        this.velocidade -= this.velocidade * CARRO_ATRITO * dt;
      }
      this.velocidade = THREE.MathUtils.clamp(this.velocidade, -CARRO_RE, topo);

      // o volante só responde com o carro em movimento, como um carro de verdade
      const resposta = Math.min(1, Math.abs(this.velocidade) / 7);
      this.volante += (direcao - this.volante) * Math.min(1, dt * 8);
      this.yaw -= this.volante * CARRO_ESTERCO * resposta * dt * Math.sign(this.velocidade || 1);
    }

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.vel.x = fx * this.velocidade;
    this.vel.z = fz * this.velocidade;
    this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -45);

    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveVertical(this.vel.y * dt);
    // bateu em alguma coisa: perde a velocidade de verdade
    const real = Math.hypot(this.vel.x, this.vel.z);
    if (real < Math.abs(this.velocidade) - 2) this.velocidade *= 0.45;
    if (this.grounded) this.coyote = 0.11;
  }

  update(dt) {
    if (this.enabled && this.sitting) {
      if (this.querSeMexer()) this.stand();
      else {
        this.vel.set(0, 0, 0);
        this.anim = 4;
      }
    }

    if (this.enabled && !this.sitting) {
      // botão de pulo mantido pressionado: pula de novo ao encostar no chão
      if (this.jumpHeld && !this.override && !this.travado) this.jumpBuffer = Math.max(this.jumpBuffer, 0.12);
      // carregado por plataforma móvel (deslocamento deste frame)
      if (this.ground && this.ground.data.move) this.pos.add(this.ground.delta);
      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) this.physicsStep(h);
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      if (this.pos.y < -30) this.emit('void');
    }

    // orientação do boneco
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.veiculo) {
      this.bodyYaw = Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    } else if (this.sitting && this.sitYaw != null) {
      this.bodyYaw = this.sitYaw; // na cadeira o corpo fica virado para a mesa
    } else if (this.mode === 'first' || this.sitting) {
      this.bodyYaw = Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    } else if (hs > 0.6) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.bodyYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.bodyYaw += d * Math.min(1, dt * 14);
    }
    this.anim = this.veiculo ? 5 : this.sitting ? 4 : !this.grounded && this.coyote <= 0 ? 3 : hs > 9 ? 2 : hs > 0.6 ? 1 : 0;

    this.avatar.group.position.copy(this.pos);
    this.avatar.inner.rotation.y = this.bodyYaw;
    this.avatar.anim = this.anim;
    this.avatar.velocidade = this.velocidade;
    this.avatar.volante = this.volante;

    this.updateCamera(dt);
  }

  applyShake(cam) {
    if (this.shake <= 0) return;
    const t = performance.now() / 1000 + this.shakeSeed;
    const k = this.shake * this.shake * 0.42; // ao quadrado: soco forte sacode muito mais
    cam.position.x += Math.sin(t * 47) * k;
    cam.position.y += Math.sin(t * 61 + 1.7) * k;
    cam.position.z += Math.sin(t * 53 + 3.1) * k * 0.6;
  }

  lookDirection(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // Balanço da visão na 1ª pessoa: a cada passo a câmera desce e sobe (duas vezes por passada),
  // ginga de leve para o lado do pé de apoio e inclina um tiquinho. A média é zero: balança em volta
  // da altura padrão, sem tirar a câmera dela. Some aos poucos ao parar, no ar, sentado, de carro,
  // voando e na luneta. Devolve a inclinação (radianos) para girar a câmera depois do lookAt.
  balancoDaVisao(dt, cam) {
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const pisando = this.grounded || this.coyote > 0;
    const vale = this.balancoVisao && !this.mirando && pisando && !this.sitting && !this.veiculo && !this.voando;
    this.balanco += ((vale ? Math.min(1, hs / WALK) : 0) - this.balanco) * (1 - Math.exp(-dt * 8));
    // ~2,4 passos por segundo andando, ~2,9 correndo
    this.passo = (this.passo + dt * (4.2 + hs * 0.45)) % (Math.PI * 2);

    // aterrissagem: afunda e volta sem passar do ponto (resposta de mola criticamente amortecida)
    this.tQueda += dt;
    const w = this.tQueda * 9;
    cam.position.y -= this.balancoVisao && w < 6 ? this.forcaQueda * w * Math.exp(1 - w) : 0;

    const k = this.balanco;
    if (k < 0.001) return 0;
    const correndo = THREE.MathUtils.clamp((hs - WALK) / (RUN - WALK), 0, 1);
    const s = Math.sin(this.passo);
    // |sen| tem média 2/π: descontada, o pé no chão fica abaixo da altura padrão e o meio do passo acima
    cam.position.y += (Math.abs(s) - 2 / Math.PI) * (0.05 + correndo * 0.025) * k;
    const lado = s * (0.022 + correndo * 0.01) * k; // para a direita da câmera
    cam.position.x += Math.cos(this.yaw) * lado;
    cam.position.z -= Math.sin(this.yaw) * lado;
    return -s * 0.006 * k;
  }

  updateCamera(dt) {
    const cam = this.world.camera;
    // decai rápido: tremor longo embrulha o estômago
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);

    // altura dos olhos sem pulos: o degrau que o boneco subiu sozinho vira um ajuste que se desfaz
    // rápido (pulo e queda seguem o corpo na hora, senão a câmera fica "boiando")
    this.ajusteOlho = THREE.MathUtils.clamp(this.ajusteOlho - this.degrau, -0.8, 0.8);
    this.degrau = 0;
    // 1ª pessoa: OLHO acima do chão, também sentado; sentar e levantar deslizam para a altura nova
    const olho = (this.sitting && this.chaoSentado != null ? this.chaoSentado : this.pos.y) + OLHO;
    if (this.mode === 'first' && this.sitting !== this.sentadoAntes && this.olhoAntes != null && Math.abs(this.olhoAntes - olho) < 1.5) {
      this.ajusteOlho = THREE.MathUtils.clamp(this.ajusteOlho + this.olhoAntes - olho, -0.8, 0.8);
    }
    this.sentadoAntes = this.sitting;
    this.olhoAntes = olho;
    this.ajusteOlho *= Math.exp(-dt * 12);

    if (this.override) {
      const k = 1 - Math.exp(-dt * 6);
      cam.position.lerp(this.override.position, k);
      this.lookPoint.lerp(this.override.target, k);
      cam.lookAt(this.lookPoint);
      // sentado (no posto) ou com a câmera colada no boneco, ele só taparia a tela: some
      // (personagem grande, como o Optimus, ficava na frente dos monitores)
      this.avatar.setVisible(!this.sitting && cam.position.distanceTo(this.avatar.group.position) > 2.2);
      return;
    }

    const dir = this.lookDirection(_dir);
    if (this.mode === 'first') {
      cam.position.set(this.pos.x, olho + this.ajusteOlho, this.pos.z);
      const inclinacao = this.balancoDaVisao(dt, cam);
      this.applyShake(cam);
      // o alvo anda junto com a câmera: o balanço mexe a visão, não a mira
      this.lookPoint.copy(cam.position).add(dir);
      cam.lookAt(this.lookPoint);
      if (inclinacao) cam.rotateZ(inclinacao);
      this.avatar.setVisible(false);
      return;
    }
    this.balanco = 0; // voltando para a 1ª pessoa, o balanço entra aos poucos

    const target = _v.set(this.pos.x, this.pos.y + 1.55 + this.ajusteOlho, this.pos.z);
    // impede a câmera de atravessar paredes/plataformas
    _ray.set(target, dir.clone().negate());
    _ray.far = this.camDist + 0.4;
    const hits = _ray.intersectObjects(this.world.cameraBlockers, false);
    let allowed = this.camDist;
    if (hits.length) allowed = Math.max(0.6, hits[0].distance - 0.4);
    if (allowed < this.camDistCurrent) this.camDistCurrent = allowed;
    else this.camDistCurrent += (allowed - this.camDistCurrent) * Math.min(1, dt * 5);

    cam.position.copy(target).addScaledVector(dir, -this.camDistCurrent);
    this.applyShake(cam);
    // dentro do mapa a câmera não passa da cerca nem do teto; lá no céu (surf, mata-mata) é livre
    if (this.pos.y < ROOM.height) {
      cam.position.x = THREE.MathUtils.clamp(cam.position.x, ROOM.minX + 0.4, ROOM.maxX - 0.4);
      cam.position.z = THREE.MathUtils.clamp(cam.position.z, ROOM.minZ + 0.4, ROOM.maxZ - 0.4);
      cam.position.y = THREE.MathUtils.clamp(cam.position.y, 0.3, ROOM.height - 0.4);
    }
    cam.lookAt(target);
    this.lookPoint.copy(target);
    // esconde o próprio boneco se a câmera encostar nele
    this.avatar.setVisible(this.camDistCurrent > 1.1);
  }
}
