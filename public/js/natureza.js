// Natureza do mapa, no tema dele (temas3d.js): céu do meio-dia, serra (ou mar) no horizonte, mata,
// água (lagoa, lago congelado ou lago de carpas), flores, nuvens, pássaros e, no outono, folhas
// caindo. Nada disso aparece dentro da sala do cinema (paredes e teto tampam).
//
// Tudo é sorteado com semente fixa: cada jogador monta o mesmo mundo, com as mesmas árvores
// nos mesmos lugares, sem precisar mandar nada pela rede.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isTouch } from './touch.js';
import { CAMINHO, PISTA } from './pista.js';
import {
  TEMA, SOL_DA_TARDE, DETALHE, arvoresDoTema, pintar as pintarTema, texturaFoto, relevoFoto, materiaisArvore, CHAO_DO_TEMA, geoArbusto,
  geoArbustoSimples, geoPedraSimples,
} from './temas3d.js';

const LEVE = isTouch; // celular: menos árvores, terreno mais grosso
// Lado do pedaço do mapa em que as plantas são agrupadas (ver instanciar). No celular, pedaços
// maiores: uns 45 desenhos a menos, e lá cada desenho pesa mais que os triângulos. No PC fica 320,
// onde o recorte dos pedaços fora da tela poupa de 120 a 300 mil triângulos.
const PEDACO = LEVE ? 480 : 320;
// O sol se põe a noroeste. O relevo abre um vale nessa direção para dar para ver o pôr do sol.
const SOL = new THREE.Vector3(-0.72, 0.045, 0.69).normalize();
const SOL_XZ = new THREE.Vector2(SOL.x, SOL.z).normalize();

// ------------------------------------------------------------------ shader só de sol
// Longe da cerca nenhuma luz pontual nem o holofote chega: além dela, o maior alcance é o do
// brilho da tela do cinema, ~61 m atrás da sala (onde não nasce árvore), e o dos braseiros dos
// jogos, ~11 m. Lá o laço das pontuais e da spot só somaria zero em cada pixel: o terreno e as
// árvores longe e as nuvens usam um shader sem ele. Se puser luz pontual perto da cerca, rever os
// cortes (80 m no terreno, 60 m nas árvores).
// O pedaço sai do texto do shader: #undef NUM_POINT_LIGHTS não serve, porque o three troca esses
// nomes por números no texto e o resultado nem compila. No r186 a ordem é pontual, spot, sol,
// direcional; se mudar numa versão nova, SEM_PONTUAIS fica null e o material fica como era.
const TRECHO = THREE.ShaderChunk.lights_fragment_begin;
const iPonto = TRECHO.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
const iSol = TRECHO.indexOf('#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )');
const SEM_PONTUAIS = iPonto >= 0 && iSol > iPonto ? TRECHO.slice(0, iPonto) + TRECHO.slice(iSol) : null;
function soSol(m) {
  if (!SEM_PONTUAIS) return m;
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_begin>', () => SEM_PONTUAIS);
  };
  m.customProgramCacheKey = () => 'soSol';
  return m;
}

// ------------------------------------------------------------------ aleatório e ruído
function semente(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function ruido(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, oitavas = 5) {
  let soma = 0;
  let amp = 0.5;
  let freq = 1;
  let norma = 0;
  for (let i = 0; i < oitavas; i++) {
    soma += amp * ruido(x * freq, y * freq);
    norma += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return soma / norma;
}

// cristas: o que dá cara de serra (picos afiados) em vez de morrinhos redondos
function cristas(x, y, oitavas = 5) {
  let soma = 0;
  let amp = 0.5;
  let freq = 1;
  let norma = 0;
  for (let i = 0; i < oitavas; i++) {
    const r = 1 - Math.abs(ruido(x * freq, y * freq) * 2 - 1);
    soma += amp * r * r;
    norma += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return soma / norma;
}

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ relevo
// Plano dentro da área jogável (a física do chão é plana em y=0), colinas logo depois da
// cerca e a serra bem mais longe.
function foraDaArea(x, z, area) {
  const dx = Math.max(area.minX - x, 0, x - area.maxX);
  const dz = Math.max(area.minZ - z, 0, z - area.maxZ);
  return Math.hypot(dx, dz);
}

const RELEVO = TEMA.relevo;
// fundo do mar (praia): a terra desce logo depois da cerca e o mar (y = NIVEL_MAR) cobre
const NIVEL_MAR = -0.6;
export function alturaTerreno(x, z, area) {
  const d = foraDaArea(x, z, area);
  if (d <= 0) return 0;
  const terra = alturaDaTerra(x, z, area, d) * RELEVO.serra;
  if (!RELEVO.mar) return terra;
  // só o lado norte (+z) é terra firme; os outros viram mar, com uma faixa de praia na cerca
  const cx = x - (area.minX + area.maxX) / 2;
  const cz = z - (area.minZ + area.maxZ) / 2;
  const norte = cz / (Math.hypot(cx, cz) || 1);
  const firme = suave(0.15, 0.55, norte + (fbm(x * 0.004, z * 0.004, 3) - 0.5) * 0.4);
  const fundo = 1.2 - suave(6, 60, d) * 9 - suave(60, 400, d) * 20;
  return fundo + (terra - fundo) * firme;
}
function alturaDaTerra(x, z, area, d) {
  // vale na direção do pôr do sol: colinas e serra baixam nesse trecho do horizonte
  const cx = x - (area.minX + area.maxX) / 2;
  const cz = z - (area.minZ + area.maxZ) / 2;
  const alinhado = (cx * SOL_XZ.x + cz * SOL_XZ.y) / (Math.hypot(cx, cz) || 1);
  const vale = suave(0.5, 0.92, alinhado);
  const colinas = suave(6, 170, d) * (6 + fbm(x * 0.007, z * 0.007, 4) * 40) * (1 - 0.75 * vale);
  const serra = suave(150, 780, d) * (30 + cristas(x * 0.0019 + 7.3, z * 0.0019 - 3.1, 5) * 560) * (1 - 0.88 * vale);
  return colinas + serra;
}

// ------------------------------------------------------------------ distância até a pista
// Grade com a distância de cada ponto até a linha central do circuito. Calculada uma vez
// carimbando círculos em volta dos pontos do traçado — bem mais barato que projetar cada árvore.
function gradeDaPista(area, celula = 4, raio = 72) {
  const nx = Math.ceil((area.maxX - area.minX) / celula) + 1;
  const nz = Math.ceil((area.maxZ - area.minZ) / celula) + 1;
  const g = new Float32Array(nx * nz).fill(1e9);
  for (const p of CAMINHO) {
    const px = PISTA.cx + p.x;
    const pz = PISTA.cz + p.y;
    const i0 = Math.max(0, Math.floor((px - raio - area.minX) / celula));
    const i1 = Math.min(nx - 1, Math.ceil((px + raio - area.minX) / celula));
    const j0 = Math.max(0, Math.floor((pz - raio - area.minZ) / celula));
    const j1 = Math.min(nz - 1, Math.ceil((pz + raio - area.minZ) / celula));
    for (let j = j0; j <= j1; j++) {
      const z = area.minZ + j * celula;
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(area.minX + i * celula - px, z - pz);
        const k = j * nx + i;
        if (d < g[k]) g[k] = d;
      }
    }
  }
  return (x, z) => {
    const i = Math.round((x - area.minX) / celula);
    const j = Math.round((z - area.minZ) / celula);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 1e9;
    return g[j * nx + i];
  };
}

function distSegmento(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2));
  return Math.hypot(px - (ax + abx * u), pz - (az + abz * u));
}

// ------------------------------------------------------------------ céu
// Domo que acompanha a câmera e é desenhado no fundo do depth buffer (z = w): nunca
// tapa nada e não some com o "far" da câmera.
function criarCeu(scene, solDir) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      // o céu do meio-dia (o mesmo do clima.js): já nasce assim, e o reflexo do lago sai certo
      topo: { value: new THREE.Color(TEMA.ceu[0]) },
      meio: { value: new THREE.Color(TEMA.ceu[1]) },
      horizonte: { value: new THREE.Color(TEMA.ceu[2]) },
      base: { value: new THREE.Color(TEMA.ceu[3]) },
      brilho: { value: new THREE.Color(TEMA.ceu[4]) },
      solDir: { value: new THREE.Vector3(...SOL_DA_TARDE).normalize() },
      disco: { value: new THREE.Color(1.6, 1.58, 1.46) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topo;
      uniform vec3 meio;
      uniform vec3 horizonte;
      uniform vec3 base;
      uniform vec3 brilho;
      uniform vec3 solDir;
      uniform vec3 disco;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(horizonte, meio, smoothstep(0.0, 0.2, h));
        c = mix(c, topo, smoothstep(0.16, 0.8, h));
        float s = max(dot(d, solDir), 0.0);
        // a névoa clara que sobe do horizonte (o céu de verdade é mais branco embaixo)
        c = mix(c, horizonte, (1.0 - smoothstep(-0.02, 0.32, h)) * 0.35);
        // halo do pôr do sol perto do horizonte, o clarão em volta do sol e o disco
        c += brilho * pow(s, 7.0) * (1.0 - smoothstep(0.0, 0.5, h)) * 0.6;
        c += brilho * (pow(s, 24.0) * 0.28 + pow(s, 280.0) * 0.6);
        c += disco * smoothstep(0.99935, 0.9997, s);
        c = mix(c, base, smoothstep(0.0, -0.1, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
  // Último dos opacos: no fundo do depth buffer (z = w), com LessEqual contra o 1,0 do clear, só
  // pinta onde nada foi desenhado (desenhado primeiro, pintava a tela inteira por baixo de tudo).
  // Vidro, chuva e estrelas são transparentes e continuam por cima, e o buraco do player (opaco,
  // NoBlending) grava profundidade e continua transparente.
  ceu.renderOrder = 1;
  ceu.frustumCulled = false;
  scene.add(ceu);

  // estrelas: só no alto (ainda está entardecendo) e atrás de tudo, como o céu
  const rnd = semente(77);
  const qtd = LEVE ? 350 : 700;
  const pos = new Float32Array(qtd * 3);
  const tam = new Float32Array(qtd);
  for (let i = 0; i < qtd; i++) {
    const y = 0.22 + rnd() * 0.78;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 90, y * 90, Math.sin(a) * r * 90], i * 3);
    tam[i] = 1 + rnd() * 1.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('tam', new THREE.BufferAttribute(tam, 1));
  const estrelasMat = new THREE.ShaderMaterial({
    uniforms: { tempo: { value: 0 }, visivel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float tam;
      uniform float tempo;
      uniform float visivel;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w;
        float altura = normalize(position).y;
        vAlpha = smoothstep(0.2, 0.6, altura) * (0.55 + 0.45 * sin(tempo * 1.7 + position.x * 0.37)) * visivel;
        gl_PointSize = tam;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(p)) * vAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const estrelas = new THREE.Points(geo, estrelasMat);
  estrelas.frustumCulled = false;
  estrelas.renderOrder = -1;
  scene.add(estrelas);

  return {
    mat,
    estrelasMat,
    estrelas,
    seguir(cam, t) {
      ceu.position.copy(cam.position);
      estrelas.position.copy(cam.position);
      estrelasMat.uniforms.tempo.value = t;
    },
  };
}

// ------------------------------------------------------------------ texturas
// grão cinza (multiplica a cor do vértice): o chão e a margem nas texturas simples (DETALHE falso)
function texturaGrao(tamanho, base, variacao, seed) {
  const rnd = semente(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = tamanho;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(tamanho, tamanho);
  for (let i = 0; i < tamanho * tamanho; i++) {
    const v = Math.round(255 * (base + (rnd() - 0.5) * variacao));
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// normal map da água: ondinhas feitas de senos com frequência inteira, para emendar sem costura
function texturaAgua(tamanho = 128) {
  const ondas = [[3, 1, 0.9, 0.3], [1, 4, 0.7, 1.7], [5, -2, 0.45, 2.9], [-2, 6, 0.35, 4.1], [7, 3, 0.25, 0.8]];
  const altura = (i, j) => ondas.reduce((s, [fx, fy, a, f]) => s + a * Math.sin(2 * Math.PI * (fx * i + fy * j) / tamanho + f), 0);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = tamanho;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(tamanho, tamanho);
  for (let j = 0; j < tamanho; j++) {
    for (let i = 0; i < tamanho; i++) {
      const dx = altura(i + 1, j) - altura(i - 1, j);
      const dy = altura(i, j + 1) - altura(i, j - 1);
      const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize();
      img.data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (j * tamanho + i) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ------------------------------------------------------------------ terreno
function criarTerreno(scene, area) {
  const cx = (area.minX + area.maxX) / 2;
  const cz = (area.minZ + area.maxZ) / 2;
  const tamanho = 3800;
  const seg = LEVE ? 150 : 250;
  const geo = new THREE.PlaneGeometry(tamanho, tamanho, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    const h = alturaTerreno(x, z, area);
    pos.setXYZ(i, x, h > 0 || RELEVO.mar ? (foraDaArea(x, z, area) > 0 ? h : -0.03) : -0.03, z);
  }
  geo.computeVertexNormals();

  const cores = new Float32Array(pos.count * 3);
  const T = TEMA.cores;
  const grama = new THREE.Color(T.grama);
  const gramaSeca = new THREE.Color(T.gramaSeca);
  const mata = new THREE.Color(T.mata);
  const rocha = new THREE.Color(T.rocha);
  const rochaFria = new THREE.Color(T.rochaFria);
  const neve = new THREE.Color(T.neve);
  const areia = new THREE.Color(T.areia);
  const areiaMolhada = new THREE.Color(T.areiaMolhada);
  const neveDe = RELEVO.neveAcima;
  const c = new THREE.Color();
  const normal = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = Math.max(0, pos.getY(i));
    const inclinacao = 1 - normal.getY(i);
    c.copy(grama).lerp(gramaSeca, suave(0.45, 0.8, fbm(x * 0.012, z * 0.012, 3)));
    c.lerp(mata, suave(18, 90, h) * 0.85);
    c.lerp(rocha, Math.max(suave(0.28, 0.55, inclinacao), suave(170, 300, h)));
    c.lerp(rochaFria, suave(260, 420, h) * 0.5);
    c.lerp(neve, suave(neveDe, neveDe + 80, h + fbm(x * 0.01, z * 0.01, 3) * 70) * (1 - suave(0.45, 0.7, inclinacao)));
    if (RELEVO.mar && foraDaArea(x, z, area) > 0) {
      const y = pos.getY(i);
      if (y < 2.2) c.copy(areiaMolhada).lerp(areia, suave(NIVEL_MAR - 0.4, 1.4, y));
    }
    cores.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));

  // a foto do chão (grama ou neve, em cinza: a cor é a do vértice, do tema) e o relevo dela, a cada
  // 5 m. Nas texturas simples, um grão cinza a cada 6 m, sem relevo.
  const fotoGrama = DETALHE ? texturaFoto(CHAO_DO_TEMA) : texturaGrao(128, 0.92, 0.16, 5);
  fotoGrama.repeat.set(tamanho / (DETALHE ? 5 : 6), tamanho / (DETALHE ? 5 : 6));
  const relevo = relevoFoto(CHAO_DO_TEMA);
  relevo?.repeat.copy(fotoGrama.repeat);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: fotoGrama, normalMap: relevo, normalScale: new THREE.Vector2(0.7, 0.7), flatShading: true });
  const matLonge = soSol(mat.clone());
  // Duas malhas: os triângulos até 80 m da cerca (pelo centro), onde luz pontual ainda chega, e o
  // resto com o shader só de sol. Os mesmos atributos nas duas (sobem uma vez para a placa de
  // vídeo), cada uma com o seu índice.
  const indice = geo.index.array;
  const perto = [];
  const longe = [];
  for (let i = 0; i < indice.length; i += 3) {
    const v1 = indice[i];
    const v2 = indice[i + 1];
    const v3 = indice[i + 2];
    const x = (pos.getX(v1) + pos.getX(v2) + pos.getX(v3)) / 3;
    const z = (pos.getZ(v1) + pos.getZ(v2) + pos.getZ(v3)) / 3;
    (foraDaArea(x, z, area) <= 80 ? perto : longe).push(v1, v2, v3);
  }
  for (const [triangulos, m] of [[perto, mat], [longe, matLonge]]) {
    const parte = new THREE.BufferGeometry();
    for (const nome in geo.attributes) parte.setAttribute(nome, geo.attributes[nome]);
    parte.setIndex(triangulos);
    const terreno = new THREE.Mesh(parte, m);
    terreno.receiveShadow = true;
    scene.add(terreno);
  }
}

// ------------------------------------------------------------------ árvores e afins
// Pedra: uma bola facetada amassada com ruído (cada face pega a luz de um jeito), com a foto da
// rocha como detalhe e o relevo dela
function geoPedra(cor) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 0.78 + ruido(x * 1.7 + 3, z * 1.7 + y * 1.3) * 0.42;
    pos.setXYZ(i, x * k, y * k * (y < 0 ? 0.6 : 1), z * k);
  }
  g.computeVertexNormals();
  return pintarComUv(g, cor);
}
let matPedra = null;
function materialPedra() {
  if (matPedra) return matPedra;
  const mapa = texturaFoto('rocha');
  mapa.repeat.setScalar(2);
  const relevo = relevoFoto('rocha');
  relevo.repeat.setScalar(2);
  matPedra = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: mapa, normalMap: relevo });
  return matPedra;
}

// o borrão da sombra de contato: escuro no meio, sumindo até a borda
function criarBorroes(scene, itens) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(0.45, 'rgba(0,0,0,0.6)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.42, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const malha = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, itens.length);
  const m = new THREE.Matrix4();
  itens.forEach((a, i) => {
    const d = 5.5 * a.escala;
    m.makeScale(d, 1, d).setPosition(a.x, (a.y ?? 0) + 0.24, a.z);
    malha.setMatrixAt(i, m);
  });
  malha.computeBoundingSphere();
  malha.renderOrder = -1;
  scene.add(malha);
}

function pintarComUv(geo, cor) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(cor);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function pintar(geo, cor) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(cor);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

// Agrupa instâncias por pedaço do mapa: assim o three descarta (frustum culling) os pedaços
// fora da tela e fora da sombra, em vez de desenhar a floresta inteira todo quadro.
// A ordem dentro de cada pedaço é embaralhada: na qualidade baixa desenha só as primeiras N
// instâncias (InstancedMesh.count), e assim o que some é um ralear espalhado, não uma faixa.
const densas = []; // malhas que a qualidade pode ralear
function instanciar(scene, geo, mat, itens, { pedaco = PEDACO, sombra = true } = {}) {
  const grupos = new Map();
  for (const it of itens) {
    const k = `${Math.floor(it.x / pedaco)},${Math.floor(it.z / pedaco)}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(it);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const cor = new THREE.Color();
  const eixoY = new THREE.Vector3(0, 1, 0);
  const malhas = [];
  const sorteio = semente(itens.length);
  for (const lista of grupos.values()) {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(sorteio() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    // árvore com tronco sólido (dentro da área jogável) vem primeiro e nunca some: sumir com
    // ela deixaria uma parede invisível no lugar
    lista.sort((a, b) => (b.fixa ? 1 : 0) - (a.fixa ? 1 : 0));
    const malha = new THREE.InstancedMesh(geo, mat, lista.length);
    lista.forEach((it, i) => {
      q.setFromAxisAngle(eixoY, it.rot);
      s.set(it.escala * (it.sx ?? 1), it.escala * (it.sy ?? 1), it.escala * (it.sz ?? 1));
      p.set(it.x, it.y, it.z);
      m.compose(p, q, s);
      malha.setMatrixAt(i, m);
      malha.setColorAt(i, cor.setHSL(it.matiz ?? 0, it.sat ?? 0, it.luz ?? 1));
    });
    malha.instanceMatrix.needsUpdate = true;
    if (malha.instanceColor) malha.instanceColor.needsUpdate = true;
    malha.computeBoundingSphere();
    malha.castShadow = sombra;
    malha.receiveShadow = true;
    malha.userData.total = lista.length;
    malha.userData.fixas = lista.filter((it) => it.fixa).length;
    malha.userData.sombra = sombra;
    scene.add(malha);
    malhas.push(malha);
    densas.push(malha);
  }
  return malhas;
}

// ------------------------------------------------------------------ o mar (praia)
// Um plano grande no nível do mar, com o reflexo do céu e ondinhas que andam; o relevo desce até ele
function criarMar(scene, renderer, ceuMat, area, decorar) {
  const cenaCeu = new THREE.Scene();
  cenaCeu.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), ceuMat.clone()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(cenaCeu, 0.02, 0.1, 200).texture;
  pmrem.dispose();
  const normalMap = texturaAgua();
  normalMap.repeat.set(220, 220);
  const mar = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
    soSol(new THREE.MeshStandardMaterial({
      color: '#0a6f93', roughness: 0.06, metalness: 0.05, envMap: env, envMapIntensity: 1.15,
      normalMap, normalScale: new THREE.Vector2(0.5, 0.5),
    })),
  );
  mar.position.set((area.minX + area.maxX) / 2, NIVEL_MAR, (area.minZ + area.maxZ) / 2);
  mar.receiveShadow = true;
  scene.add(mar);
  decorar.push((t) => normalMap.offset.set(t * 0.004, t * 0.0025));
}

// ------------------------------------------------------------------ lagos
// textura do gelo: branco azulado com rachaduras finas e manchas mais claras
function texturaGelo() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#d8ecfb';
  ctx.fillRect(0, 0, 512, 512);
  const rnd = semente(41);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${(0.15 + rnd() * 0.3).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 70, 8 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,160,200,0.55)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    let x = rnd() * 512;
    let y = rnd() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 90;
      y += (rnd() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// as cores de cada tipo de água: a água, o fundo da margem e quanto a margem passa da água
const TIPOS_AGUA = {
  lago: { cor: '#1f5a82', margem: '#9a8c6c', borda: 1.12 },
  lagoa: { cor: '#14b8c4', margem: '#ecd9a5', borda: 1.35 },
  gelo: { cor: '#8fc3ea', margem: '#ffffff', borda: 1.18 },
  carpas: { cor: '#1d6b6e', margem: '#7d7468', borda: 1.1 },
};

function criarLago(scene, renderer, ceuMat, x, z, raio, decorar, tipo = 'lago') {
  const T = TIPOS_AGUA[tipo] || TIPOS_AGUA.lago;
  // reflexo do céu: o céu renderizado num mapa de ambiente que só a água usa (pôr no
  // scene.environment mudaria a luz do cinema também). A cena do céu fica guardada: o mapa é
  // feito na placa de vídeo e some se o contexto do WebGL se perder (ver refazer). Com uma cópia
  // do material, o reflexo refeito é o mesmo de antes, e não o céu que o clima pintou depois.
  const cenaCeu = new THREE.Scene();
  cenaCeu.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), ceuMat.clone()));
  const gerarAmbiente = () => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const textura = pmrem.fromScene(cenaCeu, 0.02, 0.1, 200).texture;
    pmrem.dispose();
    return textura;
  };

  const forma = new THREE.Shape();
  const pontos = 48;
  for (let i = 0; i <= pontos; i++) {
    const a = (i / pontos) * Math.PI * 2;
    const r = raio * (0.82 + 0.3 * fbm(Math.cos(a) * 1.6 + 11, Math.sin(a) * 1.6 + 4, 3));
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    if (i === 0) forma.moveTo(px, pz); else forma.lineTo(px, pz);
  }
  const normalMap = texturaAgua();
  normalMap.repeat.set(raio / 7, raio / 7);
  // o gelo: liso e claro, com as rachaduras (sem ondas); a água das outras com ondinhas que andam
  const gelo = tipo === 'gelo';
  const mapaGelo = gelo ? texturaGelo() : null;
  if (mapaGelo) mapaGelo.repeat.set(raio / 18, raio / 18);
  // a ShapeGeometry tem uv = posição: a textura repete a cada 1 m sem isto
  const geoAgua = new THREE.ShapeGeometry(forma, 6);
  const uvs = geoAgua.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) / raio, uvs.getY(i) / raio);
  const agua = new THREE.Mesh(
    geoAgua,
    new THREE.MeshStandardMaterial({
      color: T.cor, roughness: gelo ? 0.08 : 0.05, metalness: gelo ? 0.12 : 0.04, envMap: gerarAmbiente(), envMapIntensity: gelo ? 0.9 : 0.85,
      map: mapaGelo, normalMap: gelo ? null : normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
      transparent: tipo === 'lagoa', opacity: tipo === 'lagoa' ? 0.88 : 1,
    }),
  );
  agua.rotation.x = -Math.PI / 2; // ShapeGeometry nasce de pé, no plano XY
  agua.position.set(x, 0.035, z);
  agua.receiveShadow = true;
  scene.add(agua);

  // a margem: a foto da areia (uv da ShapeGeometry em metros: uma repetição a cada 4 m), ou o grão
  // nas texturas simples
  const areia = DETALHE ? texturaFoto('areia') : texturaGrao(64, 0.9, 0.2, 9);
  if (DETALHE) areia.repeat.setScalar(1 / 4);
  const relevoAreia = relevoFoto('areia');
  relevoAreia?.repeat.copy(areia.repeat);
  const margem = new THREE.Mesh(
    new THREE.ShapeGeometry(forma, 6),
    new THREE.MeshLambertMaterial({ color: T.margem, map: areia, normalMap: relevoAreia }),
  );
  margem.rotation.x = -Math.PI / 2;
  margem.scale.set(T.borda, T.borda, 1);
  // a lagoa é rasa: o fundo de areia aparece pela água (um disco claro embaixo dela)
  if (tipo === 'lagoa') {
    const fundo = new THREE.Mesh(new THREE.ShapeGeometry(forma, 6), new THREE.MeshLambertMaterial({ color: '#7fd6cf' }));
    fundo.rotation.x = -Math.PI / 2;
    fundo.scale.set(0.97, 0.97, 1);
    fundo.position.set(x, 0.025, z);
    scene.add(fundo);
  }
  if (tipo === 'carpas') criarCarpas(scene, x, z, raio, decorar);
  margem.position.set(x, 0.02, z);
  margem.receiveShadow = true;
  scene.add(margem);

  decorar.push((t) => {
    normalMap.offset.set(t * 0.012, t * 0.007);
  });
  return {
    x, z, raio: raio * 1.2, tipo, raioAgua: raio * 0.8,
    // contexto do WebGL restaurado: o mapa antigo era do contexto perdido (nada de dispose nele)
    refazer: () => { agua.material.envMap = gerarAmbiente(); },
  };
}

// As carpas: peixes laranja, brancos e vermelhos nadando em volta do lago, e vitórias-régias
function criarCarpas(scene, x, z, raio, decorar) {
  const rnd = semente(88);
  const corpo = new THREE.SphereGeometry(0.32, 8, 6).scale(1, 0.45, 2.4);
  const rabo = new THREE.ConeGeometry(0.28, 0.6, 4).rotateX(-Math.PI / 2).scale(1, 0.3, 1).translate(0, 0, -0.95);
  const peixe = mergeGeometries([corpo, rabo]);
  const qtd = 18;
  const malha = new THREE.InstancedMesh(peixe, new THREE.MeshLambertMaterial({ color: '#ffffff' }), qtd);
  const cores = ['#f97316', '#f8fafc', '#ef4444', '#fb923c', '#fde68a'];
  const cor = new THREE.Color();
  const peixes = [];
  for (let i = 0; i < qtd; i++) {
    malha.setColorAt(i, cor.set(cores[i % cores.length]));
    peixes.push({ r: raio * (0.2 + rnd() * 0.55), fase: rnd() * Math.PI * 2, vel: (0.12 + rnd() * 0.12) * (rnd() < 0.5 ? 1 : -1), onda: rnd() * 6 });
  }
  malha.frustumCulled = false;
  scene.add(malha);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const eixo = new THREE.Vector3(0, 1, 0);
  decorar.push((t) => {
    peixes.forEach((f, i) => {
      const a = f.fase + t * f.vel;
      const r = f.r + Math.sin(t * 0.3 + f.onda) * 2;
      p.set(x + Math.cos(a) * r, -0.05, z + Math.sin(a) * r);
      // de frente para onde nada (a tangente do círculo) e balançando o rabo
      q.setFromAxisAngle(eixo, -a + (f.vel > 0 ? 0 : Math.PI) + Math.sin(t * 6 + f.onda) * 0.15);
      malha.setMatrixAt(i, m.compose(p, q, s));
    });
    malha.instanceMatrix.needsUpdate = true;
  });
  // vitórias-régias: discos verdes com um corte, algumas com flor rosa
  const folhas = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = raio * (0.3 + rnd() * 0.6);
    const rr = 0.5 + rnd() * 0.7;
    folhas.push(pintarTema(new THREE.CircleGeometry(rr, 10, 0.3, Math.PI * 2 - 0.3).rotateX(-Math.PI / 2).rotateY(rnd() * 6).translate(x + Math.cos(a) * r, 0.06, z + Math.sin(a) * r), '#3f8f3a'));
    if (i % 4 === 0) folhas.push(pintarTema(new THREE.IcosahedronGeometry(0.22, 0).translate(x + Math.cos(a) * r, 0.18, z + Math.sin(a) * r), '#f9a8d4'));
  }
  const regias = new THREE.Mesh(mergeGeometries(folhas), new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(regias);
}

// ------------------------------------------------------------------ nuvens e pássaros
let nuvensMat = null; // o clima (clima.js) pinta as nuvens com a cor do meio-dia
function criarNuvens(scene, centro, decorar) {
  const rnd = semente(31);
  // lá no alto nenhuma luz pontual chega: shader só de sol
  const mat = soSol(new THREE.MeshLambertMaterial({ color: TEMA.nuvens, emissive: '#8a96a8', emissiveIntensity: 0.55, flatShading: true }));
  const nuvens = [];
  const qtd = LEVE ? 9 : 16;
  for (let n = 0; n < qtd; n++) {
    const partes = [];
    const bolhas = 5 + Math.floor(rnd() * 4);
    for (let b = 0; b < bolhas; b++) {
      const r = 18 + rnd() * 22;
      partes.push(new THREE.IcosahedronGeometry(r, 1)
        .scale(1, 0.55, 1)
        .translate((b - bolhas / 2) * 22 + rnd() * 10, rnd() * 8, (rnd() - 0.5) * 30));
    }
    const nuvem = new THREE.Mesh(mergeGeometries(partes), mat);
    const a = rnd() * Math.PI * 2;
    const dist = 300 + rnd() * 900;
    nuvem.position.set(centro.x + Math.cos(a) * dist, 230 + rnd() * 140, centro.z + Math.sin(a) * dist);
    nuvem.rotation.y = rnd() * Math.PI;
    scene.add(nuvem);
    nuvens.push({ nuvem, vel: 1.5 + rnd() * 2.5 });
  }
  nuvensMat = mat;
  decorar.push((t, dt) => {
    for (const n of nuvens) {
      n.nuvem.position.x += n.vel * dt;
      if (n.nuvem.position.x > centro.x + 1300) n.nuvem.position.x = centro.x - 1300;
    }
  });
}

function criarPassaros(scene, bandos, decorar) {
  const mat = new THREE.MeshBasicMaterial({ color: TEMA.passaros, side: THREE.DoubleSide });
  const asaGeo = new THREE.BufferGeometry();
  asaGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, 0, 0, -0.35, 1.6, 0, 0], 3));
  asaGeo.computeVertexNormals();
  const passaros = [];
  bandos.forEach((b, bi) => {
    const rnd = semente(500 + bi);
    for (let i = 0; i < b.qtd; i++) {
      passaros.push({ b, fase: rnd() * Math.PI * 2, raio: b.raio + (rnd() - 0.5) * 18, alt: b.y + (rnd() - 0.5) * 10, atraso: i * 0.05 });
    }
  });
  // As duas asas de todos os pássaros num desenho só. A direita é a esquerda com escala x −1 (o
  // material é de dois lados, então a face invertida não some). Sem recorte pela esfera: ela é
  // calculada uma vez e ficaria parada onde o bando estava.
  const asas = new THREE.InstancedMesh(asaGeo, mat, passaros.length * 2);
  asas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  asas.frustumCulled = false;
  scene.add(asas);
  const corpo = new THREE.Matrix4();
  const asa = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const tamanho = new THREE.Vector3(1.6, 1.6, 1.6);
  const espelho = new THREE.Vector3(-1, 1, 1);
  const eixoY = new THREE.Vector3(0, 1, 0);
  const voar = (t) => {
    passaros.forEach((ps, i) => {
      const a = t * ps.b.vel + ps.fase * 0.15 - ps.atraso;
      p.set(ps.b.x + Math.cos(a) * ps.raio, ps.alt + Math.sin(t * 0.7 + ps.fase) * 3, ps.b.z + Math.sin(a) * ps.raio);
      q.setFromAxisAngle(eixoY, -a); // tangente do círculo
      corpo.compose(p, q, tamanho);
      const bate = Math.sin(t * 9 + ps.fase) * 0.6;
      asas.setMatrixAt(i * 2, asa.makeRotationZ(bate).premultiply(corpo));
      asas.setMatrixAt(i * 2 + 1, asa.makeRotationZ(-bate).scale(espelho).premultiply(corpo));
    });
    asas.instanceMatrix.needsUpdate = true;
  };
  voar(0); // nada de asas empilhadas na origem antes do primeiro quadro
  decorar.push(voar);
}

// ------------------------------------------------------------------ cerca da área jogável
function criarCerca(scene, area, sala) {
  const madeira = new THREE.MeshLambertMaterial({ color: TEMA.cerca });
  const lados = [
    { a: [area.minX, area.maxZ], b: [area.maxX, area.maxZ] },
    { a: [area.maxX, area.minZ], b: [area.maxX, area.maxZ] },
    { a: [sala.maxX + 2, area.minZ], b: [area.maxX, area.minZ] },
    { a: [area.minX, sala.maxZ + 2], b: [area.minX, area.maxZ] },
  ];
  const postes = [];
  for (const { a, b } of lados) {
    const comp = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(comp / 5);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      postes.push({ x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u });
    }
    for (const y of [0.55, 1.15]) {
      const trilho = new THREE.Mesh(new THREE.BoxGeometry(comp, 0.14, 0.1), madeira);
      trilho.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
      trilho.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      trilho.castShadow = true;
      scene.add(trilho);
    }
  }
  const poste = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), madeira, postes.length);
  const m = new THREE.Matrix4();
  postes.forEach((p, i) => poste.setMatrixAt(i, m.makeTranslation(p.x, 0.75, p.z)));
  poste.castShadow = true;
  scene.add(poste);
}

// ------------------------------------------------------------------ folhas caindo (outono)
// Folhas vermelhas e laranja caindo e rodopiando numa caixa em volta da câmera (quando uma passa do
// chão, volta lá para cima). Só no lado de fora.
function criarFolhas(scene, decorar) {
  const qtd = LEVE ? 140 : 320;
  const geo = new THREE.PlaneGeometry(0.16, 0.11);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const malha = new THREE.InstancedMesh(geo, mat, qtd);
  malha.frustumCulled = false;
  const rnd = semente(19);
  const cor = new THREE.Color();
  const cores = ['#dc2626', '#ea580c', '#f59e0b', '#b91c1c', '#f9a8d4'];
  const folhas = [];
  const CAIXA = 46;
  for (let i = 0; i < qtd; i++) {
    malha.setColorAt(i, cor.set(cores[i % cores.length]));
    folhas.push({ x: (rnd() - 0.5) * CAIXA, y: rnd() * 18, z: (rnd() - 0.5) * CAIXA, vel: 0.6 + rnd() * 0.7, fase: rnd() * 6, giro: rnd() * 6 });
  }
  scene.add(malha);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  let cam = null;
  decorar.push((t, dt) => {
    if (!cam) return;
    folhas.forEach((f, i) => {
      f.y -= f.vel * dt;
      if (f.y < 0) f.y += 18;
      // a folha anda presa à câmera (ela pode ir longe), com um balanço de lado
      const x = Math.round((cam.x - f.x) / CAIXA) * CAIXA + f.x + Math.sin(t * 0.9 + f.fase) * 0.8;
      const z = Math.round((cam.z - f.z) / CAIXA) * CAIXA + f.z + Math.cos(t * 0.7 + f.fase) * 0.8;
      // perto demais da câmera a folha tapa a tela: pula para o outro lado da caixa
      const perto = Math.hypot(x - cam.x, f.y - cam.y, z - cam.z) < 4;
      p.set(perto ? x + CAIXA / 2 : x, f.y, z);
      q.setFromEuler(e.set(t * 1.7 + f.giro, t * 1.1 + f.fase, t * 0.6));
      malha.setMatrixAt(i, m.compose(p, q, s));
    });
    malha.instanceMatrix.needsUpdate = true;
  });
  return (c) => { cam = c; };
}

// ------------------------------------------------------------------ tudo junto
// opts.reservas: círculos { x, z, r } onde não nasce árvore (arquibancada, telão...)
// opts.estradas: listas de pontos [[x, z], ...] com largura, para deixar caminho livre
// opts.addBox: registra colisores (só os troncos dentro da área jogável)
// opts.agua: [{ x, z, r, tipo }] a água do mapa (lagoa, gelo, carpas); opts.bosques [{ x0, x1, z0, z1 }]
// limita a mata de dentro da cerca a esses retângulos (o resto é gramado limpo); opts.fileiras
// [{ x, z, tipo }] são as árvores das ruas, plantadas uma a uma.
export function criarNatureza(scene, renderer, {
  area, sala, reservas = [], estradas = [], addBox, grupo = scene, agua = [], bosques = null, fileiras = [],
}) {
  const decorar = [];
  const ceu = criarCeu(grupo, SOL);
  // névoa na cor do horizonte: a serra lá longe se dissolve no céu em vez de cortar seco
  scene.fog = new THREE.Fog(TEMA.nevoa.cor, TEMA.nevoa.perto, TEMA.nevoa.longe);
  if (RELEVO.mar) criarMar(grupo, renderer, ceu.mat, area, decorar);

  criarTerreno(grupo, area);
  criarCerca(grupo, area, sala);

  const meia = PISTA.largura / 2;
  const distPista = gradeDaPista(area);
  const naSala = (x, z, folga) => x < sala.maxX + folga && z < sala.maxZ + folga;
  const pertoDeEstrada = (x, z, folga) => estradas.some(({ pontos, largura }) => {
    for (let i = 0; i < pontos.length - 1; i++) {
      if (distSegmento(x, z, ...pontos[i], ...pontos[i + 1]) < largura / 2 + folga) return true;
    }
    return false;
  });
  const reservado = (x, z, folga) => reservas.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + folga);
  const dentro = (x, z) => x > area.minX && x < area.maxX && z > area.minZ && z < area.maxZ;

  // a água do mapa
  const lagos = agua.map((a) => criarLago(grupo, renderer, ceu.mat, a.x, a.z, a.r, decorar, a.tipo));
  const lago = lagos[0] || null;
  const noLago = (x, z, folga) => lagos.some((l) => Math.hypot(x - l.x, z - l.z) < l.raio + folga);

  // folgaPista: árvore grande fica longe (postes, placas e guard-rail até ~21 m do eixo);
  // pedra e flor podem chegar mais perto, mas nunca na área de escape
  const noBosque = (x, z) => !bosques || bosques.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  const podeDentro = (x, z, folgaPista = 26) => !naSala(x, z, 14)
    && distPista(x, z) > meia + folgaPista
    && !pertoDeEstrada(x, z, 4)
    && !reservado(x, z, 0)
    && !noLago(x, z, 3)
    && noBosque(x, z);

  // ---------------------------------------------------------- árvores do tema
  const tipos = Object.entries(TEMA.arvores);
  const sortearTipo = (r) => {
    let soma = 0;
    for (const [k, peso] of tipos) if (r < (soma += peso)) return k;
    return tipos[0][0];
  };
  const listas = Object.fromEntries(tipos.map(([k]) => [k, []]));
  const rnd = semente(2024);
  const arbustos = [];
  const pedras = [];
  const flores = [];
  const passo = LEVE ? 20 : 13;
  const alcance = LEVE ? 300 : 460;
  for (let x = area.minX - alcance; x < area.maxX + alcance; x += passo) {
    for (let z = area.minZ - alcance; z < area.maxZ + alcance; z += passo) {
      const px = x + (rnd() - 0.5) * passo * 0.9;
      const pz = z + (rnd() - 0.5) * passo * 0.9;
      const mancha = fbm(px * 0.009 + 3, pz * 0.009 - 8, 3);
      const dentroArea = dentro(px, pz);
      if (dentroArea) {
        // bosques espalhados pela área, com clareiras (só nos bosques do mapa)
        if (mancha < 0.5 || !podeDentro(px, pz)) continue;
      } else {
        const fora = foraDaArea(px, pz, area);
        if (fora < 3 || mancha < 0.4) continue;
        if (naSala(px, pz, 20)) continue; // atrás do cinema não tem o que ver
      }
      const y = dentroArea ? 0 : alturaTerreno(px, pz, area);
      if (y > 270) continue; // acima disso é pedra e neve
      if (!dentroArea && RELEVO.mar && y < 0.8) continue; // na água e na areia molhada não
      const r = rnd();
      // longe e no alto, o que cresce é o pinheiro (ou a árvore mais comum do tema)
      const tipo = !dentroArea && y > 60 && listas.pinheiroNeve ? 'pinheiroNeve' : sortearTipo(r);
      const item = { x: px, y: y - 0.2, z: pz, rot: rnd() * Math.PI * 2, escala: 0.75 + rnd() * 0.85, matiz: 0, sat: 0, luz: 0.82 + rnd() * 0.32 };
      listas[tipo].push(item);
      if (rnd() < 0.35) {
        arbustos.push({ x: px + (rnd() - 0.5) * 6, y: y - 0.3, z: pz + (rnd() - 0.5) * 6, rot: rnd() * 6, escala: 0.7 + rnd() * 0.8, luz: 0.8 + rnd() * 0.3 });
      }
    }
  }

  // árvores das ruas: do mesmo tamanho, em fileira
  for (const f of fileiras) {
    if (distPista(f.x, f.z) < meia + 20 || reservado(f.x, f.z, 0) || noLago(f.x, f.z, 3)) continue;
    const lista = listas[f.tipo] || (listas[f.tipo] = []);
    lista.push({ x: f.x, y: -0.2, z: f.z, rot: rnd() * Math.PI * 2, escala: 1.05 + rnd() * 0.12, matiz: 0, sat: 0, luz: 0.9 + rnd() * 0.12 });
  }

  // na lagoa: coqueiros na areia em volta
  for (const l of lagos) {
    if (l.tipo !== 'lagoa' || !listas.palmeira) continue;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rnd() * 0.2;
      const r = l.raio * (1.05 + rnd() * 0.12);
      const x = l.x + Math.cos(a) * r;
      const z = l.z + Math.sin(a) * r;
      if (!dentro(x, z) || pertoDeEstrada(x, z, 3) || reservado(x, z, 0) || distPista(x, z) < meia + 20) continue;
      listas[i % 3 ? 'palmeira' : 'palmeiraBaixa'].push({ x, y: -0.2, z, rot: rnd() * 6, escala: 0.85 + rnd() * 0.3, matiz: 0, sat: 0, luz: 0.95 });
    }
  }

  // pedras, flores e arbustos soltos pela grama
  for (let i = 0; i < (LEVE ? 900 : 2200); i++) {
    const px = area.minX + rnd() * (area.maxX - area.minX);
    const pz = area.minZ + rnd() * (area.maxZ - area.minZ);
    if (!podeDentro(px, pz, 15)) continue;
    const r = rnd();
    if (r < 0.12) pedras.push({ x: px, y: 0, z: pz, rot: rnd() * 6, escala: 0.5 + rnd() * 1.6, sx: 1 + rnd(), sy: 0.6 + rnd() * 0.5, luz: 0.75 + rnd() * 0.3 });
    else if (r < 0.3) arbustos.push({ x: px, y: -0.2, z: pz, rot: rnd() * 6, escala: 0.5 + rnd() * 0.7, luz: 0.8 + rnd() * 0.3 });
    else if (TEMA.flores.length) flores.push({ x: px, y: 0.25, z: pz, rot: 0, escala: 0.8 + rnd() * 0.6, matiz: TEMA.flores[Math.floor(rnd() * TEMA.flores.length)], sat: 0.75, luz: 0.62 });
  }
  // pedras em volta dos lagos (no gelo, montes de neve)
  for (const l of lagos) {
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r = l.raio * (0.95 + rnd() * 0.25);
      pedras.push({ x: l.x + Math.cos(a) * r, y: 0, z: l.z + Math.sin(a) * r, rot: rnd() * 6, escala: 0.6 + rnd() * 1.3, sx: 1.3, sy: 0.7, luz: 0.7 + rnd() * 0.3 });
    }
  }

  // dois lados: os cones e troncos não têm tampa embaixo, e quem olha de baixo veria através
  const matPlanta = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const todas = Object.values(listas).flat();
  for (const a of todas) a.fixa = dentro(a.x, a.z);
  // No PC, as árvores a mais de 60 m da cerca usam o shader só de sol. No celular ficam num
  // material só: lá o pixel é pouco, e o desenho a mais pesaria mais que o que ele poupa.
  const matPlantaLonge = LEVE ? null : soSol(matPlanta.clone());
  // Árvore com textura (coqueiro, copa de folhas, pinheiro): dois materiais, o sólido e o
  // recortado (temas3d.materiaisArvore), um par por tipo. A mais de 60 m da cerca vai a versão
  // simples dela (geo.userData.longe), no material de sempre: lá o recorte nem aparece e só pesaria.
  const matsArvore = {};
  const plantar = (geo, lista) => {
    const tipo = geo.userData.materiais;
    const simples = geo.userData.longe;
    if (!tipo || !simples) {
      const longe = (a) => !!matPlantaLonge && foraDaArea(a.x, a.z, area) > 60;
      instanciar(grupo, geo, matPlanta, lista.filter((a) => !longe(a)));
      if (matPlantaLonge) instanciar(grupo, geo, matPlantaLonge, lista.filter(longe));
      return;
    }
    const longe = (a) => foraDaArea(a.x, a.z, area) > 60;
    const perto = lista.filter((a) => !longe(a));
    if (perto.length) instanciar(grupo, geo, matsArvore[tipo] ||= materiaisArvore(tipo), perto);
    const distantes = lista.filter(longe);
    if (distantes.length) instanciar(grupo, simples, matPlantaLonge || matPlanta, distantes);
  };
  const geos = arvoresDoTema();
  for (const [tipo, lista] of Object.entries(listas)) {
    if (!lista.length) continue;
    plantar(geos[tipo] || geos[Object.keys(geos)[0]], lista);
  }
  // arbustos: a mesma nuvem de folhas das árvores (perto) ou a bola simples (longe). Nas texturas
  // simples, a bola em todo lugar, e a pedra é um dodecaedro liso no material das plantas.
  if (arbustos.length && !DETALHE) instanciar(grupo, geoArbustoSimples(TEMA.arbusto), matPlanta, arbustos, { sombra: false });
  if (arbustos.length && DETALHE) {
    const arbusto = geoArbusto(TEMA.arbusto);
    const longe = (a) => foraDaArea(a.x, a.z, area) > 60;
    const perto = arbustos.filter((a) => !longe(a));
    if (perto.length) instanciar(grupo, arbusto, matsArvore.folhuda ||= materiaisArvore('folhuda'), perto, { sombra: false });
    const distantes = arbustos.filter(longe);
    if (distantes.length) instanciar(grupo, arbusto.userData.longe, matPlantaLonge || matPlanta, distantes, { sombra: false });
  }
  if (pedras.length && DETALHE) instanciar(grupo, geoPedra(TEMA.pedra), materialPedra(), pedras, { sombra: false });
  if (pedras.length && !DETALHE) instanciar(grupo, geoPedraSimples(TEMA.pedra), matPlanta, pedras, { sombra: false });
  if (flores.length) instanciar(grupo, new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), flores, { sombra: false });

  // sombra de contato sob as árvores da área jogável (e um pouco além): embaixo da copa a luz do
  // céu não chega. Um borrão escuro por árvore, todos num desenho só.
  const comBorrao = DETALHE ? todas.filter((a) => foraDaArea(a.x, a.z, area) < 30) : [];
  if (comBorrao.length) criarBorroes(grupo, comBorrao);

  // tronco das árvores dentro da área jogável é sólido (as de fora nem dá para alcançar)
  for (const a of todas) {
    if (!dentro(a.x, a.z)) continue;
    const r = 0.45 * a.escala;
    addBox({ min: [a.x - r, 0, a.z - r], max: [a.x + r, 3.5 * a.escala, a.z + r], data: { type: 'tree' } });
  }

  // ---------------------------------------------------------- céu vivo
  const centro = { x: (area.minX + area.maxX) / 2, z: (area.minZ + area.maxZ) / 2 };
  criarNuvens(grupo, centro, decorar);
  const bandos = [{ x: centro.x + 60, z: centro.z - 40, raio: 120, y: 70, vel: 0.11, qtd: 9 }];
  if (lago) bandos.push({ x: lago.x, z: lago.z, raio: 45, y: 34, vel: 0.2, qtd: 6 });
  criarPassaros(grupo, bandos, decorar);
  const seguirFolhas = TEMA.particulas === 'folhas' ? criarFolhas(grupo, decorar) : null;

  // A luz do céu em todo material (scene.environment, ver World.setQualidade): o céu renderizado
  // num mapa de ambiente, como o da água. Dá o reflexo do céu e a luz vinda de cima mais clara que a
  // de baixo, que a luz do hemisfério sozinha deixa chapada.
  // Embaixo do horizonte, a cor do chão do tema: a luz que sobe do gramado e da areia é quente, não
  // o azul do céu.
  const cenaAmbiente = new THREE.Scene();
  const matAmbiente = ceu.mat.clone();
  matAmbiente.uniforms.base.value.set(TEMA.hemi.chao).multiplyScalar(0.55);
  cenaAmbiente.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), matAmbiente));

  let anterior = null;
  return {
    lago,
    gerarAmbiente: () => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const textura = pmrem.fromScene(cenaAmbiente, 0.03, 0.1, 200).texture;
      pmrem.dispose();
      return textura;
    },
    lagos,
    // o lago congelado do mapa (patinar), se tiver
    gelo: lagos.find((l) => l.tipo === 'gelo') || null,
    // o clima (clima.js) acerta as cores do céu e das nuvens e esconde as estrelas (é sempre de dia)
    ceu: { mat: ceu.mat, estrelasMat: ceu.estrelasMat, estrelas: ceu.estrelas, get nuvensMat() { return nuvensMat; } },
    seguirCamera: (cam, t) => {
      ceu.seguir(cam, t);
      seguirFolhas?.(cam.position);
    },
    // contexto do WebGL restaurado (o World chama): o reflexo do lago se foi com o contexto perdido
    refazerAmbiente: () => { for (const l of lagos) l.refazer(); },
    // qualidade: fração de árvores/arbustos/pedras desenhadas, e se as árvores fazem sombra
    ajustar({ densidade = 1, sombras = true }) {
      for (const m of densas) {
        m.count = Math.max(1, m.userData.fixas, Math.ceil(m.userData.total * densidade));
        m.castShadow = sombras && m.userData.sombra;
      }
    },
    update(t) {
      const dt = anterior == null ? 0 : Math.min(0.1, t - anterior);
      anterior = t;
      // lado de fora escondido (dentro do cinema ou do prédio): água, nuvens e pássaros param
      if (!grupo.visible) return;
      for (const fn of decorar) fn(t, dt);
    },
  };
}
