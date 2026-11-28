// Teclado e mouse do PC num jogo de controle (layouts PS5 e Switch, virtual: true). O emulador de
// Switch e o chiaki-ng só escutam o controle: o mouse de verdade andando no PC de quem compartilha
// não entrava no jogo (e o cursor do Windows saía passeando pela tela de lá). Aqui eles viram a
// fonte "teclado" do controle virtual (pad-virtual.js), como o toque faz no celular:
//
//   WASD: analógico esquerdo        mouse: analógico direito (pela velocidade)
//   (o layout de teclado e mouse mais usado, o dos adaptadores e dos jogos de PlayStation no PC)
//   clique direito: L2/ZL (mirar)   clique esquerdo: R2/ZR (atirar)   rodinha: △ (trava; o próximo dente solta)
//   Espaço/Enter: ✕   C/Ctrl/⌫: ○   R: □   F: △ (pela posição: no Switch, B A Y X)
//   Tab e Mouse 4: L1/L   E e Mouse 5: R1/R   Shift: L3 (correr)   V e meio: R3
//   Q: −   Esc: +  (só no Switch; no PS5 o Create e o Options saíram do mapa)   H: PS/Home   M: mapa (PS5)   N: clique do touchpad   setas e 1 2 3 4: direcional
//   Alt segurado: o mouse vira um dedo no touchpad (encosta no meio ao descer o Alt, sai ao soltar);
//   Alt + clique esquerdo afunda o touchpad. O touchpad só chega no PS5 direto (a ponte); o controle
//   de Xbox (emulador, chiaki-ng) não tem.
//   J (só no PS5): liga/desliga a inclinação — o mouse inclina o controle em vez de mexer a câmera,
//   no lugar do giroscópio do DualSense (a nave do Astro Bot se pilota inclinando o controle). Mouse
//   para os lados: o controle tomba para o lado; para frente/trás: a frente desce/sobe. A inclinação
//   fica onde o mouse deixou (até GIRO_MAX); J de novo: o controle volta deitado e o mouse, para a
//   câmera. Também só chega no PS5 direto (movimento.js, o campo m do controle virtual).
//
// Isso é o padrão: quem joga troca qualquer tecla no painel "Mapear teclas" (mapa-teclas.js, nas
// Opções do modo jogo) e o que vale aqui é sempre o mapa de lá.
//
// Tecla sem ação no mapa continua indo como tecla (F11 do emulador, por exemplo). O mouse vai todo
// para o controle (botão do mouse sem ação não faz nada).

import { Fusao, inclinado } from './movimento.js';
import { mapaTeclas, EIXO, MOUSE, ENTRA_CARRO } from './mapa-teclas.js';

// roda: TRAVA o botão. Um dente para baixo aperta □ (para cima △) e deixa apertado; o próximo dente,
// para qualquer lado, solta. A roda só manda pulsos, não dá para "segurar" nela — antes o botão soltava
// 150 ms depois do último dente e só ficava apertado rolando sem parar. Dentes seguidos (menos de
// RODA_PAUSA_MS entre um e outro) contam como um gesto só: rolar dois dentes sem querer não destrava.
const RODA_PAUSA_MS = 250;
// touchpad pelo mouse (Alt segurado): quantos pixels de mouse atravessam o touchpad de ponta a ponta
const TP_LARGURA_PX = 800;
const TP_ALTURA_PX = 450;
const TP_CLIQUE = 17;

// inclinação pelo mouse (G): graus por pixel (× a sensibilidade das opções), o máximo para cada lado
// e a velocidade de volta ao deitado (graus por segundo) quando desliga
const GIRO_GRAUS_PX = 0.12;
const GIRO_MAX = 75;
const GIRO_VOLTA = 300;

// O mouse vira o analógico pela velocidade: soma o que andou na última JANELA_MS e, a VEL_CHEIA
// px/ms, o analógico vai até o fim. Raiz na curva: mirar devagar ainda mexe a câmera.
// 24 ms (eram 40): o analógico parava/arrancava 40 ms depois do mouse. 24 ainda pega 3 relatórios de
// um mouse sem fio de 125 Hz, sem a câmera tremer.
const JANELA_MS = 24;
const TICK_MS = 8;
const VEL_CHEIA = 1.6;
// Toque rápido numa tecla (ou o Esc que solta o ponteiro, que desce e sobe junto): o botão fica
// apertado pelo menos MIN_MS, senão o emulador podia nem ver.
const MIN_MS = 60;

export class TecladoPad {
  // sens(): a sensibilidade do mouse escolhida nas opções do modo jogo (1 = VEL_CHEIA)
  // aviso(texto): um recado curto para quem joga (ligou/desligou a inclinação)
  // onCarro(sim): o modo carro trocou (modo-carro.js mostra a pé / no carro o tempo todo)
  constructor({ pad, sens = () => 1, aviso = () => {}, onCarro = () => {} }) {
    this.pad = pad;
    this.sens = sens;
    this.aviso = aviso;
    this.onCarro = onCarro;
    this.ativo = false;
    this.layout = null;
    this.carro = false; // no modo carro (mapa-teclas.js): a camada do carro vale por cima do mapa
    // só sai no △: o △ a pé não entra no modo carro (quem entra é a página, quando vê o carro no jogo:
    // o /jogar com o quadro do motor e da gasolina do GTA). No carro, o △ volta a pé.
    this.soSaiNoTriangulo = false;
    this.zerar();
  }

  // as teclas do carro valem agora? (no modo 'sempre' do mapa, o tempo todo)
  noCarro() {
    return mapaTeclas.modoCarro() === 'sempre' || (this.carro && mapaTeclas.carroTroca());
  }

  // as ações de uma entrada agora (a pé ou no carro; no carro o W são duas: acelerar e andar)
  acoesDe(entrada) {
    return mapaTeclas.acoes(entrada, this.noCarro());
  }

  // aperta/solta todas; true se alguma virou controle
  acionarTodas(quem, ids, desce) {
    let foi = false;
    for (const id of ids) foi = this.acionar(quem, id, desce) || foi;
    return foi;
  }

  // uma tecla/botão do mouse desceu ou subiu: a subida solta o que a descida apertou (mesmo que o
  // modo tenha trocado no meio). O △ que desce troca o modo carro, se ele está ligado nas opções.
  entrada(quem, ent, desce) {
    // a tecla só de troca (' no padrão): troca o modo e não aperta nada no jogo
    if (mapaTeclas.trocaCarro(ent)) {
      if (desce && !this.trocaSegura.has(quem) && !this.pad.treino) this.trocarCarro();
      if (desce) this.trocaSegura.add(quem);
      else this.trocaSegura.delete(quem);
      return true;
    }
    const antes = this.seguras.get(quem);
    // a repetição da tecla segurada fica com o que a descida apertou
    const ids = antes ? antes.ids : this.acoesDe(ent);
    if (!desce) {
      this.seguras.delete(quem);
      return this.acionarTodas(quem, ids, false);
    }
    if (ids.length) this.seguras.set(quem, { ent, ids });
    const foi = this.acionarTodas(quem, ids, true);
    // no tutorial (treino) o botão não chega no jogo: não entrou em carro nenhum
    if (!antes && ids.includes(ENTRA_CARRO) && mapaTeclas.carroTroca() && !this.pad.treino && (this.carro || !this.soSaiNoTriangulo)) this.trocarCarro();
    return foi;
  }

  // entra/sai do modo carro: as teclas seguradas passam para a ação do modo novo (o W segurado ao
  // sair do carro solta o R2 e volta a andar)
  trocarCarro(sim = !this.carro) {
    if (this.carro === sim) return;
    this.carro = sim;
    this.onCarro(sim);
    for (const [quem, s] of [...this.seguras]) {
      const novas = this.acoesDe(s.ent);
      // o que vale nos dois modos (o andar do W) continua apertado, sem soltar no meio
      this.acionarTodas(quem, s.ids.filter((id) => !novas.includes(id)), false);
      this.acionarTodas(quem, novas.filter((id) => !s.ids.includes(id)), true);
      if (novas.length) this.seguras.set(quem, { ent: s.ent, ids: novas });
      else this.seguras.delete(quem);
    }
  }

  zerar() {
    clearInterval(this.tick);
    this.tick = 0;
    clearInterval(this.giroTick);
    this.giroTick = 0;
    if (this.giro) this.pad.movimento?.('teclado', null);
    this.giro = null; // a inclinação pelo mouse (G): { ligado, r, p, dr, dp, t, fusao }
    this.gSegurado = new Set(); // as entradas da inclinação seguradas (a tecla segurada repete o "down")
    this.altSegura = new Set(); // as entradas do touchpad seguradas
    for (const t of this.timers?.values() || []) clearTimeout(t);
    this.rodaUlt = 0; // quando veio o último dente da roda
    this.rodaB = 0; // o bit do botão que a roda está travando agora
    if (this.dedo) this.pad.touchpad(null);
    this.dedo = null; // {x, y} de 0 a 1: o dedo no touchpad enquanto o Alt está segurado
    this.cliqueTp = null; // o botão do mouse que afundou o touchpad (o "up" dele solta o touchpad)
    this.timers = new Map(); // botão -> soltura adiada (MIN_MS)
    this.desceu = new Map(); // botão -> quando desceu
    this.trocaSegura = new Set(); // as teclas de troca do modo carro seguradas (a repetição não troca de novo)
    this.seguras = new Map(); // tecla/botão do mouse segurado -> { ent: a entrada, ids: as ações que apertou }
    this.fontes = new Map(); // botão -> quantas teclas/botões o seguram (Shift esq. e dir.)
    this.eixos = new Map(); // direção do analógico (ly-, rx+...) -> as entradas que seguram
    this.b = 0;
    this.mov = []; // [t, dx, dy] da última JANELA_MS
    this.rx = 0;
    this.ry = 0;
  }

  // layout: 'ps5' ou 'switch' (o G da inclinação só vale no PS5; no Switch ele vai como tecla)
  ligar(layout = null) {
    this.layout = layout;
    if (this.ativo) return;
    this.zerar();
    this.carro = false;
    this.ativo = true;
    this.onCarro(false);
  }

  desligar() {
    if (!this.ativo) return;
    this.ativo = false;
    this.carro = false;
    this.onCarro(false);
    this.zerar();
    this.pad.soltar('teclado');
  }

  soltarTudo() {
    if (!this.ativo) return;
    this.zerar();
    this.pad.soltar('teclado');
  }

  // um evento do controle.js (mandar/moverJogo): true se virou controle e não vai como tecla/mouse
  evento(ev) {
    if (!this.ativo) return false;
    if (ev.t === 'mouse') {
      if (ev.a === 'move') {
        if (ev.dx !== undefined) this.mover(ev.dx, ev.dy);
      } else {
        // o clique que prende o mouse de novo (depois de um Esc) não aperta nada
        if (ev.a === 'down' && !document.pointerLockElement) return true;
        const quem = `m:${ev.b}`;
        // Alt + clique esquerdo: afunda o touchpad em vez do R2 (vale até soltar o clique)
        if (ev.a === 'down' && this.dedo && ev.b === 'left') {
          this.cliqueTp = quem;
          this.botao(quem, TP_CLIQUE, true);
          return true;
        }
        if (ev.a === 'up' && this.cliqueTp === quem) {
          this.cliqueTp = null;
          this.botao(quem, TP_CLIQUE, false);
          return true;
        }
        const ent = MOUSE[ev.b];
        if (ent) this.entrada(quem, ent, ev.a === 'down');
      }
      return true;
    }
    if (ev.t === 'wheel') {
      if (ev.dy && document.pointerLockElement) {
        const id = mapaTeclas.acao(ev.dy > 0 ? 'RodaBaixo' : 'RodaCima');
        if (/^b\d+$/.test(id || '')) this.roda(Number(id.slice(1)));
      }
      return true;
    }
    if (ev.t !== 'tecla') return false;
    return this.entrada(ev.code, ev.code, ev.a === 'down');
  }

  // a entrada (tecla ou botão do mouse) desceu/subiu e faz a ação id do mapa. false: não virou controle
  acionar(quem, id, desce) {
    if (!id) return false;
    if (id === 'tp') {
      if (desce) this.altSegura.add(quem);
      else this.altSegura.delete(quem);
      this.alt(this.altSegura.size > 0);
      return true;
    }
    // o mapa do PS5 (M no padrão): vai como o Options, que o PC da casa (com o menu travado) troca por
    // "Options + Mapa" e não deixa voltar para a lista do menu (ps5-nativo.js pedirMapa). No Switch: tecla
    if (id === 'mapa') {
      if (this.layout !== 'ps5') return false;
      this.botao(quem, 9, desce);
      return true;
    }
    // Create e Options saíram do mapa do PS5 (travados como o PS; o dono aperta pelo painel): a tecla não
    // vira botão nem vai como tecla para o PC
    if ((id === 'b8' || id === 'b9') && this.layout === 'ps5') return true;
    if (id === 'giro') {
      // só no PS5; no Switch a tecla vai como tecla
      if (this.layout !== 'ps5') return false;
      if (desce && !this.gSegurado.has(quem)) this.alternarGiro();
      if (desce) this.gSegurado.add(quem);
      else this.gSegurado.delete(quem);
      return true;
    }
    if (EIXO[id]) {
      const segura = this.eixos.get(id) || new Set();
      if (desce) segura.add(quem);
      else segura.delete(quem);
      this.eixos.set(id, segura);
      this.enviar();
      return true;
    }
    const m = /^b(\d+)$/.exec(id);
    if (!m) return false;
    this.botao(quem, Number(m[1]), desce);
    return true;
  }

  botao(quem, i, desce) {
    const segura = this.fontes.get(i) || new Set();
    if (desce) segura.add(quem);
    else segura.delete(quem);
    this.fontes.set(i, segura);
    const bit = 1 << i;
    // A roda está travando este botão (no padrão a roda e o F são o △): o △ já estava apertado e o F
    // não fazia nada até outro dente da roda ou sair e entrar no modo jogo. Destrava, solta o △ lá
    // (o PS5 precisa ver ele subir) e aperta de novo MIN_MS depois, como um toque de verdade.
    if (desce && this.rodaB & bit) {
      this.rodaB = 0;
      this.b &= ~bit;
      this.enviar();
      this.pad.enviar?.(); // sai já, sem juntar com o aperto que vem logo atrás
      clearTimeout(this.timers.get(i));
      this.timers.set(i, setTimeout(() => {
        this.timers.delete(i);
        this.desceu.set(i, performance.now());
        this.b |= bit;
        this.enviar();
        // soltou antes do aperto sair: fica o toque curto (MIN_MS) e solta
        if (!this.fontes.get(i)?.size) this.botao(null, i, false);
      }, MIN_MS));
      return;
    }
    if (segura.size) {
      clearTimeout(this.timers.get(i));
      this.timers.delete(i);
      if (!(this.b & bit)) this.desceu.set(i, performance.now());
      this.b |= bit;
      return this.enviar();
    }
    if (!(this.b & bit) || this.timers.has(i)) return;
    const falta = (this.desceu.get(i) || 0) + MIN_MS - performance.now();
    const soltar = () => {
      this.timers.delete(i);
      if (this.fontes.get(i)?.size) return;
      this.b &= ~bit;
      this.enviar();
    };
    if (falta > 0) this.timers.set(i, setTimeout(soltar, falta));
    else soltar();
  }

  // um dente da roda: trava o botão do lado, ou solta o que estava travado
  roda(i) {
    const agora = performance.now();
    const seguido = agora - this.rodaUlt < RODA_PAUSA_MS;
    this.rodaUlt = agora;
    if (seguido) return;
    this.rodaB = this.rodaB ? 0 : 1 << i;
    this.enviar();
  }

  // Alt: encosta o dedo no meio do touchpad (e a câmera para) ou tira o dedo
  alt(desce) {
    if (desce) {
      if (this.dedo) return;
      this.dedo = { x: 0.5, y: 0.5 };
      this.mov = [];
      this.rx = 0;
      this.ry = 0;
      this.enviar();
    } else {
      if (!this.dedo) return;
      this.dedo = null;
      if (this.cliqueTp) {
        this.botao(this.cliqueTp, TP_CLIQUE, false);
        this.cliqueTp = null;
      }
    }
    this.pad.touchpad(this.dedo ? [this.dedo.x, this.dedo.y, -1, -1] : null);
  }

  mover(dx, dy) {
    if (this.dedo) {
      const preso = (v) => Math.min(1, Math.max(0, v));
      this.dedo = { x: preso(this.dedo.x + dx / TP_LARGURA_PX), y: preso(this.dedo.y + dy / TP_ALTURA_PX) };
      this.pad.touchpad([this.dedo.x, this.dedo.y, -1, -1]);
      return;
    }
    if (this.giro?.ligado) {
      // para a direita tomba para a direita (rolagem negativa); para frente, a frente desce
      const k = GIRO_GRAUS_PX * (Number(this.sens()) || 1);
      this.giro.dr -= dx * k;
      this.giro.dp += dy * k;
      return;
    }
    this.mov.push([performance.now(), dx, dy]);
    if (!this.tick) this.tick = setInterval(() => this.medir(), TICK_MS);
    this.medir();
  }

  medir() {
    const agora = performance.now();
    while (this.mov.length && agora - this.mov[0][0] > JANELA_MS) this.mov.shift();
    let sx = 0;
    let sy = 0;
    for (const [, dx, dy] of this.mov) { sx += dx; sy += dy; }
    const cheia = VEL_CHEIA / (Number(this.sens()) || 1);
    const curva = (v) => {
      const a = Math.min(1, Math.abs(v / JANELA_MS) / cheia);
      return Math.sign(v) * Math.round(Math.sqrt(a) * 100) / 100;
    };
    this.rx = curva(sx);
    this.ry = curva(sy);
    if (!this.mov.length) {
      clearInterval(this.tick);
      this.tick = 0;
    }
    this.enviar();
  }

  // G: liga a inclinação (o mouse sai da câmera) ou desliga (o controle volta deitado aos poucos)
  alternarGiro() {
    if (this.giro?.ligado) {
      this.giro.ligado = false;
      this.aviso('Inclinação desligada: o controle volta deitado e o mouse volta para a câmera.');
      return;
    }
    if (!this.giro) this.giro = { r: 0, p: 0, dr: 0, dp: 0, fusao: new Fusao() };
    this.giro.ligado = true;
    this.giro.t = performance.now();
    this.mov = [];
    this.rx = 0;
    this.ry = 0;
    this.enviar();
    if (!this.giroTick) this.giroTick = setInterval(() => this.passoGiro(), TICK_MS);
    this.aviso('Inclinação ligada: o mouse inclina o controle, como o giroscópio do DualSense (só no PS5 direto). G de novo volta para a câmera.');
  }

  // a cada TICK_MS: a inclinação nova → o que o giroscópio e o acelerômetro mediriam → a mesma fusão
  // do DualSense de verdade (movimento.js), para o PS5 ver um controle coerente
  passoGiro() {
    const gi = this.giro;
    if (!gi) return;
    const agora = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (agora - gi.t) / 1000));
    gi.t = agora;
    const preso = (v) => Math.max(-GIRO_MAX, Math.min(GIRO_MAX, v));
    let r = preso(gi.r + gi.dr);
    let p = preso(gi.p + gi.dp);
    gi.dr = 0;
    gi.dp = 0;
    if (!gi.ligado) {
      const volta = GIRO_VOLTA * dt;
      r = Math.sign(r) * Math.max(0, Math.abs(r) - volta);
      p = Math.sign(p) * Math.max(0, Math.abs(p) - volta);
    }
    const { g, a } = inclinado(r, p, (r - gi.r) / dt, (p - gi.p) / dt);
    gi.r = r;
    gi.p = p;
    gi.fusao.passo(g, a, dt);
    if (!gi.ligado && !r && !p) {
      // voltou deitado: para de mandar o movimento (sem ele, a ponte deixa deitado e parado)
      clearInterval(this.giroTick);
      this.giroTick = 0;
      this.giro = null;
      this.pad.movimento?.('teclado', null);
      return;
    }
    this.pad.movimento?.('teclado', gi.fusao.estado());
  }

  enviar() {
    const tem = (id) => (this.eixos.get(id)?.size ? 1 : 0);
    let lx = tem('lx+') - tem('lx-');
    let ly = tem('ly+') - tem('ly-');
    // no carro não: o W também é para frente, e o volante (W + A) viraria só 70%
    if (lx && ly && !this.noCarro()) { lx *= Math.SQRT1_2; ly *= Math.SQRT1_2; }
    // o analógico direito pelo teclado soma com o mouse
    let kx = tem('rx+') - tem('rx-');
    let ky = tem('ry+') - tem('ry-');
    if (kx && ky) { kx *= Math.SQRT1_2; ky *= Math.SQRT1_2; }
    const preso = (v) => Math.max(-1, Math.min(1, v));
    const b = this.b | this.rodaB;
    this.pad.definir('teclado', {
      b, lx, ly, rx: preso(this.rx + kx), ry: preso(this.ry + ky),
      lt: b & (1 << 6) ? 1 : 0, rt: b & (1 << 7) ? 1 : 0,
    });
  }
}
