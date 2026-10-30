// A catedral gótica (de "patrix", no Sketchfab: sketchfab.com/3d-models/fead337069164dcabc41fb211417581f,
// com licença liberada pelo autor) foi construída no Minecraft 1.7. O .obj que ele exportou perdeu o
// tipo de cada bloco; o mapa dele (link na descrição do modelo) tem tudo. Este script lê o mapa e
// grava public/models/catedral.bin: só a caixa da catedral, bloco a bloco, compacta. O jogo monta a
// malha e a colisão no navegador (catedral.js), com texturas próprias.
//
//   baixe o mapa (gothcathedralmap.rar), extraia e ponha a pasta region/ em models-brutos/catedral/
//   node scripts/preparar-catedral.js
//
// Formato (tudo little-endian), depois de gzip:
//   'CAT1', L (x), A (y), C (z) em uint16, n em uint16 e n blocos da paleta (uint16: id << 4 | dado),
//   e a grade em sequências (índice na paleta: uint8, quantas: varint), x mais rápido, depois z, depois y.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PASTA = path.join(__dirname, '..', 'models-brutos', 'catedral', 'region');
const SAIDA = path.join(__dirname, '..', 'public', 'models', 'catedral.bin');
// a caixa da catedral no mapa: o chão (grama) é o y 71; abaixo dele só tem alicerce
const X0 = -71, X1 = -11, Y0 = 72, Y1 = 188, Z0 = -99, Z1 = 18;
// o que é do terreno em volta, não da catedral
const TERRENO = new Set([1, 2, 3, 7, 8, 9, 12, 13, 31, 78, 18]);

function lerNBT(buf) {
  let o = 0;
  const rd = {
    1: () => buf.readInt8(o++),
    2: () => { const v = buf.readInt16BE(o); o += 2; return v; },
    3: () => { const v = buf.readInt32BE(o); o += 4; return v; },
    4: () => { o += 8; return 0; },
    5: () => { o += 4; return 0; },
    6: () => { o += 8; return 0; },
    7: () => { const n = buf.readInt32BE(o); o += 4; const v = buf.subarray(o, o + n); o += n; return v; },
    8: () => { const n = buf.readUInt16BE(o); o += 2; const v = buf.toString('utf8', o, o + n); o += n; return v; },
    9: () => { const t = buf.readInt8(o++); const n = buf.readInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(rd[t]()); return a; },
    10: () => { const c = {}; for (;;) { const t = buf.readInt8(o++); if (t === 0) break; const k = rd[8](); c[k] = rd[t](); } return c; },
    11: () => { const n = buf.readInt32BE(o); o += 4 + 4 * n; return null; },
    12: () => { const n = buf.readInt32BE(o); o += 4 + 8 * n; return null; },
  };
  const t = buf.readInt8(o++);
  rd[8]();
  return rd[t]();
}

const L = X1 - X0 + 1, A = Y1 - Y0 + 1, C = Z1 - Z0 + 1;
const grade = new Uint16Array(L * A * C); // id << 4 | dado; 0 = ar
for (const f of fs.readdirSync(PASTA)) {
  if (!/^r\.-?\d+\.-?\d+\.mca$/.test(f)) continue;
  const b = fs.readFileSync(path.join(PASTA, f));
  for (let i = 0; i < 1024; i++) {
    const off = (b.readUInt32BE(i * 4) >> 8) * 4096;
    if (!off) continue;
    const len = b.readUInt32BE(off);
    const bruto = b.subarray(off + 5, off + 4 + len);
    const lv = lerNBT(b[off + 4] === 1 ? zlib.gunzipSync(bruto) : zlib.inflateSync(bruto)).Level;
    for (const s of lv.Sections || []) {
      for (let k = 0; k < 4096; k++) {
        const id = s.Blocks[k] & 255;
        if (!id || TERRENO.has(id)) continue;
        const x = lv.xPos * 16 + (k & 15), z = lv.zPos * 16 + ((k >> 4) & 15), y = s.Y * 16 + (k >> 8);
        if (x < X0 || x > X1 || y < Y0 || y > Y1 || z < Z0 || z > Z1) continue;
        const dado = (s.Data[k >> 1] >> ((k & 1) * 4)) & 15;
        grade[(x - X0) + L * ((z - Z0) + C * (y - Y0))] = (id << 4) | dado;
      }
    }
  }
}

const paleta = [0];
const indice = new Map([[0, 0]]);
for (const v of grade) if (!indice.has(v)) { indice.set(v, paleta.length); paleta.push(v); }
if (paleta.length > 255) throw new Error(`paleta grande demais: ${paleta.length}`);

const partes = [];
const cab = Buffer.alloc(4 + 8 + paleta.length * 2);
cab.write('CAT1', 0, 'ascii');
cab.writeUInt16LE(L, 4); cab.writeUInt16LE(A, 6); cab.writeUInt16LE(C, 8); cab.writeUInt16LE(paleta.length, 10);
paleta.forEach((v, i) => cab.writeUInt16LE(v, 12 + i * 2));
partes.push(cab);
const seq = [];
for (let i = 0; i < grade.length;) {
  const v = grade[i];
  let n = 1;
  while (i + n < grade.length && grade[i + n] === v) n++;
  seq.push(indice.get(v));
  for (let m = n; ; m >>>= 7) { if (m < 128) { seq.push(m); break; } seq.push((m & 127) | 128); }
  i += n;
}
partes.push(Buffer.from(seq));
const bruto = Buffer.concat(partes);
const final = zlib.gzipSync(bruto, { level: 9 });
fs.writeFileSync(SAIDA, final);
let blocos = 0;
for (const v of grade) if (v) blocos++;
console.log(`${L} x ${A} x ${C}, ${blocos} blocos, ${paleta.length} tipos: ${(bruto.length / 1024).toFixed(0)} KB, ${(final.length / 1024).toFixed(0)} KB com gzip -> ${path.relative(process.cwd(), SAIDA)}`);
