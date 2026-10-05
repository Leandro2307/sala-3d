// Clima e hora do dia: o sol anda pelo céu (amanhecer, meio-dia, pôr do sol, noite com lua e
// estrelas) e o tempo muda entre sol, nublado, chuva e tempestade com raios e trovões.
//
// Ninguém precisa avisar ninguém pela rede: a hora vem do relógio (um dia do jogo dura
// DIA_MS) e o clima automático é sorteado por bloco de tempo com a mesma semente em todos os
// navegadores — todo mundo na sala vê o mesmo céu. O dono da sala pode fixar os dois (config
// "clima" e "horario", ver server.js e o painel da sala).
import * as THREE from 'three';
import { SALA } from './world.js';
import { audioContext } from './sfx.js';
import { isTouch } from './touch.js';

export const CLIMAS = {
  auto: { nome: 'Automático' },
  sol: { nome: 'Sol', nuvens: 0, chuva: 0, raios: false },
  nublado: { nome: 'Nublado', nuvens: 0.75, chuva: 0, raios: false },
  chuva: { nome: 'Chuva', nuvens: 0.9, chuva: 0.6, raios: false },
  tempestade: { nome: 'Tempestade', nuvens: 1, chuva: 1, raios: true },
};
export const HORARIOS = {
  ciclo: { nome: 'Dia e noite (passa sozinho)' },
  manha: { nome: 'Manhã', hora: 0.3 },
  dia: { nome: 'Meio-dia', hora: 0.5 },
  tarde: { nome: 'Pôr do sol', hora: 0.735 },
  noite: { nome: 'Noite', hora: 0.0 },
};

const DIA_MS = 24 * 60 * 1000; // um dia do jogo = 24 minutos de verdade (1 hora = 1 minuto)
const BLOCO_CLIMA_MS = 12 * 60 * 1000; // o clima automático muda a cada 12 minutos
const LEVE = isTouch;

// hora do jogo: 0 meia-noite, 0.25 amanhecer, 0.5 meio-dia, 0.75 pôr do sol
export function horaDoJogo(horario, agora = Date.now()) {
  const fixa = HORARIOS[horario]?.hora;
  if (fixa != null) return fixa;
  return (agora / DIA_MS + 0.3) % 1;
}

function sorteio(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function climaDoMomento(clima, agora = Date.now()) {
  if (clima !== 'auto' && CLIMAS[clima]) return clima;
  const r = sorteio(Math.floor(agora / BLOCO_CLIMA_MS));
  return r < 0.45 ? 'sol' : r < 0.7 ? 'nublado' : r < 0.9 ? 'chuva' : 'tempestade';
}

// ------------------------------------------------------------------ paletas do céu
// [topo, meio, horizonte, base (abaixo do horizonte), halo do sol]
const hex = (s) => new THREE.Color(s);
const PALETAS = {
  noite: [hex('#04060f'), hex('#0a1028'), hex('#18203d'), hex('#080a14'), hex('#1d2850')],
  dourado: [hex('#122152'), hex('#3d5596'), hex('#f0956c'), hex('#4d4f7e'), hex('#ffb06a')],
  dia: [hex('#2463c9'), hex('#5a92e0'), hex('#bcd6f2'), hex('#6c84a6'), hex('#fff1d6')],
  // encoberto: o céu vira cinza (mais claro de dia, quase preto de noite)
  cinzaDia: [hex('#5d6672'), hex('#7a838f'), hex('#a3abb5'), hex('#59606b'), hex('#c3c8cf')],
  cinzaNoite: [hex('#07080b'), hex('#0d0f14'), hex('#151820'), hex('#08090c'), hex('#1a1d24')],
};
const _c = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
const _g = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ chuva
// Riscos de chuva numa caixa que acompanha a câmera (a posição de cada gota é calculada na
// placa de vídeo: nada se mexe no JavaScript). Dentro do prédio a chuva não cai.
function criarChuva(qtd) {
  const pos = new Float32Array(qtd * 2 * 3);
  const sorte = new Float32Array(qtd * 2);
  const ponta = new Float32Array(qtd * 2);
  for (let i = 0; i < qtd; i++) {
    const x = Math.random();
    const y = Math.random();
    const z = Math.random();
    const r = Math.random();
    for (let k = 0; k < 2; k++) {
      pos.set([x, y, z], (i * 2 + k) * 3);
      sorte[i * 2 + k] = r;
      ponta[i * 2 + k] = k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('sorte', new THREE.BufferAttribute(sorte, 1));
  geo.setAttribute('ponta', new THREE.BufferAttribute(ponta, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      cam: { value: new THREE.Vector3() },
      tempo: { value: 0 },
      intensidade: { value: 0 },
      vento: { value: new THREE.Vector2(1.5, 0.6) },
      tamanho: { value: new THREE.Vector3(70, 36, 70) },
      telhadoMin: { value: new THREE.Vector2(SALA.minX, SALA.minZ) },
      telhadoMax: { value: new THREE.Vector2(SALA.maxX, SALA.maxZ) },
      cor: { value: new THREE.Color(0.75, 0.8, 0.9) },
    },
    vertexShader: /* glsl */ `
      attribute float sorte;
      attribute float ponta;
      uniform vec3 cam;
      uniform float tempo;
      uniform float intensidade;
      uniform vec2 vento;
      uniform vec3 tamanho;
      varying vec3 vMundo;
      varying float vVisivel;
      void main() {
        float vel = 22.0 + sorte * 8.0;
        vec3 p = position * tamanho;
        p.y -= tempo * vel;
        p.xz += vento * tempo;
        // dá a volta na caixa em torno da câmera
        vec3 base = cam - tamanho * 0.5;
        p = base + mod(p - base, tamanho);
        // o risco: a ponta de cima fica para trás no sentido da queda
        vec3 queda = normalize(vec3(vento.x, -vel, vento.y));
        p -= queda * ponta * (0.5 + sorte * 0.5);
        vMundo = p;
        vVisivel = step(sorte, intensidade);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec2 telhadoMin;
      uniform vec2 telhadoMax;
      uniform vec3 cor;
      varying vec3 vMundo;
      varying float vVisivel;
      void main() {
        if (vVisivel < 0.5) discard;
        if (vMundo.y < 0.0) discard;
        if (vMundo.x > telhadoMin.x && vMundo.x < telhadoMax.x && vMundo.z > telhadoMin.y && vMundo.z < telhadoMax.y) discard;
        gl_FragColor = vec4(cor, 0.42);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const chuva = new THREE.LineSegments(geo, mat);
  chuva.frustumCulled = false;
  chuva.renderOrder = 5;
  return chuva;
}

// raio: uma linha quebrada do céu até o chão, que pisca por um instante
function criarRaio() {
  const mat = new THREE.LineBasicMaterial({ color: 0xe8efff, transparent: true, toneMapped: false, fog: false });
  const raio = new THREE.Line(new THREE.BufferGeometry(), mat);
  raio.frustumCulled = false;
  raio.visible = false;
  return raio;
}
function desenharRaio(raio, x, z) {
  const pts = [];
  let px = x;
  let pz = z;
  for (let y = 320; y > 0; y -= 18 + Math.random() * 22) {
    pts.push(new THREE.Vector3(px, y, pz));
    px += (Math.random() - 0.5) * 30;
    pz += (Math.random() - 0.5) * 30;
  }
  pts.push(new THREE.Vector3(px, 0, pz));
  raio.geometry.dispose();
  raio.geometry = new THREE.BufferGeometry().setFromPoints(pts);
}

// ------------------------------------------------------------------ som
class SomDoTempo {
  constructor() {
    this.ac = null;
    this.chuva = null;
  }

  iniciar() {
    if (this.ac) return;
    try {
      const ac = (this.ac = audioContext());
      const n = Math.floor(ac.sampleRate * 2);
      const buf = ac.createBuffer(1, n, ac.sampleRate);
      const d = buf.getChannelData(0);
      // ruído "rosa" barato: chiado com graves, que soa como chuva e não como TV fora do ar
      let b = 0;
      for (let i = 0; i < n; i++) {
        b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
        d[i] = (Math.random() * 2 - 1) * 0.35 + b * 2.2;
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filtro = ac.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 3200;
      const ganho = ac.createGain();
      ganho.gain.value = 0;
      src.connect(filtro).connect(ganho).connect(ac.destination);
      src.start();
      this.chuva = { filtro, ganho };
    } catch {
      this.ac = null;
    }
  }

  // nivel 0..1; dentro: abafado pelo telhado
  chover(nivel, dentro) {
    if (!this.chuva) return;
    const t = this.ac.currentTime;
    this.chuva.ganho.gain.setTargetAtTime(nivel * (dentro ? 0.05 : 0.16), t, 0.4);
    this.chuva.filtro.frequency.setTargetAtTime(dentro ? 650 : 3200, t, 0.4);
  }

  trovao(forca, dentro) {
    if (!this.ac) return;
    const ac = this.ac;
    const t0 = ac.currentTime;
    const dur = 2.5 + Math.random() * 1.5;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) {
      b = 0.985 * b + 0.015 * (Math.random() * 2 - 1);
      // estalo no começo, ronco depois, com "rolagens"
      const env = Math.min(1, i / (ac.sampleRate * 0.02)) * Math.exp(-i / (ac.sampleRate * dur * 0.35)) * (0.7 + 0.3 * Math.sin(i / 2200));
      d[i] = b * 6 * env;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filtro = ac.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = dentro ? 220 : 520;
    const g = ac.createGain();
    g.gain.value = 0.5 * forca * (dentro ? 0.45 : 1);
    src.connect(filtro).connect(g).connect(ac.destination);
    src.start(t0);
  }
}

// ------------------------------------------------------------------ o clima
export class Clima {
  constructor(world) {
    this.world = world;
    this.config = { clima: 'auto', horario: 'ciclo' };
    // estado que muda devagar (transição de uns 20 s entre um tempo e outro)
    this.nuvens = 0;
    this.chuvaNivel = 0;
    this.raios = 0;
    this.clarao = 0; // relâmpago: 1 no instante, cai rápido
    this.proximoRaio = 8;
    this.raioVida = 0;
    this.chuva = criarChuva(LEVE ? 2500 : 6000);
    this.raio = criarRaio();
    world.scene.add(this.chuva, this.raio);
    this.som = new SomDoTempo();
    this.dirLuz = new THREE.Vector3();
    this.hora = horaDoJogo('ciclo');
    this.climaAtual = climaDoMomento('auto');
    this.primeira = true; // na entrada já começa no clima certo, sem transição
  }

  setConfig({ clima = 'auto', horario = 'ciclo' } = {}) {
    this.config = { clima: CLIMAS[clima] ? clima : 'auto', horario: HORARIOS[horario] ? horario : 'ciclo' };
  }

  // o áudio só pode começar depois de um gesto da pessoa (entrar na sala)
  ligarSom() {
    this.som.iniciar();
  }

  // "🌧 Chuva · 21:40"
  rotulo() {
    const min = Math.floor(this.hora * 24 * 60);
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    const noite = this.hora < 0.24 || this.hora > 0.78;
    const icone = { sol: noite ? '🌙' : '☀️', nublado: '☁️', chuva: '🌧️', tempestade: '⛈️' }[this.climaAtual];
    const nome = this.climaAtual === 'sol' && noite ? 'Céu limpo' : CLIMAS[this.climaAtual].nome;
    return `${icone} ${nome} · ${hh}:${mm}`;
  }

  update(dt, t) {
    const w = this.world;
    const agora = Date.now();
    this.hora = horaDoJogo(this.config.horario, agora);
    this.climaAtual = climaDoMomento(this.config.clima, agora);
    const alvo = CLIMAS[this.climaAtual];
    const k = this.primeira ? 1 : 1 - Math.exp(-dt / 6);
    this.primeira = false;
    this.nuvens += (alvo.nuvens - this.nuvens) * k;
    this.chuvaNivel += (alvo.chuva - this.chuvaNivel) * k;
    this.raios += ((alvo.raios ? 1 : 0) - this.raios) * k;

    // ---- sol e lua: o sol nasce no leste (+X) e se põe no oeste, inclinado para o sul
    const ang = (this.hora - 0.25) * Math.PI * 2; // 0 no amanhecer, π/2 ao meio-dia
    const el = Math.sin(ang);
    const sol = new THREE.Vector3(Math.cos(ang), el * 0.92, -0.38).normalize();
    const lua = sol.clone().negate();
    lua.y = Math.abs(lua.y) * 0.8 + 0.15;
    lua.normalize();
    const dia = smooth(0.0, 0.35, sol.y); // 0 no horizonte, 1 com o sol alto
    const noite = smooth(0.02, -0.16, sol.y); // 1 de noite
    const luzDoSol = smooth(-0.04, 0.12, sol.y);
    const encoberto = this.nuvens;

    // ---- céu
    for (let i = 0; i < 5; i++) {
      _c[i].copy(PALETAS.dourado[i]).lerp(PALETAS.dia[i], dia).lerp(PALETAS.noite[i], noite);
      _g[i].copy(PALETAS.cinzaDia[i]).lerp(PALETAS.cinzaNoite[i], Math.max(noite, 1 - luzDoSol * 0.9 - 0.1));
      _c[i].lerp(_g[i], encoberto * 0.85);
    }
    // relâmpago
    if (this.clarao > 0) for (let i = 0; i < 4; i++) _c[i].lerp(hex('#c8d2ff'), this.clarao * 0.7);
    const ceu = w.natureza?.ceu;
    if (ceu) {
      const u = ceu.mat.uniforms;
      u.topo.value.copy(_c[0]);
      u.meio.value.copy(_c[1]);
      u.horizonte.value.copy(_c[2]);
      u.base.value.copy(_c[3]);
      u.brilho.value.copy(_c[4]).multiplyScalar(1 - encoberto * 0.9);
      const deNoite = noite > 0.5;
      u.solDir.value.copy(deNoite ? lua : sol);
      const limpo = 1 - encoberto;
      if (deNoite) u.disco.value.setRGB(0.95, 0.98, 1.1).multiplyScalar(limpo);
      else u.disco.value.setRGB(1.6, 1.38 + dia * 0.2, 1.06 + dia * 0.4).multiplyScalar(limpo * luzDoSol);
      ceu.estrelasMat.uniforms.visivel.value = noite * (1 - encoberto * 0.95);
      const nm = ceu.nuvensMat;
      if (nm) {
        nm.color.copy(hex('#f4dfe3')).lerp(hex('#ffffff'), dia).lerp(hex('#2a3044'), noite).lerp(hex('#59606b'), encoberto * (1 - noite) * 0.8);
        nm.emissive.copy(hex('#4a3550')).lerp(hex('#8a96a8'), dia).lerp(hex('#0b0e18'), noite);
        nm.emissiveIntensity = 0.55 - encoberto * 0.25 + this.clarao * 0.8;
      }
    }

    // ---- luzes
    const dentro = this.cameraDentro();
    const sun = w.sun;
    if (sun) {
      // de dia é o sol (dourado perto do horizonte); de noite a mesma luz vira a lua, azulada
      const usaLua = sol.y < 0.02;
      this.dirLuz.copy(usaLua ? lua : sol);
      w.sunOffset.copy(this.dirLuz).multiplyScalar(66);
      sun.position.copy(sun.target.position).add(w.sunOffset);
      if (usaLua) {
        sun.color.setRGB(0.62, 0.72, 1);
        sun.intensity = 0.38 * smooth(0.02, -0.12, sol.y) * (1 - encoberto * 0.8);
      } else {
        sun.color.copy(hex('#ffb070')).lerp(hex('#fff3e6'), dia);
        sun.intensity = 1.6 * luzDoSol * (1 - encoberto * 0.72);
      }
      sun.intensity += this.clarao * 1.8;
    }
    const hemi = w.hemi;
    if (hemi) {
      hemi.color.copy(_c[1]).lerp(hex('#ffffff'), 0.45);
      hemi.groundColor.copy(hex('#252036')).lerp(hex('#3a3a30'), dia * (1 - encoberto));
      let forca = THREE.MathUtils.lerp(1.45, 0.45, noite) * (1 - encoberto * 0.25) + this.clarao * 2.5;
      // dentro do cinema/escritório a sala tem a luz dela: a noite lá fora não apaga o salão
      if (dentro) forca = Math.max(forca, 1.25);
      hemi.intensity = forca;
    }
    w.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.92, noite);
    const fog = w.scene.fog;
    if (fog) {
      fog.color.copy(_c[2]).lerp(_c[1], 0.3);
      fog.near = THREE.MathUtils.lerp(320, 30, this.chuvaNivel);
      fog.far = THREE.MathUtils.lerp(2100, 420, this.chuvaNivel) * (1 - noite * 0.2);
    }

    // ---- chuva
    const cam = w.camera.position;
    const cu = this.chuva.material.uniforms;
    cu.cam.value.copy(cam);
    cu.tempo.value = t;
    cu.intensidade.value = this.chuvaNivel;
    cu.vento.value.set(1.5 + this.raios * 4, 0.6 + this.raios * 2);
    const L = w.escritorio?.limites || SALA;
    cu.telhadoMin.value.set(L.minX, L.minZ);
    cu.telhadoMax.value.set(L.maxX, L.maxZ);
    cu.cor.value.setRGB(0.75, 0.8, 0.9).multiplyScalar(THREE.MathUtils.lerp(1, 0.45, noite) + this.clarao);
    this.chuva.visible = this.chuvaNivel > 0.01;
    this.som.chover(this.chuvaNivel, dentro);

    // ---- raios (só na tempestade); cada um em lugar e hora diferentes para cada pessoa
    this.clarao = Math.max(0, this.clarao - dt * 3.2);
    if (this.raioVida > 0) {
      this.raioVida -= dt;
      this.raio.material.opacity = Math.max(0, this.raioVida / 0.25);
      this.raio.visible = this.raioVida > 0;
    }
    if (this.raios > 0.6) {
      this.proximoRaio -= dt;
      if (this.proximoRaio <= 0) {
        this.proximoRaio = 6 + Math.random() * 12;
        const a = Math.random() * Math.PI * 2;
        const d = 180 + Math.random() * 380;
        desenharRaio(this.raio, cam.x + Math.cos(a) * d, cam.z + Math.sin(a) * d);
        this.raio.visible = !dentro;
        this.raioVida = 0.25;
        this.clarao = dentro ? 0.35 : 1;
        // segundo piscar logo depois, como raio de verdade
        setTimeout(() => { this.clarao = Math.max(this.clarao, dentro ? 0.25 : 0.8); }, 120);
        // o trovão chega depois (o som é mais lento que a luz)
        setTimeout(() => this.som.trovao(THREE.MathUtils.clamp(1.3 - d / 600, 0.35, 1), this.cameraDentro()), d * 3 + 200);
      }
    }
  }

  cameraDentro() {
    const p = this.world.camera.position;
    const L = this.world.escritorio?.limites || SALA;
    return p.x > L.minX && p.x < L.maxX && p.z > L.minZ && p.z < L.maxZ;
  }
}
