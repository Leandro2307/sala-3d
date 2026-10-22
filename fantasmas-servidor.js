// Caça-Fantasmas (como o Phasmophobia): o servidor manda no fantasma. Uma investigação por sala:
// quem entra primeiro pelo portal escolhe a casa, o servidor sorteia o monstro (um dos 13), o
// cômodo favorito dele e o nome que ele tinha em vida. Os outros que entrarem caem na mesma
// investigação, na van.
//
// Aqui o fantasma anda pelos cômodos (pelas portas), mexe nas coisas (porta, luz, arremesso,
// toque: o EMF), aparece para alguém, deixa as provas que o tipo dele tem e caça quando a
// sanidade do time cai. Na caçada a porta da rua tranca, ele persegue quem vê (ou quem está com
// aparelho ligado, ou falando) e pega quem alcança. Os navegadores contam a própria sanidade e
// mandam junto com a lanterna, o esconderijo e o microfone ('fs-eu'). Quem estiver na van aperta
// "terminar": acertou o monstro no diário, ganha moedas.
//
// Mensagens: 'fs-estado' (o que muda devagar: portas, luzes, temperaturas, quem está, o que foi
// posto no chão), 'fs-g' (10 vezes por segundo: o fantasma e as lanternas) e 'fs-ev' (os
// acontecimentos: porta batendo, arremesso, aparição, caçada, morte, resposta do Spirit Box...).

let D = null;
import('./public/js/fantasmas-dados.js')
  .then((m) => { D = m; })
  .catch((err) => console.warn('  Dados do caça-fantasmas não carregaram:', err.message));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inteiro = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : null);
const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];
const entre = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const TICK = 100; // ms

function ligarFantasmas(io, rooms, jogoLigado, darMoedas) {
  const canal = (room) => `${room.id}:fs`;
  const ev = (room, e) => io.to(canal(room)).emit('fs-ev', e);

  function publico(s) {
    if (!s) return null;
    return {
      casa: s.casa, fase: s.fase, nome: s.nome, idade: s.idade, desde: s.desde, mx: s.monstro.modelo,
      portas: s.portas, luzes: s.luzes, disjuntor: s.disjuntor, trancada: s.trancada,
      temps: s.temps.map((t) => Math.round(t * 10) / 10),
      orbes: s.monstro.provas.includes('orbes') ? s.favorito : -1,
      cacando: !!s.cacada,
      colocados: [...s.colocados.values()],
      digitais: s.digitais.filter((d) => d.ate > Date.now()).map(({ tipo, i, lado }) => ({ tipo, i, lado })),
      jogadores: [...s.jogadores.values()].map(({ id, nome, cor, sanidade, morto, palpite }) => ({ id, nome, cor, sanidade: Math.round(sanidade), morto, palpite: !!palpite })),
      fim: s.fim || null,
    };
  }
  const avisar = (room) => io.to(canal(room)).emit('fs-estado', publico(room.fantasmas));

  // ---------------------------------------------------------------- a investigação
  function nova(casaId) {
    const C = D.casa(casaId);
    const monstro = sortear(D.MONSTROS);
    // o favorito: um cômodo de verdade (corredor e entrada só nas casas pequenas)
    const salas = C.comodos.filter((c) => (c.tipo !== 'corredor' && c.tipo !== 'hall') || C.tam === 'pequena');
    const fav = sortear(salas);
    const favorito = C.comodos.indexOf(fav);
    const p = D.pontoNaSala(fav);
    const agora = Date.now();
    return {
      casa: casaId, C, monstro, favorito, fase: 'jogo', desde: agora,
      nome: sortear(D.NOMES), idade: Math.floor(entre(8, 92)),
      portas: C.portas.map((d) => !!d.aberta || !!d.semPorta),
      luzes: C.comodos.map(() => false),
      disjuntor: true,
      trancada: false,
      temps: C.comodos.map((c, i) => (i === favorito ? 11 : entre(13, 17))),
      jogadores: new Map(),
      colocados: new Map(),
      nColocado: 0,
      digitais: [],
      g: { x: p.x, z: p.z, rot: 0, vis: 0, anim: 0, rota: [], parado: 2, visAte: 0, vel: monstro.velocidade },
      cacada: null,
      proxCacada: agora + 60000, // o primeiro minuto é de graça
      incensoAte: 0,
      proxMexer: agora + entre(4000, 9000),
      proxEvento: agora + entre(30000, 50000),
      proxEspectro: agora + entre(50000, 90000),
      proxDots: 0,
      proxEscrita: 0,
      vitima: null, // a banshee escolhe uma pessoa
      fim: null,
      fimAte: 0,
      mudou: false,
    };
  }

  function entrar(room, user) {
    const s = room.fantasmas;
    if (s.jogadores.has(user.id)) return;
    s.jogadores.set(user.id, {
      id: user.id, nome: user.name, cor: user.color, sanidade: 100, morto: false, h: -1, l: false, e: false, f: false,
      d: [0, 0, -1], palpite: null, descoberto: false, item: '',
    });
    if (s.monstro.id === 'banshee' && !s.vitima) s.vitima = user.id;
  }

  function sair(room, id) {
    const s = room.fantasmas;
    if (!s?.jogadores.delete(id)) return;
    if (s.vitima === id) s.vitima = [...s.jogadores.keys()][0] || null;
    for (const [k, c] of s.colocados) if (c.dono === id) s.colocados.delete(k);
    if (!s.jogadores.size) room.fantasmas = null;
    avisar(room);
  }

  // ---------------------------------------------------------------- quem está onde
  // os jogadores dentro da casa, com a posição nas coordenadas dela
  function naCasa(room, s, todos = false) {
    const out = [];
    for (const j of s.jogadores.values()) {
      const u = room.users.get(j.id);
      if (!u?.p) continue;
      const p = D.paraCasa(s.C, u.p[0], u.p[1], u.p[2]);
      if (Math.abs(p.y) > 4) continue;
      const sala = D.salaEm(s.C, p.x, p.z);
      if (!sala && !todos) continue;
      out.push({ j, p, sala });
    }
    return out;
  }

  const salaDoFantasma = (s) => D.salaEm(s.C, s.g.x, s.g.z);
  const luzAcesa = (s, sala) => !!sala && s.disjuntor && s.luzes[s.C.comodos.indexOf(sala)];

  // ---------------------------------------------------------------- o fantasma anda
  function andar(s, dt, vel) {
    const g = s.g;
    const alvo = g.rota[0];
    if (!alvo) {
      g.anim = 0;
      return true;
    }
    const dx = alvo.x - g.x;
    const dz = alvo.z - g.z;
    const d = Math.hypot(dx, dz);
    const passo = vel * dt;
    if (d > 0.01) g.rot = Math.atan2(dx, dz);
    if (d <= passo) {
      g.x = alvo.x;
      g.z = alvo.z;
      // passou por uma porta fechada: na caçada ela abre com um empurrão
      if (alvo.porta !== undefined && !s.portas[alvo.porta] && !s.C.portas[alvo.porta].rua) {
        s.portas[alvo.porta] = true;
        s.mudou = true;
        return g.rota.shift() && false;
      }
      g.rota.shift();
      return !g.rota.length;
    }
    g.x += (dx / d) * passo;
    g.z += (dz / d) * passo;
    g.anim = vel > 2 ? 2 : 1;
    return false;
  }

  function irPara(s, ponto) {
    s.g.rota = D.caminho(s.C, s.g, ponto);
  }

  // à toa: de vez em quando um ponto do cômodo favorito (às vezes o vizinho)
  function vagar(room, s, dt, agora) {
    const g = s.g;
    if (g.rota.length) {
      andar(s, dt, s.monstro.velocidade * 0.55);
      return;
    }
    g.anim = 0;
    g.parado -= dt;
    if (g.parado > 0) return;
    g.parado = entre(2, 7);
    const fav = s.C.comodos[s.favorito];
    let sala = fav;
    if (Math.random() < 0.25) {
      const viz = s.C.vizinhos[fav.id];
      if (viz.length) sala = s.C.sala[sortear(viz).sala];
    }
    irPara(s, D.pontoNaSala(sala));
  }

  // ---------------------------------------------------------------- mexer nas coisas
  function emf(s, nivel) {
    if (s.monstro.provas.includes('emf') && Math.random() < 0.3) return 5;
    return nivel;
  }

  function digital(s, tipo, i, lado = 0) {
    if (!s.monstro.provas.includes('digitais')) return;
    s.digitais = s.digitais.filter((d) => d.ate > Date.now() && !(d.tipo === tipo && d.i === i));
    s.digitais.push({ tipo, i, lado, ate: Date.now() + 120000 });
  }

  function mexer(room, s, agora) {
    const g = s.g;
    const C = s.C;
    const sala = salaDoFantasma(s);
    const m = s.monstro.id;
    const opcoes = [];
    // porta perto
    const portas = C.portas.map((p, i) => ({ p, i })).filter(({ p }) => !p.semPorta && !p.rua && Math.hypot(p.x - g.x, p.z - g.z) < 4);
    if (portas.length) opcoes.push('porta', 'porta');
    // luz do cômodo
    if (sala && s.disjuntor) {
      const i = C.comodos.indexOf(sala);
      if (s.luzes[i] || (m !== 'mare' && Math.random() < 0.3)) opcoes.push('luz');
    }
    // arremesso
    const perto = C.objetos.filter((o) => Math.hypot(o.x - g.x, o.z - g.z) < 3.5);
    if (perto.length) opcoes.push('arremesso', 'arremesso', ...(m === 'poltergeist' ? ['arremesso', 'arremesso', 'arremesso'] : []));
    opcoes.push('toque', 'passos');
    if (s.disjuntor && Math.random() < 0.04) opcoes.push('disjuntor');
    if (m === 'raiju' || Math.random() < 0.15) opcoes.push('lampada');
    const o = sortear(opcoes);
    if (o === 'porta') {
      const { p, i } = sortear(portas);
      const bate = s.portas[i] && Math.random() < 0.45;
      s.portas[i] = !s.portas[i];
      s.mudou = true;
      digital(s, 'porta', i, p.a === sala?.id ? 0 : 1);
      ev(room, { t: 'porta', i, aberta: s.portas[i], bate, x: p.x, z: p.z, emf: emf(s, 2) });
    } else if (o === 'luz') {
      const i = C.comodos.indexOf(sala);
      s.luzes[i] = !s.luzes[i];
      s.mudou = true;
      const sw = C.interruptores.find((q) => q.sala === sala.id);
      if (sw) digital(s, 'interruptor', sw.i);
      ev(room, { t: 'luz', i, acesa: s.luzes[i], x: sw?.x ?? g.x, z: sw?.z ?? g.z, emf: emf(s, 2) });
    } else if (o === 'arremesso') {
      const n = m === 'poltergeist' && Math.random() < 0.4 ? Math.min(perto.length, 2 + Math.floor(Math.random() * 3)) : 1;
      const lista = [...perto].sort(() => Math.random() - 0.5).slice(0, n);
      for (const ob of lista) {
        const a = Math.random() * Math.PI * 2;
        const f = entre(2.5, 5.5);
        ev(room, { t: 'arremesso', i: ob.i, v: [Math.cos(a) * f, entre(1.5, 3.5), Math.sin(a) * f], x: ob.x, z: ob.z, emf: emf(s, 3) });
      }
    } else if (o === 'toque') {
      ev(room, { t: 'emf', x: g.x + entre(-1, 1), z: g.z + entre(-1, 1), emf: emf(s, 2) });
    } else if (o === 'passos') {
      ev(room, { t: 'passos', x: g.x, z: g.z, rot: g.rot });
    } else if (o === 'disjuntor') {
      s.disjuntor = false;
      s.mudou = true;
      ev(room, { t: 'disjuntor', ligado: false });
    } else if (o === 'lampada') {
      if (sala && luzAcesa(s, sala)) ev(room, { t: 'pisca', i: C.comodos.indexOf(sala), dur: entre(0.6, 1.6) });
      else ev(room, { t: 'emf', x: g.x, z: g.z, emf: emf(s, 2) });
    }
  }

  // ---------------------------------------------------------------- aparições e sustos
  function evento(room, s, agora) {
    const g = s.g;
    const gente = naCasa(room, s).filter(({ j }) => !j.morto && j.h < 0);
    if (!gente.length) return;
    const alvo = s.monstro.id === 'banshee' && s.vitima ? gente.find(({ j }) => j.id === s.vitima) || sortear(gente) : sortear(gente);
    const tipo = Math.random();
    if (tipo < 0.5) {
      // aparece para ele: no mesmo cômodo, de 3 a 7 m (ou na porta do cômodo)
      const sala = alvo.sala;
      let p = null;
      for (let k = 0; k < 12 && !p; k++) {
        const q = D.pontoNaSala(sala, Math.random, 0.6);
        const d = dist(q, alvo.p);
        if (d > 2.5 && d < 7.5) p = q;
      }
      if (!p) {
        const viz = s.C.vizinhos[sala.id];
        if (!viz.length) return;
        const v = sortear(viz);
        const porta = s.C.portas[v.porta];
        const out = D.salaEm(s.C, porta.x + (porta.eixo === 'z' ? Math.sign(porta.x - alvo.p.x) * 1.2 : 0), porta.z + (porta.eixo === 'x' ? Math.sign(porta.z - alvo.p.z) * 1.2 : 0));
        p = out ? { x: porta.x + (porta.eixo === 'z' ? Math.sign(porta.x - alvo.p.x) * 1.2 : 0), z: porta.z + (porta.eixo === 'x' ? Math.sign(porta.z - alvo.p.z) * 1.2 : 0) } : { x: porta.x, z: porta.z };
        s.portas[v.porta] = true;
        s.mudou = true;
      }
      g.x = p.x;
      g.z = p.z;
      g.rota = Math.random() < 0.6 ? [{ x: alvo.p.x, z: alvo.p.z }] : [];
      g.rot = Math.atan2(alvo.p.x - p.x, alvo.p.z - p.z);
      const dur = entre(2.2, 4.2) * (s.monstro.id === 'oni' ? 1.4 : 1);
      // às vezes só o vulto escuro, às vezes ele inteiro
      g.vis = Math.random() < 0.55 ? 1 : 2;
      g.visAte = agora + dur * 1000;
      ev(room, { t: 'aparece', x: g.x, z: g.z, para: alvo.j.id, dur, sala: s.C.comodos.indexOf(alvo.sala) });
    } else {
      const sons = ['sussurro', 'sussurro', 'batida', 'risada', 'musica', 'respira', 'grito'];
      const som = s.monstro.id === 'banshee' && Math.random() < 0.4 ? 'grito' : sortear(sons);
      // o som sai de perto da pessoa (o sussurro e a respiração, no ouvido)
      const a = Math.random() * Math.PI * 2;
      const r = som === 'sussurro' || som === 'respira' ? 0.8 : entre(2, 5);
      ev(room, { t: 'som', som, x: alvo.p.x + Math.cos(a) * r, z: alvo.p.z + Math.sin(a) * r, para: alvo.j.id });
    }
  }

  // ---------------------------------------------------------------- a caçada
  function mediaSanidade(s, gente) {
    if (s.monstro.id === 'banshee' && s.vitima) {
      const v = s.jogadores.get(s.vitima);
      if (v && !v.morto) return v.sanidade;
    }
    const vivos = gente.filter(({ j }) => !j.morto);
    if (!vivos.length) return 100;
    return vivos.reduce((t, { j }) => t + j.sanidade, 0) / vivos.length;
  }

  function limiar(room, s, gente) {
    const m = s.monstro;
    if (m.id === 'mare') return luzAcesa(s, salaDoFantasma(s)) ? 40 : 60;
    if (m.id === 'yokai' && gente.some(({ j, p }) => j.f && dist(p, s.g) < 6)) return 80;
    return m.sanidade;
  }

  function tentarCacar(room, s, agora, gente) {
    if (s.cacada || agora < s.proxCacada || agora < s.incensoAte) return;
    const vivos = gente.filter(({ j }) => !j.morto);
    if (!vivos.length) return;
    const san = mediaSanidade(s, gente);
    const lim = limiar(room, s, gente);
    if (san >= lim) return;
    // uma chance por segundo, maior quanto mais baixa a sanidade
    const chance = (0.06 + ((lim - san) / 100) * 0.35) * (TICK / 1000);
    if (Math.random() > chance) return;
    // crucifixo perto do fantasma: queima e segura a caçada
    const raio = ['banshee', 'demonio'].includes(s.monstro.id) ? 5 : D.JOGO.crucifixo;
    for (const c of s.colocados.values()) {
      if (c.t !== 'crucifixo' || c.usos <= 0 || dist(c, s.g) > raio) continue;
      c.usos--;
      s.proxCacada = agora + 15000;
      s.mudou = true;
      ev(room, { t: 'crucifixo', id: c.id, x: c.x, z: c.z, usos: c.usos });
      return;
    }
    const dur = D.JOGO.duracao[s.C.tam] * 1000;
    s.cacada = { inicio: agora, ate: agora + dur, alvo: null, ultimo: null, cegoAte: 0, repensar: 0, vendo: false, matou: 0 };
    s.trancada = true;
    const e = s.C.entrada.i;
    s.portas[e] = false;
    for (const j of s.jogadores.values()) j.descoberto = false;
    s.g.vis = 0;
    s.g.rota = [];
    s.mudou = true;
    ev(room, { t: 'cacada', x: s.g.x, z: s.g.z, dur: dur / 1000 });
  }

  function terminarCacada(room, s, agora) {
    s.cacada = null;
    s.trancada = false;
    s.proxCacada = agora + (s.monstro.id === 'demonio' ? 20000 : D.JOGO.esperaCacada * 1000);
    s.g.vis = 0;
    s.g.rota = [];
    s.mudou = true;
    ev(room, { t: 'fimCacada' });
  }

  // na caçada: quem ele percebe (vê, ou ouve o aparelho, ou ouve falar)
  function percebe(s, j, p) {
    const g = s.g;
    const m = s.monstro.id;
    if (j.morto) return false;
    if (m === 'deogen') return true;
    if (j.h >= 0 && !j.descoberto) return false;
    const d = dist(p, g);
    if (D.enxerga(s.C, g, p, s.portas)) return true;
    if (j.e && d < (m === 'raiju' ? 10 : 7.5)) return true;
    if (j.l && d < 5) return true;
    if (j.f && d < (m === 'yokai' ? 2 : 9)) return true;
    return false;
  }

  function velocidadeNaCacada(s, vendo, alvoP) {
    const m = s.monstro;
    const g = s.g;
    let [semVer, comVer] = m.caca;
    let v = vendo ? comVer : semVer;
    if (m.id === 'deogen' && alvoP) v = dist(alvoP, g) < 2.5 ? 0.4 : 3.0;
    if (m.id === 'hantu') {
      const sala = salaDoFantasma(s);
      const t = sala ? s.temps[s.C.comodos.indexOf(sala)] : 10;
      v = t < 3 ? 2.7 : vendo ? 1.8 : 1.4;
    }
    return v;
  }

  function cacar(room, s, dt, agora, gente) {
    const c = s.cacada;
    const g = s.g;
    if (agora >= c.ate || (c.matou && agora - c.matou > 2500)) return terminarCacada(room, s, agora);
    const cego = agora < c.cegoAte;
    c.repensar -= dt;
    let alvoP = null;
    if (c.repensar <= 0 && !c.matou) {
      c.repensar = 0.4;
      let melhor = null;
      if (!cego) {
        for (const x of gente) {
          if (!percebe(s, x.j, x.p)) continue;
          const d = dist(x.p, g);
          if (!melhor || d < melhor.d) melhor = { ...x, d };
        }
      }
      c.vendo = !!melhor && D.enxerga(s.C, g, melhor.p, s.portas);
      if (melhor) {
        c.alvo = melhor.j.id;
        c.ultimo = { x: melhor.p.x, z: melhor.p.z };
        irPara(s, c.ultimo);
      } else if (!g.rota.length) {
        // sem ninguém: vai até onde viu por último, depois sai procurando
        const sala = c.ultimo ? null : sortear(s.C.comodos);
        irPara(s, c.ultimo || D.pontoNaSala(sala));
        c.ultimo = null;
      }
    }
    if (c.alvo) alvoP = gente.find((x) => x.j.id === c.alvo)?.p || null;
    const vel = c.matou ? 0 : velocidadeNaCacada(s, c.vendo, alvoP);
    andar(s, dt, vel);
    g.anim = c.matou ? 3 : vel > 0.5 && g.rota.length ? (vel >= 2 ? 2 : 1) : 0;
    // pegou alguém?
    if (c.matou || agora - c.inicio < D.JOGO.carencia * 1000 || cego) return;
    for (const x of gente) {
      const { j, p } = x;
      if (j.morto) continue;
      if (j.h >= 0 && !j.descoberto && s.monstro.id !== 'deogen') continue;
      if (dist(p, g) > D.JOGO.pegou) continue;
      j.morto = true;
      j.h = -1;
      c.matou = agora;
      g.rota = [];
      g.rot = Math.atan2(p.x - g.x, p.z - g.z);
      s.mudou = true;
      ev(room, { t: 'morte', id: j.id, nome: j.nome, x: g.x, z: g.z });
      if (s.vitima === j.id) s.vitima = [...s.jogadores.values()].find((o) => !o.morto)?.id || null;
      break;
    }
  }

  // ---------------------------------------------------------------- provas que dependem do lugar
  function provasDoLugar(room, s, agora) {
    const m = s.monstro;
    const g = s.g;
    const salaG = salaDoFantasma(s);
    // escrita: livro no cômodo dele ou a 3 m
    if (m.provas.includes('escrita') && agora > s.proxEscrita) {
      for (const c of s.colocados.values()) {
        if (c.t !== 'livro' || c.escrito) continue;
        const salaC = D.salaEm(s.C, c.x, c.z);
        if (dist(c, g) > 3 && salaC !== salaG) continue;
        if (Math.random() < 0.05) {
          c.escrito = true;
          s.mudou = true;
          s.proxEscrita = agora + 8000;
          ev(room, { t: 'escrita', id: c.id, x: c.x, z: c.z, emf: 2 });
        }
      }
    }
    // D.O.T.S.: o vulto passa pelo projetor de vez em quando
    if (m.provas.includes('dots') && agora > s.proxDots && !s.cacada && s.g.vis === 0) {
      for (const c of s.colocados.values()) {
        if (c.t !== 'dots') continue;
        const salaC = D.salaEm(s.C, c.x, c.z);
        if (salaC !== salaG && dist(c, g) > 5) continue;
        s.proxDots = agora + entre(9000, 18000);
        g.vis = 3;
        g.visAte = agora + 2600;
        // anda um pouco na frente do projetor
        const a = Math.random() * Math.PI * 2;
        g.rota = [{ x: c.x + Math.cos(a) * 1.5, z: c.z + Math.sin(a) * 1.5 }];
        ev(room, { t: 'dots', id: c.id });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- temperaturas
  function temperaturas(s, dt) {
    const fav = s.favorito;
    const frio = s.monstro.provas.includes('frio');
    const salaG = salaDoFantasma(s);
    s.temps = s.temps.map((t, i) => {
      let alvo = 15;
      if (i === fav) alvo = frio ? -4.5 : 6.5;
      else if (salaG && s.C.comodos[i] === salaG) alvo = frio ? 2 : 9;
      return t + (alvo - t) * Math.min(1, dt * 0.02) + (Math.random() - 0.5) * 0.04;
    });
  }

  // ---------------------------------------------------------------- o fim
  function terminar(room, s, motivo) {
    if (s.fim) return;
    s.fase = 'fim';
    const lista = [];
    for (const j of s.jogadores.values()) {
      const certo = j.palpite === s.monstro.id;
      const M = D.JOGO.moedas;
      const moedas = (certo ? (j.morto ? M.acertouMorto : M.acertou) : 0) + (j.morto ? 0 : M.sobreviveu);
      const u = room.users.get(j.id);
      if (u && moedas) darMoedas?.(room, u, moedas, certo ? 'acertou o fantasma' : 'saiu vivo da casa');
      lista.push({ id: j.id, nome: j.nome, cor: j.cor, palpite: j.palpite, certo, morto: j.morto, moedas });
    }
    s.fim = { motivo, monstro: s.monstro.id, nome: s.nome, idade: s.idade, favorito: s.C.comodos[s.favorito].nome, jogadores: lista };
    s.fimAte = Date.now() + 14000;
    s.cacada = null;
    s.trancada = false;
    s.g.vis = 0;
    avisar(room);
  }

  // ---------------------------------------------------------------- o relógio
  let quadro = 0;
  setInterval(() => {
    if (!D) return;
    quadro++;
    const agora = Date.now();
    const dt = TICK / 1000;
    for (const room of rooms.values()) {
      const s = room.fantasmas;
      if (!s) continue;
      if (!jogoLigado(room, 'fantasmas')) {
        room.fantasmas = null;
        io.to(canal(room)).emit('fs-estado', null);
        continue;
      }
      for (const id of [...s.jogadores.keys()]) if (!room.users.has(id)) sair(room, id);
      if (!room.fantasmas) continue;
      if (s.fase === 'fim') {
        if (agora > s.fimAte) {
          room.fantasmas = null;
          io.to(canal(room)).emit('fs-estado', null);
        }
        continue;
      }
      const gente = naCasa(room, s);
      const g = s.g;
      // todo mundo morreu: acabou
      if ([...s.jogadores.values()].every((j) => j.morto)) {
        terminar(room, s, 'mortos');
        continue;
      }
      if (s.cacada) cacar(room, s, dt, agora, gente);
      else {
        if (g.vis && agora > g.visAte) {
          g.vis = 0;
          ev(room, { t: 'some', x: g.x, z: g.z });
        }
        if (g.vis === 1 || g.vis === 2) andar(s, dt, s.monstro.velocidade * 0.7);
        else if (g.vis === 3) andar(s, dt, 1.0);
        else vagar(room, s, dt, agora);
        const ativos = gente.length > 0;
        if (ativos && agora > s.proxMexer) {
          const oni = s.monstro.id === 'oni' || s.monstro.id === 'poltergeist';
          s.proxMexer = agora + entre(oni ? 3500 : 5500, oni ? 8000 : 13000);
          if (!g.vis) mexer(room, s, agora);
        }
        if (ativos && agora > s.proxEvento && !g.vis) {
          // mais frequente com a sanidade baixa
          const san = mediaSanidade(s, gente);
          s.proxEvento = agora + entre(25000, 55000) * (0.5 + san / 200) * (s.monstro.id === 'oni' ? 0.6 : 1);
          evento(room, s, agora);
        }
        // o espectro some e aparece perto de alguém
        if (s.monstro.id === 'espectro' && ativos && agora > s.proxEspectro && !g.vis) {
          s.proxEspectro = agora + entre(50000, 90000);
          const x = sortear(gente);
          g.x = x.p.x + entre(-1, 1);
          g.z = x.p.z + entre(-1, 1);
          if (!D.salaEm(s.C, g.x, g.z)) Object.assign(g, { x: x.p.x, z: x.p.z });
          g.rota = [];
          ev(room, { t: 'emf', x: g.x, z: g.z, emf: 2 });
        }
        provasDoLugar(room, s, agora);
        tentarCacar(room, s, agora, gente);
      }
      if (quadro % 5 === 0) temperaturas(s, 0.5);
      // o fantasma e as lanternas, 10 vezes por segundo
      io.to(canal(room)).volatile.emit('fs-g', {
        g: [Math.round(g.x * 100) / 100, Math.round(g.z * 100) / 100, Math.round(g.rot * 100) / 100, s.cacada ? 4 : g.vis, g.anim],
        j: [...s.jogadores.values()].map((j) => [j.id, j.l ? 1 : 0, j.d[0], j.d[1], j.d[2], j.h, j.item]),
      });
      if (s.mudou || quadro % 10 === 0) {
        s.mudou = false;
        avisar(room);
      }
    }
  }, TICK);

  // ---------------------------------------------------------------- as mensagens
  return function porSocket(socket, quem) {
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !D) return {};
      return { room, user, s: room.fantasmas, j: room.fantasmas?.jogadores.get(user.id) };
    };

    socket.on('fs-ver', (ack) => {
      const { room, s } = daSala();
      if (!room) return ack?.(null);
      ack?.({ estado: publico(s), casas: D.CASAS_RESUMO });
    });

    socket.on('fs-entrar', (dados, ack) => {
      const { room, user } = daSala();
      if (!room || !jogoLigado(room, 'fantasmas')) return ack?.({ erro: 'desligado' });
      if (room.fantasmas?.fase === 'fim') return ack?.({ erro: 'fim' });
      if (!room.fantasmas) {
        const casaId = D.CASA_IDS.includes(dados?.casa) ? dados.casa : D.CASA_IDS[0];
        room.fantasmas = nova(casaId);
      }
      entrar(room, user);
      socket.join(canal(room));
      avisar(room);
      ack?.({ ok: true, casa: room.fantasmas.casa });
    });

    socket.on('fs-sair', () => {
      const { room, user } = daSala();
      if (!room) return;
      socket.leave(canal(room));
      sair(room, user.id);
    });

    // o que o navegador sabe de si: sanidade, lanterna, aparelho, microfone, esconderijo, olhar
    socket.on('fs-eu', (m) => {
      const { s, j } = daSala();
      if (!j || !m || typeof m !== 'object') return;
      const san = num(m.s);
      if (san !== null) j.sanidade = Math.max(0, Math.min(100, san));
      j.l = !!m.l;
      j.e = !!m.e;
      j.f = !!m.f;
      const h = Number.isInteger(m.h) ? m.h : -1;
      if (h !== j.h) {
        // entrou no esconderijo com ele olhando, de perto: ele viu
        if (h >= 0 && s.cacada) {
          const room = quem().room;
          const u = room.users.get(j.id);
          const p = u?.p && D.paraCasa(s.C, u.p[0], u.p[1], u.p[2]);
          if (p && dist(p, s.g) < 4 && D.enxerga(s.C, s.g, p, s.portas)) j.descoberto = true;
        }
        j.h = h >= 0 && h < s.C.esconderijos.length ? h : -1;
      }
      if (Array.isArray(m.d) && m.d.length === 3 && m.d.every((v) => num(v) !== null)) j.d = m.d.map((v) => Math.round(v * 100) / 100);
      j.item = typeof m.it === 'string' ? m.it.slice(0, 12) : '';
    });

    socket.on('fs-porta', (i) => {
      const { room, s, j } = daSala();
      const n = s ? inteiro(i, s.C.portas.length) : null;
      if (n === null || !j || j.morto) return;
      const p = s.C.portas[n];
      if (p.semPorta) return;
      if (p.rua && s.trancada) {
        ev(room, { t: 'trancada', i: n, x: p.x, z: p.z });
        return;
      }
      s.portas[n] = !s.portas[n];
      s.mudou = true;
      ev(room, { t: 'porta', i: n, aberta: s.portas[n], x: p.x, z: p.z, quem: j.id });
    });

    socket.on('fs-luz', (i) => {
      const { room, s, j } = daSala();
      const n = s ? inteiro(i, s.C.comodos.length) : null;
      if (n === null || !j || j.morto) return;
      s.luzes[n] = !s.luzes[n];
      s.mudou = true;
      ev(room, { t: 'luz', i: n, acesa: s.luzes[n], quem: j.id });
    });

    socket.on('fs-disjuntor', () => {
      const { room, s, j } = daSala();
      if (!j || j.morto) return;
      s.disjuntor = !s.disjuntor;
      s.mudou = true;
      ev(room, { t: 'disjuntor', ligado: s.disjuntor, quem: j.id });
    });

    // pôr no chão um livro, um projetor ou um crucifixo (x, z na casa)
    socket.on('fs-por', (m, ack) => {
      const { room, s, j } = daSala();
      if (!j || j.morto || !m) return ack?.(null);
      const t = ['livro', 'dots', 'crucifixo'].includes(m.t) ? m.t : null;
      const x = num(m.x);
      const z = num(m.z);
      const y = num(m.y) ?? 0;
      if (!t || x === null || z === null) return ack?.(null);
      const meus = [...s.colocados.values()].filter((c) => c.dono === j.id && c.t === t).length;
      if (meus >= D.ITEM[t].limite) return ack?.({ erro: 'limite' });
      const id = ++s.nColocado;
      s.colocados.set(id, { id, t, x, z, y, giro: num(m.giro) ?? 0, dono: j.id, escrito: false, usos: t === 'crucifixo' ? 2 : 0 });
      s.mudou = true;
      ack?.({ id });
    });

    socket.on('fs-pegar', (id) => {
      const { s, j } = daSala();
      const c = s?.colocados.get(id);
      if (!c || !j || j.morto) return;
      s.colocados.delete(id);
      s.mudou = true;
    });

    // pergunta no Spirit Box (x, z de quem pergunta, na casa)
    socket.on('fs-spirit', (m, ack) => {
      const { room, s, j } = daSala();
      if (!j || j.morto || !m) return ack?.(null);
      const p = { x: num(m.x) ?? 9e9, z: num(m.z) ?? 9e9 };
      const sala = D.salaEm(s.C, p.x, p.z);
      const salaG = salaDoFantasma(s);
      const perto = sala && (sala === salaG || dist(p, s.g) < D.JOGO.alcanceSpirit);
      if (!perto || luzAcesa(s, sala) || !s.monstro.provas.includes('spirit') || s.cacada || Math.random() > 0.5) return ack?.({ resp: null });
      const tipo = ['onde', 'idade', 'quem'].includes(m.q) ? m.q : sortear(['onde', 'idade', 'quem']);
      const resp = s.monstro.id === 'banshee' && Math.random() < 0.25 ? '*grito*' : s.monstro.id === 'deogen' && Math.random() < 0.4 ? '*respiração*' : sortear(D.RESPOSTAS[tipo]);
      ack?.({ resp });
      ev(room, { t: 'spirit', resp, x: p.x, z: p.z, quem: j.id, emf: 0 });
    });

    // incenso aceso (x, z): perto dele segura as caçadas, na caçada deixa ele cego
    socket.on('fs-incenso', (m) => {
      const { room, s, j } = daSala();
      if (!j || j.morto || !m) return;
      const p = { x: num(m.x) ?? 9e9, z: num(m.z) ?? 9e9 };
      const agora = Date.now();
      ev(room, { t: 'incenso', x: p.x, z: p.z, quem: j.id });
      const d = dist(p, s.g);
      if (s.cacada) {
        if (d < 5) {
          s.cacada.cegoAte = agora + (s.monstro.id === 'espectro' ? 12000 : D.JOGO.incensoCega * 1000);
          s.g.rota = [];
          s.cacada.ultimo = null;
        }
      } else if (d < 6 || D.salaEm(s.C, p.x, p.z) === salaDoFantasma(s)) {
        s.incensoAte = agora + (s.monstro.id === 'espirito' ? 180000 : D.JOGO.incensoSegura * 1000);
        if (s.g.vis) s.g.visAte = 0;
      }
    });

    socket.on('fs-palpite', (id) => {
      const { room, s, j } = daSala();
      if (!j) return;
      j.palpite = D.MONSTRO[id] ? id : null;
      s.mudou = true;
    });

    socket.on('fs-terminar', () => {
      const { room, s, j } = daSala();
      if (!j || s.fase !== 'jogo') return;
      terminar(room, s, 'van');
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.fantasmas) sair(room, user?.id);
    });
  };
}

module.exports = { ligarFantasmas };
