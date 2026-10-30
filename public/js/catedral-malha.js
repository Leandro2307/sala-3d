// A catedral bloco a bloco (public/models/catedral.bin, ver scripts/preparar-catedral.js) virando
// malha e colisão. Só números, sem three.js: o 3D (catedral.js) põe as listas na cena e os testes
// rodam no Node. Coordenadas em blocos (1 bloco = 1 m): x de 0 a L, y de 0 a A (0 é o chão), z de 0
// a C; a fachada das torres fica no z 0.
//
// Cada bloco do Minecraft vira uma forma (cubo cheio, degrau, laje, mureta, grade, vitral...) e um
// material (cantaria, pedra com musgo, telhado, madeira, vitral...). Os cubos cheios entram por
// fatias com as faces vizinhas fundidas (o "greedy meshing") e sombreado de canto (oclusão
// ambiente por vértice); o resto vira caixinhas, juntando as iguais que se encostam.

// materiais (o 3D tem uma textura para cada)
export const MAT = {
  cantaria: 0, musgo: 1, rachado: 2, cinzel: 3, pedregulho: 4, liso: 5, marmore: 6, telha: 7,
  madeira: 8, ferro: 9, ouro: 10, vitral: 11, tapete: 12, chama: 13, estante: 14, neve: 15, tapeteCinza: 16,
};
export const N_MATS = 17;

// ------------------------------------------------------------------ leitura
// bytes já sem o gzip
export function lerCatedral(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag !== 'CAT1') throw new Error('catedral.bin inválido');
  const L = dv.getUint16(4, true), A = dv.getUint16(6, true), C = dv.getUint16(8, true), n = dv.getUint16(10, true);
  const paleta = new Uint16Array(n);
  for (let i = 0; i < n; i++) paleta[i] = dv.getUint16(12 + i * 2, true);
  const grade = new Uint8Array(L * A * C);
  let o = 12 + n * 2;
  let i = 0;
  while (o < bytes.length && i < grade.length) {
    const v = bytes[o++];
    let qt = 0;
    for (let s = 0; ; s += 7) {
      const b = bytes[o++];
      qt |= (b & 127) << s;
      if (b < 128) break;
    }
    grade.fill(v, i, i + qt);
    i += qt;
  }
  return { L, A, C, paleta, grade };
}

// ------------------------------------------------------------------ o que é cada bloco
const CHEIO = 1, LAJE = 2, DEGRAU = 3, MURETA = 4, CERCA = 5, PAINEL = 6, ALCAPAO = 7, BOTAO = 8, TOCHA = 9,
  TAPETE = 10, BIGORNA = 11, PORTA = 12, ESCADA = 13, PORTAO = 14, CAIXA = 15, NADA = 0;

// [forma, material] de cada id (o dado escolhe a variante em alguns)
function tipo(id, d) {
  switch (id) {
    case 98: return [CHEIO, d === 1 ? MAT.musgo : d === 2 ? MAT.rachado : d === 3 ? MAT.cinzel : MAT.cantaria];
    case 48: return [CHEIO, MAT.musgo];
    case 4: return [CHEIO, MAT.pedregulho];
    case 1: case 43: case 33: case 29: return [CHEIO, MAT.liso];
    case 155: return [CHEIO, MAT.marmore];
    case 5: case 17: case 58: case 25: return [CHEIO, MAT.madeira];
    case 47: return [CHEIO, MAT.estante];
    case 41: return [CHEIO, MAT.ouro];
    case 42: return [CHEIO, MAT.ferro];
    case 89: return [CHEIO, MAT.chama];
    case 80: return [CHEIO, MAT.neve];
    case 20: return [CHEIO, MAT.vitral];
    case 44: return [LAJE, [MAT.liso, MAT.liso, MAT.madeira, MAT.pedregulho, MAT.telha, MAT.cantaria, MAT.telha, MAT.marmore][d & 7]];
    case 126: return [LAJE, MAT.madeira];
    case 67: return [DEGRAU, MAT.pedregulho];
    case 109: return [DEGRAU, MAT.cantaria];
    case 114: return [DEGRAU, MAT.telha];
    case 156: return [DEGRAU, MAT.marmore];
    case 53: case 134: case 135: case 136: case 163: case 164: return [DEGRAU, MAT.madeira];
    case 139: return [MURETA, d === 1 ? MAT.musgo : d === 6 ? MAT.cantaria : MAT.pedregulho];
    case 85: return [CERCA, MAT.madeira];
    case 113: return [CERCA, MAT.telha];
    case 102: return [PAINEL, MAT.vitral];
    case 101: return [PAINEL, MAT.ferro];
    case 96: return [ALCAPAO, MAT.madeira];
    case 77: return [BOTAO, MAT.liso];
    case 50: return [TOCHA, MAT.madeira];
    case 76: return [TOCHA, MAT.telha];
    case 171: return [TAPETE, d === 14 ? MAT.tapete : MAT.tapeteCinza];
    case 145: return [BIGORNA, MAT.ferro];
    case 64: return [PORTA, MAT.madeira];
    case 65: return [ESCADA, MAT.madeira];
    case 107: return [PORTAO, MAT.madeira];
    case 144: case 154: case 117: case 116: case 151: case 147: case 148: return [CAIXA, MAT.ferro];
    default: return [NADA, 0];
  }
}

// ------------------------------------------------------------------ montagem
// Devolve { L, A, C, lotes: [{ pos, nor, uv, cor, idx }] por material, colisoes: [[x0,y0,z0,x1,y1,z1, tipo]],
// tochas: [[x,y,z]], bancos: [[x0,y0,z0,x1,y1,z1]], bloqueia(x,y,z) para a câmera }
// tipo da colisão: 0 = sólido, 1 = banco (dá para sentar)
export function montarCatedral({ L, A, C, paleta, grade }, { texBlocos = 4 } = {}) {
  const nP = paleta.length;
  const pForma = new Uint8Array(nP), pMat = new Uint8Array(nP), pDado = new Uint8Array(nP), pId = new Uint16Array(nP);
  for (let i = 0; i < nP; i++) {
    const id = paleta[i] >> 4, d = paleta[i] & 15;
    const [f, m] = tipo(id, d);
    pForma[i] = f; pMat[i] = m; pDado[i] = d; pId[i] = id;
  }
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= L || y >= A || z >= C ? 0 : grade[x + L * (z + C * y)]);
  const forma = (x, y, z) => pForma[at(x, y, z)];
  // tapa a luz e esconde a face do vizinho: cubo cheio que não é vidro
  const opaco = (x, y, z) => { const p = at(x, y, z); return pForma[p] === CHEIO && pMat[p] !== MAT.vitral; };
  const cheio = (x, y, z) => pForma[at(x, y, z)] === CHEIO;

  // saídas por material
  const lotes = Array.from({ length: N_MATS }, () => ({ pos: [], nor: [], uv: [], cor: [], idx: [] }));
  const AO = [0.5, 0.68, 0.84, 1];
  const uvDe = (p, eixo) => (eixo === 0 ? [p[2], p[1]] : eixo === 1 ? [p[0], p[2]] : [p[0], p[1]]);
  // quadrilátero: origem o, lados du e dv, normal no eixo (sinal s), brilho de cada canto
  function quad(mat, o, du, dv, eixo, s, br = null, girar = false) {
    const lt = lotes[mat];
    const n = [0, 0, 0];
    n[eixo] = s;
    // du x dv tem de apontar para fora
    const cx = du[1] * dv[2] - du[2] * dv[1], cy = du[2] * dv[0] - du[0] * dv[2], cz = du[0] * dv[1] - du[1] * dv[0];
    let a = du, b = dv, brs = br;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) {
      a = dv; b = du;
      if (br) brs = [br[0], br[3], br[2], br[1]];
    }
    const base = lt.pos.length / 3;
    const vs = [o, [o[0] + a[0], o[1] + a[1], o[2] + a[2]], [o[0] + a[0] + b[0], o[1] + a[1] + b[1], o[2] + a[2] + b[2]], [o[0] + b[0], o[1] + b[1], o[2] + b[2]]];
    for (let i = 0; i < 4; i++) {
      const p = vs[i];
      lt.pos.push(p[0], p[1], p[2]);
      lt.nor.push(n[0], n[1], n[2]);
      const [u, v] = uvDe(p, eixo);
      lt.uv.push(u / texBlocos, v / texBlocos);
      const c = brs ? brs[i] : 1;
      lt.cor.push(c, c, c);
    }
    // a diagonal que deixa o degradê do canto liso
    if (brs && brs[0] + brs[2] < brs[1] + brs[3]) lt.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else lt.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // polígono plano (3 ou 4 cantos, já no sentido anti-horário visto de fora) com normal qualquer
  function poli(mat, vs, n, br = 1) {
    const lt = lotes[mat];
    const len = Math.hypot(n[0], n[1], n[2]);
    const nn = [n[0] / len, n[1] / len, n[2] / len];
    const ax = Math.abs(nn[0]), ay = Math.abs(nn[1]), az = Math.abs(nn[2]);
    const eixo = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
    const base = lt.pos.length / 3;
    for (const p of vs) {
      lt.pos.push(p[0], p[1], p[2]);
      lt.nor.push(nn[0], nn[1], nn[2]);
      const [u, v] = uvDe(p, eixo);
      lt.uv.push(u / texBlocos, v / texBlocos);
      lt.cor.push(br, br, br);
    }
    lt.idx.push(base, base + 1, base + 2);
    if (vs.length === 4) lt.idx.push(base, base + 2, base + 3);
  }

  // ---------------------------------------------- cubos cheios, por fatias
  const dims = [L, A, C];
  const c = [0, 0, 0];
  for (let eixo = 0; eixo < 3; eixo++) {
    const u = (eixo + 1) % 3, v = (eixo + 2) % 3;
    const nu = dims[u], nv = dims[v];
    const chave = new Int32Array(nu * nv);
    const aos = new Uint8Array(nu * nv * 4);
    for (const s of [-1, 1]) {
      for (c[eixo] = 0; c[eixo] < dims[eixo]; c[eixo]++) {
        // a máscara desta fatia: a face de cada cubo que fica à mostra
        let n = 0;
        for (c[v] = 0; c[v] < nv; c[v]++) {
          for (c[u] = 0; c[u] < nu; c[u]++, n++) {
            chave[n] = 0;
            const p = at(c[0], c[1], c[2]);
            if (pForma[p] !== CHEIO) continue;
            const viz = [c[0], c[1], c[2]];
            viz[eixo] += s;
            const pv = at(viz[0], viz[1], viz[2]);
            if (pForma[pv] === CHEIO && (pMat[pv] !== MAT.vitral || pMat[p] === MAT.vitral)) continue;
            // sombra de canto: os 3 vizinhos de cada canto na camada da frente
            let soma = 0;
            for (let k = 0; k < 4; k++) {
              const du = k === 1 || k === 2 ? 1 : -1;
              const dvv = k >= 2 ? 1 : -1;
              const a = viz.slice(); a[u] += du;
              const b = viz.slice(); b[v] += dvv;
              const q = viz.slice(); q[u] += du; q[v] += dvv;
              const s1 = opaco(a[0], a[1], a[2]) ? 1 : 0, s2 = opaco(b[0], b[1], b[2]) ? 1 : 0, s3 = opaco(q[0], q[1], q[2]) ? 1 : 0;
              const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
              aos[n * 4 + k] = ao;
              soma += ao;
            }
            // só funde faces de sombra igual nos 4 cantos; as outras ficam sozinhas
            const uniforme = soma === aos[n * 4] * 4;
            chave[n] = uniforme ? 1 + pMat[p] + N_MATS * aos[n * 4] : -(n + 1);
          }
        }
        // junta retângulos de chave igual
        n = 0;
        for (let j = 0; j < nv; j++) {
          for (let i = 0; i < nu;) {
            const k = chave[n];
            if (!k) { i++; n++; continue; }
            let w = 1;
            if (k > 0) while (i + w < nu && chave[n + w] === k) w++;
            let h = 1;
            if (k > 0) {
              fora: for (; j + h < nv; h++) {
                for (let q = 0; q < w; q++) if (chave[n + q + h * nu] !== k) break fora;
              }
            }
            const o = [0, 0, 0];
            o[eixo] = c[eixo] + (s > 0 ? 1 : 0);
            o[u] = i; o[v] = j;
            const du = [0, 0, 0]; du[u] = w;
            const dv = [0, 0, 0]; dv[v] = h;
            const cel = [0, 0, 0]; cel[eixo] = c[eixo]; cel[u] = i; cel[v] = j;
            const mat = pMat[at(cel[0], cel[1], cel[2])];
            const br = [AO[aos[n * 4]], AO[aos[n * 4 + 1]], AO[aos[n * 4 + 2]], AO[aos[n * 4 + 3]]];
            quad(mat, o, du, dv, eixo, s, br);
            for (let hh = 0; hh < h; hh++) for (let q = 0; q < w; q++) chave[n + q + hh * nu] = 0;
            i += w; n += w;
          }
        }
      }
    }
  }

  // ---------------------------------------------- as outras formas, em caixinhas
  const caixas = []; // [x0,y0,z0,x1,y1,z1, mat, faces]
  const rampas = []; // [x, y, z, dir, invertida, mat]
  const colis = []; // [x0,y0,z0,x1,y1,z1, tipo]
  const tochas = [];
  const cx = (x, y, z, b, mat, col = true, tipoCol = 0, faces = 63) => {
    const bx = [x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]];
    if (mat >= 0) caixas.push([...bx, mat, faces]);
    if (col) colis.push([...bx, tipoCol]);
  };
  // liga com o vizinho (mureta, cerca, painel): cubo cheio ou a mesma família
  const ligaMureta = (x, y, z) => { const f = forma(x, y, z); return f === MURETA || f === PORTAO || (f === CHEIO && !cheioVidro(x, y, z)); };
  const ligaCerca = (x, y, z) => { const f = forma(x, y, z); return f === CERCA || f === PORTAO || (f === CHEIO && !cheioVidro(x, y, z)); };
  const ligaPainel = (x, y, z) => { const f = forma(x, y, z); return f === PAINEL || f === CHEIO; };
  function cheioVidro(x, y, z) { return pMat[at(x, y, z)] === MAT.vitral; }

  for (let y = 0; y < A; y++) {
    for (let z = 0; z < C; z++) {
      for (let x = 0; x < L; x++) {
        const p = grade[x + L * (z + C * y)];
        const f = pForma[p];
        if (f === NADA || f === CHEIO) continue;
        const m = pMat[p], d = pDado[p];
        switch (f) {
          case LAJE:
            cx(x, y, z, d & 8 ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1], m, true, m === MAT.madeira ? 1 : 0);
            break;
          case DEGRAU: {
            const dir = d & 3, cima = d & 4;
            const [y0, y1] = cima ? [0.5, 1] : [0, 0.5];
            const [s0, s1] = cima ? [0, 0.5] : [0.5, 1];
            const passo = [[0.5, s0, 0, 1, s1, 1], [0, s0, 0, 0.5, s1, 1], [0, s0, 0.5, 1, s1, 1], [0, s0, 0, 1, s1, 0.5]][dir];
            // no desenho, uma rampa (ver cunhas abaixo)
            rampas.push([x, y, z, dir, cima ? 1 : 0, m]);
            if (cima) {
              colis.push([x, y + 0.5, z, x + 1, y + 1, z + 1, 0]);
              colis.push([x + passo[0], y, z + passo[2], x + passo[3], y + 0.5, z + passo[5], 0]);
            } else {
              // na colisão, quatro degrauzinhos de 25 cm: dá para subir andando (o passo sobe 42 cm)
              const banco = m === MAT.madeira ? 1 : 0;
              for (let q = 0; q < 4; q++) {
                const t0 = q / 4, t1 = (q + 1) / 4, h = (q + 1) / 4;
                // q = 0 é a ponta baixa
                const b = dir === 0 ? [t0, 0, 0, t1, h, 1] : dir === 1 ? [1 - t1, 0, 0, 1 - t0, h, 1]
                  : dir === 2 ? [0, 0, t0, 1, h, t1] : [0, 0, 1 - t1, 1, h, 1 - t0];
                colis.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5], banco]);
              }
            }
            break;
          }
          case MURETA: {
            const n = ligaMureta(x, y, z - 1), s = ligaMureta(x, y, z + 1), o = ligaMureta(x - 1, y, z), l = ligaMureta(x + 1, y, z);
            // reta (só de um eixo) fica um muro contínuo, sem o pilar
            if (n && s && !o && !l) { cx(x, y, z, [0.3125, 0, 0, 0.6875, 1, 1], m); break; }
            if (o && l && !n && !s) { cx(x, y, z, [0, 0, 0.3125, 1, 1, 0.6875], m); break; }
            // nas pontas, curvas e cruzamentos fica só o pilar: as muretas da catedral são as colunas
            // finas da fachada, e o pilar de cada andar emenda com o de cima numa coluna só
            cx(x, y, z, [0.25, 0, 0.25, 0.75, 1, 0.75], m);
            break;
          }
          case CERCA: {
            cx(x, y, z, [0.375, 0, 0.375, 0.625, 1, 0.625], m);
            if (ligaCerca(x, y, z - 1)) cx(x, y, z, [0.4375, 0.375, 0, 0.5625, 0.9375, 0.375], m);
            if (ligaCerca(x, y, z + 1)) cx(x, y, z, [0.4375, 0.375, 0.625, 0.5625, 0.9375, 1], m);
            if (ligaCerca(x - 1, y, z)) cx(x, y, z, [0, 0.375, 0.4375, 0.375, 0.9375, 0.5625], m);
            if (ligaCerca(x + 1, y, z)) cx(x, y, z, [0.625, 0.375, 0.4375, 1, 0.9375, 0.5625], m);
            break;
          }
          case PAINEL: {
            const n = ligaPainel(x, y, z - 1), s = ligaPainel(x, y, z + 1), o = ligaPainel(x - 1, y, z), l = ligaPainel(x + 1, y, z);
            const ns = n || s, ol = o || l;
            // sozinho ou numa reta: atravessa o bloco inteiro (as retas viram uma chapa só)
            if ((ns && !ol) || (!ns && !ol)) cx(x, y, z, [0.4375, 0, 0, 0.5625, 1, 1], m);
            if ((ol && !ns) || (!ns && !ol)) cx(x, y, z, [0, 0, 0.4375, 1, 1, 0.5625], m);
            if (ns && ol) {
              cx(x, y, z, [0.4375, 0, 0.4375, 0.5625, 1, 0.5625], m);
              if (n) cx(x, y, z, [0.4375, 0, 0, 0.5625, 1, 0.4375], m);
              if (s) cx(x, y, z, [0.4375, 0, 0.5625, 0.5625, 1, 1], m);
              if (o) cx(x, y, z, [0, 0, 0.4375, 0.4375, 1, 0.5625], m);
              if (l) cx(x, y, z, [0.5625, 0, 0.4375, 1, 1, 0.5625], m);
            }
            break;
          }
          case ALCAPAO: {
            const e = 0.1875;
            if (d & 4) {
              const b = [[0, 0, 1 - e, 1, 1, 1], [0, 0, 0, 1, 1, e], [1 - e, 0, 0, 1, 1, 1], [0, 0, 0, e, 1, 1]][d & 3];
              cx(x, y, z, b, m);
            } else cx(x, y, z, d & 8 ? [0, 1 - e, 0, 1, 1, 1] : [0, 0, 0, 1, e, 1], m);
            break;
          }
          case BOTAO: {
            const b = [null, [0, 0.375, 0.3125, 0.125, 0.625, 0.6875], [0.875, 0.375, 0.3125, 1, 0.625, 0.6875],
              [0.3125, 0.375, 0, 0.6875, 0.625, 0.125], [0.3125, 0.375, 0.875, 0.6875, 0.625, 1], [0.3125, 0, 0.375, 0.6875, 0.125, 0.625]][d & 7];
            // só a frente aparece: o botão é um detalhe de 12 cm em relevo na pedra
            const frente = [0, 1 << 1, 1 << 0, 1 << 5, 1 << 4, 1 << 3][d & 7];
            if (b) cx(x, y, z, b, m, false, 0, frente);
            break;
          }
          case TOCHA: {
            // presa na parede: encostada no lado do suporte
            const off = [[0, 0], [-0.32, 0], [0.32, 0], [0, -0.32], [0, 0.32], [0, 0]][d] || [0, 0];
            const y0 = d === 5 || !d ? 0 : 0.2;
            // o cabo some e fica a chama, um cubinho aceso (de baixo ninguém vê)
            const b = [0.4375 + off[0], y0 + 0.36, 0.4375 + off[1], 0.5625 + off[0], y0 + 0.56, 0.5625 + off[1]];
            cx(x, y, z, b, m === MAT.telha ? MAT.telha : MAT.chama, false, 0, 63 & ~(1 << 2));
            tochas.push([x + 0.5 + off[0], y + y0 + 0.62, z + 0.5 + off[1]]);
            break;
          }
          case TAPETE: cx(x, y, z, [0, 0, 0, 1, 0.0625, 1], m, false); break;
          case BIGORNA: {
            // as bigornas da catedral são enfeites de pedra escura (capitéis, pináculos): um bloco estreito
            cx(x, y, z, d & 1 ? [0, 0, 0.1875, 1, 1, 0.8125] : [0.1875, 0, 0, 0.8125, 1, 1], m);
            break;
          }
          case PORTA: {
            // a metade de cima segue a de baixo; as portas ficam abertas (sem colisão)
            const dd = d & 8 ? pDado[at(x, y - 1, z)] : d;
            const e = 0.1875;
            const b = [[0, 0, 0, e, 1, 1], [0, 0, 0, 1, 1, e], [1 - e, 0, 0, 1, 1, 1], [0, 0, 1 - e, 1, 1, 1]][(dd + (dd & 4 ? 1 : 0)) & 3];
            cx(x, y, z, b, m, false);
            break;
          }
          case ESCADA: {
            const b = { 2: [0, 0, 0.875, 1, 1, 1], 3: [0, 0, 0, 1, 1, 0.125], 4: [0.875, 0, 0, 1, 1, 1], 5: [0, 0, 0, 0.125, 1, 1] }[d];
            if (b) cx(x, y, z, b, m, false);
            break;
          }
          case PORTAO:
            cx(x, y, z, d & 1 ? [0.4375, 0.375, 0, 0.5625, 0.9375, 1] : [0, 0.375, 0.4375, 1, 0.9375, 0.5625], m, false);
            break;
          case CAIXA: {
            const id = pId[p];
            if (id === 147 || id === 148) cx(x, y, z, [0.0625, 0, 0.0625, 0.9375, 0.0625, 0.9375], m, false);
            else if (id === 151) cx(x, y, z, [0, 0, 0, 1, 0.375, 1], m);
            else if (id === 116) cx(x, y, z, [0, 0, 0, 1, 0.75, 1], MAT.estante);
            else if (id === 117) {
              cx(x, y, z, [0.0625, 0, 0.0625, 0.9375, 0.125, 0.9375], m);
              cx(x, y, z, [0.4375, 0.125, 0.4375, 0.5625, 0.875, 0.5625], MAT.ouro, false);
            } else if (id === 154) {
              cx(x, y, z, [0, 0.625, 0, 1, 1, 1], m);
              cx(x, y, z, [0.25, 0.25, 0.25, 0.75, 0.625, 0.75], m);
            } else cx(x, y, z, [0.25, 0, 0.25, 0.75, 0.5, 0.75], MAT.liso, false);
            break;
          }
          default: break;
        }
      }
    }
  }

  // junta caixas iguais encostadas: primeiro em pé (colunas), depois em x, depois em z
  const juntar = (lista, extra) => {
    for (const eixo of [1, 0, 2]) {
      const o1 = (eixo + 1) % 3, o2 = (eixo + 2) % 3;
      const grupos = new Map();
      for (const b of lista) {
        const k = `${b[o1]},${b[o1 + 3]},${b[o2]},${b[o2 + 3]},${b[6]},${b[7]}`;
        let g = grupos.get(k);
        if (!g) grupos.set(k, (g = []));
        g.push(b);
      }
      const saida = [];
      for (const g of grupos.values()) {
        g.sort((a, b) => a[eixo] - b[eixo]);
        let atual = g[0].slice();
        for (let i = 1; i < g.length; i++) {
          const b = g[i];
          if (Math.abs(b[eixo] - atual[eixo + 3]) < 1e-6 && extra(atual, b)) atual[eixo + 3] = b[eixo + 3];
          else { saida.push(atual); atual = b.slice(); }
        }
        saida.push(atual);
      }
      lista = saida;
    }
    return lista;
  };
  const caixasJuntas = juntar(caixas, () => true);

  // uma face de caixa que encosta num cubo opaco (em toda a extensão) não aparece
  const escondida = (b, eixo, s) => {
    const plano = s > 0 ? b[eixo + 3] : b[eixo];
    if (Math.abs(plano - Math.round(plano)) > 1e-6) return false;
    const camada = s > 0 ? Math.round(plano) : Math.round(plano) - 1;
    const u = (eixo + 1) % 3, v = (eixo + 2) % 3;
    const c3 = [0, 0, 0];
    c3[eixo] = camada;
    for (let i = Math.floor(b[u] + 1e-6); i < Math.ceil(b[u + 3] - 1e-6); i++) {
      for (let j = Math.floor(b[v] + 1e-6); j < Math.ceil(b[v + 3] - 1e-6); j++) {
        c3[u] = i; c3[v] = j;
        if (!opaco(c3[0], c3[1], c3[2])) return false;
      }
    }
    return true;
  };
  // as faces de cada plano, por célula: (eixo, plano, lado) -> retângulos [u0, v0, u1, v1]
  const planos = new Map();
  const chavePlano = (eixo, plano, s, i, j) => `${eixo}|${Math.round(plano * 64)}|${s}|${i}|${j}`;
  for (const b of caixasJuntas) {
    for (let eixo = 0; eixo < 3; eixo++) {
      const u = (eixo + 1) % 3, v = (eixo + 2) % 3;
      for (const s of [-1, 1]) {
        const plano = s > 0 ? b[eixo + 3] : b[eixo];
        const r = [b[u], b[v], b[u + 3], b[v + 3]];
        for (let i = Math.floor(r[0] + 1e-6); i < Math.ceil(r[2] - 1e-6); i++) {
          for (let j = Math.floor(r[1] + 1e-6); j < Math.ceil(r[3] - 1e-6); j++) {
            const k = chavePlano(eixo, plano, s, i, j);
            let l = planos.get(k);
            if (!l) planos.set(k, (l = []));
            l.push(r);
          }
        }
      }
    }
  }
  const coberta = (b, eixo, s) => {
    const u = (eixo + 1) % 3, v = (eixo + 2) % 3;
    const plano = s > 0 ? b[eixo + 3] : b[eixo];
    const l = planos.get(chavePlano(eixo, plano, -s, Math.floor(b[u] + 1e-6), Math.floor(b[v] + 1e-6)));
    if (!l) return false;
    for (const r of l) if (r[0] <= b[u] + 1e-6 && r[1] <= b[v] + 1e-6 && r[2] >= b[u + 3] - 1e-6 && r[3] >= b[v + 3] - 1e-6) return true;
    return false;
  };
  for (const b of caixasJuntas) {
    const mat = b[6];
    for (let eixo = 0; eixo < 3; eixo++) {
      const u = (eixo + 1) % 3, v = (eixo + 2) % 3;
      for (const s of [-1, 1]) {
        if (!(b[7] & (1 << (eixo * 2 + (s > 0 ? 1 : 0))))) continue;
        if (escondida(b, eixo, s) || coberta(b, eixo, s)) continue;
        const o = [b[0], b[1], b[2]];
        if (s > 0) o[eixo] = b[eixo + 3];
        const du = [0, 0, 0]; du[u] = b[u + 3] - b[u];
        const dv = [0, 0, 0]; dv[v] = b[v + 3] - b[v];
        quad(mat, o, du, dv, eixo, s, null);
      }
    }
  }

  // ---------------------------------------------- rampas
  // Cada degrau vira uma cunha que sobe do chão do bloco até o topo no lado alto: um telhado de
  // degraus fica uma água lisa. Degraus vizinhos virados para o mesmo lado viram uma cunha comprida.
  // dir: 0 sobe para +x, 1 para -x, 2 para +z, 3 para -z; invertida: de cabeça para baixo
  const chaveRampa = (r) => `${r[1]},${r[3]},${r[4]},${r[5]},${r[3] < 2 ? r[0] : r[2]}`;
  const fileiras = new Map();
  for (const r of rampas) {
    const k = chaveRampa(r);
    let l = fileiras.get(k);
    if (!l) fileiras.set(k, (l = []));
    l.push(r);
  }
  const ehRampaIgual = (x, y, z, r) => {
    const p = at(x, y, z);
    if (pForma[p] !== DEGRAU) return false;
    const d = pDado[p];
    return (d & 3) === r[3] && ((d & 4) ? 1 : 0) === r[4];
  };
  for (const l of fileiras.values()) {
    const r0 = l[0];
    const dir = r0[3], inv = r0[4], mat = r0[5];
    const aoLongoDeZ = dir < 2; // a fileira corre em z quando a rampa sobe em x
    l.sort((a, b) => (aoLongoDeZ ? a[2] - b[2] : a[0] - b[0]));
    for (let i = 0; i < l.length;) {
      let j = i + 1;
      while (j < l.length && (aoLongoDeZ ? l[j][2] - l[j - 1][2] : l[j][0] - l[j - 1][0]) === 1) j++;
      const a = l[i], b = l[j - 1];
      const x0 = a[0], y = a[1], z0 = a[2];
      const x1 = aoLongoDeZ ? x0 + 1 : b[0] + 1, z1 = aoLongoDeZ ? b[2] + 1 : z0 + 1;
      // em coordenadas da rampa: t sobe de 0 (lado baixo) a 1 (lado alto), w corre na fileira
      const P = (t, h, w) => {
        const yy = inv ? y + 1 - h : y + h;
        if (dir === 0) return [x0 + t, yy, z0 + w * (z1 - z0)];
        if (dir === 1) return [x1 - t, yy, z0 + w * (z1 - z0)];
        if (dir === 2) return [x0 + w * (x1 - x0), yy, z0 + t];
        return [x0 + w * (x1 - x0), yy, z1 - t];
      };
      // vira o polígono quando a rampa espelha a orientação (dir 1 e 2, ou de cabeça para baixo)
      const espelho = (dir === 1 || dir === 2) !== !!inv;
      const face = (vs, n, br) => poli(mat, espelho ? vs.slice().reverse() : vs, n, br);
      const sobe = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][dir];
      const cima = inv ? -1 : 1;
      // a rampa
      const nr = [-sobe[0], cima, -sobe[2]];
      face([P(0, 0, 0), P(0, 0, 1), P(1, 1, 1), P(1, 1, 0)], nr, 1);
      // o fundo do lado alto (escondido se o vizinho de trás for opaco em toda a fileira)
      const tras = (q) => (aoLongoDeZ ? [dir === 0 ? x1 : x0 - 1, y, q] : [q, y, dir === 2 ? z1 : z0 - 1]);
      let trasAberto = false;
      for (let q = aoLongoDeZ ? z0 : x0; q < (aoLongoDeZ ? z1 : x1); q++) { const c3 = tras(q); if (!opaco(c3[0], c3[1], c3[2])) trasAberto = true; }
      if (trasAberto) face([P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)], sobe, 0.85);
      // a base (embaixo, ou em cima quando invertida)
      const yb = inv ? y + 1 : y - 1;
      let baseAberta = false;
      for (let xx = x0; xx < x1; xx++) for (let zz = z0; zz < z1; zz++) if (!opaco(xx, yb, zz)) baseAberta = true;
      if (baseAberta) face([P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], [0, -cima, 0], 0.8);
      // as pontas da fileira: triângulos (somem se o vizinho é opaco ou outra rampa igual)
      const pontas = aoLongoDeZ ? [[x0, z0 - 1, 0], [x0, z1, 1]] : [[x0 - 1, z0, 0], [x1, z0, 1]];
      for (const [px, pz, w] of pontas) {
        if (opaco(px, y, pz) || ehRampaIgual(px, y, pz, r0)) continue;
        const n = aoLongoDeZ ? [0, 0, w ? 1 : -1] : [w ? 1 : -1, 0, 0];
        const tri = w ? [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1)] : [P(0, 0, 0), P(1, 1, 0), P(1, 0, 0)];
        face(tri, n, 0.9);
      }
      i = j;
    }
  }

  // ---------------------------------------------- colisão
  // cubos cheios (vidro também): caixas grandes, crescendo em x, depois em z, depois em y
  const usado = new Uint8Array(L * A * C);
  const solidos = [];
  const livre = (x, y, z) => cheio(x, y, z) && !usado[x + L * (z + C * y)];
  for (let y = 0; y < A; y++) {
    for (let z = 0; z < C; z++) {
      for (let x = 0; x < L; x++) {
        if (!livre(x, y, z)) continue;
        let w = 1;
        while (x + w < L && livre(x + w, y, z)) w++;
        let d = 1;
        fz: for (; z + d < C; d++) for (let i = 0; i < w; i++) if (!livre(x + i, y, z + d)) break fz;
        let h = 1;
        fy: for (; y + h < A; h++) for (let k = 0; k < d; k++) for (let i = 0; i < w; i++) if (!livre(x + i, y + h, z + k)) break fy;
        for (let yy = 0; yy < h; yy++) for (let k = 0; k < d; k++) for (let i = 0; i < w; i++) usado[x + i + L * (z + k + C * (y + yy))] = 1;
        solidos.push([x, y, z, x + w, y + h, z + d, 0]);
      }
    }
  }
  const colisoes = [...solidos, ...juntar(colis, () => true)];

  // a câmera em 3ª pessoa não atravessa cubo cheio nem laje/degrau
  const bloqueia = (x, y, z) => {
    const f = forma(x, y, z);
    return f === CHEIO || f === LAJE || f === DEGRAU;
  };

  const saida = lotes.map((lt, mat) => ({
    mat,
    pos: new Float32Array(lt.pos), nor: new Float32Array(lt.nor), uv: new Float32Array(lt.uv), cor: new Float32Array(lt.cor),
    idx: lt.pos.length / 3 > 65535 ? new Uint32Array(lt.idx) : new Uint16Array(lt.idx),
  })).filter((lt) => lt.idx.length);
  return { L, A, C, lotes: saida, colisoes, tochas, bloqueia, opaco };
}
