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
    this.touchLook = 1; // multiplicador do arrasto com o dedo
    this.sitting = false; // sentado num sofá/pufe
    this.veiculo = false; // transformado em carro
    this.volante = 0; // -1..1, só para animar as rodas
    this.velocidade = 0; // m/s na direção do carro
    this.shake = 0; // tremor da câmera (soco recebido)
    this.shakeSeed = Math.random() * 100;
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
    this.sitting = true;
    this.vel.set(0, 0, 0);
    this.pos.y = assento.max.y;
    this.jumpBuffer = 0;
    this.emit('sit', true);
    return true;
  }

  stand() {
    if (!this.sitting) return false;
    this.sitting = false;
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
    this.sitting = false;
    this.velocidade = 0;
    this.volante = 0;
    this.vel.set(0, this.vel.y, 0);
    this.emit('veiculo', this.veiculo);
    return true;
  }

  toggleMode() {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    return this.mode;
  }

  teleport(pos, yaw = null) {
    this.pos.set(pos[0], pos[1] + 0.05, pos[2]);
    this.vel.set(0, 0, 0);
    if (yaw !== null) {
      this.yaw = yaw;
      this.bodyYaw = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    }
    this.ground = null;
    this.grounded = false;
    this.camDistCurrent = 0.5;
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
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.runInput || this.runLock;

    if (this.veiculo) {
      this.passoCarro(dt, f, r, running);
      return;
    }

    const hasInput = (f !== 0 || r !== 0) && !this.override;

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
      this.vel.y = JUMP;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.ground = null;
      this.emit('jump');
    }

    this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -45);

    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveVertical(this.vel.y * dt);

    if (this.grounded) this.coyote = 0.11;

    const type = this.ground?.data.type;
    if (type === 'pad') {
      this.vel.y = this.ground.data.strength;
      this.grounded = false;
      this.emit('pad');
    } else if (type === 'teleport') {
      this.emit('teleport', this.ground.data.target);
    }
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
      if (this.jumpHeld && !this.override) this.jumpBuffer = Math.max(this.jumpBuffer, 0.12);
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

  updateCamera(dt) {
    const cam = this.world.camera;
    // decai rápido: tremor longo embrulha o estômago
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);
    if (this.override) {
      const k = 1 - Math.exp(-dt * 6);
      cam.position.lerp(this.override.position, k);
      this.lookPoint.lerp(this.override.target, k);
      cam.lookAt(this.lookPoint);
      this.avatar.setVisible(true);
      return;
    }

    const dir = this.lookDirection(_dir);
    if (this.mode === 'first') {
      cam.position.set(this.pos.x, this.pos.y + 1.62, this.pos.z);
      this.applyShake(cam);
      this.lookPoint.copy(cam.position).add(dir);
      cam.lookAt(this.lookPoint);
      this.avatar.setVisible(false);
      return;
    }

    const target = _v.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
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
    cam.position.x = THREE.MathUtils.clamp(cam.position.x, ROOM.minX + 0.4, ROOM.maxX - 0.4);
    cam.position.z = THREE.MathUtils.clamp(cam.position.z, ROOM.minZ + 0.4, ROOM.maxZ - 0.4);
    cam.position.y = THREE.MathUtils.clamp(cam.position.y, 0.3, ROOM.height - 0.4);
    cam.lookAt(target);
    this.lookPoint.copy(target);
    // esconde o próprio boneco se a câmera encostar nele
    this.avatar.setVisible(this.camDistCurrent > 1.1);
  }
}
