// Luta no ringue: soco com alcance e cone à frente, empurrão, vida e nocaute.
// Cada cliente manda só o que ele mesmo fez (socou / levou dano), no mesmo nível de
// confiança do resto da sala — é um jogo entre amigos, não um competitivo valendo nada.
import * as THREE from 'three';
import { COMBAT, RING, insideRing, ringCorners } from './arena.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Combat {
  constructor({ player, socket, getOthers, onState, onHitLanded, onKo, onDamage }) {
    this.player = player;
    this.socket = socket;
    this.getOthers = getOthers; // () => [{ id, position }]
    this.onState = onState; // (health, inRing) => void
    this.onHitLanded = onHitLanded; // (targetId) => void  (acertou alguém)
    this.onKo = onKo; // (byName|null) => void  (você foi nocauteado)
    this.onDamage = onDamage; // () => void (você levou dano)

    this.health = COMBAT.maxHealth;
    this.cooldown = 0;
    this.sinceHit = 99;
    this.knockedOut = false;
    this.koTimer = 0;
    this.inRing = false;
    this.swing = 0; // 0..1 para a animação do braço
    this.lastKoBy = null;
    this.ultimoAgressor = null; // { id, name, idade } — crédito do ring-out
  }

  reset() {
    this.health = COMBAT.maxHealth;
    this.knockedOut = false;
    this.koTimer = 0;
    this.sinceHit = 99;
    this.onState?.(this.health, this.inRing);
  }

  // ------------------------------------------------------------------ socar
  punch() {
    if (this.cooldown > 0 || this.knockedOut || !this.inRing) return false;
    this.cooldown = COMBAT.cooldown;
    this.swing = 1;
    this.socket?.emit('punch');

    // direção em que o jogador está olhando, no plano
    const yaw = this.player.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const origin = this.player.pos;

    let acertou = null;
    let maisPerto = Infinity;
    for (const o of this.getOthers()) {
      _a.copy(o.position).sub(origin);
      _a.y = 0;
      const dist = _a.length();
      if (dist > COMBAT.reach || dist < 0.01) continue;
      // altura parecida: não dá para socar quem está muito acima/abaixo
      if (Math.abs(o.position.y - origin.y) > 2.2) continue;
      _a.divideScalar(dist);
      if (_a.x * fx + _a.z * fz < COMBAT.arc) continue; // está atrás ou muito de lado
      if (dist < maisPerto) {
        maisPerto = dist;
        acertou = o;
      }
    }

    if (acertou) {
      _b.copy(acertou.position).sub(origin);
      _b.y = 0;
      _b.normalize();
      this.socket?.emit('hit', { to: acertou.id, dir: [_b.x, _b.z] });
      this.onHitLanded?.(acertou.id);
    }
    return true;
  }

  // ------------------------------------------------------------------ apanhar
  takeHit({ dir, from, fromName }) {
    if (this.knockedOut) return;
    const [dx, dz] = Array.isArray(dir) ? dir : [0, 0];
    const forte = this.health <= COMBAT.damage;
    const push = forte ? COMBAT.koKnockback : COMBAT.knockback;
    this.player.vel.x += dx * push;
    this.player.vel.z += dz * push;
    this.player.vel.y = Math.max(this.player.vel.y, forte ? COMBAT.koLift : COMBAT.lift);
    this.player.grounded = false;
    this.player.ground = null;

    this.health = Math.max(0, this.health - COMBAT.damage);
    this.sinceHit = 0;
    this.ultimoAgressor = { id: from || null, name: fromName || null, idade: 0 };
    this.onDamage?.();
    this.onState?.(this.health, this.inRing);
    if (this.health === 0) this.knockOut(fromName, from);
  }

  knockOut(byName, byId) {
    if (this.knockedOut) return;
    this.knockedOut = true;
    this.koTimer = COMBAT.respawnDelay;
    this.lastKoBy = byName || null;
    this.socket?.emit('ko', { by: byId || null });
    this.onKo?.(byName || null);
  }

  // ------------------------------------------------------------------ por frame
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceHit += dt;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt / 0.26);

    const dentro = insideRing(this.player.pos, 0.5);
    if (dentro !== this.inRing) {
      this.inRing = dentro;
      if (dentro) this.health = COMBAT.maxHealth;
      this.onState?.(this.health, this.inRing);
    }

    if (this.knockedOut) {
      this.koTimer -= dt;
      if (this.koTimer <= 0) {
        this.knockedOut = false;
        this.health = COMBAT.maxHealth;
        this.respawnInRing();
        this.onState?.(this.health, this.inRing);
      }
      return;
    }

    // Caiu do ringue = nocaute. O crédito vai para quem bateu por último, se foi há
    // pouco: empurrar alguém para fora é justamente a graça do ringue, e antes disso
    // o empurrão não contava ponto para ninguém.
    if (this.ultimoAgressor) {
      this.ultimoAgressor.idade += dt;
      if (this.ultimoAgressor.idade > COMBAT.creditoRingOut) this.ultimoAgressor = null;
    }
    if (!dentro && this.health < COMBAT.maxHealth && this.player.pos.y < RING.matTop - 1) {
      const a = this.ultimoAgressor;
      this.knockOut(a ? a.name : null, a ? a.id : null);
      return;
    }

    if (this.inRing && this.health < COMBAT.maxHealth && this.sinceHit > COMBAT.regenDelay) {
      const antes = this.health;
      this.health = Math.min(COMBAT.maxHealth, this.health + COMBAT.regenRate * dt);
      if (Math.floor(antes) !== Math.floor(this.health)) this.onState?.(this.health, this.inRing);
    }
  }

  respawnInRing() {
    const cantos = ringCorners();
    const c = cantos[Math.floor(Math.random() * cantos.length)];
    const yaw = Math.atan2(RING.x - c[0], RING.z - c[2]) + Math.PI;
    this.player.teleport(c, yaw);
  }
}
