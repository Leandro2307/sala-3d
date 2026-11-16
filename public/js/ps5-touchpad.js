// Touchpad do DualSense de quem joga (PS5 direto). O Gamepad do navegador dá o clique do touchpad
// (botão 17), mas não onde o dedo está. Aqui o controle é lido pelo WebHID (Chrome/Edge no PC, com
// a permissão da pessoa uma vez: depois ele volta sozinho) e os dois dedos vão no estado do controle
// virtual (pad-virtual.js, campo tp), até a ponte do PS5, que os passa ao PS5 como toques de verdade.
//
// Relatório de entrada do DualSense (o mesmo do driver hid-playstation do Linux), contado a partir do
// primeiro byte depois do id: no cabo, id 0x01; no Bluetooth, id 0x31 com um byte a mais na frente
// (o Bluetooth só passa ao relatório completo depois de lido o relatório de recurso 0x05).
//   7-10: botões (byte 9, bit 1: touchpad afundado)
//   32-35 e 36-39: os dois dedos — byte 0: bit 7 = sem dedo; x 12 bits (0-1919), y 12 bits (0-1079)

const SONY = 0x054c;
const DUALSENSE = [0x0ce6, 0x0df2]; // DualSense e DualSense Edge
const FILTROS = DUALSENSE.map((productId) => ({ vendorId: SONY, productId }));
const LARGURA = 1919;
const ALTURA = 1079;

export const temTouchpadHid = () => typeof navigator !== 'undefined' && !!navigator.hid?.requestDevice;
const eDualSense = (d) => d.vendorId === SONY && DUALSENSE.includes(d.productId);

export class Ps5Touchpad {
  constructor({ pad, onMudou }) {
    this.pad = pad;
    this.onMudou = onMudou || (() => {});
    this.dev = null;
    this.ativo = false; // modo jogo numa tela de PS5
    this.ultimo = '';
    this.ler = (e) => this.relatorio(e);
    navigator.hid?.addEventListener?.('disconnect', (e) => {
      if (e.device !== this.dev) return;
      this.dev = null;
      this.pad.touchpad(null);
      this.onMudou();
    });
    navigator.hid?.addEventListener?.('connect', (e) => {
      if (this.ativo && !this.dev && eDualSense(e.device)) this.abrir(e.device).catch(() => {});
    });
  }

  get ligado() { return !!this.dev; }

  // o botão "Usar o touchpad do DualSense" (precisa do clique: o navegador mostra a lista)
  async pedir() {
    if (!temTouchpadHid()) throw new Error('Este navegador não lê o touchpad (precisa do Chrome ou do Edge no PC).');
    const [d] = await navigator.hid.requestDevice({ filters: FILTROS });
    if (!d) return false;
    await this.abrir(d);
    return true;
  }

  // modo jogo no PS5: volta sozinho no controle que já tinha permissão
  async ligar() {
    this.ativo = true;
    if (this.dev || !temTouchpadHid()) return;
    try {
      const d = (await navigator.hid.getDevices()).find(eDualSense);
      if (d && this.ativo) await this.abrir(d);
    } catch { /* sem permissão ainda: fica no botão */ }
  }

  desligar() {
    this.ativo = false;
    this.ultimo = '';
    this.pad.touchpad(null);
  }

  async abrir(d) {
    if (this.dev === d) return;
    if (!d.opened) await d.open();
    // Bluetooth: ler o 0x05 (calibração) põe o controle no relatório completo, com o touchpad
    try { await d.receiveFeatureReport(0x05); } catch { /* no cabo não precisa */ }
    d.addEventListener('inputreport', this.ler);
    this.dev = d;
    this.onMudou();
  }

  relatorio(e) {
    if (!this.ativo) return;
    const v = e.data;
    let o;
    if (e.reportId === 0x01 && v.byteLength >= 40) o = 0;
    else if (e.reportId === 0x31 && v.byteLength >= 41) o = 1;
    else return; // o relatório simples do Bluetooth não tem o touchpad
    const dedo = (i) => {
      if (v.getUint8(o + i) & 0x80) return [-1, -1];
      const b1 = v.getUint8(o + i + 1);
      const b2 = v.getUint8(o + i + 2);
      const b3 = v.getUint8(o + i + 3);
      const x = b1 | ((b2 & 0x0f) << 8);
      const y = (b2 >> 4) | (b3 << 4);
      return [Math.min(1, x / LARGURA), Math.min(1, y / ALTURA)];
    };
    const tp = [...dedo(32), ...dedo(36)].map((n) => (n < 0 ? -1 : Math.round(n * 1000) / 1000));
    const clique = !!(v.getUint8(o + 9) & 0x02);
    // o controle manda ~250 relatórios por segundo: só passa adiante o que mudou
    const chave = tp.join(',') + (clique ? '+' : '');
    if (chave === this.ultimo) return;
    this.ultimo = chave;
    this.pad.touchpad(tp, clique);
  }
}
