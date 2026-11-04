// Criador por voz: segure N, fale o que quer ("pistola que atira pombos que cagam granadas") e
// solte — aquilo vira a arma na mão, no mapa todo. Também dá para digitar no chat: /criar <frase>.
// Dizer "guardar" (ou /criar guardar) tira da mão. U abre o catálogo (criador-catalogo.js).
//
// O leitor da frase e as peças ficam em criador-dados.js, os modelos em criador-modelos.js; aqui
// ficam a física das coisas criadas (batem nas paredes do mapa, que são caixas em world.colliders)
// e a rede: a frase vai para a sala ('criador-arma') e cada tiro manda só de onde saiu e para onde
// ('criador-tiro'). Cada navegador monta a mesma árvore e simula as coisas por conta própria; só
// o de quem atirou conta o dano ('criador-acerto', o servidor confere e manda o 'hit').
import * as THREE from 'three';
import { parsear, arvore, nomeDaCriacao, projetilDe } from './criador-dados.js';
import { GEO, GEO_ESF, construirModelo, corDe, modeloNaMao } from './criador-modelos.js';
import { Catalogo } from './criador-catalogo.js';

const V3 = THREE.Vector3;
const R = Math.random;
const G = 18; // gravidade das coisas criadas
const MAX_ENT = 300; // coisas vivas no mundo (as mais velhas somem)
const ALCANCE_ALVO = 45; // até onde os bichos procuram alguém
const DANO_JOGADOR = 0.6; // os números do catálogo são para boneco de teste: em gente, menos
const _tmp = new V3();
const _tmp2 = new V3();
const _dirC = new V3();

// ------------------------------------------------------------------ grade das paredes do mapa
// world.colliders tem milhares de caixas: cada coisa criada só olha as das casas em volta dela.
const CEL = 8;
class Grade {
  constructor(world) {
    this.world = world;
    this.lista = null;
    this.n = -1;
    this.cel = new Map();
    this.grandes = [];
  }

  atualizar() {
    const cs = this.world.colliders;
    if (cs === this.lista && cs.length === this.n) return;
    this.lista = cs;
    this.n = cs.length;
    this.cel.clear();
    this.grandes = [];
    for (const c of cs) {
      if (!c?.min) continue;
      const x0 = Math.floor(c.min.x / CEL);
      const x1 = Math.floor(c.max.x / CEL);
      const z0 = Math.floor(c.min.z / CEL);
      const z1 = Math.floor(c.max.z / CEL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) { this.grandes.push(c); continue; }
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const k = `${x},${z}`;
          let l = this.cel.get(k);
          if (!l) this.cel.set(k, (l = []));
          l.push(c);
        }
      }
    }
  }

  em(x, z) {
    return this.cel.get(`${Math.floor(x / CEL)},${Math.floor(z / CEL)}`) || null;
  }
}

// ------------------------------------------------------------------ som (sintetizado)
let AC = null;
let ultimoBum = 0;
function audio() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch { /* sem áudio */ }
  return AC;
}
function bip(f, dur, tipo = 'square', vol = 0.06, fFim = f, atraso = 0) {
  const ac = AC;
  if (!ac || vol < 0.003) return;
  const t = ac.currentTime + atraso;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, fFim), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function ruido(dur, vol, freq) {
  const ac = AC;
  if (!ac || vol < 0.01) return;
  const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (R() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  s.buffer = buf;
  f.type = 'lowpass';
  f.frequency.value = freq;
  g.gain.value = vol;
  s.connect(f).connect(g).connect(ac.destination);
  s.start();
}
let ultimoTiro = 0;
const som = {
  tiro: (v = 1) => {
    const t = performance.now();
    if (t - ultimoTiro < 40) return; // lança-chamas e minigun: sem metralhar o ouvido
    ultimoTiro = t;
    bip(520, 0.06, 'square', 0.035 * v, 160);
  },
  bum: (v = 1) => {
    const t = performance.now();
    if (t - ultimoBum < 60) return;
    ultimoBum = t;
    ruido(0.6, 0.4 * v, 700);
  },
  criar: () => {
    bip(400, 0.1, 'triangle', 0.07, 800);
    bip(600, 0.12, 'triangle', 0.07, 1200, 0.09);
    bip(900, 0.15, 'triangle', 0.06, 1500, 0.18);
  },
  erro: () => bip(220, 0.25, 'sawtooth', 0.04, 110),
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// como a peça se mexe, com os jeitos da frase ("vaca voadora", "pombo teleguiado")
function movDe(n) {
  const m = n.d.mov;
  if (n.voa && (m === 'anda' || m === 'arco' || m === 'parado')) return 'voa';
  if (n.guiado && m !== 'anda' && m !== 'parado' && m !== 'volta') return 'guiado';
  return m;
}

// ------------------------------------------------------------------ o criador
export class Criador {
  // opts: world, player, toast, socket(), eu(), localAvatar, avatarDe(id), alvos() -> [{ id, pos, raio, altura }],
  // podeUsar() (ligado e fora das arenas), podeAtirar() (não está sentado, dirigindo, nocauteado...),
  // acertar(id, dano, [dx, dz]), empurrar(vetor) (explosão ou buraco negro perto de mim)
  constructor(opts) {
    Object.assign(this, opts);
    this.scene = opts.world.scene;
    this.camera = opts.world.camera;
    this.grade = new Grade(opts.world);
    this.raiz = null; // a minha criação
    this.texto = null;
    this.vm = null; // na tela, em 1ª pessoa
    this.naMao = new Map(); // id -> { raiz, texto, modelo, avatar } (a criação no boneco de cada um)
    this.ents = [];
    this.flashes = [];
    this.listaAlvos = [];
    this.gatilhoOn = false;
    this.espera = 0;
    this.recuo = 0;
    this.formando = 1;
    this.balanco = 0;
    this.ouvindo = false;
    this.rec = null;
    this.montarHud();
    this.montarParticulas();
    this.catalogo = new Catalogo({ criar: (t) => this.pedir(t), aberto: () => this.podeUsar() });
  }

  get armado() {
    return !!this.raiz && this.podeUsar();
  }

  abrirCatalogo() {
    if (!this.podeUsar()) {
      this.toast('O criador por voz está desligado aqui.', 'info', 2600);
      return;
    }
    this.catalogo.abrir();
  }

  // ---------------------------------------------------------------- HUD
  montarHud() {
    const css = document.createElement('style');
    css.textContent = `#criador-hud { position: fixed; left: 14px; bottom: 120px; z-index: 24; max-width: min(420px, 70vw); max-height: 40vh; overflow: hidden; padding: 9px 13px; border-radius: 12px;
  background: rgba(15,23,42,.8); color: #f8fafc; pointer-events: none; font: 600 12px 'Plus Jakarta Sans', system-ui, sans-serif; }
#criador-hud b { display: block; font-size: 11px; letter-spacing: .12em; color: #fbbf24; margin-bottom: 4px; }
#criador-hud pre { margin: 0; font: 12px/1.45 ui-monospace, Consolas, monospace; white-space: pre; }
#criador-hud small { display: block; margin-top: 5px; color: #94a3b8; font-weight: 600; }
#criador-fala { position: fixed; left: 50%; bottom: 150px; transform: translateX(-50%); z-index: 26; max-width: min(640px, 90vw); padding: 10px 16px;
  border-radius: 12px; background: rgba(15,23,42,.88); color: #f8fafc; text-align: center; pointer-events: none;
  font: 600 15px 'Plus Jakarta Sans', system-ui, sans-serif; transition: opacity .35s; opacity: 0; }
#criador-fala.ouvindo { box-shadow: 0 0 0 2px #ef4444; }
#criador-fala .erro { color: #fca5a5; } #criador-fala .aviso { color: #fde68a; font-size: 13px; } #criador-fala .ok { color: #86efac; }
#criador-hud[hidden] { display: none; }`;
    document.head.appendChild(css);
    this.hud = document.createElement('div');
    this.hud.id = 'criador-hud';
    this.hud.hidden = true;
    this.fala = document.createElement('div');
    this.fala.id = 'criador-fala';
    document.body.append(this.hud, this.fala);
  }

  mostrarFala(html, fixo = false) {
    this.fala.innerHTML = html;
    this.fala.style.opacity = 1;
    clearTimeout(this.timerFala);
    if (!fixo) this.timerFala = setTimeout(() => { this.fala.style.opacity = 0; }, 6000);
  }

  // ---------------------------------------------------------------- voz
  falarInicio() {
    if (!this.podeUsar()) {
      this.toast('O criador por voz está desligado aqui.', 'info', 2600);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.mostrarFala('<span class="erro">Este navegador não reconhece voz. Use o Chrome ou o Edge, ou escreva no chat: /criar pistola que atira pombos</span>');
      return;
    }
    if (this.ouvindo) return;
    audio();
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = true;
    let final = '';
    let parcial = '';
    rec.onresult = (ev) => {
      parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += `${r[0].transcript} `;
        else parcial += r[0].transcript;
      }
      this.mostrarFala(`🎤 ${esc(final + parcial)}`, true);
    };
    rec.onerror = (ev) => {
      const msg = {
        'not-allowed': 'O microfone foi bloqueado para o reconhecimento de voz. Libere no cadeado da barra de endereço.',
        network: 'O reconhecimento de voz do navegador precisa de internet.',
        'no-speech': 'Não ouvi nada.',
        'audio-capture': 'Nenhum microfone encontrado.',
      }[ev.error] || `Erro de voz: ${ev.error}`;
      if (ev.error !== 'aborted') this.mostrarFala(`<span class="erro">${esc(msg)}</span>`);
    };
    rec.onend = () => {
      this.ouvindo = false;
      this.fala.classList.remove('ouvindo');
      const t = (final + parcial).trim();
      if (t) this.pedir(t);
      else if (this.fala.textContent.startsWith('🎤')) this.fala.style.opacity = 0;
    };
    try {
      rec.start();
      this.rec = rec;
      this.ouvindo = true;
      this.fala.classList.add('ouvindo');
      this.mostrarFala('🎤 ouvindo… fale e solte o N', true);
    } catch { /* já estava ouvindo */ }
  }

  falarFim() {
    if (this.rec && this.ouvindo) this.rec.stop();
  }

  // ---------------------------------------------------------------- pedir / guardar
  pedir(texto) {
    texto = String(texto || '').trim().slice(0, 200);
    if (!texto) return;
    if (!this.podeUsar()) {
      this.toast('O criador por voz está desligado aqui.', 'info', 2600);
      return;
    }
    audio();
    const r = parsear(texto);
    let html = `<b>Você disse:</b> “${esc(texto)}”`;
    if (r?.guardar) {
      this.guardar();
      this.mostrarFala(`${html}<br><span class="ok">Guardado.</span>`);
      return;
    }
    if (!r) {
      som.erro();
      this.mostrarFala(`${html}<br><span class="erro">Não reconheci nenhuma peça. Aperte U para ver o catálogo.</span>`);
      return;
    }
    if (r.ignoradas.length) html += `<br><span class="aviso">Ignorei: ${esc(r.ignoradas.join(', '))}</span>`;
    this.raiz = r.raiz;
    this.texto = texto;
    this.montarVm();
    this.hud.innerHTML = `<b>CRIAÇÃO NA MÃO</b><pre>${esc(arvore(r.raiz).trimEnd())}</pre><small>Clique ou X atira · N fala de novo · U catálogo · “guardar” tira</small>`;
    this.hud.hidden = false;
    som.criar();
    this.mostrarFala(`${html}<br><span class="ok">✔ ${esc(nomeDaCriacao(r.raiz))} na mão!</span>`);
    this.socket()?.emit('criador-arma', texto);
    this.definirArma(this.eu(), texto, r.raiz);
  }

  guardar(avisar = true) {
    if (!this.raiz) return;
    this.raiz = null;
    this.texto = null;
    this.gatilhoOn = false;
    if (this.vm) this.camera.remove(this.vm);
    this.vm = null;
    this.hud.hidden = true;
    if (avisar) this.socket()?.emit('criador-arma', null);
    this.definirArma(this.eu(), null);
  }

  // a criação de alguém (eu também, em 3ª pessoa): o modelo vai no boneco
  definirArma(id, texto, raizPronta = null) {
    const antes = this.naMao.get(id);
    if (antes) {
      antes.modelo.removeFromParent();
      this.mostrarArmaDoBoneco(antes.avatar, true);
      this.naMao.delete(id);
    }
    if (!texto) return;
    const raiz = raizPronta || parsear(texto)?.raiz;
    if (!raiz) return;
    this.naMao.set(id, { raiz, texto, modelo: modeloNaMao(raiz, 0.8), avatar: null });
  }

  mostrarArmaDoBoneco(avatar, on) {
    if (!avatar) return;
    if (avatar.armaMao) avatar.armaMao.visible = on;
    if (avatar.armaSolta) avatar.armaSolta.visible = on;
  }

  // quem entrou na sala agora fica sabendo o que eu tenho na mão
  reanunciar() {
    if (this.texto) this.socket()?.emit('criador-arma', this.texto);
  }

  montarVm() {
    if (this.vm) this.camera.remove(this.vm);
    this.vm = new THREE.Group();
    const m = modeloNaMao(this.raiz, 0.75);
    m.rotation.y = Math.PI; // os modelos olham para +z; a câmera, para -z
    this.vm.add(m);
    this.vm.userData = m.userData;
    this.vm.visible = false;
    this.camera.add(this.vm);
    this.formando = 0;
  }

  // ---------------------------------------------------------------- tiro
  gatilho(on) {
    this.gatilhoOn = on;
    if (on && this.espera <= 0) this.atirar();
  }

  atirar() {
    if (!this.armado || !this.podeAtirar() || this.formando < 0.8) return;
    const a = this.raiz;
    const f = projetilDe(a);
    this.espera = 1 / (a.d.cad * a.vel);
    const n = Math.min(30, a.d.qtd * a.qtd * f.qtd);
    const origem = new V3();
    if (this.player.mode === 'first' && this.vm?.visible) this.vm.userData.ponta.getWorldPosition(origem);
    else {
      const meu = this.naMao.get(this.eu());
      if (meu?.avatar) meu.modelo.userData.ponta.getWorldPosition(origem);
      else origem.set(this.player.pos.x, this.player.pos.y + 1.3, this.player.pos.z);
    }
    this.camera.getWorldDirection(_dirC);
    const r2 = (v) => Math.round(v * 1000) / 1000;
    const dirs = [];
    let origens = null;
    if (a.d.ceu) {
      // chuva: cai do céu em volta de onde se mira (no chão à frente, até 45 m)
      const cam = this.camera.position;
      let t = 45;
      if (_dirC.y < -0.02) t = Math.min(45, (cam.y - this.player.pos.y) / -_dirC.y);
      const alvo = cam.clone().addScaledVector(_dirC, t);
      const raio = 2 + n * 0.6;
      origens = [];
      for (let i = 0; i < n; i++) {
        origens.push(new V3(alvo.x + (R() - 0.5) * 2 * raio, alvo.y + 20 + R() * 8, alvo.z + (R() - 0.5) * 2 * raio));
        dirs.push(new V3((R() - 0.5) * 0.1, -1, (R() - 0.5) * 0.1).normalize());
      }
    } else {
      // mira: o ponto a 60 m à frente da câmera (em 3ª pessoa a câmera fica atrás do boneco)
      const base = _tmp.copy(this.camera.position).addScaledVector(_dirC, 60).sub(origem).normalize();
      const esp = a.d.espalha + (n > 1 && a.d.qtd === 1 ? 0.06 : 0);
      for (let i = 0; i < n; i++) {
        const d = base.clone();
        d.x += (R() - 0.5) * 2 * esp;
        d.y += (R() - 0.5) * 2 * esp;
        d.z += (R() - 0.5) * 2 * esp;
        if (movDe(f) === 'arco') d.y += 0.06;
        d.normalize();
        dirs.push(d);
      }
    }
    this.disparar(a, origem, dirs, this.eu(), origens);
    this.recuo = 1;
    som.tiro();
    this.localAvatar?.atirar?.();
    this.player.addShake?.(0.15);
    const msg = { o: origem.toArray().map(r2), d: dirs.map((d) => d.toArray().map(r2)) };
    if (origens) msg.os = origens.map((p) => p.toArray().map(r2));
    this.socket()?.emit('criador-tiro', msg);
  }

  disparar(a, origem, dirs, dono, origens = null) {
    const f = projetilDe(a);
    const vel = a.d.velo * f.d.fator * f.vel;
    const mult = a.d.danoArma || 1;
    dirs.forEach((d, i) => {
      const p = origens?.[i] ? origens[i].clone() : origem.clone().addScaledVector(d, f.d.corpo * f.escala);
      this.spawn(f, p, d.clone().multiplyScalar(vel), 0, dono, mult);
    });
    if (!origens) this.particulas(origem, '#fde68a', 4, 3, 0.08, 0.15, 0);
  }

  tiroRemoto({ id, o, d, os }) {
    const quem = this.naMao.get(id);
    if (!quem || !Array.isArray(o) || !Array.isArray(d)) return;
    const origem = new V3(...o);
    const dirs = d.slice(0, 30).map((x) => new V3(...x).normalize());
    const origens = Array.isArray(os) ? os.slice(0, 30).map((x) => new V3(...x)) : null;
    this.disparar(quem.raiz, origem, dirs, id, origens);
    quem.avatar?.atirar?.();
    const dist = origem.distanceTo(this.player.pos);
    som.tiro(THREE.MathUtils.clamp(1 - dist / 80, 0.05, 1));
  }

  // ---------------------------------------------------------------- coisas no mundo
  spawn(n, pos, vel, ger, dono, mult = 1) {
    if (this.ents.length >= MAX_ENT) {
      const velho = this.ents.find((e) => !e.morto);
      if (velho) {
        velho.morto = true;
        velho.mesh.removeFromParent();
      }
    }
    const d = n.d;
    const mesh = construirModelo(n);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const mov = movDe(n);
    let vel0 = d.velFixa ? d.velFixa * n.vel : Math.max(mov === 'guiado' ? 8 : 6, mov === 'voa' ? Math.hypot(vel.x, vel.z) : vel.length());
    if (d.tipo === 'arma') vel0 = 4;
    const e = {
      node: n, d, mesh, pos: mesh.position, vel: vel.clone(), idade: 0, vida: d.vida * n.vidaMul, raio: d.corpo * n.escala, ger, dono, mult,
      timers: n.emissores.map((m) => m.intervalo * R()), timerArma: R() * 0.5, cd: 0, noChao: false, morto: false, parado: false, preso: false,
      mov, vel0, grav: n.grav * (d.grav || 1), altura: pos.y + (d.tipo === 'arma' ? 2 : 1.5), temCai: n.emissores.some((m) => m.modo === 'cai'),
      spin: new V3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(14), explodeImpacto: n.explosivo || d.bate === 'explode',
      fase: R() * 10, dirVag: new V3(R() - 0.5, 0, R() - 0.5).normalize(),
      gira: d.gira || n.gira, rastro: n.rastro || d.rastro || null, atravessa: n.atravessa || d.atravessa, pega: n.pega || d.pega,
    };
    if (d.velFixa) e.vel.setLength(vel0);
    this.ents.push(e);
    return e;
  }

  alvoProximo(e, maxD) {
    let melhor = null;
    let md = maxD * maxD;
    for (const a of this.listaAlvos) {
      if (a.id === e.dono) continue;
      const dx = a.pos.x - e.pos.x;
      const dz = a.pos.z - e.pos.z;
      const dy = a.pos.y - e.pos.y;
      const d = dx * dx + dz * dz + dy * dy * 0.3;
      if (d < md) { md = d; melhor = a; }
    }
    return melhor;
  }

  matar(e, silencioso = false) {
    if (e.morto) return;
    e.morto = true;
    e.mesh.removeFromParent();
    if (silencioso) return;
    const n = e.node;
    const d = e.d;
    if (n.explosivo || d.bate === 'explode' || d.explodeNoFim) this.explodir(e.pos.clone(), (d.raio || 3.5) * n.escala ** 0.7, (d.raio ? d.dano : 60) * n.danoMul * e.mult, e.dono);
    else this.particulas(e.pos, corDe(n), 10, 4, 0.12 * Math.max(1, n.escala), 0.5);
    if (n.vira && e.ger < 10) {
      const k = Math.min(30, n.vira.qtd);
      for (let i = 0; i < k; i++) {
        const v = new V3(R() - 0.5, 0.5 + R() * 0.6, R() - 0.5).normalize().multiplyScalar(5 + R() * 4);
        this.spawn(n.vira, e.pos.clone().add(_tmp2.set(0, 0.2, 0)), v, e.ger + 1, e.dono);
      }
    }
  }

  // bateu em chão / parede (eixo da batida; sinal = para que lado sai)
  bater(e, eixo, sinal) {
    const d = e.d;
    const n = e.node;
    // bala e coisa arremessada explodem no que baterem; bicho explosivo só em gente (ou no fim)
    if (e.explodeImpacto && (e.mov === 'reto' || e.mov === 'arco')) return this.matar(e);
    if (e.pega) { // grudou
      e.vel.set(0, 0, 0);
      e.preso = true;
      return;
    }
    if (e.mov === 'parado') {
      e.vel.multiplyScalar(0.2);
      e.vel[eixo] = 0;
      if (eixo === 'y' && sinal > 0) { e.vel.set(0, 0, 0); e.parado = true; }
      return;
    }
    const quica = n.quica || d.bate === 'quica';
    if (e.mov === 'anda' && eixo === 'y' && sinal > 0) {
      e.vel.y = 0;
      e.noChao = true;
      return;
    }
    if (d.bate === 'some' && e.mov === 'arco' && !quica && e.vel.length() < 5) { // pousou devagar: fica
      e.vel.multiplyScalar(0.3);
      e.vel[eixo] = 0;
      e.parado = true;
      return;
    }
    if (quica || e.mov === 'voa' || e.mov === 'guiado' || e.mov === 'anda' || e.mov === 'volta' || e.mov === 'sobe' || d.tipo === 'arma') {
      e.vel[eixo] = Math.abs(e.vel[eixo]) * sinal * (quica ? 0.65 : 0.5);
      if (eixo === 'y') {
        if (quica) {
          e.vel.x *= 0.85;
          e.vel.z *= 0.85;
          if (Math.abs(e.vel.y) < 1.2) e.vel.y = 0;
        }
        if (e.mov === 'voa' || e.mov === 'guiado') e.vel.y += 2;
      }
      if (e.mov === 'sobe' && eixo === 'y' && sinal < 0) this.matar(e); // balão no teto: estoura
      return;
    }
    this.matar(e);
  }

  emitir(e, filho, modo, velFixa) {
    if (e.ger >= 10) return;
    const k = Math.min(30, filho.qtd);
    for (let i = 0; i < k; i++) {
      let pos;
      let v;
      if (modo === 'cai') {
        const espalha = k > 1 ? 2 : 0.3;
        if (e.mov === 'anda' || e.mov === 'parado') { // bota atrás de si
          const tras = e.vel.clone().setY(0);
          if (tras.lengthSq() < 0.01) tras.set(0, 0, 1);
          tras.normalize();
          pos = e.pos.clone().addScaledVector(tras, -(e.raio + 0.3));
          pos.y += 0.1;
          v = new V3((R() - 0.5) * espalha, 1.5, (R() - 0.5) * espalha);
        } else {
          pos = e.pos.clone();
          pos.y -= e.raio + filho.d.corpo * filho.escala + 0.05;
          v = e.vel.clone().multiplyScalar(0.3).add(new V3((R() - 0.5) * espalha, -2, (R() - 0.5) * espalha));
        }
      } else {
        const alvo = this.alvoProximo(e, ALCANCE_ALVO);
        const sp = velFixa || Math.max(8, 30 * filho.d.fator * filho.vel);
        let dir;
        if (alvo) {
          dir = new V3(alvo.pos.x, alvo.pos.y + alvo.altura * 0.55, alvo.pos.z).sub(e.pos);
          const dist = dir.length();
          dir.normalize();
          if (movDe(filho) === 'arco') dir.y += (dist * G * filho.grav * (filho.d.grav || 1)) / (2 * sp * sp);
        } else dir = e.vel.lengthSq() > 0.01 ? e.vel.clone().normalize() : new V3(R() - 0.5, 0, R() - 0.5).normalize();
        const ab = 0.12 * (k > 1 ? 2 : 1);
        dir.x += (R() - 0.5) * ab;
        dir.z += (R() - 0.5) * ab;
        dir.normalize();
        pos = e.pos.clone().addScaledVector(dir, e.raio + 0.2);
        v = dir.multiplyScalar(sp);
      }
      this.spawn(filho, pos, v, e.ger + 1, e.dono);
    }
  }

  virarHorizontal(e, ax, az, sp, giroMax) {
    const ang = Math.atan2(ax - e.pos.x, az - e.pos.z);
    const atual = Math.atan2(e.vel.x, e.vel.z);
    let da = ang - atual;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const na = atual + THREE.MathUtils.clamp(da, -giroMax, giroMax);
    e.vel.x = Math.sin(na) * sp;
    e.vel.z = Math.cos(na) * sp;
  }

  // acertou alguém: só quem criou conta o dano (os outros só veem)
  danoEm(alvo, valor, dir, e) {
    if (e.dono !== this.eu() || alvo.id === this.eu() || valor <= 0) return;
    const v = Math.round(Math.min(60, Math.max(1, valor * DANO_JOGADOR)));
    this.acertar(alvo.id, v, [dir.x, dir.z]);
  }

  colidirMundo(e) {
    const r = e.raio;
    const p = e.pos;
    if (!e.atravessa) {
      const lista = this.grade.em(p.x, p.z);
      const testar = (c) => {
        if (e.morto || e.preso) return;
        if (p.x <= c.min.x - r || p.x >= c.max.x + r || p.y <= c.min.y - r || p.y >= c.max.y + r || p.z <= c.min.z - r || p.z >= c.max.z + r) return;
        let melhor = Infinity;
        let ax = 'y';
        let s = 1;
        const pens = [[p.x - (c.min.x - r), 'x', -1], [c.max.x + r - p.x, 'x', 1], [p.y - (c.min.y - r), 'y', -1], [c.max.y + r - p.y, 'y', 1], [p.z - (c.min.z - r), 'z', -1], [c.max.z + r - p.z, 'z', 1]];
        for (const [v, a, sn] of pens) if (v < melhor) { melhor = v; ax = a; s = sn; }
        p[ax] = s > 0 ? c.max[ax] + r : c.min[ax] - r;
        this.bater(e, ax, s);
      };
      if (lista) for (const c of lista) testar(c);
      for (const c of this.grade.grandes) testar(c);
    }
    if (!e.morto && !e.preso && p.y < r) {
      p.y = r;
      if (e.atravessa) e.vel.y = Math.abs(e.vel.y);
      else this.bater(e, 'y', 1);
    }
  }

  // buraco negro e tornado: puxam as coisas e as pessoas em volta
  puxar(e, dt) {
    const R0 = e.d.puxa * Math.max(1, e.node.escala);
    for (const o of this.ents) {
      if (o === e || o.morto || o.d.puxa) continue;
      _tmp.copy(e.pos).sub(o.pos);
      const dist = _tmp.length();
      if (dist > R0 || dist < 0.05) continue;
      o.vel.addScaledVector(_tmp.normalize(), 30 * (1 - dist / R0) * dt);
      o.parado = false;
      o.preso = false;
    }
    const eu = this.eu();
    if (e.dono === eu) return; // a minha não me puxa
    const me = this.listaAlvos.find((a) => a.id === eu);
    if (!me) return;
    _tmp.set(e.pos.x - me.pos.x, 0, e.pos.z - me.pos.z);
    const dist = _tmp.length();
    if (dist < R0 && dist > 0.3) this.empurrar?.(_tmp.normalize().multiplyScalar(22 * (1 - dist / R0) * dt).setY(0));
  }

  atualizarEnts(dt, t) {
    const total = this.ents.length;
    for (let i = 0; i < total; i++) {
      const e = this.ents[i];
      if (e.morto) continue;
      const d = e.d;
      const n = e.node;
      e.idade += dt;
      e.cd -= dt;
      if (e.idade > e.vida) { this.matar(e); continue; }

      // movimento
      if (e.preso) { /* grudado: fica onde está */ } else if (e.mov === 'reto') e.pos.addScaledVector(e.vel, dt);
      else if (e.mov === 'arco' || e.mov === 'parado') {
        e.vel.y -= G * e.grav * dt;
        if (e.parado && e.vel.lengthSq() < 0.5) e.vel.set(0, Math.min(0, e.vel.y), 0);
        e.pos.addScaledVector(e.vel, dt);
        if (e.noChaoArco) {
          const atrito = Math.max(0, 1 - 2.5 * dt);
          e.vel.x *= atrito;
          e.vel.z *= atrito;
        }
      } else if (e.mov === 'voa') {
        const alvo = d.tipo === 'arma' ? null : this.alvoProximo(e, 60);
        let alvoY = e.altura;
        if (alvo) {
          this.virarHorizontal(e, alvo.pos.x, alvo.pos.z, e.vel0, 2.2 * dt);
          alvoY = e.temCai ? alvo.pos.y + 6 + e.raio : alvo.pos.y + alvo.altura * 0.55;
        } else {
          const h = Math.hypot(e.vel.x, e.vel.z);
          if (h < 0.01) { e.vel.x = e.dirVag.x * e.vel0; e.vel.z = e.dirVag.z * e.vel0; }
          this.virarHorizontal(e, e.pos.x + e.vel.x - e.vel.z * 0.3, e.pos.z + e.vel.z + e.vel.x * 0.3, e.vel0, 0.8 * dt);
        }
        e.vel.y += ((alvoY - e.pos.y) * 3 - e.vel.y * 2) * dt;
        e.pos.addScaledVector(e.vel, dt);
      } else if (e.mov === 'guiado') {
        const alvo = this.alvoProximo(e, 80);
        if (alvo && e.idade > 0.15) {
          _tmp.set(alvo.pos.x, alvo.pos.y + alvo.altura * 0.55, alvo.pos.z).sub(e.pos).normalize().multiplyScalar(e.vel0);
          e.vel.lerp(_tmp, Math.min(1, 2.5 * dt));
          e.vel.setLength(e.vel0);
        }
        if (d.puxa) e.vel.y = (Math.max(e.raio, 1) - e.pos.y) * 2; // o tornado anda no chão
        e.pos.addScaledVector(e.vel, dt);
      } else if (e.mov === 'anda') {
        e.vel.y -= G * e.grav * dt;
        if (e.noChao) {
          const alvo = this.alvoProximo(e, 80);
          const passo = (d.passo || 4) * n.vel;
          let dx = e.dirVag.x;
          let dz = e.dirVag.z;
          if (alvo) {
            dx = alvo.pos.x - e.pos.x;
            dz = alvo.pos.z - e.pos.z;
            const l = Math.hypot(dx, dz) || 1;
            dx /= l;
            dz /= l;
          }
          const k = Math.min(1, 6 * dt);
          e.vel.x += (dx * passo - e.vel.x) * k;
          e.vel.z += (dz * passo - e.vel.z) * k;
          const pulo = d.pulo ?? 4;
          if (pulo && R() < dt * (d.pulo ? 2 : 1.2)) e.vel.y = pulo;
        }
        e.noChao = false;
        e.pos.addScaledVector(e.vel, dt);
      } else if (e.mov === 'sobe') {
        e.vel.y += ((d.sobeVel || 2) * n.vel - e.vel.y) * 2 * dt;
        const k = Math.max(0, 1 - 1.5 * dt);
        e.vel.x *= k;
        e.vel.z *= k;
        e.pos.addScaledVector(e.vel, dt);
      } else if (e.mov === 'volta') {
        if (e.idade > 0.35) { // bumerangue: volta para quem jogou
          const dono = this.listaAlvos.find((a) => a.id === e.dono);
          if (dono) {
            _tmp.set(dono.pos.x, dono.pos.y + 1.2, dono.pos.z).sub(e.pos);
            const dist = _tmp.length();
            if (e.idade > 0.8 && dist < 1.2) { this.matar(e, true); continue; }
            e.vel.addScaledVector(_tmp.normalize(), 40 * dt);
            if (e.vel.length() > e.vel0 * 1.3) e.vel.setLength(e.vel0 * 1.3);
          }
        }
        e.pos.addScaledVector(e.vel, dt);
      }
      if (n.louco && !e.preso) {
        e.vel.x += (R() - 0.5) * 60 * dt;
        e.vel.z += (R() - 0.5) * 60 * dt;
        if (e.mov === 'voa' || e.mov === 'guiado') e.vel.y += (R() - 0.5) * 40 * dt;
      }

      const yAntes = e.vel.y;
      this.colidirMundo(e);
      if (e.morto) continue;
      e.noChaoArco = (e.mov === 'arco' || e.mov === 'parado') && yAntes < 0 && e.vel.y >= 0;
      if (e.pos.y < -50 || e.pos.y > 300) { this.matar(e, true); continue; }
      if (d.puxa) this.puxar(e, dt);

      // mina: alguém chegou perto
      if (d.gatilho && e.idade > 1) {
        const a = this.alvoProximo(e, d.gatilho * Math.max(1, n.escala));
        if (a) { this.matar(e); continue; }
      }

      // gente
      for (const a of this.listaAlvos) {
        if (a.id === e.dono) continue;
        const dx = e.pos.x - a.pos.x;
        const dz = e.pos.z - a.pos.z;
        if (Math.hypot(dx, dz) >= e.raio + a.raio || e.pos.y <= a.pos.y - e.raio || e.pos.y >= a.pos.y + a.altura + e.raio) continue;
        if (e.cd > 0) break;
        const dir = e.vel.clone().setY(0);
        if (dir.lengthSq() < 0.01) dir.set(-dx, 0, -dz);
        dir.normalize();
        this.danoEm(a, (d.impacto ?? d.dano) * n.danoMul * Math.max(1, n.escala) * e.mult, dir, e);
        if (e.explodeImpacto) { this.matar(e); break; }
        if (d.persiste || n.quica || d.bate === 'quica' || d.tipo === 'arma' || e.preso) {
          e.cd = 0.6;
          if (!e.preso && !d.puxa) {
            e.vel.x *= -0.5;
            e.vel.z *= -0.5;
            e.vel.y = Math.max(e.vel.y, 3);
          }
        } else if (e.pega) {
          e.preso = true;
          e.cd = 0.6;
        } else this.matar(e);
        break;
      }
      if (e.morto) continue;

      // o que essa coisa solta / atira
      n.emissores.forEach((m, k) => {
        e.timers[k] -= dt * n.vel;
        if (e.timers[k] <= 0) {
          e.timers[k] = m.intervalo;
          this.emitir(e, m.filho, m.modo);
        }
      });
      if (d.tipo === 'arma') { // arma flutuando atira sozinha
        e.timerArma -= dt;
        if (e.timerArma <= 0) {
          e.timerArma = Math.max(0.2, 1 / (d.cad * n.vel));
          const f = projetilDe(n);
          for (let q = 0; q < Math.min(d.qtd, 8); q++) this.emitir(e, f, 'mira', d.velo * f.d.fator * f.vel);
        }
      }

      // visual
      if (e.rastro && R() < dt * 45) this.particulas(e.pos, e.rastro, 1, 1, 0.14 * Math.max(0.6, n.escala), 0.45, 0);
      const ud = e.mesh.userData;
      if (d.chama) e.mesh.scale.setScalar(n.escala * (0.5 + (e.idade / e.vida) * 1.8));
      if (e.gira) {
        if (!e.parado && !e.preso) e.mesh.rotation.set(e.mesh.rotation.x + e.spin.x * dt, e.mesh.rotation.y + e.spin.y * dt, e.mesh.rotation.z + e.spin.z * dt);
      } else if (e.vel.lengthSq() > 0.25 && !e.preso) {
        _tmp.copy(e.pos).add(e.vel);
        if (e.mov === 'anda' || e.mov === 'parado' || e.mov === 'sobe' || d.puxa) _tmp.y = e.pos.y;
        e.mesh.lookAt(_tmp);
      }
      if (ud.asas) {
        const a = Math.sin(t * (d.modelo === 'dragao' || d.modelo === 'aguia' ? 8 : 22) + e.fase) * 0.8;
        ud.asas[0].rotation.z = a;
        ud.asas[1].rotation.z = -a;
      }
      if (ud.pernas) {
        const a = Math.sin(t * 14 + e.fase) * 0.6;
        ud.pernas.forEach((p, k) => { p.rotation.x = k % 2 ? a : -a; });
      }
      if (ud.cobra) ud.cobra.forEach((p, k) => { p.position.x = Math.sin(t * 8 + k * 0.9 + e.fase) * 0.12; });
      if (ud.rotor) ud.rotor.rotation[ud.rotorEixo] += dt * (ud.rotorVel || 25);
      if (ud.rodas) ud.rodas.forEach((p) => { p.rotation.x += dt * Math.hypot(e.vel.x, e.vel.z) * 4; });
    }
    if (this.ents.some((e) => e.morto)) this.ents = this.ents.filter((e) => !e.morto);
  }

  explodir(p, raio, dano, dono) {
    const m = new THREE.Mesh(GEO_ESF, new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    m.position.copy(p);
    this.scene.add(m);
    this.flashes.push({ m, t: 0, raio });
    this.particulas(p, '#fb923c', 22, raio * 3, 0.3, 0.6);
    this.particulas(p, '#fde047', 14, raio * 3.5, 0.2, 0.5);
    this.particulas(p, '#475569', 14, raio * 1.5, 0.5, 1.1, 0.2);
    const distEu = this.player.pos.distanceTo(p);
    som.bum(THREE.MathUtils.clamp(1 - distEu / 70, 0, 1));
    const eu = this.eu();
    for (const a of this.listaAlvos) {
      const dir = new V3(a.pos.x - p.x, a.pos.y + a.altura * 0.5 - p.y, a.pos.z - p.z);
      const dist = dir.length();
      if (dist >= raio + 0.6) continue;
      const f = 1 - dist / (raio + 0.6);
      dir.setY(0).normalize();
      if (a.id === eu) this.empurrar?.(dir.multiplyScalar(14 * f).setY(9 * f)); // a explosão me joga (até a minha)
      else if (dono === eu) this.acertar(a.id, Math.round(Math.min(60, Math.max(1, dano * (0.35 + 0.65 * f) * DANO_JOGADOR * 0.8))), [dir.x, dir.z]);
    }
    for (const e of this.ents) {
      if (e.morto) continue;
      const dir = e.pos.clone().sub(p);
      const dist = dir.length();
      if (dist < raio && dist > 0.01) {
        const f = 1 - dist / raio;
        e.vel.addScaledVector(dir.normalize(), 12 * f);
        e.parado = false;
        e.preso = false;
        if ((e.explodeImpacto || e.d.explodeNoFim) && f > 0.35) e.vida = Math.min(e.vida, e.idade + 0.06); // reação em cadeia
      }
    }
    if (distEu < 40) this.player.addShake?.(Math.min(1.2, raio * 0.12 * (1 - distEu / 40)));
  }

  // ---------------------------------------------------------------- partículas
  montarParticulas() {
    this.MAXP = 2500;
    this.pMesh = new THREE.InstancedMesh(GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), this.MAXP);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.pMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.pMesh.count = 0;
    this.scene.add(this.pMesh);
    this.P = [];
    this.dummy = new THREE.Object3D();
    this.cores = new Map();
  }

  particulas(pos, cor, n, vel = 5, tam = 0.15, vida = 0.7, grav = 1) {
    let c = this.cores.get(cor);
    if (!c) this.cores.set(cor, (c = new THREE.Color(cor)));
    for (let i = 0; i < n && this.P.length < this.MAXP; i++) {
      const v = new V3(R() - 0.5, R() - 0.3, R() - 0.5).normalize().multiplyScalar(vel * (0.4 + R() * 0.8));
      const vi = vida * (0.6 + R() * 0.6);
      this.P.push({ p: pos.clone(), v, vida: vi, max: vi, tam: tam * (0.6 + R() * 0.8), c, grav });
    }
  }

  atualizarParticulas(dt) {
    const P = this.P;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.vida -= dt;
      if (q.vida <= 0) {
        P[i] = P[P.length - 1];
        P.pop();
        continue;
      }
      q.v.y -= G * q.grav * dt;
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0) {
        q.p.y = 0;
        q.v.y *= -0.3;
        q.v.x *= 0.6;
        q.v.z *= 0.6;
      }
    }
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      this.dummy.position.copy(q.p);
      this.dummy.scale.setScalar(q.tam * (q.vida / q.max));
      this.dummy.updateMatrix();
      this.pMesh.setMatrixAt(i, this.dummy.matrix);
      this.pMesh.setColorAt(i, q.c);
    }
    this.pMesh.count = P.length;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- por quadro
  update(dt, t) {
    if (this.raiz && !this.podeUsar()) this.guardar(); // desligaram, ou entrou numa arena
    this.grade.atualizar();
    this.listaAlvos = this.alvos();
    this.espera -= dt;
    if (this.gatilhoOn && this.espera <= 0) this.atirar();
    this.recuo = Math.max(0, this.recuo - dt * 6);
    this.formando = Math.min(1, this.formando + dt * 2.6);

    // na tela (1ª pessoa)
    if (this.vm) {
      const ver = this.player.mode === 'first' && this.podeAtirar();
      this.vm.visible = ver;
      if (ver) {
        const k = this.formando - 1;
        const fe = this.formando < 1 ? 1 + 2.70158 * k ** 3 + 1.70158 * k ** 2 : 1; // easeOutBack
        const andando = this.player.grounded ? Math.min(1, Math.hypot(this.player.vel.x, this.player.vel.z) / 7) : 0;
        this.balanco += dt * 9 * andando;
        this.vm.scale.setScalar(Math.max(0.001, fe));
        this.vm.position.set(0.3, -0.3 + Math.sin(this.balanco) * 0.012 * andando, -0.75 + this.recuo * 0.08);
        this.vm.rotation.set(-this.recuo * 0.25, 0, (1 - fe) * 1.5);
        this.vm.userData.mini.rotation.y += dt * 1.5;
        const rotor = this.vm.userData.armaModelo?.userData.rotor;
        if (rotor) rotor.rotation[this.vm.userData.armaModelo.userData.rotorEixo] += dt * (this.gatilhoOn ? 30 : 3);
      }
    }

    // no boneco de cada um (inclusive o meu, em 3ª pessoa)
    for (const [id, m] of this.naMao) {
      const av = id === this.eu() ? this.localAvatar : this.avatarDe(id);
      if (av !== m.avatar) {
        this.mostrarArmaDoBoneco(m.avatar, true);
        m.modelo.removeFromParent();
        m.avatar = av || null;
        if (av?.inner) {
          m.modelo.position.set(0.22, 1.12, 0.36);
          av.inner.add(m.modelo);
        }
      }
      if (av) this.mostrarArmaDoBoneco(av, false);
      m.modelo.userData.mini.rotation.y += dt * 1.5;
    }

    this.atualizarEnts(dt, t);
    this.atualizarParticulas(dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / 0.3;
      f.m.scale.setScalar(f.raio * 2 * Math.min(1, k * 1.6));
      f.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        f.m.removeFromParent();
        f.m.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
  }
}
