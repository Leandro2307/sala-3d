// Bonecos lisos: corpo em cápsula, cabeça redonda com viseira e mãozinhas flutuantes.
import * as THREE from 'three';

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";

export const EMOTES = {
  wave: '👋', party: '🎉', laugh: '😂', heart: '❤️', clap: '👏', fire: '🔥',
};

const shared = {
  body: new THREE.CapsuleGeometry(0.4, 0.5, 10, 28),
  head: new THREE.SphereGeometry(0.34, 32, 24),
  visor: new THREE.SphereGeometry(0.34, 32, 16, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.3, Math.PI * 0.32),
  hand: new THREE.SphereGeometry(0.12, 16, 12),
  halo: new THREE.TorusGeometry(0.5, 0.035, 8, 48),
  visorMat: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.12, metalness: 0.6 }),
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

    this.body = new THREE.Mesh(shared.body, this.material);
    this.body.position.y = 0.65;
    this.head = new THREE.Mesh(shared.head, this.material);
    this.head.position.y = 1.47;
    const visor = new THREE.Mesh(shared.visor, shared.visorMat);
    visor.scale.setScalar(1.03);
    this.head.add(visor);
    this.handL = new THREE.Mesh(shared.hand, this.material);
    this.handR = new THREE.Mesh(shared.hand, this.material);
    for (const m of [this.body, this.head, this.handL, this.handR]) {
      m.castShadow = true;
      this.inner.add(m);
    }

    // auréola que acende quando a pessoa fala
    this.halo = new THREE.Mesh(
      shared.halo,
      new THREE.MeshBasicMaterial({ color: 0x6ee7c8, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
    );
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 1.47;
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
    tex.needsUpdate = true;
  }

  setName(name) { this.name = name; this.drawTag(); }

  setColor(color) {
    this.color = color;
    this.material.color.set(color);
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

    this.body.position.y = 0.65 + bob;
    this.head.position.y = 1.47 + bob * 1.1;
    this.body.rotation.z = moving ? s * 0.06 : 0;
    this.body.rotation.x = moving ? (this.anim === 2 ? 0.16 : 0.08) : 0;
    this.halo.position.y = this.head.position.y;

    if (airborne) {
      this.handL.position.set(-0.55, 1.35, 0.05);
      this.handR.position.set(0.55, 1.35, 0.05);
      this.body.scale.set(0.94, 1.06, 0.94);
    } else {
      this.body.scale.set(1, 1, 1);
      const swing = moving ? s * 0.32 : 0;
      this.handL.position.set(-0.56, 0.72 + bob, swing);
      this.handR.position.set(0.56, 0.72 + bob, -swing);
    }
    if (this.waveTime > 0) {
      this.waveTime -= dt;
      this.handR.position.set(0.58 + Math.sin(t * 14) * 0.12, 1.85, 0.1);
    }

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
