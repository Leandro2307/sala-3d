// Personagens em glTF/GLB: carrega o arquivo, acha as animações e liga cada uma
// ao estado do jogador (parado, andando, correndo, no ar, sentado), com transição
// suave entre elas. Se o modelo não tiver animação, ele entra parado mesmo — e o
// jogo avisa, em vez de ficar uma estátua deslizando sem explicação.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneComEsqueleto } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map(); // url -> Promise<gltf>

// Catálogo. `url` aponta para um .glb dentro de /models.
// Para entrar aqui, o modelo precisa estar RIGADO E ANIMADO — ver README em /models.
export const PERSONAGENS = {
  padrao: { id: 'padrao', label: 'Boneco', url: null },
};

export function registrarPersonagem(def) {
  PERSONAGENS[def.id] = def;
}

// Nomes que os pacotes de animação costumam usar (Mixamo, Quaternius, Kenney…).
const PADROES = {
  idle: [/idle/i, /breath/i, /stand/i, /parado/i],
  walk: [/walk/i, /andar/i, /caminh/i],
  run: [/run/i, /sprint/i, /corr/i],
  air: [/jump/i, /fall/i, /air/i, /pul/i],
  sit: [/sit/i, /sent/i],
};

// Liga cada estado do jogo a um clipe. Estados sem clipe próprio caem no mais
// parecido (correr vira andar, no ar vira parado) para nunca ficar sem animação.
export function mapearClipes(clips) {
  const achar = (regexes) => clips.find((c) => regexes.some((r) => r.test(c.name))) || null;
  const mapa = {};
  for (const [estado, regexes] of Object.entries(PADROES)) mapa[estado] = achar(regexes);
  if (!mapa.idle) mapa.idle = clips[0] || null; // sem nome reconhecido: usa o primeiro
  if (!mapa.walk) mapa.walk = mapa.idle;
  if (!mapa.run) mapa.run = mapa.walk;
  if (!mapa.air) mapa.air = mapa.idle;
  if (!mapa.sit) mapa.sit = mapa.idle;
  return mapa;
}

// anim do jogador: 0 parado, 1 andando, 2 correndo, 3 no ar, 4 sentado
const POR_ANIM = ['idle', 'walk', 'run', 'air', 'sit'];

export function carregarModelo(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, (err) => {
        cache.delete(url); // deixa tentar de novo depois
        reject(err);
      });
    }));
  }
  return cache.get(url);
}

// Põe o modelo de pé na origem, com a altura certa e virado para +Z (frente do jogo).
function ajustar(raiz, def) {
  const caixa = new THREE.Box3().setFromObject(raiz);
  const tam = caixa.getSize(new THREE.Vector3());
  const alvo = def.altura || 1.8;
  const escala = def.escala || (tam.y > 0 ? alvo / tam.y : 1);
  raiz.scale.setScalar(escala);

  // recalcula depois de escalar e assenta os pés em y=0, centrado em x/z
  const caixa2 = new THREE.Box3().setFromObject(raiz);
  const centro = caixa2.getCenter(new THREE.Vector3());
  raiz.position.x -= centro.x;
  raiz.position.z -= centro.z;
  raiz.position.y -= caixa2.min.y;
  if (def.giro) raiz.rotation.y += def.giro;
  return escala;
}

export class Personagem {
  constructor(gltf, def) {
    this.def = def;
    // clona preservando o esqueleto: o clone comum do three quebra o skinning,
    // e os vários jogadores da sala compartilham o mesmo arquivo carregado
    this.raiz = cloneComEsqueleto(gltf.scene);
    this.clips = gltf.animations || [];
    this.temAnimacao = this.clips.length > 0;

    this.grupo = new THREE.Group();
    this.grupo.add(this.raiz);
    this.escala = ajustar(this.raiz, def);

    this.raiz.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // esqueleto animado estoura a caixa original
      }
    });

    this.mixer = new THREE.AnimationMixer(this.raiz);
    this.mapa = mapearClipes(this.clips);
    this.acoes = {};
    for (const [estado, clip] of Object.entries(this.mapa)) {
      if (!clip) continue;
      const acao = this.mixer.clipAction(clip);
      acao.setLoop(THREE.LoopRepeat);
      this.acoes[estado] = acao;
    }
    this.atual = null;
    this.setEstado('idle', 0);
  }

  // Troca de animação com mistura, que é o que faz parecer fluido em vez de
  // "pular" de uma pose para a outra.
  setEstado(estado, mistura = 0.22) {
    const acao = this.acoes[estado];
    if (!acao || acao === this.atual) return;
    acao.reset();
    acao.enabled = true;
    acao.setEffectiveWeight(1);
    acao.play();
    if (this.atual) this.atual.crossFadeTo(acao, mistura, false);
    this.atual = acao;
    this.estadoAtual = estado;
  }

  update(dt, anim, velocidade = 1) {
    this.setEstado(POR_ANIM[anim] || 'idle');
    // andar/correr acompanham a velocidade real, senão os pés patinam no chão
    if (this.atual && (this.estadoAtual === 'walk' || this.estadoAtual === 'run')) {
      this.atual.setEffectiveTimeScale(Math.max(0.4, Math.min(2.2, velocidade)));
    } else if (this.atual) {
      this.atual.setEffectiveTimeScale(1);
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.raiz.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) m[k]?.dispose?.();
          m.dispose?.();
        }
      }
    });
  }
}

// Carrega e devolve um Personagem pronto, ou null se o arquivo não vier.
export async function criarPersonagem(def) {
  if (!def?.url) return null;
  const gltf = await carregarModelo(def.url);
  return new Personagem(gltf, def);
}
