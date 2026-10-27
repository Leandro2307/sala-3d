// Regras do jogo da velha 2 (a "super velha") e o adversário de computador.
// O tabuleiro grande é uma velha de 9 velhinhas, cada uma com 9 casas: 81 casas, de a1 a i9.
// Casa = linha * 9 + coluna (linha 0 = fileira 1, coluna 0 = "a"). Peças 'x' (começa) e 'o'.
// A casa em que se joga dentro da velhinha manda o adversário para a velhinha na mesma posição do
// tabuleiro grande (jogou no canto de cima à direita: ele joga na velhinha de cima à direita). Se
// ela já fechou — alguém fez três em linha nela ou encheu —, ele joga em qualquer uma aberta.
// Ganha quem fechar três velhinhas em linha.
// A interface é a mesma de xadrez.js/dama.js, para jogos.js e o servidor tratarem igual.

const LINHAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const PECA = { w: 'x', b: 'o' };
const COLUNAS = 'abcdefghi';

// velhinha de cada casa (0..8, na mesma ordem das casas de uma velha) e a posição da casa nela
const VEL = Array.from({ length: 81 }, (_, i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));
const POS = Array.from({ length: 81 }, (_, i) => (Math.floor(i / 9) % 3) * 3 + (i % 3));
// as 9 casas de cada velhinha, na ordem das posições
export const CASAS = Array.from({ length: 9 }, (_, v) => Array.from({ length: 9 }, (_, p) => (Math.floor(v / 3) * 3 + Math.floor(p / 3)) * 9 + (v % 3) * 3 + (p % 3)));
// as linhas que passam por cada posição (para conferir só elas depois de um lance)
const LINHAS_DA = Array.from({ length: 9 }, (_, p) => LINHAS.filter((l) => l.includes(p)));

export const velhinhaDe = (i) => VEL[i];
export const casaNome = (i) => COLUNAS[i % 9] + (Math.floor(i / 9) + 1);
// "d4–f6": os cantos da velhinha, como estão escritos na beira do tabuleiro
export const nomeVelhinha = (v) => `${casaNome(CASAS[v][0])}–${casaNome(CASAS[v][8])}`;

export function novo() {
  // g: como ficou cada velhinha (null aberta, 'x'/'o' ganha, '=' deu velha); alvo: onde a vez joga
  // (-1 = em qualquer velhinha aberta)
  return { b: new Array(81).fill(null), g: new Array(9).fill(null), alvo: -1, vez: 'w', n: 0 };
}

function tresEmLinha(x) {
  for (const l of LINHAS) if ((x[l[0]] === 'x' || x[l[0]] === 'o') && x[l[0]] === x[l[1]] && x[l[0]] === x[l[2]]) return l;
  return null;
}

// as velhinhas em que a vez pode jogar
export function velhinhasDaVez(st) {
  if (st.alvo >= 0 && !st.g[st.alvo]) return [st.alvo];
  const out = [];
  for (let v = 0; v < 9; v++) if (!st.g[v]) out.push(v);
  return out;
}

export function legais(st) {
  if (tresEmLinha(st.g)) return [];
  const out = [];
  for (const v of velhinhasDaVez(st)) for (const i of CASAS[v]) if (!st.b[i]) out.push({ casa: i, p: PECA[st.vez] });
  return out;
}

export function aplicar(st, m) {
  const b = st.b.slice();
  const g = st.g.slice();
  b[m.casa] = m.p;
  const v = VEL[m.casa];
  if (!g[v]) {
    const pequena = CASAS[v].map((i) => b[i]);
    if (tresEmLinha(pequena)) g[v] = m.p;
    else if (pequena.every(Boolean)) g[v] = '=';
  }
  const pos = POS[m.casa];
  return { b, g, alvo: g[pos] ? -1 : pos, vez: st.vez === 'w' ? 'b' : 'w', n: st.n + 1 };
}

export function situacao(st) {
  const linha = tresEmLinha(st.g);
  if (linha) return { fim: true, vencedor: st.g[linha[0]] === 'x' ? 'w' : 'b', motivo: 'Três velhinhas em linha', linha };
  if (st.g.every(Boolean)) return { fim: true, vencedor: null, motivo: 'Deu velha nas nove — empate' };
  return { fim: false };
}

export const paraTexto = (m) => casaNome(m.casa);
export function deTexto(st, s) {
  return legais(st).find((m) => casaNome(m.casa) === s) || null;
}
export function descrever(st, m) {
  const v = VEL[m.casa];
  const depois = aplicar(st, m);
  const P = m.p.toUpperCase();
  let frase = `${P} em ${casaNome(m.casa)}`;
  if (!st.g[v] && depois.g[v] === '=') frase += ` — deu velha na ${nomeVelhinha(v)}`;
  else if (!st.g[v] && depois.g[v]) frase += ` — ${P} fechou a velhinha ${nomeVelhinha(v)}`;
  return frase;
}

// por que a casa não vale agora (ou null, se vale)
export function porQue(st, i) {
  if (st.b[i]) return 'Essa casa já está ocupada.';
  const vs = velhinhasDaVez(st);
  if (vs.includes(VEL[i])) return null;
  if (st.g[VEL[i]]) return 'Essa velhinha já fechou. Jogue numa aberta.';
  return `Agora é na velhinha ${nomeVelhinha(vs[0])}, a que está acesa.`;
}

// ------------------------------------------------------------------ comando falado ou digitado
const LETRA = { a: 'a', 'á': 'a', b: 'b', 'bê': 'b', be: 'b', c: 'c', 'cê': 'c', ce: 'c', se: 'c', d: 'd', 'dê': 'd', de: 'd', e: 'e', 'é': 'e', 'ê': 'e', f: 'f', efe: 'f', g: 'g', 'gê': 'g', ge: 'g', je: 'g', h: 'h', 'agá': 'h', aga: 'h', i: 'i', 'í': 'i' };
const NUM = { um: '1', uma: '1', dois: '2', duas: '2', 'três': '3', tres: '3', quatro: '4', cinco: '5', seis: '6', sete: '7', oito: '8', nove: '9' };

// "ê cinco", "E 5", "e5": as casas citadas, em ordem
function casasNoTexto(txt) {
  const t = txt.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const pal = t.split(' ').flatMap((w) => {
    const m = /^([a-i])([1-9])$/.exec(w);
    return m ? [m[1], m[2]] : [w];
  });
  const casas = [];
  for (let k = 0; k < pal.length - 1; k++) {
    const l = LETRA[pal[k]];
    const n = /^[1-9]$/.test(pal[k + 1]) ? pal[k + 1] : NUM[pal[k + 1]];
    if (l && n) {
      casas.push((Number(n) - 1) * 9 + COLUNAS.indexOf(l));
      k++;
    }
  }
  return casas;
}

// Transforma o comando num lance legal. Devolve { lance } ou { erro }. "Meio"/"centro" é o meio da
// velhinha em que a vez tem de jogar (ou o meio do tabuleiro, com a jogada livre).
export function interpretar(st, texto) {
  const t = texto.toLowerCase();
  let casa;
  if (/\b(meio|centro)\b/.test(t)) {
    const vs = velhinhasDaVez(st);
    casa = CASAS[vs.length === 1 ? vs[0] : 4][4];
  } else {
    const casas = casasNoTexto(t);
    if (!casas.length) return { erro: 'Diga uma casa de a1 a i9 (ex.: "e5" é o meio do tabuleiro).' };
    casa = casas[casas.length - 1];
  }
  const m = legais(st).find((x) => x.casa === casa);
  return m ? { lance: m } : { erro: porQue(st, casa) || 'Essa casa não vale agora.' };
}

// ------------------------------------------------------------------ computador
// Busca em árvore de Monte Carlo: joga muitas partidas aleatórias a partir de cada lance e fica
// com o que mais deu certo. A super velha tem posições demais para o minimax ir até o fim, e as
// partidas aleatórias acham bem o que importa (velhinha que fecha, mandar o outro para onde ele
// ganha). Na simulação o tabuleiro é de números: 0 vazio, 1 X, 2 O; nas velhinhas 3 = deu velha.
function simDe(st) {
  const b = new Int8Array(81);
  const cheias = new Int8Array(9);
  for (let i = 0; i < 81; i++) {
    if (!st.b[i]) continue;
    b[i] = st.b[i] === 'x' ? 1 : 2;
    cheias[VEL[i]]++;
  }
  const g = new Int8Array(9);
  for (let v = 0; v < 9; v++) g[v] = { x: 1, o: 2, '=': 3 }[st.g[v]] || 0;
  return { b, g, cheias, alvo: st.alvo, vez: st.vez === 'w' ? 1 : 2, fim: 0 };
}

function simCopia(s) {
  return { b: s.b.slice(), g: s.g.slice(), cheias: s.cheias.slice(), alvo: s.alvo, vez: s.vez, fim: s.fim };
}

// põe em "out" as casas que a vez pode jogar; devolve quantas
function simLegais(s, out) {
  let k = 0;
  if (s.alvo >= 0 && !s.g[s.alvo]) {
    for (const i of CASAS[s.alvo]) if (!s.b[i]) out[k++] = i;
    return k;
  }
  for (let v = 0; v < 9; v++) {
    if (s.g[v]) continue;
    for (const i of CASAS[v]) if (!s.b[i]) out[k++] = i;
  }
  return k;
}

// joga e marca s.fim (1 X ganhou, 2 O ganhou, 3 empate)
function simJogar(s, i) {
  const p = s.vez;
  s.b[i] = p;
  const v = VEL[i];
  const pos = POS[i];
  s.cheias[v]++;
  const casas = CASAS[v];
  let ganhou = false;
  for (const l of LINHAS_DA[pos]) {
    if (s.b[casas[l[0]]] === p && s.b[casas[l[1]]] === p && s.b[casas[l[2]]] === p) {
      ganhou = true;
      break;
    }
  }
  if (ganhou) {
    s.g[v] = p;
    for (const l of LINHAS_DA[v]) {
      if (s.g[l[0]] === p && s.g[l[1]] === p && s.g[l[2]] === p) {
        s.fim = p;
        break;
      }
    }
  } else if (s.cheias[v] === 9) s.g[v] = 3;
  if (!s.fim && s.g[v]) {
    let abertas = 0;
    for (let k = 0; k < 9; k++) if (!s.g[k]) abertas++;
    if (!abertas) s.fim = 3;
  }
  s.alvo = s.g[pos] ? -1 : pos;
  s.vez = 3 - p;
}

const _lista = new Int16Array(81);

function mcts(st, iteracoes, prazoMs) {
  const raiz0 = simDe(st);
  const filhosDe = (s) => {
    if (s.fim) return [];
    const k = simLegais(s, _lista);
    return Array.from(_lista.subarray(0, k));
  };
  // quem: quem jogou o lance que leva ao nó; v: vitórias dele (empate vale meia)
  const raiz = { casa: -1, pai: null, filhos: [], resto: filhosDe(raiz0), n: 0, v: 0, quem: 3 - raiz0.vez };
  const fim = Date.now() + prazoMs;
  for (let it = 0; it < iteracoes; it++) {
    if ((it & 255) === 0 && Date.now() > fim) break;
    const s = simCopia(raiz0);
    let no = raiz;
    // desce pelos lances já abertos, escolhendo pelo UCT
    while (!no.resto.length && no.filhos.length) {
      const ln = Math.log(no.n);
      let melhor = null;
      let nota = -Infinity;
      for (const f of no.filhos) {
        const u = f.v / f.n + 1.2 * Math.sqrt(ln / f.n);
        if (u > nota) {
          nota = u;
          melhor = f;
        }
      }
      no = melhor;
      simJogar(s, no.casa);
    }
    // abre um lance novo
    if (no.resto.length) {
      const k = Math.floor(Math.random() * no.resto.length);
      const casa = no.resto[k];
      no.resto[k] = no.resto[no.resto.length - 1];
      no.resto.pop();
      const quem = s.vez;
      simJogar(s, casa);
      const filho = { casa, pai: no, filhos: [], resto: filhosDe(s), n: 0, v: 0, quem };
      no.filhos.push(filho);
      no = filho;
    }
    // e joga ao acaso até o fim
    while (!s.fim) {
      const k = simLegais(s, _lista);
      simJogar(s, _lista[Math.floor(Math.random() * k)]);
    }
    for (let x = no; x; x = x.pai) {
      x.n++;
      if (s.fim === x.quem) x.v += 1;
      else if (s.fim === 3) x.v += 0.5;
    }
  }
  let melhor = null;
  for (const f of raiz.filhos) if (!melhor || f.n > melhor.n) melhor = f;
  return melhor ? melhor.casa : -1;
}

// nível 0: quase aleatório (só não deixa passar a vitória); 1: pensa pouco e às vezes erra;
// 2: pensa até ~0,8 s (no Worker, fora do quadro)
export function lanceDoComputador(st, nivel = 1) {
  const ms = legais(st);
  if (!ms.length) return null;
  const sorteio = (xs) => xs[Math.floor(Math.random() * xs.length)];
  const s0 = simDe(st);
  const vez = s0.vez;
  const depois = (m) => {
    const s = simCopia(s0);
    simJogar(s, m.casa);
    return s;
  };
  const vitoria = ms.find((m) => depois(m).fim === vez);
  if (vitoria) return vitoria;
  if (nivel === 0) {
    // metade das vezes fecha uma velhinha, se der
    const ganhaVelhinha = ms.filter((m) => depois(m).g[VEL[m.casa]] === vez);
    return ganhaVelhinha.length && Math.random() < 0.5 ? sorteio(ganhaVelhinha) : sorteio(ms);
  }
  if (nivel === 1 && Math.random() < 0.15) return sorteio(ms);
  const casa = nivel === 1 ? mcts(st, 600, 250) : mcts(st, 40000, 800);
  return ms.find((m) => m.casa === casa) || sorteio(ms);
}
