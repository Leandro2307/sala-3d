// Bonecos lisos: corpo em cápsula, cabeça redonda com viseira e mãozinhas flutuantes.
import * as THREE from 'three';

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";

export const EMOTES = {
  wave: '👋', party: '🎉', laugh: '😂', heart: '❤️', clap: '👏', fire: '🔥',
};

// Proporções: pé no chão em y=0 e topo da cabeça em ~1.8, que é a altura do colisor.
const ALTURA = {
  perna: 0.58, // do chão até o quadril
  troncoY: 1.0, // centro do tronco
  cabecaY: 1.52,
  cabecaR: 0.285,
};

// A frente do boneco é +Z (a viseira original já era centrada ali).
// Reprojeta o UV de um pedaço de esfera/cilindro como se a textura fosse colada
// de frente, senão o UV nativo da esfera distorce a foto nas bordas.
function uvDeFrente(geo) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i));
    minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) {
    // +X do mundo cai na direita da tela para quem olha o boneco de frente,
    // então u cresce junto com x — inverter aqui espelhava o texto da camiseta.
    uv.setXY(i, (pos.getX(i) - minX) / (maxX - minX), (pos.getY(i) - minY) / (maxY - minY));
  }
  uv.needsUpdate = true;
  return geo;
}

const shared = {
  torso: new THREE.CapsuleGeometry(0.3, 0.38, 10, 28),
  quadril: new THREE.SphereGeometry(0.26, 20, 14),
  coxa: new THREE.CapsuleGeometry(0.115, 0.3, 6, 14),
  pe: new THREE.SphereGeometry(0.125, 14, 10),
  head: new THREE.SphereGeometry(0.285, 32, 24),
  visor: new THREE.SphereGeometry(0.285, 32, 16, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.3, Math.PI * 0.32),
  hand: new THREE.SphereGeometry(0.105, 16, 12),
  halo: new THREE.TorusGeometry(0.44, 0.03, 8, 48),
  // calota na frente da cabeça, onde entra a foto do rosto
  rosto: uvDeFrente(new THREE.SphereGeometry(0.292, 28, 22, Math.PI / 2 - 0.62, 1.24, Math.PI / 2 - 0.58, 1.16)),
  // faixa curva no peito, onde entra a estampa da camiseta
  peito: uvDeFrente(new THREE.CylinderGeometry(0.307, 0.307, 0.34, 28, 1, true, -0.72, 1.44)),
  visorMat: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.12, metalness: 0.6 }),
  sapatoMat: new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 0.6 }),
};

function makeCanvasSprite(w, h, scaleX, scaleY) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scaleX, scaleY, 1);
  sprite.renderOrder = 10;
  return { sprite, canvas, ctx: canvas.getContext('2d'), tex };
}

function drawMicOff(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.2, y - s * 0.55, s * 0.4, s * 0.7, s * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - s * 0.05, s * 0.38, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.moveTo(x, y + s * 0.33);
  ctx.lineTo(x, y + s * 0.55);
  ctx.moveTo(x - s * 0.5, y - s * 0.55);
  ctx.lineTo(x + s * 0.5, y + s * 0.55);
  ctx.stroke();
  ctx.restore();
}

function drawScreenBadge(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#6ee7c8';
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0b0d12';
  ctx.lineWidth = s * 0.15;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.5, y - s * 0.38, s, s * 0.62, s * 0.08);
  ctx.moveTo(x - s * 0.22, y + s * 0.5);
  ctx.lineTo(x + s * 0.22, y + s * 0.5);
  ctx.stroke();
  ctx.restore();
}

// Camisetas de time político. São opções de vestuário escolhidas por quem joga —
// as duas existem, com o mesmo destaque, e nenhuma é padrão.
export const SHIRTS = {
  none: { label: 'Sem camiseta', cor: null },
  lula: { label: 'PT — Lula 13', cor: 0xc81e1e, numero: '13', nome: 'LULA', fundo: '#c81e1e', tinta: '#ffffff', estrela: true },
  bolsonaro: { label: 'Bolsonaro 22', cor: 0x166534, numero: '22', nome: 'BOLSONARO', fundo: '#166534', tinta: '#fde047' },
};

function estampaCamiseta(kind) {
  const def = SHIRTS[kind];
  if (!def || !def.numero) return null;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = def.fundo;
  ctx.fillRect(0, 0, 256, 256);

  if (def.estrela) {
    // estrela de cinco pontas atrás do número
    ctx.save();
    ctx.translate(128, 104);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 62 : 26;
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = def.tinta;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 108px ${FONT}`;
  ctx.fillText(def.numero, 128, 108);
  ctx.font = `700 ${def.nome.length > 6 ? 30 : 42}px ${FONT}`;
  ctx.fillText(def.nome, 128, 194);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Recorta a foto num círculo com borda, para ela virar um rosto e não um quadrado.
function fotoRedonda(img, cor) {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.arc(n / 2, n / 2, n / 2 - 10, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, 0, 0, n, n);
  ctx.restore();
  ctx.strokeStyle = cor;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(n / 2, n / 2, n / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Avatar {
  constructor({ name, color, isLocal = false }) {
    this.isLocal = isLocal;
    this.name = name;
    this.color = color;
    this.mic = true;
    this.sharing = false;
    this.speaking = false;
    this.anim = 0;
    this.phase = Math.random() * 10;
    this.speakLevel = 0;

    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);

    this.material = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.02 });

    this.body = new THREE.Mesh(shared.torso, this.material);
    this.body.position.y = ALTURA.troncoY;
    this.hip = new THREE.Mesh(shared.quadril, this.material);
    this.hip.position.y = ALTURA.perna;
    this.hip.scale.set(1, 0.72, 1);
    this.head = new THREE.Mesh(shared.head, this.material);
    this.head.position.y = ALTURA.cabecaY;
    const visor = new THREE.Mesh(shared.visor, shared.visorMat);
    visor.scale.setScalar(1.03);
    this.head.add(visor);
    this.visor = visor;
    this.face = null; // foto do rosto, quando a pessoa escolhe uma
    this.photo = null;
    this.shirt = 'none';
    this.chest = null; // estampa da camiseta
    this.health = 1; // 0..1 — barra só aparece quando leva porrada
    this.swing = 0; // animação do soco
    this.ko = false;
    this.sitting = false;
    this.handL = new THREE.Mesh(shared.hand, this.material);
    this.handR = new THREE.Mesh(shared.hand, this.material);

    // pernas: cada uma é um grupo que gira no quadril
    this.legs = [];
    for (const lado of [-1, 1]) {
      const perna = new THREE.Group();
      perna.position.set(lado * 0.145, ALTURA.perna, 0);
      const coxa = new THREE.Mesh(shared.coxa, this.material);
      coxa.position.y = -0.265;
      coxa.castShadow = true;
      const pe = new THREE.Mesh(shared.pe, shared.sapatoMat);
      pe.position.set(0, -0.53, 0.04);
      pe.scale.set(1, 0.66, 1.42);
      pe.castShadow = true;
      perna.add(coxa, pe);
      this.inner.add(perna);
      this.legs.push(perna);
    }

    for (const m of [this.body, this.hip, this.head, this.handL, this.handR]) {
      m.castShadow = true;
      this.inner.add(m);
    }

    // auréola que acende quando a pessoa fala
    this.halo = new THREE.Mesh(
      shared.halo,
      new THREE.MeshBasicMaterial({ color: 0x6ee7c8, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
    );
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = ALTURA.cabecaY;
    this.inner.add(this.halo);

    this.tag = makeCanvasSprite(512, 128, 2.6, 0.65);
    this.tag.sprite.position.y = 2.3;
    this.tag.sprite.visible = !isLocal; // o próprio nome só atrapalharia a visão
    this.group.add(this.tag.sprite);
    this.drawTag();

    this.bubble = null;
    this.emotes = [];

    // estado remoto (interpolação)
    this.target = new THREE.Vector3();
    this.targetYaw = 0;
    this.lastPos = new THREE.Vector3();
    this.hasTarget = false;
    this.waveTime = 0;
  }

  drawTag() {
    const { ctx, canvas, tex } = this.tag;
    const w = canvas.width;
    ctx.clearRect(0, 0, w, canvas.height);
    ctx.font = `700 50px ${FONT}`;
    const label = this.name;
    const tw = Math.min(ctx.measureText(label).width, 330);
    const icons = (this.mic ? 0 : 1) + (this.sharing ? 1 : 0);
    const pw = tw + 70 + icons * 64;
    const x0 = (w - pw) / 2;
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.beginPath();
    ctx.roundRect(x0, 22, pw, 84, 42);
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(x0 + 38, 64, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x0 + 60, 66, 330);
    let ix = x0 + 60 + tw + 36;
    if (this.sharing) { drawScreenBadge(ctx, ix, 64, 24); ix += 60; }
    if (!this.mic) drawMicOff(ctx, ix, 64, 24);

    // barra de vida: só aparece quando a pessoa está machucada
    if (this.health < 1) {
      const bw = Math.max(pw, 180);
      const bx = (w - bw) / 2;
      ctx.fillStyle = 'rgba(10,12,18,0.8)';
      ctx.beginPath();
      ctx.roundRect(bx, 112, bw, 14, 7);
      ctx.fill();
      const v = Math.max(0, Math.min(1, this.health));
      ctx.fillStyle = v > 0.5 ? '#4ade80' : v > 0.25 ? '#fbbf24' : '#f2555a';
      ctx.beginPath();
      ctx.roundRect(bx + 2, 114, Math.max(0, (bw - 4) * v), 10, 5);
      ctx.fill();
    }
    tex.needsUpdate = true;
  }

  setName(name) { this.name = name; this.drawTag(); }

  // Foto do rosto. É uma calota que acompanha a curva da cabeça e fica POR FORA
  // dela: antes era um disco chato na mesma altura da superfície, e por isso as
  // bordas afundavam dentro da cabeça.
  setPhoto(dataUrl) {
    if (this.face) {
      this.head.remove(this.face);
      this.face.material.map?.dispose();
      this.face.material.dispose();
      this.face = null;
    }
    this.photo = dataUrl || null;
    if (!dataUrl) {
      this.visor.visible = true;
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (this.photo !== dataUrl) return; // trocou de foto enquanto carregava
      const tex = fotoRedonda(img, this.color);
      const calota = new THREE.Mesh(
        shared.rosto,
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }),
      );
      this.head.add(calota);
      this.face = calota;
      this.visor.visible = false;
    };
    img.onerror = () => { this.visor.visible = true; };
    img.src = dataUrl;
  }

  // Camiseta: pinta o tronco e cola a estampa curva no peito.
  setShirt(kind) {
    this.shirt = SHIRTS[kind] ? kind : 'none';
    if (this.chest) {
      this.body.remove(this.chest);
      this.chest.material.map?.dispose();
      this.chest.material.dispose();
      this.chest = null;
    }
    const def = SHIRTS[this.shirt];
    this.shirtMat = this.shirtMat || new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.02 });
    if (!def.cor) {
      this.body.material = this.material;
      return;
    }
    this.shirtMat.color.setHex(def.cor);
    this.body.material = this.shirtMat;
    const tex = estampaCamiseta(this.shirt);
    if (tex) {
      const faixa = new THREE.Mesh(shared.peito, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 }));
      faixa.position.y = 0.02;
      this.body.add(faixa);
      this.chest = faixa;
    }
  }

  setHealth(v) {
    const novo = Math.max(0, Math.min(1, v));
    if (Math.abs(novo - this.health) < 0.005) return;
    this.health = novo;
    this.drawTag();
  }

  setKo(on) {
    this.ko = !!on;
  }

  punch() { this.swing = 1; }

  setColor(color) {
    this.color = color;
    this.material.color.set(color);
    // a foto tem a borda na cor do jogador: redesenha para acompanhar
    if (this.photo) {
      const url = this.photo;
      this.photo = null;
      this.setPhoto(url);
    }
    this.drawTag();
  }

  setStatus({ mic, sharing }) {
    let dirty = false;
    if (mic !== undefined && mic !== this.mic) { this.mic = mic; dirty = true; }
    if (sharing !== undefined && sharing !== this.sharing) { this.sharing = sharing; dirty = true; }
    if (dirty) this.drawTag();
  }

  setVisible(v) {
    this.inner.visible = v;
  }

  // balão de fala do chat
  say(text) {
    if (this.bubble) this.group.remove(this.bubble.sprite);
    const b = makeCanvasSprite(768, 256, 4.2, 1.4);
    const { ctx } = b;
    ctx.font = `600 40px ${FONT}`;
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 660 && line) { lines.push(line); line = word; } else line = test;
      if (lines.length === 3) break;
    }
    if (lines.length < 3 && line) lines.push(line);
    if (lines.length === 3 && words.join(' ').length > lines.join(' ').length) lines[2] = `${lines[2].slice(0, -1)}…`;
    const lw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = lw + 60;
    const bh = lines.length * 50 + 36;
    const x0 = (768 - bw) / 2;
    const y0 = 256 - bh - 26;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(x0, y0, bw, bh, 26);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(384 - 16, y0 + bh - 1);
    ctx.lineTo(384, y0 + bh + 20);
    ctx.lineTo(384 + 16, y0 + bh - 1);
    ctx.fill();
    ctx.fillStyle = '#0f1219';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, 384, y0 + 20 + i * 50));
    b.tex.needsUpdate = true;
    b.sprite.position.y = 3.25;
    b.life = 6 + text.length * 0.03;
    this.bubble = b;
    this.group.add(b.sprite);
  }

  emote(kind) {
    const glyph = EMOTES[kind];
    if (!glyph) return;
    const e = makeCanvasSprite(128, 128, 0.9, 0.9);
    e.ctx.font = `96px ${EMOJI_FONT}`;
    e.ctx.textAlign = 'center';
    e.ctx.textBaseline = 'middle';
    e.ctx.fillText(glyph, 64, 72);
    e.tex.needsUpdate = true;
    e.sprite.position.set((Math.random() - 0.5) * 0.6, 2.1, 0);
    e.life = 0;
    this.emotes.push(e);
    this.group.add(e.sprite);
    if (kind === 'wave') this.waveTime = 1.6;
  }

  // posição/rotação recebidas pela rede
  setNetworkState(p, r, a) {
    this.target.set(p[0], p[1], p[2]);
    this.targetYaw = r;
    this.anim = a;
    if (!this.hasTarget) {
      this.group.position.copy(this.target);
      this.inner.rotation.y = r;
      this.hasTarget = true;
    }
  }

  update(dt, t) {
    if (!this.isLocal && this.hasTarget) {
      const k = 1 - Math.exp(-dt * 12);
      if (this.group.position.distanceToSquared(this.target) > 400) this.group.position.copy(this.target);
      else this.group.position.lerp(this.target, k);
      let d = this.targetYaw - this.inner.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.inner.rotation.y += d * k;
    }

    // animação procedural
    const moving = this.anim === 1 || this.anim === 2;
    const airborne = this.anim === 3;
    const speed = this.anim === 2 ? 15 : 10;
    if (moving) this.phase += dt * speed;
    else this.phase += dt * 2;
    const s = Math.sin(this.phase);
    const bob = moving ? Math.abs(s) * 0.12 : Math.sin(t * 2 + this.phase) * 0.015;

    const sentado = this.anim === 4;
    const alturaSentado = sentado ? -0.34 : 0;

    this.body.position.y = ALTURA.troncoY + bob + alturaSentado;
    this.hip.position.y = ALTURA.perna + bob * 0.8 + alturaSentado;
    this.head.position.y = ALTURA.cabecaY + bob * 1.1 + alturaSentado;
    this.body.rotation.z = moving && !sentado ? s * 0.06 : 0;
    this.body.rotation.x = sentado ? -0.12 : moving ? (this.anim === 2 ? 0.16 : 0.08) : 0;
    this.halo.position.y = this.head.position.y;

    // pernas: alternam no caminhar, juntam no ar, dobram para a frente sentado
    const passo = moving ? s * (this.anim === 2 ? 0.95 : 0.62) : 0;
    this.legs.forEach((perna, i) => {
      const lado = i === 0 ? 1 : -1;
      perna.position.y = ALTURA.perna + bob * 0.8 + alturaSentado;
      if (sentado) {
        perna.rotation.x = -1.42; // coxa para a frente
        perna.rotation.z = 0;
        perna.children[1].position.set(0, -0.3, 0.46); // pé apoiado no chão
      } else {
        perna.rotation.x = airborne ? (lado > 0 ? -0.55 : 0.3) : passo * lado;
        perna.rotation.z = 0;
        perna.children[1].position.set(0, -0.53, 0.04);
      }
    });

    if (airborne) {
      this.handL.position.set(-0.46, 1.18, 0.05);
      this.handR.position.set(0.46, 1.18, 0.05);
      this.body.scale.set(0.94, 1.06, 0.94);
    } else {
      this.body.scale.set(1, 1, 1);
      const bracos = moving && !sentado ? s * 0.3 : 0;
      const yMao = (sentado ? 0.76 : 0.92) + bob + alturaSentado;
      this.handL.position.set(-0.44, yMao, sentado ? 0.3 : bracos);
      this.handR.position.set(0.44, yMao, sentado ? 0.3 : -bracos);
    }
    if (this.waveTime > 0) {
      this.waveTime -= dt;
      this.handR.position.set(0.58 + Math.sin(t * 14) * 0.12, 1.85, 0.1);
    }

    // soco: o braço direito dispara para frente e volta
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt / 0.26);
      const golpe = Math.sin((1 - this.swing) * Math.PI);
      this.handR.position.set(0.34 - golpe * 0.16, 1.05 + bob, 0.24 + golpe * 0.9);
      this.handL.position.set(-0.4, 0.95 + bob, 0.18);
      this.body.rotation.y = -golpe * 0.3;
    } else if (!this.ko) {
      this.body.rotation.y = 0;
    }

    // nocauteado: cai de lado
    const alvoKo = this.ko ? Math.PI / 2.1 : 0;
    this.inner.rotation.z += (alvoKo - this.inner.rotation.z) * Math.min(1, dt * 9);

    // fala
    const targetLevel = this.speaking ? 1 : 0;
    this.speakLevel += (targetLevel - this.speakLevel) * Math.min(1, dt * 10);
    this.halo.material.opacity = this.speakLevel * (0.55 + 0.35 * Math.sin(t * 10));
    const hs = 1 + this.speakLevel * 0.08 * Math.sin(t * 9);
    this.halo.scale.set(hs, hs, hs);

    if (this.bubble) {
      this.bubble.life -= dt;
      this.bubble.sprite.material.opacity = Math.min(1, this.bubble.life);
      if (this.bubble.life <= 0) {
        this.group.remove(this.bubble.sprite);
        this.bubble.tex.dispose();
        this.bubble.sprite.material.dispose();
        this.bubble = null;
      }
    }

    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const e = this.emotes[i];
      e.life += dt;
      e.sprite.position.y = 2.1 + e.life * 1.1;
      const sc = 0.9 + Math.min(e.life * 3, 0.5);
      e.sprite.scale.set(sc, sc, 1);
      e.sprite.material.opacity = Math.max(0, 1 - Math.max(0, e.life - 1.4) / 0.8);
      if (e.life > 2.2) {
        this.group.remove(e.sprite);
        e.tex.dispose();
        e.sprite.material.dispose();
        this.emotes.splice(i, 1);
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.material.dispose();
    this.halo.material.dispose();
    this.tag.tex.dispose();
    this.tag.sprite.material.dispose();
  }
}
