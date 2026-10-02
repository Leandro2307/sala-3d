// Personagens em glTF/GLB: carrega o arquivo, acha as animações e liga cada uma
// ao estado do jogador (parado, andando, correndo, no ar, sentado), com transição
// suave entre elas. Se o modelo não tiver animação, ele entra parado mesmo — e o
// jogo avisa, em vez de ficar uma estátua deslizando sem explicação.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneComEsqueleto } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Os modelos são comprimidos com meshopt na preparação (corta ~45% do arquivo),
// então o carregador precisa do decodificador para abri-los.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map(); // url -> Promise<gltf>

// Catálogo. `url` aponta para um .glb dentro de /models.
// Para entrar aqui, o modelo precisa estar RIGADO E ANIMADO — ver README em /models.
export const PERSONAGENS = {
  padrao: { id: 'padrao', label: 'Boneco', url: null },
  robo: {
    id: 'robo',
    label: 'Robô',
    url: '/models/robo.glb',
    altura: 1.8,
    // 14 animações, incluindo Punch e Sitting — encaixa em tudo que o jogo tem
    credito: 'Tomás Laulhé (Quaternius), ajustes de Don McCurdy — CC0',
  },
  ...['cavaleiro', 'barbaro', 'mago', 'ladino'].reduce((acc, id, i) => {
    acc[id] = {
      id,
      label: ['Cavaleiro', 'Bárbaro', 'Mago', 'Ladino'][i],
      url: '/models/' + id + '.glb',
      altura: 1.8,
      // o pacote traz 76 clipes; estes são os que o jogo usa, escolhidos à mão
      // porque o palpite automático pegava a pose de combate com arma na mão
      clipes: {
        idle: 'Unarmed_Idle',
        walk: 'Walking_A',
        run: 'Running_A',
        air: 'Jump_Idle',
        sit: 'Sit_Chair_Idle',
        punch: 'Unarmed_Melee_Attack_Punch_A',
        wave: 'Cheer',
      },
      credito: 'KayKit Adventurers, de Kay Lousberg — CC0',
    };
    return acc;
  }, {}),
};

export function registrarPersonagem(def) {
  PERSONAGENS[def.id] = def;
}

// Nomes que os pacotes de animação costumam usar (Mixamo, Quaternius, Kenney…).
const PADROES = {
  idle: [/idle/i, /breath/i, /stand/i, /parado/i, /survey/i],
  walk: [/walk/i, /andar/i, /caminh/i],
  run: [/run/i, /sprint/i, /corr/i],
  air: [/jump/i, /fall/i, /air/i, /pul/i],
  sit: [/sit/i, /sent/i],
};

// Liga cada estado do jogo a um clipe. Estados sem clipe próprio caem no mais
// parecido (correr vira andar, no ar vira parado) para nunca ficar sem animação.
export function mapearClipes(clips, explicito = null) {
  const porNome = (n) => clips.find((c) => c.name === n) || null;
  const achar = (regexes) => clips.find((c) => regexes.some((r) => r.test(c.name))) || null;
  const mapa = {};
  for (const [estado, regexes] of Object.entries(PADROES)) {
    // nome dado à mão ganha do palpite: num pacote com 76 clipes o palpite erra
    mapa[estado] = (explicito && explicito[estado] && porNome(explicito[estado])) || achar(regexes);
  }
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

// Mede o tamanho real do modelo. Os arquivos vêm em escalas completamente
// diferentes (a raposa tem 79 unidades de altura, o humano 1,5), então medir é
// obrigatório. Dois cuidados que, sem eles, dão modelo gigante ou minúsculo:
// atualizar as matrizes antes de medir, e usar a versão "precisa", que percorre
// os vértices em vez de confiar na caixa pré-calculada da malha com esqueleto.
function medir(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj, true);
}

// Põe o modelo de pé na origem, com a altura certa e virado para +Z (frente do jogo).
function ajustar(raiz, def) {
  const caixa = medir(raiz);
  const tam = caixa.getSize(new THREE.Vector3());
  const alvo = def.altura || 1.8;
  const escala = def.escala || (tam.y > 0.0001 ? alvo / tam.y : 1);
  raiz.scale.setScalar(escala);
  if (def.giro) raiz.rotation.y += def.giro;

  // mede de novo já escalado e girado, e assenta os pés em y=0, centrado em x/z
  const caixa2 = medir(raiz);
  const centro = caixa2.getCenter(new THREE.Vector3());
  raiz.position.x -= centro.x;
  raiz.position.z -= centro.z;
  raiz.position.y -= caixa2.min.y;
  raiz.updateMatrixWorld(true);
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
    this.mapa = mapearClipes(this.clips, def.clipes);
    this.acoes = {};
    for (const [estado, clip] of Object.entries(this.mapa)) {
      if (!clip) continue;
      const acao = this.mixer.clipAction(clip);
      acao.setLoop(THREE.LoopRepeat);
      this.acoes[estado] = acao;
    }
    // golpes e gestos que tocam uma vez e voltam ao estado anterior
    this.umaVez = {};
    for (const [chave, re] of Object.entries({ punch: /punch|soco|attack/i, wave: /wave|acen|cheer/i })) {
      const porNome = def.clipes?.[chave];
      const clip = (porNome && this.clips.find((c) => c.name === porNome))
        || this.clips.find((c) => re.test(c.name));
      if (!clip) continue;
      const acao = this.mixer.clipAction(clip);
      acao.setLoop(THREE.LoopOnce);
      acao.clampWhenFinished = true;
      this.umaVez[chave] = acao;
    }
    this.gesto = null;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.gesto) {
        const voltar = this.atual;
        this.gesto.fadeOut(0.18);
        this.gesto = null;
        if (voltar) { voltar.enabled = true; voltar.setEffectiveWeight(1); voltar.fadeIn(0.18); }
      }
    });

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

  // Toca um gesto por cima do estado atual (soco, aceno) e volta sozinho.
  tocarGesto(nome) {
    const acao = this.umaVez[nome];
    if (!acao) return false;
    if (this.gesto) this.gesto.stop();
    acao.reset();
    acao.enabled = true;
    acao.setEffectiveWeight(1);
    acao.play();
    if (this.atual) this.atual.fadeOut(0.12);
    this.gesto = acao;
    return true;
  }

  update(dt, anim, velocidade = 1) {
    if (!this.gesto) this.setEstado(POR_ANIM[anim] || 'idle');
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
