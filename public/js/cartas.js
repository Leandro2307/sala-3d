// Truco e Uno nas mesas redondas do salão de jogos do parque. E perto da mesa senta (no primeiro
// lugar livre, ou no de um robô); a câmera fica atrás da sua cadeira e aparece o painel com as suas
// cartas — é só clicar na carta para jogar. "Começar" completa a mesa com robôs. Esc (ou "Sair da
// mesa") levanta; com a partida valendo, um robô assume as suas cartas. Quem só olha vê as cartas
// da rodada no centro da mesa. O servidor (cartas-servidor.js) conduz tudo; as regras são as de
// cartas-regras.js.
import * as THREE from 'three';
import {
  forcaTruco, manilhaDa, valorDe, naipeDe, SIMBOLO, naipeVermelho, NOME_PEDIDO, PASSOS_TRUCO,
  podeJogarUno, coringa, corUno, rotuloUno, HEX_COR, NOME_COR, CORES_UNO,
} from './cartas-regras.js';
import { MESAS_CARTAS } from './parque-dados.js';
import { hud, texturaViva, FONTE } from './hud-jogos.js';

const LUGARES = { truco: 4, uno: 6 };
const R_MESA = 1.15;
const R_CADEIRA = 1.75;
const Y_MESA = 0.85;
const TIMES = ['Nós', 'Eles'];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// onde fica cada cadeira (lugar 0 ao sul, girando para leste)
export function cadeira(m, k) {
  const n = LUGARES[m.jogo];
  const a = -Math.PI / 2 + (k * Math.PI * 2) / n;
  return { x: m.x + Math.cos(a) * R_CADEIRA, z: m.z + Math.sin(a) * R_CADEIRA, a };
}

// ------------------------------------------------------------------ texturas das cartas (com cache)
const _tex = new Map();
const _url = new Map();
const urlCarta = (c) => {
  if (!_url.has(c)) _url.set(c, texturaCarta(c).image.toDataURL());
  return _url.get(c);
};
function texturaCarta(c) {
  if (_tex.has(c)) return _tex.get(c);
  const t = texturaViva(THREE, 128, 180, (ctx, w, h) => desenharCarta(ctx, w, h, c));
  _tex.set(c, t);
  return t;
}
function desenharCarta(ctx, w, h, c) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 14);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (c === 'verso') {
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.roundRect(10, 10, w - 20, h - 20, 10);
    ctx.fill();
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 4;
    ctx.stroke();
    return;
  }
  if (/^[4-7QJKA23][oecp]$/.test(c)) {
    const cor = naipeVermelho(naipeDe(c)) ? '#dc2626' : '#111827';
    ctx.fillStyle = cor;
    ctx.font = FONTE(64);
    ctx.fillText(valorDe(c), w / 2, h * 0.36);
    ctx.font = FONTE(60, 400);
    ctx.fillText(SIMBOLO[naipeDe(c)], w / 2, h * 0.72);
    return;
  }
  // uno
  const cor = coringa(c) ? '#111827' : HEX_COR[corUno(c)];
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.36, h * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = coringa(c) ? '#a855f7' : cor;
  ctx.font = FONTE(rotuloUno(c).length > 1 ? 48 : 64);
  ctx.fillText(rotuloUno(c), w / 2, h / 2 + 2);
}

// ------------------------------------------------------------------ as mesas (parte do mundo)
export function construirCartas(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const madeira = new THREE.MeshStandardMaterial({ color: 0x6b3f1d, roughness: 0.6 });
  const feltro = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.95, emissive: 0x0a3a1d, emissiveIntensity: 0.5 });
  const geoCarta = new THREE.PlaneGeometry(0.34, 0.48).rotateX(-Math.PI / 2);
  const mesas = MESAS_CARTAS.map((m) => {
    const tampo = new THREE.Mesh(new THREE.CylinderGeometry(R_MESA, R_MESA, 0.08, 40), madeira);
    tampo.position.set(m.x, Y_MESA - 0.04, m.z);
    const pano = new THREE.Mesh(new THREE.CircleGeometry(R_MESA - 0.1, 40).rotateX(-Math.PI / 2), feltro);
    pano.position.set(m.x, Y_MESA + 0.002, m.z);
    const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, Y_MESA - 0.08, 16), madeira);
    pe.position.set(m.x, (Y_MESA - 0.08) / 2, m.z);
    tampo.castShadow = pe.castShadow = true;
    pano.receiveShadow = true;
    g.add(tampo, pano, pe);
    world.addBox({ min: [m.x - R_MESA * 0.8, 0, m.z - R_MESA * 0.8], max: [m.x + R_MESA * 0.8, Y_MESA, m.z + R_MESA * 0.8] });
    for (let k = 0; k < LUGARES[m.jogo]; k++) {
      const c = cadeira(m, k);
      const banco = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.45, 16), new THREE.MeshStandardMaterial({ color: m.jogo === 'truco' ? (k % 2 ? 0xb91c1c : 0x1d4ed8) : 0x7c3aed, roughness: 0.7 }));
      banco.position.set(c.x, 0.225, c.z);
      banco.castShadow = true;
      g.add(banco);
    }
    // o nome do jogo pendurado em cima
    const nome = texturaViva(THREE, 384, 96, (ctx, w, h) => {
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = m.jogo === 'truco' ? '#f87171' : '#facc15';
      ctx.font = FONTE(56);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.jogo === 'truco' ? 'TRUCO' : 'UNO', w / 2, h / 2 + 2);
    });
    const placa = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.05), [madeira, madeira, madeira, madeira, new THREE.MeshBasicMaterial({ map: nome, toneMapped: false }), new THREE.MeshBasicMaterial({ map: nome, toneMapped: false })]);
    placa.position.set(m.x, 3.1, m.z);
    g.add(placa);
    // as cartas do centro (as da rodada no truco; o topo do descarte no uno), viradas para cima
    const cartas = [];
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Mesh(geoCarta, new THREE.MeshBasicMaterial({ map: texturaCarta('verso'), toneMapped: false }));
      c.visible = false;
      g.add(c);
      cartas.push(c);
    }
    return { cartas, placa };
  });
  return { grupo: g, mesas };
}

// ------------------------------------------------------------------ o jogo no navegador
export class Cartas {
  // opts: world, player, sfx, ligado(jogo), focar(mesa) (main.js: câmera e mouse para o painel),
  // soltarFoco()
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'cartas';
    this.socket = null;
    this.eu = null;
    this.g3d = opts.world.cartas3d;
    this.mesas = MESAS_CARTAS.map((m, i) => ({ i, m, e: null, mao: [], lugar: -1 }));
    this.ativa = null; // a mesa em que estou sentado (com o painel aberto)
    this.esperandoCor = null; // coringa escolhido, esperando a cor
    this.montarHud();
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('ct-estado', (e) => this.estado(e));
    socket.on('ct-mao', ({ mesa, lugar, mao }) => {
      const M = this.mesas[mesa];
      if (!M) return;
      M.mao = mao;
      M.lugar = lugar;
      if (this.ativa === M) this.desenhar();
    });
  }

  ver() {
    this.socket?.emit('ct-ver', (lista) => lista?.forEach((e) => this.estado(e)));
  }

  estado(e) {
    const M = this.mesas[e.mesa];
    if (!M) return;
    const antes = M.e;
    M.e = e;
    // as cartas da rodada que acabou ficam à vista um pouco (e.pausa ms)
    M.pausaAte = performance.now() + (e.pausa || 0);
    M.pausaLimpa = !e.pausa;
    // não estou mais na mesa (o servidor me tirou)
    const sentado = e.lugares.some((l) => l?.id === this.eu);
    if (!sentado) {
      M.mao = [];
      M.lugar = -1;
      if (this.ativa === M) this.soltarFoco?.();
    }
    this.mostrar3d(M);
    if (this.ativa === M) {
      this.desenhar();
      const vez = e.vez === M.lugar && e.fase === 'jogando';
      const eraVez = antes?.vez === M.lugar && antes?.fase === 'jogando';
      if (vez && !eraVez && !e.pedido) this.sfx.message();
      if (e.aviso && e.aviso !== antes?.aviso) {
        if (/TRUCO|SEIS|NOVE|DOZE|UNO/.test(e.aviso)) this.sfx.punchHit();
      }
      if (e.fase === 'fim' && antes?.fase !== 'fim') {
        const ganhei = e.jogo === 'truco' ? e.vencedor === M.lugar % 2 : e.vencedor === M.lugar;
        hud.mensagem(ganhei ? 'Vocês venceram!' : 'Fim de jogo', e.aviso, 5000, ganhei ? '#facc15' : '#f8fafc');
        if (ganhei) this.sfx.finish();
      }
    }
  }

  // as cartas no centro da mesa, para quem olha de fora (e de dentro)
  mostrar3d(M) {
    const e = M.e;
    const cartas = this.g3d.mesas[M.i].cartas;
    for (const c of cartas) c.visible = false;
    if (!e || e.fase === 'espera') return;
    const pos = (k, i, raio = 0.42) => {
      const c = cadeira(M.m, k);
      const dx = M.m.x - c.x;
      const dz = M.m.z - c.z;
      const d = Math.hypot(dx, dz);
      cartas[i].position.set(M.m.x - (dx / d) * raio, Y_MESA + 0.01 + i * 0.002, M.m.z - (dz / d) * raio);
      cartas[i].rotation.set(0, -c.a + Math.PI / 2, 0);
    };
    const por = (i, c) => {
      cartas[i].material.map = texturaCarta(c);
      cartas[i].material.needsUpdate = true;
      cartas[i].visible = true;
    };
    if (e.jogo === 'truco') {
      const lista = e.mesaCartas?.length ? e.mesaCartas : this.emPausa(M) ? e.ultimaVaza : [];
      lista.forEach((j, i) => {
        por(i, j.carta);
        pos(j.lugar, i);
      });
      if (e.vira) {
        const i = 5;
        por(i, e.vira);
        cartas[i].position.set(M.m.x, Y_MESA + 0.004, M.m.z);
        cartas[i].rotation.set(0, Math.PI / 4, 0);
      }
    } else if (e.topo) {
      por(0, e.topo);
      cartas[0].position.set(M.m.x, Y_MESA + 0.01, M.m.z);
      cartas[0].rotation.set(0, 0.3, 0);
      por(1, 'verso');
      cartas[1].position.set(M.m.x + 0.45, Y_MESA + 0.01, M.m.z);
      cartas[1].rotation.set(0, -0.2, 0);
    }
  }

  // ---------------------------------------------------------------- sentar e levantar
  mesaPerto() {
    const p = this.player.pos;
    return this.mesas.find((M) => Math.hypot(p.x - M.m.x, p.z - M.m.z) < R_CADEIRA + 1.2 && p.y < 2) || null;
  }

  usarE() {
    const M = this.mesaPerto();
    if (!M || !this.ligado(M.m.jogo)) return false;
    this.socket?.emit('ct-entrar', { mesa: M.i }, (r) => {
      if (r?.erro === 'cheia') return hud.mensagem('Mesa cheia', '', 1500);
      if (!r?.ok) return;
      M.lugar = r.lugar;
      this.ativa = M;
      if (!this.focar?.()) {
        this.ativa = null;
        return;
      }
      // senta na cadeira, virado para a mesa
      const c = cadeira(M.m, r.lugar);
      const yaw = Math.atan2(-(M.m.x - c.x), -(M.m.z - c.z));
      this.player.sentarEm({ x: c.x, y: 0.45, z: c.z, yaw });
      this.player.override = this.pose(M);
      this.ui.hidden = false;
      this.desenhar();
      this.sfx.teleport();
    });
    return true;
  }

  // a câmera atrás da minha cadeira, olhando para o centro da mesa
  pose(M) {
    const c = cadeira(M.m, Math.max(0, M.lugar));
    const dx = c.x - M.m.x;
    const dz = c.z - M.m.z;
    const d = Math.hypot(dx, dz) || 1;
    return {
      position: new THREE.Vector3(M.m.x + (dx / d) * (R_CADEIRA + 1.3), 2.9, M.m.z + (dz / d) * (R_CADEIRA + 1.3)),
      target: new THREE.Vector3(M.m.x, Y_MESA, M.m.z),
    };
  }

  // o main.js tirou o foco (Esc, E, botão): levanta e sai da mesa
  sairDaMesa() {
    if (!this.ativa) return;
    this.ativa = null;
    this.esperandoCor = null;
    this.cores.hidden = true;
    this.ui.hidden = true;
    this.player.override = null;
    this.player.stand();
    this.socket?.emit('ct-sair');
  }

  // ---------------------------------------------------------------- o painel
  montarHud() {
    const css = document.createElement('style');
    css.textContent = `
#ct-ui { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); width: min(920px, 96vw); z-index: 33; display: grid; gap: 8px;
  padding: 12px 14px; border-radius: 16px; background: rgba(10,14,24,.9); color: #f8fafc; font: 600 14px 'Plus Jakarta Sans', system-ui, sans-serif;
  box-shadow: 0 10px 40px rgba(0,0,0,.45); }
#ct-ui[hidden], #ct-cores[hidden] { display: none; }
.ct-topo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ct-topo b { font-size: 18px; }
.ct-topo .ct-placar { flex: 1; color: #cbd5e1; }
.ct-ui-btn, .ct-acoes button { padding: 7px 12px; border-radius: 9px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.07); color: #f8fafc;
  font: 700 13px 'Plus Jakarta Sans', system-ui, sans-serif; cursor: pointer; }
.ct-ui-btn:hover, .ct-acoes button:hover { background: rgba(255,255,255,.16); }
.ct-acoes button.forte { background: #dc2626; border-color: #f87171; }
.ct-acoes button.bom { background: #16a34a; border-color: #4ade80; }
.ct-acoes button.uno { background: #eab308; border-color: #fde047; color: #111827; }
.ct-lugares { display: flex; gap: 6px; flex-wrap: wrap; }
.ct-lugares span { padding: 4px 9px; border-radius: 99px; background: rgba(255,255,255,.07); font-size: 12.5px; }
.ct-lugares span.vez { outline: 2px solid #facc15; }
.ct-lugares span i { font-style: normal; color: #94a3b8; margin-left: 4px; }
.ct-meio { display: flex; align-items: center; gap: 14px; min-height: 78px; }
.ct-meio small { color: #94a3b8; display: block; }
.ct-aviso { color: #facc15; min-height: 18px; }
.ct-acoes { display: flex; gap: 8px; flex-wrap: wrap; }
.ct-mao { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.ct-carta { width: 58px; height: 82px; border-radius: 9px; border: 0; padding: 0; cursor: pointer; background: #fff center / contain no-repeat; box-shadow: 0 3px 10px rgba(0,0,0,.4);
  transition: transform .12s ease, opacity .12s; }
.ct-carta.pode:hover { transform: translateY(-6px); }
.ct-carta:disabled { opacity: .45; cursor: default; }
.ct-carta.peq { width: 44px; height: 62px; cursor: default; }
#ct-cores { position: fixed; inset: 0; z-index: 34; display: grid; place-items: center; background: rgba(0,0,0,.45); }
#ct-cores div { display: flex; gap: 12px; padding: 16px; border-radius: 16px; background: #0b1020; }
#ct-cores button { width: 64px; height: 64px; border-radius: 14px; border: 0; cursor: pointer; }
body.touch #ct-ui { bottom: 8px; }`;
    document.head.appendChild(css);
    this.ui = document.createElement('div');
    this.ui.id = 'ct-ui';
    this.ui.hidden = true;
    this.ui.innerHTML = `<div class="ct-topo"><b></b><span class="ct-placar"></span><button type="button" class="ct-ui-btn" data-acao="comecar">Começar</button><button type="button" class="ct-ui-btn" data-acao="sair">Sair da mesa</button></div>
<div class="ct-lugares"></div><div class="ct-meio"></div><div class="ct-aviso"></div><div class="ct-acoes"></div><div class="ct-mao"></div>`;
    this.cores = document.createElement('div');
    this.cores.id = 'ct-cores';
    this.cores.hidden = true;
    this.cores.innerHTML = `<div>${CORES_UNO.map((c) => `<button type="button" data-cor="${c}" style="background:${HEX_COR[c]}" aria-label="${NOME_COR[c]}"></button>`).join('')}</div>`;
    document.body.append(this.ui, this.cores);
    this.ui.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !this.ativa) return;
      b.blur();
      const mesa = this.ativa.i;
      const acao = b.dataset.acao;
      if (b.dataset.carta) return this.jogar(b.dataset.carta);
      if (acao === 'sair') return this.soltarFoco?.();
      if (acao === 'comecar') return this.socket?.emit('ct-comecar', { mesa });
      if (acao?.startsWith('truco:')) return this.socket?.emit('ct-truco', { mesa, acao: acao.slice(6) });
      if (acao?.startsWith('uno:')) return this.socket?.emit('ct-uno', { mesa, acao: acao.slice(4) });
    });
    this.cores.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cor]');
      this.cores.hidden = true;
      const carta = this.esperandoCor;
      this.esperandoCor = null;
      if (b && carta && this.ativa) this.socket?.emit('ct-jogar', { mesa: this.ativa.i, carta, cor: b.dataset.cor });
    });
  }

  jogar(carta) {
    const M = this.ativa;
    if (!M) return;
    if (M.e?.jogo === 'uno' && coringa(carta)) {
      this.esperandoCor = carta;
      this.cores.hidden = false;
      return;
    }
    this.socket?.emit('ct-jogar', { mesa: M.i, carta });
    this.sfx.dado(0.8);
  }

  // a carta como botão (imagem da textura)
  carta(c, { pode = false, peq = false } = {}) {
    const url = urlCarta(c);
    return `<button type="button" class="ct-carta${pode ? ' pode' : ''}${peq ? ' peq' : ''}" ${pode ? `data-carta="${c}"` : 'disabled'} style="background-image:url(${url})" aria-label="${c}"></button>`;
  }

  desenhar() {
    const M = this.ativa;
    const e = M?.e;
    if (!e) return;
    const $ = (s) => this.ui.querySelector(s);
    const truco = e.jogo === 'truco';
    $('.ct-topo b').textContent = truco ? 'Truco' : 'Uno';
    const meuTime = M.lugar % 2;
    $('.ct-placar').innerHTML = truco && e.pontos
      ? `${TIMES[meuTime]} <b>${e.pontos[meuTime]}</b> × <b>${e.pontos[1 - meuTime]}</b> ${TIMES[1 - meuTime]} · mão vale <b>${e.vale}</b>`
      : !truco && e.fase !== 'espera' ? `Monte: ${e.monte} · sentido ${e.sentido > 0 ? '↻' : '↺'}` : 'Sente quem quiser e clique em Começar (a mesa completa com robôs)';
    $('[data-acao="comecar"]').hidden = e.fase !== 'espera' && e.fase !== 'fim';
    // os lugares (no truco, a cor do time)
    $('.ct-lugares').innerHTML = e.lugares.map((l, k) => {
      if (!l) return `<span><i>lugar livre</i></span>`;
      const time = truco ? (k % 2 === meuTime ? '#60a5fa' : '#f87171') : l.cor;
      const vez = e.vez === k && e.fase === 'jogando';
      return `<span class="${vez ? 'vez' : ''}" style="color:${time}">${k === M.lugar ? 'Você' : esc(l.nome)}<i>${l.cartas} ${l.cartas === 1 ? 'carta' : 'cartas'}</i></span>`;
    }).join('');
    // o meio da mesa
    let meio = '';
    if (truco && e.vira) {
      const lista = e.mesaCartas?.length ? e.mesaCartas : this.emPausa(M) ? e.ultimaVaza : [];
      meio = `<div><small>vira</small>${this.carta(e.vira, { peq: true })}</div><div><small>manilha</small><b>${manilhaDa(e.vira)}</b></div>`
        + lista.map((j) => `<div><small>${j.lugar === M.lugar ? 'você' : esc(e.lugares[j.lugar]?.nome || '')}</small>${this.carta(j.carta, { peq: true })}</div>`).join('')
        + `<div><small>rodadas</small>${(e.rodadas || []).map((r) => (r === 'e' ? '⚪' : r === meuTime ? '🔵' : '🔴')).join(' ') || '—'}</div>`;
    } else if (!truco && e.topo) {
      meio = `<div><small>na mesa</small>${this.carta(e.topo, { peq: true })}</div><div><small>cor</small><b style="color:${HEX_COR[e.cor]}">${NOME_COR[e.cor] || ''}</b></div>`;
    }
    $('.ct-meio').innerHTML = meio;
    // a vez e os avisos
    const minhaVez = e.vez === M.lugar && e.fase === 'jogando';
    let aviso = e.aviso || '';
    if (e.fase === 'jogando' && !aviso) aviso = minhaVez ? 'Sua vez: clique numa carta' : `Vez de ${esc(e.lugares[e.vez]?.nome || '…')}`;
    if (e.fase === 'espera') aviso = 'Esperando começar';
    $('.ct-aviso').textContent = aviso;
    // os botões
    const acoes = [];
    if (truco && e.fase === 'jogando') {
      const p = e.pedido;
      if (p && p.porTime !== meuTime) {
        acoes.push(['truco:aceitar', 'Aceitar', 'bom'], ['truco:correr', 'Correr']);
        if (p.valor < 12) acoes.push(['truco:aumentar', `${NOME_PEDIDO[PASSOS_TRUCO[PASSOS_TRUCO.indexOf(p.valor) + 1]]}!`, 'forte']);
      } else if (p) acoes.push(['', `Esperando a resposta do ${NOME_PEDIDO[p.valor]}…`]);
      else if (minhaVez && e.maoDeOnze === null && e.vale < 12 && (e.podeAumentar === null || e.podeAumentar === meuTime) && !(e.pontos[0] === 11 && e.pontos[1] === 11)) {
        acoes.push(['truco:pedir', `${NOME_PEDIDO[PASSOS_TRUCO[PASSOS_TRUCO.indexOf(e.vale) + 1]]}!`, 'forte']);
      }
    }
    if (truco && e.fase === 'onze' && e.maoDeOnze === meuTime) acoes.push(['truco:onze-jogar', 'Jogar a mão de onze (vale 3)', 'bom'], ['truco:onze-correr', 'Correr (eles +1)']);
    if (!truco && e.fase === 'jogando') {
      if (minhaVez && !e.comprou) acoes.push(['uno:comprar', 'Comprar']);
      if (minhaVez && e.comprou) acoes.push(['uno:passar', 'Passar']);
      if (M.mao.length <= 2 && !e.disseUno?.includes(M.lugar)) acoes.push(['uno:uno', 'UNO!', 'uno']);
    }
    $('.ct-acoes').innerHTML = acoes.map(([a, t, c]) => (a ? `<button type="button" data-acao="${a}" class="${c || ''}">${t}</button>` : `<span>${t}</span>`)).join('');
    // a minha mão: no truco, da mais fraca para a mais forte
    const mao = truco && e.vira ? [...M.mao].sort((a, b) => forcaTruco(a, e.vira) - forcaTruco(b, e.vira)) : M.mao;
    const podeJogar = (c) => {
      if (!minhaVez) return false;
      if (truco) return !e.pedido && !this.emPausa(M);
      return podeJogarUno(c, e.topo, e.cor);
    };
    $('.ct-mao').innerHTML = mao.map((c) => this.carta(c, { pode: podeJogar(c) })).join('') || '<span style="color:#94a3b8">sem cartas</span>';
  }

  emPausa(M) {
    return performance.now() < (M.pausaAte || 0);
  }

  // ---------------------------------------------------------------- o resto da interface dos jogos
  update() {
    // a pausa da rodada do truco acabou: as cartas do meio somem e dá para jogar de novo
    for (const M of this.mesas) {
      if (M.pausaLimpa || this.emPausa(M)) continue;
      M.pausaLimpa = true;
      this.mostrar3d(M);
      if (this.ativa === M) this.desenhar();
    }
  }

  // o painel do parque mostra "Truco e Uno" se um dos dois estiver ligado
  algumLigado() {
    return this.ligado('truco') || this.ligado('uno');
  }

  apertou() { return false; }

  soltou() {}

  ativo() { return false; }

  dica(livre) {
    if (!livre) return '';
    const M = this.mesaPerto();
    if (!M || !this.ligado(M.m.jogo)) return '';
    const gente = M.e?.lugares.filter((l) => l && !l.bot).length || 0;
    const nome = M.m.jogo === 'truco' ? 'truco' : 'uno';
    return `<kbd>E</kbd>Sentar na mesa de ${nome}${gente ? ` (${gente} ${gente === 1 ? 'pessoa' : 'pessoas'})` : ''}`;
  }

  lugar() {
    const m = MESAS_CARTAS[0];
    return { nome: 'Truco e Uno', desc: 'Mesas de cartas do salão · com robôs', cor: '#f87171', pos: [m.x, 0, m.z - R_CADEIRA - 0.7], yaw: Math.PI };
  }
}
