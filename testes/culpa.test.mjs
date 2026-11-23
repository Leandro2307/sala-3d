import { test } from 'node:test';
import assert from 'node:assert/strict';
import { culpaDe, contarCulpa, linhaDaCulpa } from '../public/js/culpa.js';

const boa = { turbo: { qps: 60, filaMs: 12, decMs: 0.5 }, sonda: { picos: 0, falhas: 0 }, ritmo: { travadas: [] } };
const la = { captura: 60, enviado: 60, ps5: { manda: 60 }, turbo: { puladosFila: 0 }, sonda: { picos: 0, falhas: 0 } };
const com = (r, l) => culpaDe({ ...boa, ...r, turbo: { ...boa.turbo, ...r?.turbo } }, l === null ? null : { ...la, ...l });

test('imagem boa: ninguém', () => assert.equal(com({}, {}), null));

test('o PC que transmite recebeu tudo e mandou pouco, com a rede vazia (2026-11-23 14:05): host', () => {
  const c = com({ turbo: { qps: 42, filaMs: 22 } }, { captura: 60, enviado: 43 });
  assert.equal(c.lado, 'host');
  assert.equal(c.onde, 'pc');
  assert.match(c.texto, /43 de 60/);
});

test('poucos quadros vindos do PS5: host', () => {
  assert.equal(com({ turbo: { qps: 40 } }, { captura: 41, enviado: 41 }).onde, 'ps5');
  assert.equal(com({ turbo: { qps: 40 } }, { captura: 41, enviado: 41, ps5: null }).onde, 'captura');
});

test('decodificador lento ou página travada: quem recebe', () => {
  assert.equal(com({ turbo: { qps: 45, decMs: 16 } }, {}).lado, 'voce');
  assert.equal(com({ turbo: { qps: 45, decAtrasou: 2 } }, {}).onde, 'aparelho');
  assert.equal(com({ turbo: { qps: 45 }, pagina: { maiorMs: 900 } }, {}).lado, 'voce');
});

test('rede: a sonda com pico diz de que lado; sem pico, o caminho', () => {
  const ruim = { turbo: { qps: 40, filaMs: 200 } };
  assert.equal(com(ruim, { sonda: { picos: 2 } }).lado, 'host');
  assert.equal(com({ ...ruim, sonda: { picos: 1 } }, {}).lado, 'voce');
  assert.equal(com(ruim, {}).onde, 'caminho');
  assert.equal(com({ ...ruim, sonda: { falhas: 1 } }, { sonda: { falhas: 1 } }).onde, 'os-dois');
  assert.equal(com(ruim, null).onde, 'sem-noticia');
  // pulou pela fila cheia: é rede, e não o PC
  assert.equal(com({ turbo: { qps: 40 } }, { enviado: 41, turbo: { puladosFila: 20 } }).lado, 'caminho');
});

test('a conta da sessão e a linha do selo', () => {
  const contas = {};
  contarCulpa(contas, null);
  contarCulpa(contas, { lado: 'host', texto: 'x' });
  contarCulpa(contas, { lado: 'host', texto: 'x' });
  contarCulpa(contas, { lado: 'caminho', texto: 'x' });
  assert.deepEqual(contas, { total: 4, host: 2, caminho: 1 });
  assert.match(linhaDaCulpa({ lado: 'host', texto: 'abc' }, contas), /culpa: HOST \(abc\).*host 67%, você 0%, internet 33%/);
  assert.match(linhaDaCulpa(null, {}), /tudo certo$/);
});

test('o ping do roteador separa o Wi-Fi do PC que transmite da internet', () => {
  const ruim = { turbo: { qps: 40, filaMs: 200 } };
  assert.equal(com(ruim, { roteador: { n: 20, max: 180, falhas: 0 } }).onde, 'wifi');
  assert.equal(com(ruim, { roteador: { n: 18, max: 9, falhas: 2 } }).lado, 'host');
  assert.equal(com(ruim, { roteador: { n: 20, max: 8, falhas: 0 } }).onde, 'caminho');
  assert.equal(com(ruim, { roteador: { n: 0, max: null, falhas: 20 } }).onde, 'caminho'); // não responde a ping
});

test('TV: decodificador lento no vídeo normal, e a imagem parada (a Philips, 2026-11-23)', () => {
  const tv = { turbo: null, fpsFinal: 57, decMs: 27, bufferMs: 570, sonda: null };
  assert.equal(culpaDe(tv, la, 'a TV').lado, 'voce');
  assert.match(culpaDe(tv, la, 'a TV').texto, /^a TV: o decodificador/);
  assert.equal(culpaDe({ ...tv, fpsFinal: null, parou: true }, la, 'a TV').onde, 'parou');
  assert.equal(culpaDe({ ...tv, decMs: 0.2, bufferMs: 60 }, la, 'a TV'), null);
});
