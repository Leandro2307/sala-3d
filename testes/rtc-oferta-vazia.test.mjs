// A conexão que ainda não negociou nada (ninguém com voz nem tela) não pode pedir oferta: sem nenhuma seção, o Chrome
// recusa ("max-bundle ... no BUNDLE group") e ela fica com erro de sessão para sempre (rtc.js restartIce): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

// o bastante de um navegador para carregar o rtc.js e usar a conexão
const local = { search: '', origin: 'http://localhost' };
globalThis.window = { location: local, matchMedia: () => ({ matches: false }) };
globalThis.location = local;
globalThis.document = { documentElement: {}, addEventListener() {}, createElement: () => ({}) };
globalThis.requestAnimationFrame = () => 0;
globalThis.MediaStream = class {};
globalThis.setInterval = () => 0; // os vigias rodam à mão aqui
const tempos = [];
const espera = globalThis.setTimeout;
globalThis.setTimeout = (f, ms, ...a) => (ms >= 1000 ? (tempos.push(f), 0) : espera(f, ms, ...a));

// como o Chrome: trocar os servidores ou reiniciar o ICE sem descrição local pede uma negociação na hora
class ConexaoFalsa {
  constructor(config) {
    Object.assign(this, { config, trs: [], canais: 0, localDescription: null, remoteDescription: null, signalingState: 'stable', iceConnectionState: 'new', connectionState: 'new', pedidos: [], estragada: false });
  }
  createDataChannel() { this.canais++; return { readyState: 'connecting' }; }
  getTransceivers() { return this.trs; }
  getConfiguration() { return { ...this.config }; }
  setConfiguration(c) { this.config = c; this.pedidos.push('setConfiguration'); if (!this.localDescription) this.onnegotiationneeded?.(); }
  restartIce() { this.pedidos.push('restartIce'); if (!this.localDescription) this.onnegotiationneeded?.(); }
  // só as seções vivas entram no BUNDLE
  async createOffer() {
    this.pedidos.push('createOffer');
    const vivas = [...this.trs.map((t, i) => (t.parada ? null : i)).filter((i) => i != null), ...(this.canais ? ['dados'] : [])];
    const secoes = this.trs.map((t, i) => `m=video ${t.parada ? 0 : 9} UDP/TLS/RTP/SAVPF 96\r\na=mid:${i}\r\n`).join('');
    return { type: 'offer', sdp: `v=0\r\n${vivas.length ? `a=group:BUNDLE ${vivas.join(' ')}\r\n` : ''}${secoes}${this.canais ? 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:dados\r\n' : ''}` };
  }
  async setLocalDescription(d) {
    if (!/^a=group:BUNDLE/m.test(d?.sdp || '')) { this.estragada = true; throw new Error('max-bundle configured but session description has no BUNDLE group'); }
    this.localDescription = d;
    this.signalingState = 'have-local-offer';
  }
  addTransceiver() { this.trs.push({ sender: {}, receiver: {}, mid: null }); this.onnegotiationneeded?.(); }
  addTrack() { this.addTransceiver(); return {}; }
  close() { this.connectionState = 'closed'; }
  async getStats() { return new Map(); }
}
globalThis.RTCPeerConnection = ConexaoFalsa;

const { RTC } = await import('../public/js/rtc.js');
const ICE = [{ urls: 'stun:stun.exemplo:3478' }, { urls: 'turn:turn.exemplo:3478', username: 'u', credential: 'c' }];
const montar = () => {
  const enviados = [];
  const rtc = new RTC({ on() {}, emit: (ev, m) => enviados.push([ev, m]) }, { iceServers: ICE, onTrack() {} });
  rtc.selfId = 'b';
  const peer = rtc.getPeer('a');
  return { rtc, peer, pc: peer.pc, enviados };
};
const depois = async (rtc, peer, ms) => { peer.nasceuEm -= ms; rtc.vigiar(); await new Promise((r) => espera(r, 5)); };

test('conexão vazia: passados os 3 s do "direto primeiro", nada é pedido e ela não se estraga', async () => {
  const { rtc, peer, pc, enviados } = montar();
  for (let i = 0; i < 5; i++) await depois(rtc, peer, 4000);
  assert.deepEqual(pc.pedidos, []);
  assert.equal(pc.estragada, false);
  assert.equal(enviados.length, 0);
  assert.equal(peer.soStun, true, 'o TURN espera a negociação');
});

test('e a tela que entra depois sai na primeira oferta', async () => {
  const { rtc, peer, pc, enviados } = montar();
  for (let i = 0; i < 5; i++) await depois(rtc, peer, 4000);
  pc.addTransceiver();
  await new Promise((r) => espera(r, 5));
  assert.equal(enviados.filter(([, m]) => m.data?.description?.type === 'offer').length, 1);
  assert.equal(pc.estragada, false);
});

test('a única tela saiu do ar (só seções encerradas): um canal vazio mantém a oferta válida', async () => {
  const { peer, pc, enviados } = montar();
  pc.addTransceiver();
  await new Promise((r) => espera(r, 5));
  Object.assign(pc, { signalingState: 'stable', remoteDescription: { sdp: 'v=0\r\n' } }); // respondida
  pc.trs[0].parada = true;
  for (let i = 0; i < 2; i++) {
    await peer.negociar();
    pc.signalingState = 'stable';
  }
  assert.equal(pc.estragada, false);
  assert.equal(pc.canais, 1, 'um canal só, por mais ofertas que saiam');
  assert.equal(enviados.filter(([, m]) => m.data?.description?.type === 'offer').length, 3);
});

test('com algo negociando, o TURN entra 3 s depois, como antes', async () => {
  const { rtc, peer, pc } = montar();
  pc.addTransceiver();
  await depois(rtc, peer, 1000);
  assert.equal(peer.soStun, true);
  await depois(rtc, peer, 4000);
  assert.equal(peer.soStun, false);
  assert.ok(pc.pedidos.includes('setConfiguration') && pc.pedidos.includes('restartIce'));
  assert.ok([].concat(...pc.config.iceServers.map((s) => s.urls)).some((u) => u.startsWith('turn:')));
});

test('credencial nova do TURN (trocarIce) também não mexe numa conexão vazia', async () => {
  const { rtc, peer, pc } = montar();
  peer.soStun = false;
  rtc.trocarIce(ICE);
  await new Promise((r) => espera(r, 5));
  assert.deepEqual(pc.pedidos, []);
  assert.equal(peer.soStun, true, 'recebe a credencial em liberarTurn, quando houver o que negociar');
});

test('oferta vazia pedida por outro caminho: não é aplicada, e o vigia tenta de novo', async () => {
  const { rtc, peer, pc, enviados } = montar();
  await peer.negociar();
  assert.equal(pc.estragada, false);
  assert.equal(peer.renegociar, true);
  pc.trs.push({ sender: {}, receiver: {}, mid: null }); // sem o aviso do navegador (ele já tinha avisado)
  rtc.vigiar();
  await new Promise((r) => espera(r, 5));
  assert.equal(enviados.filter(([, m]) => m.data?.description?.type === 'offer').length, 1);
});
