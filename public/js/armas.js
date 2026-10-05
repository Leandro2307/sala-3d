// Armas em 3D (modelos do catálogo em armas-dados.js) e tudo o que as faz parecer vivas, já que
// os arquivos vêm parados, numa peça só: coice, clarão na boca do cano, cápsula pulando da
// janela de ejeção, a bombada da escopeta, o ferrolho da sniper e a arma subindo ao sacar.
//
// criarArma(tipo) devolve um grupo com a origem na empunhadura (onde a mão segura), o cano em +X
// e Y para cima, em metros. Quem segura (o boneco, a visão em 1ª pessoa) gira esse grupo para o
// seu eixo e chama animador.disparar() / animador.update(dt).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARMAS, IDS_ARMAS, ARMA_PADRAO } from './armas-dados.js';

export { ARMAS, IDS_ARMAS, ARMA_PADRAO };

const loader = new GLTFLoader();
const cache = new Map(); // tipo -> Promise<cena do glb>
const ESCALA_VISUAL = 1.12; // um pouco maior que o real: o boneco é cabeçudo e a arma sumia

export const defArma = (tipo) => ARMAS[tipo] || ARMAS[ARMA_PADRAO];

function baixar(def) {
  if (!cache.has(def.id)) {
    const p = loader.loadAsync(def.modelo).then((g) => {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.material.envMapIntensity = 0.8;
      });
      return g.scene;
    });
    p.catch(() => cache.delete(def.id)); // falhou (rede): tenta de novo da próxima vez
    cache.set(def.id, p);
  }
  return cache.get(def.id);
}

// baixa antes de precisar (ao escolher a arma no modal, por exemplo)
export function preCarregarArma(tipo) {
  baixar(defArma(tipo)).catch(() => {});
}

// ------------------------------------------------------------------ clarão na boca do cano
let texClarao = null;
function texturaClarao() {
  if (texClarao) return texClarao;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.25, 'rgba(255,214,110,0.95)');
  g.addColorStop(0.6, 'rgba(255,120,30,0.35)');
  g.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = g;
  // estrela de 4 pontas: o clarão não é uma bola
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 4 === 0 ? 32 : i % 2 === 0 ? 17 : 11;
    ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  ctx.fill();
  texClarao = new THREE.CanvasTexture(c);
  texClarao.colorSpace = THREE.SRGBColorSpace;
  return texClarao;
}

function criarClarao(tamanho) {
  const mat = new THREE.MeshBasicMaterial({
    map: texturaClarao(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const g = new THREE.Group();
  // de frente (plano YZ) e duas "chamas" compridas no sentido do cano
  const frente = new THREE.Mesh(new THREE.PlaneGeometry(tamanho, tamanho), mat);
  frente.rotation.y = Math.PI / 2;
  const lado = new THREE.Mesh(new THREE.PlaneGeometry(tamanho * 2.2, tamanho * 0.9), mat);
  lado.position.x = tamanho * 0.9;
  const cima = lado.clone();
  cima.rotation.x = Math.PI / 2;
  g.add(frente, lado, cima);
  g.visible = false;
  return g;
}

// ------------------------------------------------------------------ montar
export async function criarArma(tipo) {
  const def = defArma(tipo);
  const base = await baixar(def);
  const s = (def.comprimento / (def.xMax - def.xMin)) * ESCALA_VISUAL;
  const [gx, gy] = def.empunhadura;
  const local = ([x, y]) => new THREE.Vector3((x - gx) * s, (y - gy) * s, 0);

  const modelo = base.clone(true);
  modelo.scale.setScalar(s);
  modelo.position.set(-gx * s, -gy * s, 0);
  const arma = new THREE.Group();
  arma.name = `arma-${def.id}`;
  // "corpo" é o que coice, bombada e ferrolho mexem; a origem do grupo fica parada na mão
  const corpo = new THREE.Group();
  corpo.add(modelo);
  arma.add(corpo);

  const ponta = new THREE.Object3D();
  ponta.position.copy(local(def.boca));
  const janela = new THREE.Object3D();
  janela.position.copy(local(def.janela));
  const clarao = criarClarao(def.id === 'pistola' ? 0.16 : def.id === 'submetralhadora' ? 0.2 : 0.28);
  clarao.position.copy(ponta.position);
  corpo.add(ponta, janela, clarao);

  arma.userData = { def, corpo, ponta, janela, clarao, apoio: def.apoio ? local(def.apoio) : null };
  arma.userData.animador = new AnimadorArma(arma);
  return arma;
}

// ------------------------------------------------------------------ animação
// Tempo de cada coisa, em segundos.
const T_CLARAO = 0.05;
const T_SACAR = 0.32;

export class AnimadorArma {
  constructor(arma) {
    this.arma = arma;
    this.def = arma.userData.def;
    this.coice = 0; // 1 logo após o tiro, cai rápido
    this.clarao = 0;
    this.engatilhar = -1; // segundos desde o tiro, enquanto bombeia/puxa o ferrolho
    this.sacar = 0; // 0 → 1 ao aparecer na mão
    this.capsulaPendente = false;
  }

  // ejetar(posMundo, direitaMundo): quem segura decide se solta cápsula (só se estiver visível)
  disparar() {
    this.coice = 1;
    this.clarao = T_CLARAO;
    const { clarao } = this.arma.userData;
    clarao.rotation.x = Math.random() * Math.PI; // cada clarão sai um pouco diferente
    clarao.scale.setScalar(0.85 + Math.random() * 0.4);
    if (this.def.engatilhar) this.engatilhar = 0;
    else this.capsulaPendente = true; // automática/semiautomática: a cápsula sai na hora
  }

  // devolve true no quadro em que uma cápsula deve sair
  update(dt) {
    const { corpo, clarao } = this.arma.userData;
    let soltar = false;
    if (this.capsulaPendente) {
      soltar = true;
      this.capsulaPendente = false;
    }
    this.coice = Math.max(0, this.coice - dt * (this.def.auto ? 14 : 7));
    this.sacar = Math.min(1, this.sacar + dt / T_SACAR);
    if (this.clarao > 0) this.clarao -= dt;
    clarao.visible = this.clarao > 0;

    // coice: a arma recua no sentido do cano e a boca sobe
    const c = this.coice * this.coice * this.def.coice;
    let x = -c * 0.06;
    let rz = c * 0.32;
    let rx = 0;
    // sacar: vem de baixo, girando para cima
    const e = 1 - (1 - this.sacar) ** 3;
    rz -= (1 - e) * 1.1;
    let y = -(1 - e) * 0.12;

    // bombada / ferrolho: depois do tiro, a arma tomba de lado e volta
    if (this.engatilhar >= 0) {
      this.engatilhar += dt;
      const ini = 0.14;
      const dur = this.def.engatilhar === 'ferrolho' ? 0.55 : 0.42;
      const k = (this.engatilhar - ini) / dur;
      if (k > 0 && k < 1) {
        const onda = Math.sin(k * Math.PI);
        rx = (this.def.engatilhar === 'ferrolho' ? -0.55 : 0.4) * onda;
        x -= 0.05 * Math.sin(k * Math.PI * 2) ** 2;
        rz += 0.08 * onda;
        // a cápsula sai no meio do movimento, quando a bomba/o ferrolho vai para trás
        if (k >= 0.4 && !this.ejetou) {
          this.ejetou = true;
          soltar = true;
        }
      }
      if (k >= 1) {
        this.engatilhar = -1;
        this.ejetou = false;
      }
    }
    corpo.position.set(x, y, 0);
    corpo.rotation.set(rx, 0, rz);
    return soltar;
  }

  // a arma está no meio do engatilhar (o som do "tchec-tchec" sai uma vez, no começo)
  get engatilhando() {
    return this.engatilhar >= 0;
  }
}

// ------------------------------------------------------------------ cápsulas
// Um punhado de cápsulas reaproveitadas: pulam da janela de ejeção para a direita, giram, quicam
// no chão e somem. Cartucho de escopeta é vermelho e maior; o de fuzil, mais comprido.
const MAX_CAPSULAS = 40;
const capsulas = [];
let cenaCapsulas = null;
const _v = new THREE.Vector3();

const MATS = {};
const GEOS = {};
function pecaCapsula(tipo) {
  if (!GEOS[tipo]) {
    const [r, h] = tipo === 'cartucho' ? [0.011, 0.07] : tipo === 'fuzil' ? [0.0055, 0.05] : [0.0048, 0.022];
    GEOS[tipo] = new THREE.CylinderGeometry(r, r, h, 7);
    GEOS[tipo].rotateZ(Math.PI / 2);
    MATS[tipo] = new THREE.MeshStandardMaterial({
      color: tipo === 'cartucho' ? 0xb3261e : 0xc9a24a, metalness: tipo === 'cartucho' ? 0.1 : 0.85, roughness: 0.35, transparent: true,
    });
  }
  return { geo: GEOS[tipo], mat: MATS[tipo] };
}

export function iniciarCapsulas(cena) {
  cenaCapsulas = cena;
}

// de: posição da janela de ejeção (mundo); direita: para onde a cápsula voa (mundo); chao: y do piso
export function ejetarCapsula(tipo, de, direita, chao) {
  if (!cenaCapsulas) return;
  let c = capsulas.length >= MAX_CAPSULAS ? capsulas.shift() : null;
  const { geo, mat } = pecaCapsula(tipo);
  if (!c) {
    c = { mesh: new THREE.Mesh(geo, mat.clone()), vel: new THREE.Vector3(), giro: new THREE.Vector3() };
    c.mesh.castShadow = false;
  } else {
    c.mesh.geometry = geo;
    c.mesh.material.color.copy(mat.color);
    c.mesh.material.metalness = mat.metalness;
  }
  c.mesh.position.copy(de);
  c.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  c.mesh.material.opacity = 1;
  c.vel.copy(direita).multiplyScalar(1.6 + Math.random() * 0.9);
  c.vel.y = 2.2 + Math.random() * 0.8;
  c.giro.set(8 + Math.random() * 10, Math.random() * 6, 10 + Math.random() * 8);
  c.chao = chao + 0.01;
  c.vida = 2.2;
  cenaCapsulas.add(c.mesh);
  capsulas.push(c);
}

export function atualizarCapsulas(dt) {
  for (let i = capsulas.length - 1; i >= 0; i--) {
    const c = capsulas[i];
    c.vida -= dt;
    if (c.mesh.position.y > c.chao || c.vel.y > 0) {
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.giro.x * dt;
      c.mesh.rotation.z += c.giro.z * dt;
      if (c.mesh.position.y <= c.chao) {
        c.mesh.position.y = c.chao;
        // quica uma vez ou duas, cada vez mais fraco, e deita
        if (Math.abs(c.vel.y) > 0.8) {
          c.vel.y *= -0.32;
          c.vel.x *= 0.5;
          c.vel.z *= 0.5;
          c.giro.multiplyScalar(0.4);
        } else {
          c.vel.set(0, 0, 0);
          c.mesh.rotation.x = Math.PI / 2;
        }
      }
    }
    if (c.vida < 0.5) c.mesh.material.opacity = Math.max(0, c.vida / 0.5);
    if (c.vida <= 0) {
      c.mesh.removeFromParent();
      capsulas.splice(i, 1);
    }
  }
}

// solta a cápsula de uma arma segurada (calcula janela e "direita" no mundo)
const _q = new THREE.Quaternion();
export function capsulaDa(arma, chao) {
  const { janela, def } = arma.userData;
  janela.getWorldPosition(_v);
  arma.getWorldQuaternion(_q);
  // a janela fica do lado direito da arma: cano (+X) × cima (+Y) = +Z no espaço dela
  const direita = new THREE.Vector3(0, 0.25, 1).applyQuaternion(_q).normalize();
  ejetarCapsula(def.cartucho, _v.clone(), direita, chao);
}

// ------------------------------------------------------------------ visão em 1ª pessoa
// A arma presa à câmera, no canto de baixo à direita, como nos jogos de tiro: balança com o
// passo, atrasa um pouco quando a pessoa vira a câmera e chuta para trás a cada tiro.
export class VisaoArma {
  constructor(camera) {
    this.camera = camera;
    this.raiz = new THREE.Group(); // posição de descanso na tela
    this.balanco = new THREE.Group(); // passo e atraso ao virar
    this.raiz.add(this.balanco);
    this.raiz.visible = false;
    camera.add(this.raiz);
    this.arma = null;
    this.tipo = null;
    this.fase = 0;
    this.atraso = new THREE.Vector2();
    this.ultYaw = null;
    this.ultPitch = null;
  }

  async setTipo(tipo) {
    if (tipo === this.tipo) return;
    this.tipo = tipo;
    const arma = await criarArma(tipo).catch(() => null);
    if (!arma || this.tipo !== tipo) return;
    this.arma?.removeFromParent();
    this.arma = arma;
    arma.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    // cano (+X da arma) para o fundo da tela (-Z da câmera)
    arma.rotation.y = Math.PI / 2;
    const longa = !!arma.userData.def.apoio;
    // menor que o real: perto da câmera, a arma em tamanho real taparia meia tela
    arma.scale.setScalar(longa ? 0.62 : 0.8);
    this.balanco.position.set(longa ? 0.15 : 0.15, longa ? -0.15 : -0.15, longa ? -0.36 : -0.38);
    this.balanco.add(arma);
  }

  disparar() {
    this.arma?.userData.animador.disparar();
  }

  // estado: { visivel, andando (0..1), yaw, pitch, chao }
  update(dt, { visivel, andando, yaw, pitch, chao }) {
    this.raiz.visible = visivel && !!this.arma;
    if (!this.raiz.visible) {
      if (this.arma) this.arma.userData.animador.sacar = 0; // ao voltar, saca de novo
      this.ultYaw = null;
      return;
    }
    // atraso: a arma "fica para trás" quando a câmera gira, e volta sozinha
    if (this.ultYaw != null) {
      let dy = yaw - this.ultYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.atraso.x = THREE.MathUtils.clamp(this.atraso.x + dy * 0.6, -0.12, 0.12);
      this.atraso.y = THREE.MathUtils.clamp(this.atraso.y + (pitch - this.ultPitch) * 0.6, -0.1, 0.1);
    }
    this.ultYaw = yaw;
    this.ultPitch = pitch;
    this.atraso.multiplyScalar(Math.exp(-dt * 9));
    // passo: oito deitado, mais forte correndo
    this.fase += dt * (6 + andando * 5);
    const amp = andando * 0.012;
    this.raiz.position.set(Math.sin(this.fase) * amp + this.atraso.x * 0.25, -Math.abs(Math.cos(this.fase)) * amp + this.atraso.y * 0.2, 0);
    this.raiz.rotation.set(this.atraso.y * 0.6, this.atraso.x * 0.9, Math.sin(this.fase) * amp * 1.5);
    const anim = this.arma.userData.animador;
    if (anim.update(dt)) capsulaDa(this.arma, chao);
    // no 1º plano o coice aparece mais: empurra o grupo todo para trás
    this.balanco.rotation.x = anim.coice * anim.coice * this.arma.userData.def.coice * 0.08;
  }
}
