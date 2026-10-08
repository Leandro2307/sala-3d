// Natureza em volta do autódromo: céu de fim de tarde, serra no horizonte, floresta, lago,
// flores, nuvens e pássaros. Nada disso aparece dentro da sala do cinema (paredes e teto tampam).
//
// Tudo é sorteado com semente fixa: cada jogador monta o mesmo mundo, com as mesmas árvores
// nos mesmos lugares, sem precisar mandar nada pela rede.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isTouch } from './touch.js';
import { CAMINHO, PISTA } from './pista.js';

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

export function alturaTerreno(x, z, area) {
  const d = foraDaArea(x, z, area);
  if (d <= 0) return 0;
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
      topo: { value: new THREE.Color('#122152') },
      meio: { value: new THREE.Color('#3d5596') },
      horizonte: { value: new THREE.Color('#f0956c') },
      base: { value: new THREE.Color('#4d4f7e') },
      brilho: { value: new THREE.Color('#ffb06a') },
      solDir: { value: solDir.clone() },
      disco: { value: new THREE.Color(1.6, 1.38, 1.06) }, // sol (ou lua, de noite); preto = encoberto
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
        // halo do pôr do sol perto do horizonte e o disco do sol
        c += brilho * pow(s, 7.0) * (1.0 - smoothstep(0.0, 0.5, h)) * 0.6;
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
    pos.setXYZ(i, x, h > 0 ? h : -0.03, z);
  }
  geo.computeVertexNormals();

  const cores = new Float32Array(pos.count * 3);
  const grama = new THREE.Color('#4f7f3c');
  const gramaSeca = new THREE.Color('#878c46');
  const mata = new THREE.Color('#2f5a33');
  const rocha = new THREE.Color('#77706a');
  const rochaFria = new THREE.Color('#5c5a73');
  const neve = new THREE.Color('#eef2f8');
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
    c.lerp(neve, suave(360, 440, h + fbm(x * 0.01, z * 0.01, 3) * 70) * (1 - suave(0.45, 0.7, inclinacao)));
    cores.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));

  const grao = texturaGrao(128, 0.92, 0.16, 5);
  grao.repeat.set(tamanho / 6, tamanho / 6);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grao, flatShading: true });
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
function pintar(geo, cor) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(cor);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function geoPinheiro() {
  const partes = [
    pintar(new THREE.CylinderGeometry(0.32, 0.48, 3.2, 6, 1, true).translate(0, 1.6, 0), '#5b3d2a'),
    pintar(new THREE.ConeGeometry(2.7, 4.4, 7, 1, true).translate(0, 4.6, 0), '#2e6a41'),
    pintar(new THREE.ConeGeometry(2.1, 3.8, 7, 1, true).translate(0, 6.7, 0), '#357a48'),
    pintar(new THREE.ConeGeometry(1.35, 3.2, 7, 1, true).translate(0, 8.6, 0), '#3d8a51'),
  ];
  return mergeGeometries(partes);
}

function geoFrondosa() {
  const copa1 = new THREE.IcosahedronGeometry(2.7, 0).scale(1, 0.85, 1).translate(0, 5.6, 0);
  const copa2 = new THREE.IcosahedronGeometry(1.9, 0).translate(1.4, 6.6, 0.6);
  const copa3 = new THREE.IcosahedronGeometry(1.7, 0).translate(-1.3, 6.2, -0.8);
  return mergeGeometries([
    pintar(new THREE.CylinderGeometry(0.3, 0.45, 4.4, 6, 1, true).translate(0, 2.2, 0), '#6a4a33'),
    pintar(copa1, '#5c8f3e'),
    pintar(copa2, '#68a046'),
    pintar(copa3, '#4f8238'),
  ]);
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

// ------------------------------------------------------------------ lago
function criarLago(scene, renderer, ceuMat, x, z, raio, decorar) {
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
  const agua = new THREE.Mesh(
    new THREE.ShapeGeometry(forma, 6),
    new THREE.MeshStandardMaterial({
      // reflexo moderado: forte demais, de perto do chão ela espelha o horizonte laranja e
      // fica com cara de areia
      color: '#1f5a82', roughness: 0.1, metalness: 0.1, envMap: gerarAmbiente(), envMapIntensity: 0.55,
      normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
    }),
  );
  agua.rotation.x = -Math.PI / 2; // ShapeGeometry nasce de pé, no plano XY
  agua.position.set(x, 0.035, z);
  agua.receiveShadow = true;
  scene.add(agua);

  const margem = new THREE.Mesh(
    new THREE.ShapeGeometry(forma, 6),
    new THREE.MeshLambertMaterial({ color: '#9a8c6c', map: texturaGrao(64, 0.9, 0.2, 9) }),
  );
  margem.rotation.x = -Math.PI / 2;
  margem.scale.set(1.12, 1.12, 1);
  margem.position.set(x, 0.02, z);
  margem.receiveShadow = true;
  scene.add(margem);

  decorar.push((t) => {
    normalMap.offset.set(t * 0.012, t * 0.007);
  });
  return {
    x, z, raio: raio * 1.2,
    // contexto do WebGL restaurado: o mapa antigo era do contexto perdido (nada de dispose nele)
    refazer: () => { agua.material.envMap = gerarAmbiente(); },
  };
}

// ------------------------------------------------------------------ nuvens e pássaros
let nuvensMat = null; // o clima (clima.js) escurece as nuvens na chuva e de noite
function criarNuvens(scene, centro, decorar) {
  const rnd = semente(31);
  // lá no alto nenhuma luz pontual chega: shader só de sol
  const mat = soSol(new THREE.MeshLambertMaterial({ color: '#f4dfe3', emissive: '#4a3550', emissiveIntensity: 0.55, flatShading: true }));
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
  const mat = new THREE.MeshBasicMaterial({ color: '#1b1726', side: THREE.DoubleSide });
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
  const madeira = new THREE.MeshLambertMaterial({ color: '#6b4e36' });
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

// ------------------------------------------------------------------ tudo junto
// opts.reservas: círculos { x, z, r } onde não nasce árvore (arquibancada, telão...)
// opts.estradas: listas de pontos [[x, z], ...] com largura, para deixar caminho livre
// opts.colliders: função para registrar colisores (só os troncos dentro da área jogável)
// Mundo novo (cidade.js): opts.lago { x, z, r } põe o lago no lugar em vez de procurar o maior que
// cabe; opts.bosques [{ x0, x1, z0, z1 }] limita a mata de dentro da cerca a esses retângulos (o resto
// é gramado limpo); opts.fileiras [{ x, z }] são as árvores das avenidas, plantadas uma a uma.
export function criarNatureza(scene, renderer, {
  area, sala, reservas = [], estradas = [], addBox, grupo = scene, lago: lagoFixo = null, bosques = null, fileiras = [],
}) {
  const decorar = [];
  const ceu = criarCeu(grupo, SOL);
  // névoa na cor do horizonte: a serra lá longe se dissolve no céu em vez de cortar seco
  scene.fog = new THREE.Fog(0x6d6489, 320, 2100);

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

  // lago: o maior que couber na área sem encostar na pista, na sala, na estrada, nas
  // reservas e na cerca (o contorno chega a 1,12x o raio, mais a margem de areia)
  let melhor = lagoFixo ? { ...lagoFixo } : null;
  const ate = (d) => (d - 12) / 1.3; // maior raio que ainda deixa d metros de folga
  for (let x = area.minX + 30; !lagoFixo && x < area.maxX - 30; x += 8) {
    for (let z = area.minZ + 30; z < area.maxZ - 30; z += 8) {
      let r = Math.min(58, (distPista(x, z) - meia - 30) * 0.75);
      const dSala = Math.hypot(Math.max(0, x - sala.maxX), Math.max(0, z - sala.maxZ));
      r = Math.min(r, ate(dSala), ate(x - area.minX), ate(area.maxX - x), ate(z - area.minZ), ate(area.maxZ - z));
      for (const res of reservas) r = Math.min(r, ate(Math.hypot(x - res.x, z - res.z) - res.r));
      for (const { pontos, largura } of estradas) {
        for (let i = 0; i < pontos.length - 1; i++) r = Math.min(r, ate(distSegmento(x, z, ...pontos[i], ...pontos[i + 1]) - largura / 2));
      }
      if (!melhor || r > melhor.r) melhor = { x, z, r };
    }
  }
  let lago = null;
  if (melhor && melhor.r > 20) lago = criarLago(grupo, renderer, ceu.mat, melhor.x, melhor.z, melhor.r, decorar);
  const noLago = (x, z, folga) => lago && Math.hypot(x - lago.x, z - lago.z) < lago.raio + folga;

  // folgaPista: árvore grande fica longe (postes, placas e guard-rail até ~21 m do eixo);
  // pedra e flor podem chegar mais perto, mas nunca na área de escape
  const noBosque = (x, z) => !bosques || bosques.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  const podeDentro = (x, z, folgaPista = 26) => !naSala(x, z, 14)
    && distPista(x, z) > meia + folgaPista
    && !pertoDeEstrada(x, z, 4)
    && !reservado(x, z, 0)
    && !noLago(x, z, 3)
    && noBosque(x, z);

  // ---------------------------------------------------------- árvores
  const rnd = semente(2024);
  const pinheiros = [];
  const frondosas = [];
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
        // bosques espalhados pela área, com clareiras (no mundo novo, só nos bosques: mais cheios)
        if (mancha < (bosques ? 0.5 : 0.56) || !podeDentro(px, pz)) continue;
      } else {
        const fora = foraDaArea(px, pz, area);
        if (fora < 3 || mancha < 0.4) continue;
        if (naSala(px, pz, 20)) continue; // atrás do cinema não tem o que ver
      }
      const y = dentroArea ? 0 : alturaTerreno(px, pz, area);
      if (y > 270) continue; // acima disso é pedra e neve
      const item = {
        x: px, y: y - 0.2, z: pz, rot: rnd() * Math.PI * 2, escala: 0.75 + rnd() * 0.85,
        matiz: 0.0, sat: 0, luz: 0.82 + rnd() * 0.32,
      };
      if (y > 60 || rnd() < 0.55) pinheiros.push(item);
      else {
        // algumas frondosas já amarelando: dá cor ao bosque no fim de tarde
        if (rnd() < 0.18) Object.assign(item, { matiz: 0.11, sat: 0.55, luz: 0.62 });
        frondosas.push(item);
      }
      if (rnd() < 0.35) {
        arbustos.push({ x: px + (rnd() - 0.5) * 6, y: y - 0.3, z: pz + (rnd() - 0.5) * 6, rot: rnd() * 6, escala: 0.7 + rnd() * 0.8, luz: 0.8 + rnd() * 0.3 });
      }
    }
  }

  // árvores das avenidas (mundo novo): frondosas do mesmo tamanho, em fileira
  for (const f of fileiras) {
    if (distPista(f.x, f.z) < meia + 20 || reservado(f.x, f.z, 0) || noLago(f.x, f.z, 3)) continue;
    frondosas.push({ x: f.x, y: -0.2, z: f.z, rot: rnd() * Math.PI * 2, escala: 1.05 + rnd() * 0.12, matiz: 0, sat: 0, luz: 0.9 + rnd() * 0.12 });
  }

  // pedras, flores e arbustos soltos pela grama
  for (let i = 0; i < (LEVE ? 900 : 2200); i++) {
    const px = area.minX + rnd() * (area.maxX - area.minX);
    const pz = area.minZ + rnd() * (area.maxZ - area.minZ);
    if (!podeDentro(px, pz, 15)) continue;
    const r = rnd();
    if (r < 0.12) pedras.push({ x: px, y: 0, z: pz, rot: rnd() * 6, escala: 0.5 + rnd() * 1.6, sx: 1 + rnd(), sy: 0.6 + rnd() * 0.5, luz: 0.75 + rnd() * 0.3 });
    else if (r < 0.3) arbustos.push({ x: px, y: -0.2, z: pz, rot: rnd() * 6, escala: 0.5 + rnd() * 0.7, luz: 0.8 + rnd() * 0.3 });
    else flores.push({ x: px, y: 0.25, z: pz, rot: 0, escala: 0.8 + rnd() * 0.6, matiz: [0.13, 0.95, 0.83, 0.0, 0.75][Math.floor(rnd() * 5)], sat: 0.75, luz: 0.62 });
  }
  // pedras e juncos em volta do lago
  if (lago) {
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r = lago.raio * (0.95 + rnd() * 0.25);
      pedras.push({ x: lago.x + Math.cos(a) * r, y: 0, z: lago.z + Math.sin(a) * r, rot: rnd() * 6, escala: 0.6 + rnd() * 1.3, sx: 1.3, sy: 0.7, luz: 0.7 + rnd() * 0.3 });
    }
  }

  // dois lados: os cones e troncos não têm tampa embaixo, e quem olha de baixo veria através
  const matPlanta = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  for (const a of [...pinheiros, ...frondosas]) a.fixa = dentro(a.x, a.z);
  // No PC, as árvores a mais de 60 m da cerca usam o shader só de sol. No celular ficam num
  // material só: lá o pixel é pouco, e o desenho a mais pesaria mais que o que ele poupa.
  const matPlantaLonge = LEVE ? null : soSol(matPlanta.clone());
  const plantar = (geo, lista) => {
    const longe = (a) => !!matPlantaLonge && foraDaArea(a.x, a.z, area) > 60;
    instanciar(grupo, geo, matPlanta, lista.filter((a) => !longe(a)));
    if (matPlantaLonge) instanciar(grupo, geo, matPlantaLonge, lista.filter(longe));
  };
  plantar(geoPinheiro(), pinheiros);
  plantar(geoFrondosa(), frondosas);
  instanciar(grupo, pintar(new THREE.IcosahedronGeometry(1.1, 0).scale(1.3, 0.8, 1.3), '#4e7f39'), matPlanta, arbustos, { sombra: false });
  instanciar(grupo, pintar(new THREE.DodecahedronGeometry(1, 0), '#8a837c'), matPlanta, pedras, { sombra: false });
  instanciar(grupo, new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), flores, { sombra: false });

  // tronco das árvores dentro da área jogável é sólido (as de fora nem dá para alcançar)
  for (const a of [...pinheiros, ...frondosas]) {
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

  let anterior = null;
  return {
    lago,
    // o clima (clima.js) muda as cores do céu, as estrelas e as nuvens, e esconde as estrelas de dia
    ceu: { mat: ceu.mat, estrelasMat: ceu.estrelasMat, estrelas: ceu.estrelas, get nuvensMat() { return nuvensMat; } },
    seguirCamera: (cam, t) => ceu.seguir(cam, t),
    // contexto do WebGL restaurado (o World chama): o reflexo do lago se foi com o contexto perdido
    refazerAmbiente: () => lago?.refazer(),
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
