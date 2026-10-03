// Regras do xadrez, um adversário de computador e o intérprete dos comandos ("cavalo f3",
// "e2 e4", "roque") — falados ou digitados, como o Rony comandando as peças em Harry Potter.
//
// Casa = índice 0..63, linha * 8 + coluna. Linha 0 é a fileira 1 (das brancas), coluna 0 é "a".
// Peças: maiúscula branca, minúscula preta (P N B R Q K = peão, cavalo, bispo, torre, dama, rei).

export const NOMES = { p: 'Peão', n: 'Cavalo', b: 'Bispo', r: 'Torre', q: 'Dama', k: 'Rei' };

const col = (i) => i & 7;
const lin = (i) => i >> 3;
export const casaNome = (i) => 'abcdefgh'[col(i)] + (lin(i) + 1);
export const casaDe = (s) => {
  const m = /^([a-h])([1-8])$/.exec(s);
  return m ? (Number(m[2]) - 1) * 8 + 'abcdefgh'.indexOf(m[1]) : -1;
};
const corDe = (p) => (p === p.toUpperCase() ? 'w' : 'b');
const tipo = (p) => p.toLowerCase();

export function novo() {
  const b = new Array(64).fill(null);
  const fundo = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let c = 0; c < 8; c++) {
    b[c] = fundo[c].toUpperCase();
    b[8 + c] = 'P';
    b[48 + c] = 'p';
    b[56 + c] = fundo[c];
  }
  return { b, vez: 'w', roque: { K: true, Q: true, k: true, q: true }, ep: -1, meio: 0, n: 0 };
}

const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const RETA = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SALTO = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const VOLTA = [...DIAG, ...RETA];

// A casa i é atacada por alguém da cor "por"?
export function atacada(b, i, por) {
  const c0 = col(i);
  const l0 = lin(i);
  const minha = (p, t) => p && corDe(p) === por && tipo(p) === t;
  // peão
  const dl = por === 'w' ? -1 : 1;
  for (const dc of [-1, 1]) {
    const c = c0 + dc;
    const l = l0 + dl;
    if (c >= 0 && c < 8 && l >= 0 && l < 8 && minha(b[l * 8 + c], 'p')) return true;
  }
  for (const [dc, dl2] of SALTO) {
    const c = c0 + dc;
    const l = l0 + dl2;
    if (c >= 0 && c < 8 && l >= 0 && l < 8 && minha(b[l * 8 + c], 'n')) return true;
  }
  for (const [dc, dl2] of VOLTA) {
    const c = c0 + dc;
    const l = l0 + dl2;
    if (c >= 0 && c < 8 && l >= 0 && l < 8 && minha(b[l * 8 + c], 'k')) return true;
  }
  for (const [dirs, tipos] of [[DIAG, 'bq'], [RETA, 'rq']]) {
    for (const [dc, dl2] of dirs) {
      let c = c0 + dc;
      let l = l0 + dl2;
      while (c >= 0 && c < 8 && l >= 0 && l < 8) {
        const p = b[l * 8 + c];
        if (p) {
          if (corDe(p) === por && tipos.includes(tipo(p))) return true;
          break;
        }
        c += dc;
        l += dl2;
      }
    }
  }
  return false;
}

const reiDe = (b, cor) => b.indexOf(cor === 'w' ? 'K' : 'k');
export const emXeque = (st, cor = st.vez) => atacada(st.b, reiDe(st.b, cor), cor === 'w' ? 'b' : 'w');

function pseudo(st) {
  const { b, vez } = st;
  const out = [];
  const add = (de, para, extra = {}) => out.push({ de, para, cap: b[para] ? para : -1, ...extra });
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || corDe(p) !== vez) continue;
    const c0 = col(i);
    const l0 = lin(i);
    const t = tipo(p);
    if (t === 'p') {
      const d = vez === 'w' ? 1 : -1;
      const ultima = vez === 'w' ? 7 : 0;
      const empurra = (de, para, extra = {}) => {
        if (lin(para) === ultima) for (const pr of ['q', 'r', 'b', 'n']) add(de, para, { ...extra, promo: pr });
        else add(de, para, extra);
      };
      const f1 = i + d * 8;
      if (f1 >= 0 && f1 < 64 && !b[f1]) {
        empurra(i, f1);
        const inicio = vez === 'w' ? 1 : 6;
        const f2 = i + d * 16;
        if (l0 === inicio && !b[f2]) add(i, f2);
      }
      for (const dc of [-1, 1]) {
        const c = c0 + dc;
        const l = l0 + d;
        if (c < 0 || c > 7 || l < 0 || l > 7) continue;
        const alvo = l * 8 + c;
        if (b[alvo] && corDe(b[alvo]) !== vez) empurra(i, alvo);
        else if (alvo === st.ep) out.push({ de: i, para: alvo, cap: alvo - d * 8, ep: true });
      }
      continue;
    }
    if (t === 'n' || t === 'k') {
      for (const [dc, dl] of t === 'n' ? SALTO : VOLTA) {
        const c = c0 + dc;
        const l = l0 + dl;
        if (c < 0 || c > 7 || l < 0 || l > 7) continue;
        const alvo = l * 8 + c;
        if (!b[alvo] || corDe(b[alvo]) !== vez) add(i, alvo);
      }
      if (t === 'k') {
        const inimigo = vez === 'w' ? 'b' : 'w';
        const base = vez === 'w' ? 0 : 56;
        const [kk, qq] = vez === 'w' ? ['K', 'Q'] : ['k', 'q'];
        if (i === base + 4 && !atacada(b, i, inimigo)) {
          if (st.roque[kk] && !b[base + 5] && !b[base + 6] && b[base + 7] === (vez === 'w' ? 'R' : 'r')
            && !atacada(b, base + 5, inimigo) && !atacada(b, base + 6, inimigo)) {
            out.push({ de: i, para: base + 6, cap: -1, roque: { de: base + 7, para: base + 5 } });
          }
          if (st.roque[qq] && !b[base + 3] && !b[base + 2] && !b[base + 1] && b[base] === (vez === 'w' ? 'R' : 'r')
            && !atacada(b, base + 3, inimigo) && !atacada(b, base + 2, inimigo)) {
            out.push({ de: i, para: base + 2, cap: -1, roque: { de: base, para: base + 3 } });
          }
        }
      }
      continue;
    }
    const dirs = t === 'b' ? DIAG : t === 'r' ? RETA : VOLTA;
    for (const [dc, dl] of dirs) {
      let c = c0 + dc;
      let l = l0 + dl;
      while (c >= 0 && c < 8 && l >= 0 && l < 8) {
        const alvo = l * 8 + c;
        if (b[alvo]) {
          if (corDe(b[alvo]) !== vez) add(i, alvo);
          break;
        }
        add(i, alvo);
        c += dc;
        l += dl;
      }
    }
  }
  return out;
}

export function aplicar(st, m) {
  const b = st.b.slice();
  const p = b[m.de];
  const roque = { ...st.roque };
  b[m.para] = m.promo ? (st.vez === 'w' ? m.promo.toUpperCase() : m.promo) : p;
  b[m.de] = null;
  if (m.ep) b[m.cap] = null;
  if (m.roque) {
    b[m.roque.para] = b[m.roque.de];
    b[m.roque.de] = null;
  }
  // perdeu o direito de rocar: o rei andou, ou a torre andou/foi tomada
  if (p === 'K') roque.K = roque.Q = false;
  if (p === 'k') roque.k = roque.q = false;
  for (const [casa, chave] of [[0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']]) if (m.de === casa || m.para === casa) roque[chave] = false;
  const ep = tipo(p) === 'p' && Math.abs(m.para - m.de) === 16 ? (m.de + m.para) / 2 : -1;
  return {
    b, roque, ep,
    vez: st.vez === 'w' ? 'b' : 'w',
    meio: tipo(p) === 'p' || m.cap >= 0 ? 0 : st.meio + 1,
    n: st.n + 1,
  };
}

export function legais(st) {
  return pseudo(st).filter((m) => !emXeque(aplicar(st, m), st.vez));
}

// Fim de jogo? { fim: true, vencedor: 'w'|'b'|null, motivo } ou { fim: false, xeque }
export function situacao(st) {
  const ls = legais(st);
  const xeque = emXeque(st);
  if (!ls.length) return xeque ? { fim: true, vencedor: st.vez === 'w' ? 'b' : 'w', motivo: 'Xeque-mate' } : { fim: true, vencedor: null, motivo: 'Afogado — empate' };
  if (st.meio >= 100) return { fim: true, vencedor: null, motivo: 'Empate pela regra dos 50 lances' };
  const resto = st.b.filter((p) => p && tipo(p) !== 'k');
  if (!resto.length || (resto.length === 1 && 'nb'.includes(tipo(resto[0])))) return { fim: true, vencedor: null, motivo: 'Empate — não sobrou material para dar mate' };
  return { fim: false, xeque };
}

// lance <-> texto curto ("e2e4", "e7e8q") — é isso que vai pela rede
export const paraTexto = (m) => casaNome(m.de) + casaNome(m.para) + (m.promo || '');
export function deTexto(st, s) {
  const de = casaDe(s.slice(0, 2));
  const para = casaDe(s.slice(2, 4));
  const promo = s[4] || undefined;
  return legais(st).find((m) => m.de === de && m.para === para && (m.promo || undefined) === promo) || null;
}

// Frase para anunciar o lance ("Cavalo toma f6", "Roque pequeno").
export function descrever(st, m) {
  if (m.roque) return m.para > m.de ? 'Roque pequeno' : 'Roque grande';
  const nome = NOMES[tipo(st.b[m.de])];
  let txt = `${nome} ${m.cap >= 0 ? 'toma' : 'para'} ${casaNome(m.para)}`;
  if (m.promo) txt += `, vira ${NOMES[m.promo].toLowerCase()}`;
  return txt;
}

// ------------------------------------------------------------------ computador
const VALOR = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// bônus por casa (do ponto de vista das brancas, linha 0 = fileira 1)
const CENTRO = [0, 1, 2, 3, 3, 2, 1, 0];
function posicional(t, i, cor) {
  const c = col(i);
  const l = cor === 'w' ? lin(i) : 7 - lin(i);
  switch (t) {
    case 'p': return l * 8 + (c >= 2 && c <= 5 ? CENTRO[c] * l * 2 : 0);
    case 'n': return (CENTRO[c] + CENTRO[l]) * 8 - 20;
    case 'b': return (CENTRO[c] + CENTRO[l]) * 4;
    case 'r': return l === 6 ? 20 : 0;
    case 'q': return (CENTRO[c] + CENTRO[l]) * 2;
    case 'k': return l === 0 && (c <= 2 || c >= 6) ? 25 : -l * 8;
    default: return 0;
  }
}

function avaliar(st) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = st.b[i];
    if (!p) continue;
    const t = tipo(p);
    const v = VALOR[t] + posicional(t, i, corDe(p));
    s += corDe(p) === 'w' ? v : -v;
  }
  return st.vez === 'w' ? s : -s;
}

const MATE = 100000;
function ordenar(st, ms) {
  return ms.sort((a, b) => (b.cap >= 0 ? VALOR[tipo(st.b[b.cap])] * 10 - VALOR[tipo(st.b[b.de])] : 0) + (b.promo ? 800 : 0)
    - ((a.cap >= 0 ? VALOR[tipo(st.b[a.cap])] * 10 - VALOR[tipo(st.b[a.de])] : 0) + (a.promo ? 800 : 0)));
}

// só capturas, para não parar a conta no meio de uma troca
function quieto(st, alfa, beta, prof) {
  const parado = avaliar(st);
  if (parado >= beta) return beta;
  if (parado > alfa) alfa = parado;
  if (prof <= 0) return alfa;
  for (const m of ordenar(st, pseudo(st).filter((x) => x.cap >= 0 || x.promo))) {
    const prox = aplicar(st, m);
    if (emXeque(prox, st.vez)) continue;
    const v = -quieto(prox, -beta, -alfa, prof - 1);
    if (v >= beta) return beta;
    if (v > alfa) alfa = v;
  }
  return alfa;
}

function busca(st, prof, alfa, beta, ply) {
  if (prof <= 0) return quieto(st, alfa, beta, 4);
  let algum = false;
  for (const m of ordenar(st, pseudo(st))) {
    const prox = aplicar(st, m);
    if (emXeque(prox, st.vez)) continue;
    algum = true;
    const v = -busca(prox, prof - 1, -beta, -alfa, ply + 1);
    if (v >= beta) return beta;
    if (v > alfa) alfa = v;
  }
  if (!algum) return emXeque(st) ? -MATE + ply : 0;
  return alfa;
}

// Escolhe o lance do computador. Um tiquinho de sorteio entre lances quase iguais
// para ele não jogar sempre a mesma partida.
export function lanceDoComputador(st, prof = 3) {
  const ms = ordenar(st, legais(st));
  if (!ms.length) return null;
  let melhor = [];
  let alfa = -Infinity;
  for (const m of ms) {
    const v = -busca(aplicar(st, m), prof - 1, -MATE - 1, -alfa + 15, 1) + Math.random() * 6;
    if (v > alfa + 15) {
      alfa = v;
      melhor = [m];
    } else if (v >= alfa - 15) {
      melhor.push(m);
      if (v > alfa) alfa = v;
    }
  }
  return melhor[Math.floor(Math.random() * melhor.length)];
}

// ------------------------------------------------------------------ comandos falados/digitados
const PALAVRAS_PECA = [
  [/\b(pe[aã]o|pe[oõ]es)\b/, 'p'],
  [/\b(cavalo|cavaleiro)\b/, 'n'],
  [/\bbispo\b/, 'b'],
  [/\b(torre)\b/, 'r'],
  [/\b(dama|rainha)\b/, 'q'],
  [/\brei\b/, 'k'],
];
const LETRA = { a: 'a', 'á': 'a', b: 'b', 'bê': 'b', be: 'b', c: 'c', 'cê': 'c', ce: 'c', se: 'c', d: 'd', 'dê': 'd', de: 'd', e: 'e', 'é': 'e', f: 'f', efe: 'f', g: 'g', 'gê': 'g', ge: 'g', je: 'g', h: 'h', 'agá': 'h', aga: 'h' };
const NUM = { um: '1', uma: '1', dois: '2', duas: '2', 'três': '3', tres: '3', quatro: '4', cinco: '5', seis: '6', sete: '7', oito: '8' };

// Junta "bê quatro", "B 4", "b4" tudo em "b4". Devolve a lista de casas citadas, em ordem.
export function casasNoTexto(txt) {
  const t = txt.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const pal = t.split(' ').flatMap((w) => {
    const m = /^([a-h])([1-8])$/.exec(w);
    return m ? [m[1], m[2]] : [w];
  });
  const casas = [];
  for (let i = 0; i < pal.length - 1; i++) {
    const l = LETRA[pal[i]];
    const n = /^[1-8]$/.test(pal[i + 1]) ? pal[i + 1] : NUM[pal[i + 1]];
    if (l && n) {
      casas.push(casaDe(l + n));
      i++;
    }
  }
  return casas;
}

// Transforma o comando num lance legal. Devolve { lance } ou { erro }.
export function interpretar(st, texto) {
  const t = texto.toLowerCase();
  const ls = legais(st);
  if (/roque\s*(grande|longo)|grande\s*roque|o-o-o/.test(t)) {
    const m = ls.find((x) => x.roque && x.para < x.de);
    return m ? { lance: m } : { erro: 'Roque grande não pode agora' };
  }
  if (/roque|o-o/.test(t)) {
    const ms = ls.filter((x) => x.roque);
    const m = ms.find((x) => x.para > x.de) || (ms.length === 1 ? ms[0] : null);
    return m ? { lance: m } : { erro: 'Roque não pode agora' };
  }
  let peca = null;
  for (const [re, p] of PALAVRAS_PECA) {
    const m = re.exec(t);
    if (m && (peca === null || m.index < peca.idx)) peca = { t: p, idx: m.index };
  }
  // "promove a cavalo", "vira torre": a peça depois de "vira/promove" é a promoção
  let promo = 'q';
  const pm = /(vira|promove|promo[cç][aã]o|coroa)\D*?(cavalo|bispo|torre|dama|rainha)/.exec(t);
  if (pm) promo = { cavalo: 'n', bispo: 'b', torre: 'r', dama: 'q', rainha: 'q' }[pm[2]];
  const casas = casasNoTexto(t);
  if (!casas.length) return { erro: 'Não entendi a casa. Diga, por exemplo, "cavalo f3" ou "e2 e4".' };
  let cand;
  if (casas.length >= 2) {
    cand = ls.filter((m) => m.de === casas[0] && m.para === casas[1]);
  } else {
    const alvo = casas[0];
    cand = ls.filter((m) => m.para === alvo);
    // "e4" sozinho é a peça própria que está em e4? então não é destino, é escolha — o cliente trata
    if (peca) cand = cand.filter((m) => tipo(st.b[m.de]) === peca.t);
    else if (cand.some((m) => tipo(st.b[m.de]) === 'p')) cand = cand.filter((m) => tipo(st.b[m.de]) === 'p');
  }
  cand = cand.filter((m) => !m.promo || m.promo === promo);
  if (cand.length === 1) return { lance: cand[0] };
  if (!cand.length) return { erro: `Nenhuma peça sua pode ir para ${casaNome(casas[casas.length - 1])}` };
  return { erro: `Mais de uma peça pode ir para ${casaNome(cand[0].para)}: diga a casa de saída (ex.: "${casaNome(cand[0].de)} ${casaNome(cand[0].para)}")` };
}
