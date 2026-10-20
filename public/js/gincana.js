// Gincana (como o Fall Guys): um show de 10 fases e a final, bem longe do mapa. O portal fica no
// parque (E nele): quem entra vai para a largada da 1ª fase e espera o show começar. Cada fase
// mostra o nome e conta 3, 2, 1. Corrida: até a chegada (caiu, volta no último ponto; R também;
// na gosma, caiu está fora). Sobrevivência: fique em pé até o tempo acabar (caiu, assiste da
// sacada). A final é o piso de hexágonos. Os pontos de cada fase somam e quem fizer mais leva a
// coroa. Clique mergulha para a frente. Esc sai.
//
// As fases só são montadas (gincana-3d.js, baixado na hora) quando alguém entra, e só a que está
// valendo aparece e colide. O servidor (gincana-servidor.js) manda no show; os obstáculos andam
// pelo relógio ou pelo tempo da fase (gincana-dados.js), iguais para todos.
import * as THREE from 'three';
import { FASES, origemDa, nomeDaFase, vaga, gosmaY, N_FASES } from './gincana-dados.js';
import { PORTAL_GINCANA } from './parque-dados.js';
import { hud, texturaViva, FONTE } from './hud-jogos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dentroDa = (c, p) => !!c && p.x >= c[0] && p.y >= c[1] && p.z >= c[2] && p.x <= c[3] && p.y <= c[4] && p.z <= c[5];
const DICAS = {
  corrida: 'Até a chegada · caiu, volta no ponto (R)',
  sobrevivencia: 'Fique em pé até o tempo acabar',
  final: 'O último em pé ganha mais pontos',
};

function placa(texto, cor, larg = 4) {
  const tex = texturaViva(THREE, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(15,23,42,0.88)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cor;
    ctx.fillRect(0, h - 12, w, 12);
    ctx.fillStyle = '#f8fafc';
    ctx.font = FONTE(70);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, w / 2, h / 2 - 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(larg, larg / 4, 1);
  return s;
}

// ------------------------------------------------------------------ o portal (parte do mundo)
// As fases não: ficam longe e só nascem quando alguém entra (ver Gincana.carregar).
export function construirGincana(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const P = PORTAL_GINCANA;
  const anel = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 12, 40), new THREE.MeshBasicMaterial({ color: 0xf472b6, toneMapped: false }));
  anel.position.set(P.x, 2, P.z);
  const meio = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  meio.position.copy(anel.position);
  const chao = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
  chao.position.set(P.x, 0.05, P.z);
  const nome = placa('GINCANA', '#f472b6', 4);
  nome.position.set(P.x, 4.4, P.z);
  g.add(anel, meio, chao, nome);
  world.decorAnimated.push((t) => { anel.rotation.y = t * 0.8; });
  return { grupo: g };
}

// a tabela de pontos (resultado de cada fase e a coroa no fim)
let elRanking = null;
function ranking() {
  if (elRanking) return elRanking;
  const css = document.createElement('style');
  css.textContent = `
#gc-ranking { position: fixed; top: 70px; right: 16px; z-index: 31; width: min(280px, calc(100vw - 32px)); padding: 12px 14px; border-radius: 14px;
  background: rgba(15,23,42,.9); color: #f8fafc; font: 600 14px 'Plus Jakarta Sans', system-ui, sans-serif; pointer-events: none; box-shadow: 0 8px 28px rgba(0,0,0,.4); }
#gc-ranking h3 { margin: 0 0 8px; font-size: 15px; }
#gc-ranking ol { margin: 0; padding: 0; list-style: none; }
#gc-ranking li { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-top: 1px solid rgba(148,163,184,.15); }
#gc-ranking li.eu { color: #facc15; }
#gc-ranking li i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
#gc-ranking li span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#gc-ranking li em { font-style: normal; color: #4ade80; font-size: 12px; }
#gc-ranking li b { font-variant-numeric: tabular-nums; min-width: 28px; text-align: right; }
#gc-ranking[hidden] { display: none; }
body.touch #gc-ranking { top: 60px; font-size: 12px; }`;
  document.head.appendChild(css);
  elRanking = document.createElement('div');
  elRanking.id = 'gc-ranking';
  elRanking.hidden = true;
  document.body.appendChild(elRanking);
  return elRanking;
}

// ------------------------------------------------------------------ o jogo no navegador
export class Gincana {
  // opts: world, player, sfx, ligado(), aoEntrar() (desliga carro, voo, pulo alto)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'gincana';
    this.socket = null;
    this.eu = null;
    this.e = null;
    this.estadoEm = 0;
    this.dentro = false;
    this.carregando = false;
    this.mod = null; // gincana-3d.js, depois de baixado
    this.raiz = null;
    this.fases = new Map(); // k -> fase montada (fica guardada, escondida)
    this.f = null; // a fase que está valendo
    this.chave = ''; // show:fase:etapa do último estado tratado
    this.ponto = 0;
    this.terminou = false;
    this.fora = false; // caiu fora nesta fase (sobrevivência, gosma, final)
    this.empurrao = 0;
    this.mergulho = 0; // > 0: mergulhando (até encostar no chão)
    this.tfAntes = 0;
    this.contado = 0; // o último 3, 2, 1 mostrado
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('gc-estado', (e) => this.estado(e));
    socket.on('gc-quebra', (id) => { if (this.dentro) this.f?.quebrar(id, true); });
    socket.on('gc-piso', ([id, falta]) => { if (this.dentro) this.f?.marcarPiso(id, falta); });
    socket.on('gc-chegada', (m) => {
      if (!this.dentro) return;
      if (m.id === this.eu) hud.mensagem(`Você chegou em ${m.ordem}º!`, `${m.tempo} s`, 3000, '#22c55e');
      else hud.mensagem(`${m.nome} chegou em ${m.ordem}º`, '', 1400, '#86efac');
      this.sfx.checkpoint();
    });
    socket.on('gc-queda', (m) => {
      if (this.dentro && m.id !== this.eu) hud.mensagem(`${m.nome} caiu!`, '', 1100, '#fb923c');
    });
  }

  ver() {
    this.socket?.emit('gc-ver', (e) => e && this.estado(e));
  }

  meu() {
    return this.e?.jogadores.find((j) => j.id === this.eu) || null;
  }

  estado(e) {
    this.e = e;
    this.estadoEm = performance.now();
    if (!this.dentro || this.carregando) return;
    if (!this.meu()) return this.sair(false); // o servidor tirou (desligado, reconexão)
    const chave = `${e.show}:${e.k}:${e.fase}`;
    if (chave !== this.chave) {
      const chegando = !this.chave;
      this.chave = chave;
      this.mudou(e, chegando);
    }
    if (e.fase === 'jogo' && this.f) {
      for (const id of e.quebrados) this.f.quebrar(id, true);
      for (const [id, falta] of e.pisos) this.f.marcarPiso(id, falta);
    }
    if (e.fase === 'resultado' || e.fase === 'fim') this.mostrarRanking(true);
  }

  // mudou a etapa do show (ou acabei de entrar no meio dele)
  mudou(e, chegando) {
    const antesDoShow = e.fase === 'contagem' || e.fase === 'espera';
    const k = antesDoShow ? 0 : e.k;
    this.ativar(k);
    const def = this.f.def;
    if (antesDoShow) {
      this.mostrarRanking(false);
      this.f.preparar(e.semente, []);
      this.reiniciar();
      this.irParaVaga();
      hud.mensagem('Gincana', `${N_FASES} fases e a final · o show começa já já`, 3500, '#f472b6');
    } else if (e.fase === 'intro') {
      this.mostrarRanking(false);
      this.f.preparar(e.semente, []);
      this.reiniciar();
      this.irParaVaga();
      hud.mensagem(nomeDaFase(k), `${def.nome} — ${def.desc}`, 4000, def.cor);
      this.sfx.rodada();
    } else if (e.fase === 'jogo') {
      if (chegando) {
        this.f.preparar(e.semente, e.quebrados);
        this.reiniciar();
      }
      if (this.meu()?.atrasado) {
        this.irParaSacada();
        hud.mensagem('Já está valendo', 'Assista daqui e jogue a próxima fase', 3000, def.cor);
      } else {
        hud.mensagem('VAI!', def.gosma ? 'A gosma está subindo: corra!' : DICAS[def.tipo], 1800, '#facc15');
        this.sfx.rodada();
      }
    } else {
      // resultado ou fim
      if (chegando) {
        this.f.preparar(e.semente, e.quebrados);
        this.irParaSacada();
      }
      if (e.fase === 'fim') {
        const v = e.vencedor;
        hud.mensagem(v ? `${v.id === this.eu ? 'Você' : v.nome} levou a coroa!` : 'Fim do show', v ? `${v.pontos} pontos · show novo já já` : '', 6000, '#facc15');
        if (v?.id === this.eu) this.sfx.finish();
      }
    }
  }

  reiniciar() {
    this.ponto = 0;
    this.terminou = false;
    this.fora = false;
    this.mergulho = 0;
    this.empurrao = 0;
    this.contado = 0;
  }

  // ---------------------------------------------------------------- as fases
  async carregar() {
    if (this.mod) return;
    const mod = await import('./gincana-3d.js');
    this.raiz = mod.criarRaiz(this.world);
    this.mod = mod;
  }

  montar(k) {
    let f = this.fases.get(k);
    if (!f) {
      f = this.mod.montarFase(this.world, k, FASES[k], this.raiz, this.sfx);
      this.fases.set(k, f);
    }
    return f;
  }

  ativar(k) {
    if (this.f?.k === k && this.f.ativa) return;
    this.f?.desativar();
    this.f = this.montar(k);
    this.f.ativar();
    // a caixa do sol desce até o chão das fases (lá no céu)
    this.world.alturaSol = origemDa(k).y;
    // a próxima já fica montada (escondida): a troca de fase não engasga
    if (k + 1 < FASES.length) setTimeout(() => { if (this.dentro && this.mod) this.montar(k + 1); }, 1500);
  }

  // o tempo da fase: no jogo, desde que começou; na intro (e na contagem), negativo até começar;
  // no resultado, parado onde acabou
  tf() {
    const e = this.e;
    if (!e) return 0;
    const passou = performance.now() - this.estadoEm;
    if (e.fase === 'jogo') {
      this.tfAntes = (e.dur - e.falta + passou) / 1000;
      return this.tfAntes;
    }
    if (e.fase === 'intro' || e.fase === 'contagem') return -(e.falta - passou) / 1000;
    return this.tfAntes;
  }

  irPara(l, yaw) {
    const o = this.f.o;
    this.player.teleport([o.x + l.x, o.y + l.y + 0.1, o.z + l.z], yaw);
  }

  irParaVaga() {
    const i = Math.max(0, this.e.jogadores.findIndex((j) => j.id === this.eu));
    const v = vaga(this.f.def.nascer, i);
    this.irPara(v, v.yaw);
  }

  irParaSacada() {
    const s = this.f.def.sacada;
    this.irPara({ x: s.x + (Math.random() - 0.5) * 3, y: s.y, z: s.z + (Math.random() - 0.5) * 3 }, s.yaw);
  }

  voltarAoPonto() {
    const pontos = this.f.def.pontos;
    const p = pontos[this.ponto] || pontos[0];
    this.irPara({ x: p.x + (Math.random() - 0.5) * 2, y: p.y, z: p.z }, p.yaw);
  }

  caiuFora(titulo) {
    if (this.fora) return;
    this.fora = true;
    this.socket?.emit('gc-caiu');
    hud.mensagem(titulo, 'Assista da sacada', 2200, '#fb923c');
    this.sfx.fall();
    this.irParaSacada();
  }

  empurrar(vx, vy, vz) {
    if (this.empurrao > 0) return;
    const pl = this.player;
    pl.vel.set(vx, vy, vz);
    pl.grounded = false;
    pl.ground = null;
    this.empurrao = 0.45;
    this.sfx.punchTaken();
  }

  // ---------------------------------------------------------------- entrar e sair
  pertoDoPortal() {
    const p = this.player.pos;
    return !this.dentro && this.ligado() && p.y < 5 && Math.hypot(p.x - PORTAL_GINCANA.x, p.z - PORTAL_GINCANA.z) < 2.6;
  }

  usarE() {
    if (!this.pertoDoPortal() || this.carregando) return false;
    this.carregando = true;
    if (!this.mod) hud.mensagem('Gincana', 'Carregando as fases...', 2000, '#f472b6');
    this.socket?.emit('gc-entrar', {}, async (r) => {
      if (!r?.ok) {
        this.carregando = false;
        return;
      }
      try {
        await this.carregar();
      } catch (err) {
        console.warn('[gincana] não carregou:', err);
        this.carregando = false;
        this.socket?.emit('gc-sair');
        hud.mensagem('Gincana', 'Não deu para carregar. Tente de novo.', 2500, '#fb7185');
        return;
      }
      this.carregando = false;
      this.dentro = true;
      this.chave = '';
      this.aoEntrar?.();
      this.sfx.teleport();
      if (this.e) this.estado(this.e);
      else this.ver();
    });
    return true;
  }

  sair(avisar = true) {
    if (!this.dentro) return;
    this.dentro = false;
    this.chave = '';
    if (avisar) this.socket?.emit('gc-sair');
    this.f?.desativar();
    this.f = null;
    this.world.alturaSol = null;
    hud.placar('');
    this.mostrarRanking(false);
    this.player.teleport([PORTAL_GINCANA.x + 3, 0, PORTAL_GINCANA.z], -Math.PI / 2);
  }

  esc() {
    if (!this.dentro) return false;
    this.sair();
    return true;
  }

  teclaR() {
    if (!this.dentro) return false;
    const def = this.f?.def;
    if (this.e?.fase === 'jogo' && def?.tipo === 'corrida' && !def.gosma && !this.terminou && !this.fora && !this.meu()?.atrasado) this.voltarAoPonto();
    return true;
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt) {
    // fora da gincana não tem nada para animar: as fases nem estão montadas (ou estão escondidas)
    if (!this.dentro || !this.f) return;
    if (!this.ligado()) return this.sair();
    const e = this.e;
    const pl = this.player;
    const def = this.f.def;
    const o = this.f.o;
    const fase = e?.fase;
    const eu = this.meu();
    const t = Date.now() / 1000;
    const tf = this.tf();
    const jogando = fase === 'jogo' && !!eu && !eu.atrasado && !this.fora && !this.terminou;
    if (pl.voando || pl.puloAlto || pl.veiculo) this.aoEntrar?.(); // nada de poder na gincana
    this.empurrao -= dt;
    if (this.mergulho > 0) {
      this.mergulho += dt;
      if (pl.grounded && this.mergulho > 0.15) this.mergulho = 0;
    }
    this.f.abrirPortao(fase === 'jogo');
    this.f.update(dt, t, tf, {
      pl, dt, t, tf, jogando, sfx: this.sfx,
      empurrar: (vx, vy, vz) => this.empurrar(vx, vy, vz),
      quebrar: (id) => this.socket?.emit('gc-quebra', id),
      pisar: (id) => this.socket?.emit('gc-pisou', id),
    });
    const p = { x: pl.pos.x - o.x, y: pl.pos.y - o.y, z: pl.pos.z - o.z };
    // a corrida: pontos de volta e a chegada
    if (jogando && def.tipo === 'corrida') {
      for (let k = def.pontos.length - 1; k > this.ponto; k--) {
        if (dentroDa(def.pontos[k].area, p)) {
          this.ponto = k;
          this.sfx.checkpoint();
          break;
        }
      }
      if (dentroDa(def.chegada, p)) {
        this.terminou = true;
        this.socket?.emit('gc-chegou');
      }
    }
    if (jogando && def.gosma && p.y < gosmaY(def.gosma, tf) + 0.2) this.caiuFora('A gosma te pegou!');
    else if (p.y < def.queda) {
      if (jogando && (def.tipo !== 'corrida' || def.gosma)) this.caiuFora('Caiu!');
      else if (jogando) {
        this.sfx.fall();
        this.voltarAoPonto();
      } else if (fase === 'intro' || fase === 'contagem') this.irParaVaga();
      else this.irParaSacada();
    }
    // 3, 2, 1 no fim da intro
    if (fase === 'intro') {
      const s = Math.ceil(-tf);
      if (s >= 1 && s <= 3 && s !== this.contado) {
        this.contado = s;
        hud.mensagem(String(s), def.nome, 900, def.cor);
        this.sfx.bip?.();
      }
    }
    this.placar(tf);
  }

  placar(tf) {
    const e = this.e;
    if (!e) return;
    const s = Math.max(0, Math.ceil((e.falta - (performance.now() - this.estadoEm)) / 1000));
    const n = e.jogadores.length;
    const def = this.f.def;
    const eu = this.meu();
    const nome = `<b style="color:${def.cor}">${nomeDaFase(this.f.k)}</b><small>${def.nome}</small>`;
    let html = '';
    if (e.fase === 'contagem' || e.fase === 'espera') html = `<b>Gincana</b><small>o show começa em</small><b>${s}</b><small>s · ${n} ${n === 1 ? 'jogador' : 'jogadores'} · Esc sai</small>`;
    else if (e.fase === 'intro') html = `${nome}<small>começa em</small><b>${s}</b>`;
    else if (e.fase === 'jogo') {
      let info;
      if (eu?.atrasado) info = 'assistindo · você joga a próxima';
      else if (def.tipo === 'corrida') info = `chegaram ${e.jogadores.filter((j) => j.chegou).length}/${n}${def.gosma ? '' : ' · R volta no ponto'}`;
      else info = `em pé ${e.jogadores.filter((j) => !j.atrasado && j.caiu === null).length}/${n}`;
      const extra = this.f.status(tf);
      html = `${nome}<b>${s}</b><small>s · ${info}</small>${extra ? `<small>· ${extra}</small>` : ''}`;
    } else if (e.fase === 'resultado') html = `${nome}<small>fim da fase · você tem</small><b>${eu?.pontos ?? 0}</b><small>pontos</small>`;
    else if (e.fase === 'fim') html = `<b>👑</b><small>${e.vencedor ? esc(e.vencedor.nome) : '—'} levou a coroa</small>`;
    hud.placar(html);
  }

  mostrarRanking(on) {
    const el = ranking();
    if (!on || !this.e) {
      el.hidden = true;
      return;
    }
    const e = this.e;
    const lista = [...e.jogadores].sort((a, b) => b.pontos - a.pontos);
    const titulo = e.fase === 'fim' ? '👑 Fim do show' : `${nomeDaFase(e.k)} · ${esc(FASES[e.k]?.nome)}`;
    el.innerHTML = `<h3>${titulo}</h3><ol>${lista.map((j) => `<li class="${j.id === this.eu ? 'eu' : ''}"><i style="background:${esc(j.cor)}"></i>`
      + `<span>${esc(j.nome)}</span>${j.ganho ? `<em>+${j.ganho}</em>` : ''}<b>${j.pontos}</b></li>`).join('')}</ol>`;
    el.hidden = false;
  }

  // clique: mergulho para a frente (no chão ou no ar, um por pulo); dentro da gincana não tem soco
  apertou() {
    if (!this.dentro) return false;
    const pl = this.player;
    if (this.mergulho > 0 || pl.travado || pl.sitting) return true;
    pl.vel.x = -Math.sin(pl.yaw) * 13;
    pl.vel.z = -Math.cos(pl.yaw) * 13;
    pl.vel.y = pl.grounded ? 5.5 : Math.max(pl.vel.y, 3);
    pl.grounded = false;
    pl.ground = null;
    this.mergulho = 0.001;
    this.sfx.jump();
    return true;
  }

  ativo() {
    return this.dentro; // o botão de ação do celular vira o mergulho
  }

  soltou() {}

  dica(livre) {
    if (!livre || !this.pertoDoPortal()) return '';
    return `<kbd>E</kbd>Ir para a gincana (${N_FASES} fases e a final)`;
  }

  lugar() {
    return { nome: 'Gincana', desc: `${N_FASES} fases estilo Fall Guys e a final dos hexágonos`, cor: '#f472b6', pos: [PORTAL_GINCANA.x - 3, 0, PORTAL_GINCANA.z], yaw: -Math.PI / 2 };
  }
}
