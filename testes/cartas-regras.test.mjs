// Regras da mesa de cartas (truco, uno, 21 e cacheta): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baralhoTruco, forcaTruco, MANILHAS,
  baralhoUno, podeJogarUno, coringa, falaUno,
  embaralhar,
  baralho21, soma21, apostaBase21, aposta21, meta21, sortearTrunfo21, TRUNFOS_21, MAX_21,
  baralhoCacheta, lerCacheta, curingaDe, ehCuringa, nomeCuringa, bateCacheta, arranjoCacheta, comoBaterCacheta,
  arquivoVoz, naVozDe, frasesFaladas,
} from '../public/js/cartas-regras.js';

test('truco: baralho de 27 cartas sem repetir, com as 4 manilhas', () => {
  const b = baralhoTruco();
  assert.equal(b.length, 27);
  assert.equal(new Set(b).size, 27);
  for (const m of MANILHAS) assert.ok(b.includes(m), m);
});

test('truco: zap > copas > espadilha > pica-fumo > 3 > 2 > A > K > J > Q', () => {
  const ordem = ['4p', '7c', 'Ae', '7o', '3o', '2c', 'Ao', 'Kp', 'Je', 'Qc'];
  for (let i = 1; i < ordem.length; i++) assert.ok(forcaTruco(ordem[i - 1]) > forcaTruco(ordem[i]), `${ordem[i - 1]} > ${ordem[i]}`);
  assert.equal(forcaTruco('3o'), forcaTruco('3e')); // fora as manilhas, o naipe não desempata
});

test('uno: 108 cartas, 8 coringas', () => {
  const b = baralhoUno();
  assert.equal(b.length, 108);
  assert.equal(b.filter(coringa).length, 8);
});

test('uno: joga pela cor, pelo símbolo ou coringa', () => {
  assert.ok(podeJogarUno('r5', 'b5', 'b')); // mesmo número
  assert.ok(podeJogarUno('b9', 'b5', 'b')); // mesma cor
  assert.ok(!podeJogarUno('r9', 'b5', 'b'));
  assert.ok(podeJogarUno('W4', 'b5', 'b'));
  assert.ok(podeJogarUno('gP2', 'rP2', 'r')); // +2 em cima de +2
  assert.ok(podeJogarUno('y3', 'W', 'y')); // depois do coringa vale a cor escolhida
  assert.ok(!podeJogarUno('g3', 'W', 'y'));
  assert.equal(falaUno('b7'), '7 azul');
  assert.equal(falaUno('W4'), 'Mais quatro!');
});

test('embaralhar mantém as cartas e usa o sorteio passado', () => {
  const b = baralhoUno();
  const e = embaralhar([...b]);
  assert.deepEqual([...e].sort(), [...b].sort());
  let s = 1;
  const sorteio = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const um = embaralhar([...b], sorteio);
  s = 1;
  assert.deepEqual(embaralhar([...b], sorteio), um);
});

test('21: baralho de 1 a 11, soma com número ou carta', () => {
  assert.deepEqual(baralho21(), Array.from({ length: MAX_21 }, (_, i) => i + 1));
  assert.equal(soma21([10, 'n7', 'n4']), 21);
  assert.equal(soma21(['verso']), 0);
});

test('21: aposta base sobe a cada 3 rodadas; trunfos mexem na aposta e na meta', () => {
  assert.deepEqual([1, 2, 3, 4, 6, 7].map(apostaBase21), [1, 1, 1, 2, 2, 3]);
  const vazia = [[], []];
  assert.equal(aposta21(vazia, 0, 1), 1);
  assert.equal(meta21(vazia), 21);
  // a última meta posta é a que vale
  const metas = Object.keys(TRUNFOS_21).filter((k) => /^meta\d+$/.test(k));
  if (metas.length >= 2) {
    const mesa = [[{ c: metas[0], n: 1 }], [{ c: metas[1], n: 2 }]];
    assert.equal(meta21(mesa), Number(metas[1].slice(4)));
  }
  if (TRUNFOS_21.tudo) assert.equal(aposta21([[{ c: 'tudo', n: 1 }], []], 0, 1), 2);
});

test('21: sorteio de trunfo não repete trunfo único que a pessoa já tem', () => {
  const unicos = Object.entries(TRUNFOS_21).filter(([, t]) => t.unico).map(([k]) => k);
  for (let i = 0; i < 300; i++) {
    const t = sortearTrunfo21(Math.random, unicos);
    assert.ok(TRUNFOS_21[t], t);
    assert.ok(!unicos.includes(t), t);
  }
});

test('cacheta: 104 cartas (dois baralhos) e o curinga é o seguinte da vira, na mesma cor', () => {
  const b = baralhoCacheta();
  assert.equal(b.length, 104);
  assert.equal(new Set(b).size, 104);
  assert.deepEqual(lerCacheta('10e1'), { v: 10, n: 'e' });
  const cur = curingaDe('8o0'); // vira 8♦: curinga são os 9 vermelhos
  assert.deepEqual(cur, { v: 9, vermelho: true });
  assert.ok(ehCuringa('9c1', cur));
  assert.ok(!ehCuringa('9p0', cur));
  assert.equal(nomeCuringa(cur), 'os 9 vermelhos');
  assert.deepEqual(curingaDe('Ke0'), { v: 1, vermelho: false }); // depois do rei vem o ás
  assert.equal(nomeCuringa(curingaDe('Jc0')), 'as damas vermelhas');
});

test('cacheta: trinca, sequência e o curinga tapando buraco', () => {
  const semCuringa = curingaDe('Ko0'); // ases vermelhos: nenhum nesta mão
  // trinca de 7 + sequência 4-5-6 de espadas + sequência Q-K-A de paus
  const mao = ['7o0', '7e0', '7p0', '4e0', '5e0', '6e0', 'Qp0', 'Kp0', 'Ap1'];
  assert.ok(bateCacheta(mao, semCuringa));
  // trinca com dois naipes iguais não vale
  assert.equal(bateCacheta(['7o0', '7o1', '7e0'], semCuringa), null);
  // o curinga (9 vermelho) completa 4-?-6 de espadas
  const cur = curingaDe('8o0');
  assert.ok(bateCacheta(['4e0', '9c0', '6e0'], cur));
  const a = arranjoCacheta(['4e0', '5e0', '6e0', 'Kp0'], semCuringa);
  assert.deepEqual(a.soltas, ['Kp0']);
});

test('cacheta: com 10 na mão, diz qual descarte bate', () => {
  const semCuringa = curingaDe('Ko0');
  const mao = ['7o0', '7e0', '7p0', '4e0', '5e0', '6e0', 'Qp0', 'Kp0', 'Ap1', '2c0'];
  const { descartes } = comoBaterCacheta(mao, semCuringa);
  assert.deepEqual(descartes, ['2c0']);
});

test('vozes: arquivo estável por frase e lugar, feminino nos lugares ímpares', () => {
  assert.equal(arquivoVoz('Truco!', 0), arquivoVoz('Truco!', 4)); // 4 usa a voz do 0
  assert.notEqual(arquivoVoz('Truco!', 0), arquivoVoz('Truco!', 1));
  assert.match(arquivoVoz('Truco!', 2), /^\/audio\/cartas\/2-[0-9a-f]{8}\.mp3$/);
  assert.equal(naVozDe('Tô armado!', 1), 'Tô armada!');
  assert.equal(naVozDe('Tô armado!', 2), 'Tô armado!');
  assert.ok(frasesFaladas(0).length > frasesFaladas(2).length); // o 21 só fala nos lugares 0 e 1
});
