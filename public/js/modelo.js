// Personagens em glTF/GLB: carrega o arquivo, acha as animações e liga cada uma
// ao estado do jogador (parado, andando, correndo, no ar, sentado), com transição
// suave entre elas. Se o modelo não tiver animação, ele entra parado mesmo — e o
// jogo avisa, em vez de ficar uma estátua deslizando sem explicação.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneComEsqueleto } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PERSONAGENS } from './personagens.js';

// Os modelos são comprimidos com meshopt na preparação (corta ~45% do arquivo),
// então o carregador precisa do decodificador para abri-los.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const _qPasso = new THREE.Quaternion();
const _quadril = new THREE.Vector3();
// do osso do quadril até o assento, sentado (o osso fica no meio da bacia)
const FOLGA_QUADRIL = 0.14;
const _eixoPasso = new THREE.Vector3();
const EIXOS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const cache = new Map(); // url -> Promise<gltf>

// O catálogo fica em personagens.js (só dados: o servidor usa também).
export { PERSONAGENS };

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
    // alguns modelos não têm ciclo de andar: o clipe serve como POSE, toca uma
    // vez e segura o último quadro em vez de ficar repetindo o movimento inteiro
    const poses = new Set(def.poses || []);
    this.acoes = {};
    for (const [estado, clip] of Object.entries(this.mapa)) {
      if (!clip) continue;
      const acao = this.mixer.clipAction(clip);
      const ehPose = poses.has(clip.name);
      acao.setLoop(ehPose ? THREE.LoopOnce : THREE.LoopRepeat);
      acao.clampWhenFinished = ehPose;
      this.acoes[estado] = acao;
    }
    // Modelos sem ciclo de andar (os Transformers) ganham um passo feito à mão:
    // o esqueleto tem coxa, joelho e braço com nome claro, então dá para girar
    // esses ossos por cima da pose que o mixer segura.
    this.ossos = null;
    if (def.andarProcedural) {
      const achar = (re) => {
        let achado = null;
        this.raiz.traverse((o) => { if (!achado && o.isBone && re.test(o.name)) achado = o; });
        return achado;
      };
      const o = {
        coxaE: achar(/l_thigh/i), coxaD: achar(/r_thigh/i),
        joelhoE: achar(/l_knee/i), joelhoD: achar(/r_knee/i),
        bracoE: achar(/l_upperarm/i), bracoD: achar(/r_upperarm/i),
      };
      if (o.coxaE && o.coxaD) this.ossos = o;
    }
    // Sentado, cada modelo tem o quadril numa altura (o robô senta como no chão, os do KayKit
    // como numa cadeira). O jogo põe o boneco com os pés na altura do assento: sem descer o
    // modelo até o quadril encostar nele, ele fica sentado no ar.
    this.quadril = null;
    this.raiz.traverse((o) => { if (!this.quadril && o.isBone && /hips?$|pelvis/i.test(o.name)) this.quadril = o; });
    this.descida = 0;
    // Optimus e Solus "sentam" com a pose de pé: esses não descem
    this.sentaDeVerdade = !!this.mapa.sit && /sit|sent/i.test(this.mapa.sit.name);
    this.eixoPasso = def.eixoPasso || 'x';
    this.fasePasso = Math.random() * 6;
    this.pesoPasso = 0;

    this.travado = null; // animação de transformação segurando a pose
    this.modoVeiculo = false;
    this.temIdleCiclico = !!this.mapa.idle && !poses.has(this.mapa.idle.name);
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
      // terminou de voltar a robô: devolve o controle para os estados normais
      if (e.action === this.travado && !this.modoVeiculo && this.temIdleCiclico) {
        this.travado.fadeOut(0.25);
        this.travado = null;
      }
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

  // Transformação de verdade: alguns modelos trazem o clipe de virar veículo e
  // de voltar a robô. Toca uma vez e segura a pose final, em vez de usar o carro
  // desenhado em código.
  transformar(paraVeiculo) {
    const t = this.def.transforma;
    if (!t) return false;
    const nome = paraVeiculo ? t.paraVeiculo : t.paraRobo;
    const clip = this.clips.find((c) => c.name === nome);
    if (!clip) return false;
    const acao = this.mixer.clipAction(clip);
    if (this.atual) this.atual.fadeOut(0.18);
    if (this.travado && this.travado !== acao) this.travado.fadeOut(0.18);
    if (this.gesto) { this.gesto.stop(); this.gesto = null; }
    acao.reset();
    acao.setLoop(THREE.LoopOnce);
    acao.clampWhenFinished = true;
    acao.enabled = true;
    acao.setEffectiveWeight(1);
    acao.fadeIn(0.18).play();
    this.travado = acao;
    this.modoVeiculo = !!paraVeiculo;
    this.atual = null;
    this.estadoAtual = paraVeiculo ? 'veiculo' : 'robo';
    return true;
  }

  get temTransformacao() {
    const t = this.def.transforma;
    return !!(t && this.clips.some((c) => c.name === t.paraVeiculo));
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

  // Passo feito à mão, somado por cima do que o mixer escreveu. Como o mixer
  // reescreve a rotação do osso todo frame, basta somar depois dele.
  aplicarPasso(dt, anim) {
    if (!this.ossos || this.modoVeiculo) return;
    const andando = anim === 1 || anim === 2;
    if (andando) this.fasePasso += dt * (anim === 2 ? 11 : 7);
    this.pesoPasso += ((andando ? 1 : 0) - this.pesoPasso) * Math.min(1, dt * 9);
    const o = this.ossos;

    // Parado, a pose atual vira a base do passo. Isso é obrigatório: a animação
    // de transformação fica PAUSADA segurando o último quadro, então o mixer
    // para de escrever no osso — e girar o osso "por cima" acumularia um pouco a
    // cada frame até o boneco dobrar ao meio.
    if (this.pesoPasso < 0.02) {
      for (const osso of Object.values(o)) {
        if (!osso) continue;
        osso.userData.baseQ = (osso.userData.baseQ || new THREE.Quaternion()).copy(osso.quaternion);
      }
      return;
    }

    const s = Math.sin(this.fasePasso) * this.pesoPasso * (this.forcaPasso ?? 1);
    _eixoPasso.set(...(EIXOS[this.eixoPasso] || EIXOS.x));
    const girar = (osso, ang) => {
      if (!osso || !osso.userData.baseQ) return;
      _qPasso.setFromAxisAngle(_eixoPasso, ang);
      osso.quaternion.copy(osso.userData.baseQ).multiply(_qPasso);
    };
    // 0,4 rad na coxa foi o maior valor que ainda lê como passada; acima disso
    // a perna abre demais e o robô parece desengonçado
    girar(o.coxaE, s * 0.4);
    girar(o.coxaD, -s * 0.4);
    // o joelho só dobra na perna que volta, como numa passada de verdade
    girar(o.joelhoE, -Math.max(0, -s) * 0.45);
    girar(o.joelhoD, -Math.max(0, s) * 0.45);
    girar(o.bracoE, -s * 0.2);
    girar(o.bracoD, s * 0.2);
  }

  update(dt, anim, velocidade = 1) {
    // travado numa pose de transformação: nada de trocar de estado
    if (this.travado) {
      this.mixer.update(dt);
      this.aplicarPasso(dt, anim);
      return;
    }
    if (!this.gesto) this.setEstado(POR_ANIM[anim] || 'idle');
    // andar/correr acompanham a velocidade real, senão os pés patinam no chão
    if (this.atual && (this.estadoAtual === 'walk' || this.estadoAtual === 'run')) {
      this.atual.setEffectiveTimeScale(Math.max(0.4, Math.min(2.2, velocidade)));
    } else if (this.atual) {
      this.atual.setEffectiveTimeScale(1);
    }
    this.mixer.update(dt);
    this.aplicarPasso(dt, anim);
    this.encaixarNoAssento(dt);
  }

  // Desce o modelo até o quadril encostar no assento (e volta ao levantar), com suavidade
  encaixarNoAssento(dt) {
    let alvo = 0;
    if (this.estadoAtual === 'sit' && this.quadril && this.sentaDeVerdade) {
      this.quadril.updateWorldMatrix(true, false);
      this.grupo.worldToLocal(this.quadril.getWorldPosition(_quadril));
      alvo = Math.max(-1, Math.min(0, FOLGA_QUADRIL - _quadril.y)); // _quadril: no espaço do grupo
    }
    this.descida += (alvo - this.descida) * Math.min(1, dt * 10);
    this.grupo.position.y = this.descida;
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
