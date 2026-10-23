// Teste rápido das regras de poker (node scripts/testar-poker.js)
import { novoBaralho, embaralhar, avaliarMao, compararMaos, vencedores } from '../public/js/poker-regras.js';

const C = (id) => ({ n: ({ A: 14, K: 13, Q: 12, J: 11 })[id.slice(0, -1)] || Number(id.slice(0, -1)), s: id.slice(-1) });
const ids = (cartas) => cartas.map((c) => c.id).sort().join(' ');
let falhas = 0;
const testa = (nome, cond) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'}  ${nome}`);
  if (!cond) falhas++;
};

// baralho: 52 cartas únicas
const b = novoBaralho();
testa('baralho tem 52 cartas', b.length === 52 && new Set(b.map((c) => c.id)).size === 52);
embaralhar(b);
testa('embaralhar mantém as 52', b.length === 52 && new Set(b.map((c) => c.id)).size === 52);

// par vs par maior
const parK = avaliarMao(['Kh', 'Kd', '7e', '5p', '2o'].map((x) => C(x.replace('h', 'c'))));
const parA = avaliarMao(['Ae', 'Ao', '7e', '5p', '2o'].map(C));
testa('par de A > par de K', parK.forca === 1 && parA.forca === 1 && compararMaos(parA, parK) === 1);

// kicker: mesmo par, kicker maior ganha
const kickerA = avaliarMao(['Ae', 'Ao', 'Qp', '5p', '2o'].map(C));
const kickerB = avaliarMao(['Ae', 'Ao', 'Jp', '6p', '2o'].map(C));
testa('kicker decide (Q > J)', compararMaos(kickerA, kickerB) === 1);

// flush
const flush = avaliarMao(['2c', '5c', '9c', 'Qc', 'Ac'].map(C));
testa('flush detectado', flush.forca === 5 && flush.nome === 'Flush');

// sequência com As-baixo (A-2-3-4-5)
const roda = avaliarMao(['Ae', '2p', '3c', '4o', '5e'].map(C));
testa('sequência com As-baixo', roda.forca === 4 && roda.tie[0] === 5);
const seq6 = avaliarMao(['2e', '3p', '4c', '5o', '6e'].map(C));
testa('6-alta bate As-baixo', compararMaos(seq6, roda) === 1);

// full house vs flush
const full = avaliarMao(['7e', '7p', '7c', 'Kc', 'Ko'].map(C));
testa('full house > flush', full.forca === 6 && compararMaos(full, flush) === 1);

// quadra
const quadra = avaliarMao(['9e', '9p', '9c', '9o', 'Ac'].map(C));
testa('quadra > full house', quadra.forca === 7 && compararMaos(quadra, full) === 1);

// straight flush
const sf = avaliarMao(['8c', '9c', '10c', 'Jc', 'Qc'].map(C));
testa('straight flush > quadra', sf.forca === 8 && compararMaos(sf, quadra) === 1);

// straight flush com As-baixo
const sfRoda = avaliarMao(['Ac', '2c', '3c', '4c', '5c'].map(C));
testa('straight flush com As-baixo', sfRoda.forca === 8);

// vencedores: split pot
const com = ['Ae', 'Kc', 'Qe', 'Jp', '10c'].map(C); // mesa faz a sequência para os dois
const split = vencedores([{ id: 'a', cartas: ['2p', '3o'].map(C) }, { id: 'b', cartas: ['5p', '7o'].map(C) }], com);
testa('split pot (mesa decide)', split.length === 2 && split.map((s) => s.id).sort().join(',') === 'a,b');

// vencedores: um ganha com par de As, outro só usa a mesa
const com2 = ['Ae', 'Ac', '2c', '7p', '9o'].map(C);
const um = vencedores([{ id: 'a', cartas: ['Ko', '3p'].map(C) }, { id: 'b', cartas: ['5e', '6e'].map(C) }], com2);
testa('par de As na mesa: kicker K decide para a', um.length === 1 && um[0].id === 'a');

// melhor mão de 5 entre 7: straight maior que par
const com3 = ['2c', '3e', '4p', '5o', 'Kc', 'Kd', '9e'].map(C);
const v7 = vencedores([{ id: 'a', cartas: ['Ao', 'Qp'].map(C) }], com3); // 2-3-4-5-A
testa('7 cartas: melhor é As-baixo', v7.length === 1 && avaliarMao([...v7[0].cartas, ...com3]).tie[0] === 5);

// flush e sequência juntos (sem ser straight flush): o flush vale mais
const fs7 = avaliarMao(['4c', '5c', '6e', '7c', '8p', 'Kc', '2c'].map(C));
testa('flush com sequência junto: vale o flush', fs7.forca === 5);

// straight flush com 6 do naipe: a sequência usa as menores (o flush são as 5 maiores)
const sf6 = avaliarMao(['3c', '4c', '5c', '6c', '7c', 'Kc', 'Ae'].map(C));
testa('straight flush com 6 do naipe', sf6.forca === 8 && sf6.tie[0] === 7 && sf6.cartas.every((c) => c.s === 'c'));

console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos os testes passaram');
process.exit(falhas ? 1 : 0);
