// Porradaria (no mapa todo, não só no ringue): soco com alcance e cone à frente, tiro para
// quem tem arma, empurrão, vida e nocaute. No ringue, cair do tablado também é nocaute.
// Cada cliente manda só o que ele mesmo fez (socou / levou dano), no mesmo nível de
// confiança do resto da sala — é um jogo entre amigos, não um competitivo valendo nada.
import * as THREE from 'three';
import { COMBAT, RING, insideRing, ringCorners } from './arena.js';
import { ARMAS, ARMA_PADRAO } from './armas-dados.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _lado = new THREE.Vector3();
const _cima = new THREE.Vector3();

export class Combat {
  constructor({ player, socket, getOthers, onState, onHitLanded, onKo, onDamage }) {
    this.player = player;
    this.socket = socket;
    // () => [{ id, position, raio?, altura?, acertar?(origem, dir, max) }]: raio e altura dão o
    // tamanho do corpo para o soco; acertar diz onde o tiro pega (hitbox.js). Sem ele, três esferas.
    this.getOthers = getOthers;
    this.onState = onState; // (health, inRing) => void
    this.onHitLanded = onHitLanded; // (targetId) => void  (acertou alguém)
    this.onKo = onKo; // (byName|null) => void  (você foi nocauteado)
    this.onDamage = onDamage; // () => void (você levou dano)

    this.health = COMBAT.maxHealth;
    this.cooldown = 0;
    this.cooldownTiro = 0;
    this.sinceHit = 99;
    this.knockedOut = false;
    this.koTimer = 0;
    this.inRing = false;
    this.swing = 0; // 0..1 para a animação do braço
    this.lastKoBy = null;
    this.ultimoAgressor = null; // { id, name, idade } — crédito do ring-out
    this.ultimaArma = null; // o que bateu por último ('soco' ou o id da arma): vai junto no nocaute
    // mata-mata em times: quem cai não levanta sozinho (só na rodada seguinte) e a vida não volta
    this.semVoltar = false;
    this.semRegen = false;
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
    if (this.cooldown > 0 || this.knockedOut) return false;
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
      // o alcance conta até a beira do corpo: num robô de 2,8 m o centro fica bem para dentro
      if (dist > COMBAT.reach + Math.max(0, (o.raio ?? 0.45) - 0.45) || dist < 0.01) continue;
      // altura parecida: não dá para socar quem está muito acima/abaixo
      if (Math.abs(o.position.y - origin.y) > Math.max(2.2, o.altura ?? 0)) continue;
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

  // ------------------------------------------------------------------ atirar
  // Cada chumbo (a escopeta tem vários, as outras um) sai da mira (origem/dir), espalhado pela
  // abertura da arma, e acerta o primeiro jogador no caminho — pela hitbox de cada um (o.acertar,
  // ver hitbox.js), ou três esferas empilhadas — se nenhuma parede (bloqueado) estiver antes.
  // Devolve onde cada chumbo parou (para os traçantes) e o jogador que levou mais chumbos, com quantos.
  atirar({ origem, dir, bloqueado, arma = ARMA_PADRAO }) {
    const def = ARMAS[arma] || ARMAS[ARMA_PADRAO];
    if (this.cooldownTiro > 0 || this.knockedOut) return null;
    this.cooldownTiro = def.cadencia;
    _lado.crossVectors(dir, _cima.set(0, 1, 0));
    if (_lado.lengthSq() < 1e-6) _lado.set(1, 0, 0); // mirando reto para cima ou para baixo
    _lado.normalize();
    _cima.crossVectors(_lado, dir).normalize();
    const pontos = [];
    const acertos = new Map(); // alvo -> chumbos
    for (let i = 0; i < def.chumbos; i++) {
      _d.copy(dir);
      if (def.abertura) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * def.abertura;
        _d.addScaledVector(_lado, Math.cos(a) * r).addScaledVector(_cima, Math.sin(a) * r).normalize();
      }
      let melhor = null;
      for (const o of this.getOthers()) {
        if (o.acertar) {
          const t = o.acertar(origem, _d, melhor ? melhor.t : def.alcance);
          if (t != null && (!melhor || t < melhor.t)) melhor = { alvo: o, t };
          continue;
        }
        for (const altura of [0.45, 0.95, 1.45]) {
          _a.set(o.position.x, o.position.y + altura, o.position.z).sub(origem);
          const t = _a.dot(_d);
          if (t < 0 || t > def.alcance) continue;
          if (_a.lengthSq() - t * t > 0.42 * 0.42) continue;
          if (!melhor || t < melhor.t) melhor = { alvo: o, t };
        }
      }
      const longe = melhor ? melhor.t : def.alcance;
      const parede = bloqueado?.(origem, _d, longe);
      if (parede != null && parede < longe) melhor = null;
      pontos.push(origem.clone().addScaledVector(_d, melhor ? melhor.t : parede ?? def.alcance));
      if (melhor) acertos.set(melhor.alvo, (acertos.get(melhor.alvo) || 0) + 1);
    }
    let alvo = null;
    let n = 0;
    for (const [o, q] of acertos) if (q > n) [alvo, n] = [o, q];
    if (!alvo) return { alvo: null, n: 0, ponto: pontos[0], pontos, dirXZ: null };
    _b.copy(alvo.position).sub(origem);
    _b.y = 0;
    _b.normalize();
    return { alvo, n, ponto: pontos[0], pontos, dirXZ: [_b.x, _b.z] };
  }

  // ------------------------------------------------------------------ apanhar
  // arma: id da arma (ou true, de quem ainda manda o formato antigo); n: chumbos que pegaram
  takeHit({ dir, from, fromName, arma, n = 1 }) {
    if (this.knockedOut) return;
    const [dx, dz] = Array.isArray(dir) ? dir : [0, 0];
    const def = arma ? ARMAS[arma] || ARMAS[ARMA_PADRAO] : null;
    const chumbos = Math.max(1, Math.min(def?.chumbos || 1, Number(n) || 1));
    const dano = def ? def.dano * chumbos : COMBAT.damage;
    const forte = this.health <= dano;
    const push = forte ? COMBAT.koKnockback : def ? def.empurrao * Math.sqrt(chumbos) : COMBAT.knockback;
    this.player.vel.x += dx * push;
    this.player.vel.z += dz * push;
    this.player.vel.y = Math.max(this.player.vel.y, forte ? COMBAT.koLift : COMBAT.lift);
    this.player.grounded = false;
    this.player.ground = null;

    this.health = Math.max(0, this.health - dano);
    this.sinceHit = 0;
    this.ultimaArma = def ? def.id : 'soco';
    this.ultimoAgressor = { id: from || null, name: fromName || null, idade: 0 };
    this.onDamage?.();
    this.onState?.(this.health, this.inRing);
    if (this.health === 0) this.knockOut(fromName, from);
  }

  knockOut(byName, byId) {
    if (this.knockedOut) return;
    this.knockedOut = true;
    this.koNoRingue = this.inRing; // no ringue volta para um canto; no resto do mapa, levanta onde caiu
    this.koTimer = COMBAT.respawnDelay;
    this.lastKoBy = byName || null;
    this.socket?.emit('ko', { by: byId || null, arma: byId ? this.ultimaArma : null });
    this.onKo?.(byName || null);
  }

  // ------------------------------------------------------------------ por frame
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.cooldownTiro = Math.max(0, this.cooldownTiro - dt);
    this.sinceHit += dt;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt / 0.26);

    const dentro = insideRing(this.player.pos, 0.5);
    if (dentro !== this.inRing) {
      this.inRing = dentro;
      if (dentro) this.health = COMBAT.maxHealth;
      this.onState?.(this.health, this.inRing);
    }

    if (this.knockedOut) {
      if (this.semVoltar) return; // em times: espera a próxima rodada (batalha.js levanta)
      this.koTimer -= dt;
      if (this.koTimer <= 0) {
        this.knockedOut = false;
        this.health = COMBAT.maxHealth;
        if (this.koNoRingue) this.respawnInRing();
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

    if (this.health < COMBAT.maxHealth && this.sinceHit > COMBAT.regenDelay && !this.semRegen) {
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
