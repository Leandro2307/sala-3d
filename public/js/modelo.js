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

const _quadril = new THREE.Vector3();
// do osso do quadril até o assento, sentado (o osso fica no meio da bacia)
const FOLGA_QUADRIL = 0.14;
// quanto quem flutua leva para trocar de um clipe para o outro: mais que os 0,22 s dos outros, para
// a inclinação da corrida não sumir antes de ele pousar
const MISTURA_FLUTUA = 0.4;
const cache = new Map(); // url -> Promise<gltf>
const medidas = new WeakMap(); // def -> { escala, giroY, posicao, altura } (ver ajustar)
const _v = new THREE.Vector3();
const _x = new THREE.Matrix4();
const _p = new THREE.Matrix4();

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

// def: o cadastro de quem pediu, para podar as armas (ver podarMaos). O arquivo é baixado e
// podado uma vez só, antes de qualquer clone, com o def do primeiro pedido.
export function carregarModelo(url, def = null) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        podarMaos(gltf.scene, def?.maos);
        resolve(gltf);
      }, undefined, (err) => {
        cache.delete(url); // deixa tentar de novo depois
        reject(err);
      });
    }));
  }
  return cache.get(url);
}

// O KayKit traz todas as armas do pacote no arquivo, penduradas nos ossos das mãos (handslot.l
// e .r, que o GLTFLoader chama de handslotl e handslotr) e umas por cima das outras: o pacote
// espera que o jogo escolha uma. O jogo usa as animações desarmadas, então elas saem do modelo
// carregado — eram 4 a 7 desenhos a mais por pessoa, e outros tantos na sombra. maos: nomes das
// peças que ficam. O osso fica: é junta da skin.
function podarMaos(cena, maos = []) {
  const fora = [];
  cena.traverse((o) => {
    if (!o.isBone || !/^handslot/i.test(o.name)) return;
    for (const peca of o.children) if (!peca.isBone && !maos.includes(peca.name)) fora.push(peca);
  });
  for (const peca of fora) peca.removeFromParent();
}

// peça que ficou na mão (def.maos)
function naMao(o) {
  for (let p = o.parent; p; p = p.parent) if (p.isBone && /^handslot/i.test(p.name)) return true;
  return false;
}

// Mede o tamanho real do modelo. Os arquivos vêm em escalas completamente
// diferentes (a raposa tem 79 unidades de altura, o humano 1,5), então medir é
// obrigatório. Dois cuidados que, sem eles, dão modelo gigante ou minúsculo:
// atualizar as matrizes antes de medir, e percorrer os vértices já na pose do
// esqueleto em vez de confiar na caixa pré-calculada da malha com esqueleto.
// O que fica na mão não conta: um cajado mudaria a altura, e um escudo, o centro.
function medir(obj) {
  obj.updateMatrixWorld(true);
  const caixa = new THREE.Box3();
  obj.traverse((o) => {
    const pos = o.isMesh && o.geometry.attributes.position;
    if (!pos || naMao(o)) return;
    for (let i = 0; i < pos.count; i++) caixa.expandByPoint(o.getVertexPosition(i, _v).applyMatrix4(o.matrixWorld));
  });
  return caixa;
}

// Põe o modelo de pé na origem, com a altura certa e virado para +Z (frente do jogo).
// A pose de repouso é a mesma em todo clone do arquivo, e medir percorre todos os vértices na
// CPU: mede uma vez por cadastro, e os seguintes (40 cavaleiros chegando juntos) só copiam.
function ajustar(raiz, def) {
  const feita = medidas.get(def);
  if (feita) {
    raiz.scale.setScalar(feita.escala);
    raiz.rotation.y = feita.giroY;
    raiz.position.copy(feita.posicao);
    raiz.updateMatrixWorld(true);
    return feita;
  }
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
  const medida = { escala, giroY: raiz.rotation.y, posicao: raiz.position.clone(), altura: caixa2.getSize(tam).y };
  medidas.set(def, medida);
  return medida;
}

// Um esqueleto por personagem. O gltfpack embute a desquantização de cada malha nas matrizes de
// bind da skin dela: o KayKit chega com 6 a 9 skins dos mesmos 41 ossos, que só diferem por uma
// matriz fixa X por malha, e o SkeletonUtils.clone ainda dá um esqueleto a cada primitiva (Atos
// 3, robô 4). X vai para o bindMatrix e todas usam o esqueleto da primeira: 1 atualização e 1
// textura de ossos por quadro. No shader o ponto é o mesmo:
// osso·IBMbase·(X·bind)·v = osso·IBMmalha·bind·v.
// X tem de fechar em TODOS os ossos; se algum não fecha, a malha fica com o esqueleto dela.
function unirEsqueletos(raiz) {
  let base = null;
  raiz.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const sk = o.skeleton;
    if (!base) { base = sk; return; }
    if (sk === base) return;
    const n = base.bones.length;
    if (sk.bones.length !== n || sk.bones.some((b, i) => b !== base.bones[i])) return;
    _x.copy(base.boneInverses[0]).invert().multiply(sk.boneInverses[0]);
    for (let i = 0; i < n; i++) {
      const p = _p.multiplyMatrices(base.boneInverses[i], _x).elements;
      const r = sk.boneInverses[i].elements;
      for (let j = 0; j < 16; j++) if (Math.abs(p[j] - r[j]) > 1e-4 * Math.max(1, Math.abs(r[j]))) return;
    }
    o.bind(base, new THREE.Matrix4().multiplyMatrices(_x, o.bindMatrix));
  });
}

export class Personagem {
  constructor(gltf, def) {
    this.def = def;
    // clona preservando o esqueleto: o clone comum do three quebra o skinning,
    // e os vários jogadores da sala compartilham o mesmo arquivo carregado
    this.raiz = cloneComEsqueleto(gltf.scene);
    // antes de ajustar(): o updateMatrixWorld de medir() refaz a bindMatrixInverse
    unirEsqueletos(this.raiz);
    this.clips = gltf.animations || [];
    this.temAnimacao = this.clips.length > 0;

    this.grupo = new THREE.Group();
    this.grupo.add(this.raiz);
    const medida = ajustar(this.raiz, def);
    this.escala = medida.escala;

    // Esfera do boneco inteiro, no espaço de cada malha com esqueleto. Com ela o three descarta
    // o personagem fora da câmera e fora da caixa da sombra, e não sobe os ossos de quem ficou
    // de fora. Sem esfera dada, o three a calcularia uma vez só, na pose do instante, e o braço
    // do soco sumiria na borda. Medido em todos os clipes do jogo: o vértice mais longe fica a
    // 0,87 h (Atos no soco) e a 2,31 h nos que transformam (Optimus virando carreta). Malha
    // rígida presa em osso usa a esfera da própria geometria.
    const h = medida.altura;
    const esfera = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * (def.raioVista ?? (def.transforma ? 2.7 : 1.1)));
    this.grupo.updateMatrixWorld(true); // ainda fora da cena: matrixWorld = espaço do grupo
    const inv = new THREE.Matrix4();
    this.raiz.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      if (o.isSkinnedMesh) o.boundingSphere = esfera.clone().applyMatrix4(inv.copy(o.matrixWorld).invert());
    });

    this.mixer = new THREE.AnimationMixer(this.raiz);
    this.mapa = mapearClipes(this.clips, def.clipes);
    // clipe que é o movimento de chegar numa pose (o "Sitting" do robô): toca uma
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
    // Sentado, cada modelo tem o quadril numa altura (o robô senta como no chão, os do KayKit
    // como numa cadeira). O jogo põe o boneco com os pés na altura do assento: sem descer o
    // modelo até o quadril encostar nele, ele fica sentado no ar.
    this.quadril = null;
    this.raiz.traverse((o) => { if (!this.quadril && o.isBone && /hips?$|pelvis/i.test(o.name)) this.quadril = o; });
    this.descida = 0;
    // Optimus e Solus "sentam" com a pose de pé: esses não descem
    this.sentaDeVerdade = !!this.mapa.sit && /sit|sent/i.test(this.mapa.sit.name);

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

    // quem não tem perna anda flutuando (def.flutua): ver flutuar()
    this.fase = 0;
    this.subida = 0;
    this.flutuacao = 0;

    this.atual = null;
    this.setEstado('idle', 0);
  }

  // Troca de animação com mistura, que é o que faz parecer fluido em vez de
  // "pular" de uma pose para a outra.
  setEstado(estado, mistura = 0.22) {
    const acao = this.acoes[estado];
    if (!acao || acao === this.atual) return;
    if (this.def.flutua) {
      // quem flutua mistura os clipes à mão (misturarPesos), cada um saindo do peso em que está
      if (!acao.isScheduled()) {
        acao.reset();
        acao.weight = mistura ? 0 : 1;
        acao.play();
      }
      acao.enabled = true;
    } else {
      acao.reset();
      acao.enabled = true;
      acao.setEffectiveWeight(1);
      acao.play();
      if (this.atual) this.atual.crossFadeTo(acao, mistura, false);
    }
    this.atual = acao;
    this.estadoAtual = estado;
  }

  // O crossFade do three recomeça os dois pesos do zero: trocar de novo no meio de uma mistura
  // (uma curva fechada correndo passa 2 ou 3 quadros andando) jogava o corpo de uma inclinação
  // para a outra num quadro só. Aqui o clipe do estado sobe até 1 e os outros descem até 0 de onde
  // estão. Mexe em .weight e não em setEffectiveWeight, que cancelaria o fadeOut de um gesto.
  misturarPesos(dt) {
    const passo = dt / MISTURA_FLUTUA;
    for (const acao of new Set(Object.values(this.acoes))) {
      if (!acao.isScheduled()) continue;
      if (acao === this.atual) acao.weight = Math.min(1, acao.weight + passo);
      else if ((acao.weight = Math.max(0, acao.weight - passo)) === 0) acao.stop();
    }
  }

  // Transformação de verdade: alguns modelos trazem o clipe de virar veículo e
  // de voltar a robô. Toca uma vez e segura a pose final, em vez de usar o carro
  // desenhado em código. Quem só traz a ida (o Bumblebee: transforma.voltaAoContrario)
  // volta a robô com ela de trás para frente.
  transformar(paraVeiculo) {
    const t = this.def.transforma;
    if (!t) return false;
    const reverso = !paraVeiculo && !!t.voltaAoContrario;
    const nome = paraVeiculo || reverso ? t.paraVeiculo : t.paraRobo;
    const clip = this.clips.find((c) => c.name === nome);
    if (!clip) return false;
    const acao = this.mixer.clipAction(clip);
    // de carro, a ida está parada no último quadro com peso 1: a volta sai dali sem misturar
    const continua = reverso && this.travado === acao;
    if (this.atual) this.atual.fadeOut(0.18);
    if (this.travado && this.travado !== acao) this.travado.fadeOut(0.18);
    if (this.gesto) { this.gesto.stop(); this.gesto = null; }
    acao.reset();
    acao.setLoop(THREE.LoopOnce);
    acao.clampWhenFinished = true;
    acao.enabled = true;
    acao.timeScale = reverso ? -1 : 1;
    if (reverso) acao.time = clip.duration;
    acao.setEffectiveWeight(1);
    if (!continua) acao.fadeIn(0.18);
    acao.play();
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

  update(dt, anim, velocidade = 1) {
    // travado numa pose de transformação: nada de trocar de estado
    if (this.travado) {
      this.mixer.update(dt);
      return;
    }
    if (!this.gesto) this.setEstado(POR_ANIM[anim] || 'idle');
    if (this.def.flutua) {
      this.misturarPesos(dt);
      this.flutuar(dt, anim === 1 || anim === 2, velocidade);
    } else if (this.atual && (this.estadoAtual === 'walk' || this.estadoAtual === 'run')) {
      // andar/correr acompanham a velocidade real, senão os pés patinam no chão
      this.atual.setEffectiveTimeScale(Math.max(0.4, Math.min(2.2, velocidade)));
    } else if (this.atual) {
      this.atual.setEffectiveTimeScale(1);
    }
    this.mixer.update(dt);
    this.encaixarNoAssento(dt);
  }

  // Quem não tem perna (def.flutua = { altura, periodo }) não dá passo: andando, vai em ondas, do
  // chão até `altura` e de volta ao chão a cada `periodo` segundos (correndo, 1,6x mais rápido).
  // A altura sai daqui e não do clipe: trocar de animação mistura os clipes em 0,2 s, e começar ou
  // parar de andar fazia o boneco pular do chão para o alto de uma vez. Aqui a primeira onda sai do
  // chão, e ao parar ele desce devagar até pousar; voltando a andar antes disso, segue da onda em
  // que estava. Os clipes de andar e correr trazem o resto (inclinar com a onda, mãos arrastadas)
  // e tocam no compasso desta onda: quadro 0 no chão, meio do clipe no alto.
  flutuar(dt, andando, ritmo) {
    const { altura, periodo } = this.def.flutua;
    // sobe a onda inteira em 0,35 s e pousa em 0,7 s, com começo e fim suaves
    this.subida = Math.max(0, Math.min(1, this.subida + dt * (andando ? 1 / 0.35 : -1 / 0.7)));
    if (andando) this.fase = (this.fase + dt * ritmo / periodo) % 1;
    else if (this.subida === 0) this.fase = 0; // pousou: a próxima onda começa do chão
    const s = this.subida;
    this.flutuacao = altura * s * s * (3 - 2 * s) * (1 - Math.cos(2 * Math.PI * this.fase)) / 2;
    for (const estado of ['walk', 'run']) {
      const acao = this.acoes[estado];
      if (!acao || acao === this.acoes.idle) continue;
      acao.setEffectiveTimeScale(0);
      acao.time = this.fase * acao.getClip().duration;
    }
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
    this.grupo.position.y = this.descida + this.flutuacao;
  }

  // Para a animação e solta os esqueletos (a textura de ossos de cada um). Geometria, material
  // e textura ficam: são do gltf em cache e dos outros bonecos com o mesmo modelo (a vitrine já
  // conta com isso). Apagá-los faria cada troca de personagem reenviar e recompilar o modelo, na
  // hora, em todas as máquinas da sala. O mixer não passa por uncacheRoot: ele morre junto com
  // este objeto, e um update ou gesto que chegasse depois lançaria erro dentro do three.
  dispose() {
    this.mixer.stopAllAction();
    const esqueletos = new Set();
    this.raiz.traverse((o) => { if (o.isSkinnedMesh) esqueletos.add(o.skeleton); });
    for (const s of esqueletos) s.dispose();
  }
}

// Carrega e devolve um Personagem pronto, ou null se o arquivo não vier.
export async function criarPersonagem(def) {
  if (!def?.url) return null;
  const gltf = await carregarModelo(def.url, def);
  return new Personagem(gltf, def);
}
