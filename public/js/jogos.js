// Partidas de xadrez de bruxo, dama e jogo da velha: quem senta em cada lado, lances pela rede, adversário de
// computador, e o comando das peças — clicando nas casas, digitando ou falando ("cavalo f3"),
// como o Rony no fim do primeiro Harry Potter.
//
// O servidor só guarda a lista de lances e quem está sentado (e confere de quem é a vez).
// Cada um refaz a partida a partir dos lances com as mesmas regras, então todos veem igual.
import * as THREE from 'three';
import * as X from './xadrez.js';
import * as D from './dama.js';
import * as V from './velha.js';
import { Mesa, MESAS } from './tabuleiros.js';
import { sfx } from './sfx.js';

const $ = (sel) => document.querySelector(sel);
const REGRAS = { xadrez: X, dama: D, velha: V };
const COR = ['w', 'b'];
const PROF = { xadrez: [2, 3, 4], dama: [3, 5, 7], velha: [0, 1, 2] }; // fácil, médio, difícil
// casas de saída/chegada de um lance, para marcar o último lance no tabuleiro
const PONTAS = {
  xadrez: (m) => [m.de, m.para],
  dama: (m) => [m.caminho[0], m.caminho[m.caminho.length - 1]],
  velha: (m) => [m.casa],
};
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;

export class Jogos {
  constructor({ world, player, toast, emitir, selfId, nomeDe }) {
    this.world = world;
    this.player = player;
    this.toast = toast;
    this.emitir = emitir;
    this.selfId = selfId;
    this.nomeDe = nomeDe;
    this.mesas = {};
    this.partidas = {};
    for (const tipo of Object.keys(MESAS)) {
      this.mesas[tipo] = new Mesa(tipo, world);
      this.partidas[tipo] = { lances: [], lugares: [null, null], botDono: null, st: REGRAS[tipo].novo(), sit: { fim: false } };
      this.mesas[tipo].reconstruir(this.partidas[tipo].st.b);
    }
    this.ativa = null; // mesa em que a pessoa está comandando/assistindo
    this.sel = -1;
    this.zoom = 1;
    this.giro = 0;
    this.nivel = 1;
    this.ouvindo = false;
    this.rec = null;
    this.raycaster = new THREE.Raycaster();
    this.ponteiro = new THREE.Vector2();
    this.ligarInterface();
  }

  // ---------------------------------------------------------------- rede
  sincronizar(todas) {
    for (const [tipo, p] of Object.entries(todas || {})) this.receber({ mesa: tipo, ...p }, true);
  }

  receber({ mesa, lances, lugares, botDono }, semAnimar = false) {
    const part = this.partidas[mesa];
    if (!part) return;
    const R = REGRAS[mesa];
    const m3d = this.mesas[mesa];
    part.lugares = lugares;
    part.botDono = botDono;
    const continua = !semAnimar && lances.length >= part.lances.length && part.lances.every((l, i) => l === lances[i]);
    if (continua) {
      for (const txt of lances.slice(part.lances.length)) {
        const m = R.deTexto(part.st, txt);
        if (!m) return this.refazer(mesa, lances);
        this.animar(mesa, part.st, m);
        part.st = R.aplicar(part.st, m);
        part.lances.push(txt);
      }
    } else {
      this.refazer(mesa, lances);
      if (!lances.length) m3d.marcarUltimo(null);
    }
    const antes = part.sit;
    part.sit = R.situacao(part.st);
    if (part.sit.fim && !antes.fim && part.lances.length && continua) this.anunciarFim(mesa);
    if (part.sit.linha) {
      // espera o último X/O cair antes de a linha começar a pular
      m3d.destacar(part.sit.linha);
    }
    if (mesa === this.ativa) {
      this.limparSel();
      this.atualizarHud();
    }
    this.vezDoComputador(mesa);
  }

  refazer(mesa, lances) {
    const part = this.partidas[mesa];
    const R = REGRAS[mesa];
    let st = R.novo();
    const ok = [];
    let ultimo = null;
    for (const txt of lances) {
      const m = R.deTexto(st, txt);
      if (!m) break;
      ultimo = PONTAS[mesa](m);
      st = R.aplicar(st, m);
      ok.push(txt);
    }
    part.st = st;
    part.lances = ok;
    this.mesas[mesa].reconstruir(st.b, ultimo);
  }

  animar(mesa, st, m) {
    const m3d = this.mesas[mesa];
    const R = REGRAS[mesa];
    if (mesa === 'xadrez') m3d.animarXadrez(m);
    else if (mesa === 'velha') m3d.animarVelha(m);
    else m3d.animarDama({ ...m, promove: D.promoveu(st, m) });
    // anuncia só para quem está perto ou comandando
    if (this.ativa === mesa || m3d.perto(this.player.pos, 20)) {
      let frase = R.descrever(st, m);
      if (mesa === 'xadrez') {
        const prox = X.aplicar(st, m);
        if (X.emXeque(prox) && X.legais(prox).length) frase += '. Xeque!';
      }
      this.mensagem(frase);
    }
  }

  anunciarFim(mesa) {
    const part = this.partidas[mesa];
    const { vencedor, motivo } = part.sit;
    const lados = MESAS[mesa].lados;
    const quem = mesa === 'velha' ? 'do' : 'das';
    const txt = vencedor ? `${motivo}! Vitória ${quem} ${lados[COR.indexOf(vencedor)]}${this.nomeLugar(part.lugares[COR.indexOf(vencedor)], ' — ')}` : motivo;
    if (this.ativa === mesa || this.mesas[mesa].perto(this.player.pos, 20)) {
      this.toast(txt, vencedor ? 'success' : 'info', 7000);
      sfx.finish();
    }
  }

  nomeLugar(id, prefixo = '') {
    if (!id) return '';
    if (id === 'bot') return `${prefixo}computador`;
    return prefixo + (id === this.selfId() ? 'você' : this.nomeDe(id) || 'alguém');
  }

  // lado (0/1) em que estou sentado nessa mesa e é a minha vez? (sentado nos dois: sempre)
  meuLadoDaVez(mesa) {
    const part = this.partidas[mesa];
    const vez = COR.indexOf(part.st.vez);
    return part.lugares[vez] === this.selfId() ? vez : -1;
  }
  meuLado(mesa) {
    const l = this.partidas[mesa].lugares;
    const eu = this.selfId();
    if (l[0] === eu) return 0;
    if (l[1] === eu) return 1;
    return -1;
  }

  // ---------------------------------------------------------------- computador
  vezDoComputador(mesa) {
    const part = this.partidas[mesa];
    if (part.sit.fim || part.botDono !== this.selfId()) return;
    const vez = COR.indexOf(part.st.vez);
    if (part.lugares[vez] !== 'bot' || part.pensando) return;
    part.pensando = true;
    const n = part.lances.length;
    // espera as peças pararem de andar e "pensa" um pouco, para não parecer instantâneo
    const tentar = () => {
      if (this.mesas[mesa].ocupada) return setTimeout(tentar, 250);
      setTimeout(() => {
        part.pensando = false;
        if (part.lances.length !== n || part.lugares[vez] !== 'bot') return;
        const m = REGRAS[mesa].lanceDoComputador(part.st, PROF[mesa][this.nivel]);
        if (m) this.emitir('jogo-lance', { mesa, n, lance: REGRAS[mesa].paraTexto(m) });
      }, 500);
    };
    tentar();
  }

  // ---------------------------------------------------------------- comandar
  jogar(mesa, m) {
    const part = this.partidas[mesa];
    if (this.meuLadoDaVez(mesa) < 0) return this.mensagem('Não é a sua vez.', true);
    this.emitir('jogo-lance', { mesa, n: part.lances.length, lance: REGRAS[mesa].paraTexto(m) });
    this.limparSel();
  }

  destinos(mesa, de) {
    const ls = REGRAS[mesa].legais(this.partidas[mesa].st);
    return mesa === 'xadrez' ? ls.filter((m) => m.de === de) : ls.filter((m) => m.caminho[0] === de);
  }

  selecionar(i) {
    const mesa = this.ativa;
    this.sel = i;
    const ds = i >= 0 ? this.destinos(mesa, i) : [];
    const alvos = [...new Set(ds.map((m) => (mesa === 'xadrez' ? m.para : m.caminho[m.caminho.length - 1])))];
    this.mesas[mesa].marcar(i, alvos);
  }

  limparSel() {
    this.sel = -1;
    if (this.ativa) this.mesas[this.ativa].marcar(-1);
  }

  clicarCasa(i) {
    const mesa = this.ativa;
    if (!mesa || i < 0) return;
    const part = this.partidas[mesa];
    if (part.sit.fim) return this.mensagem('A partida acabou. Comece um jogo novo.', true);
    if (this.meuLadoDaVez(mesa) < 0) {
      return this.mensagem(this.meuLado(mesa) < 0 ? 'Sente num dos lados para comandar as peças.' : 'Espere a sua vez.', true);
    }
    if (mesa === 'velha') {
      const m = V.legais(part.st).find((x) => x.casa === i);
      return m ? this.jogar(mesa, m) : this.mensagem('Essa casa já está ocupada.', true);
    }
    const p = part.st.b[i];
    const minha = p && (mesa === 'xadrez' ? (p === p.toUpperCase() ? 'w' : 'b') : p.toLowerCase()) === part.st.vez;
    if (this.sel >= 0) {
      const ms = this.destinos(mesa, this.sel).filter((m) => (mesa === 'xadrez' ? m.para : m.caminho[m.caminho.length - 1]) === i);
      if (ms.length) {
        // promoção pelo clique vira dama (por voz dá para pedir outra peça)
        return this.jogar(mesa, ms.find((m) => !m.promo || m.promo === 'q') || ms[0]);
      }
    }
    if (minha) {
      if (!this.destinos(mesa, i).length) {
        const obrig = mesa === 'dama' && D.legais(part.st)[0]?.capturas.length;
        this.mensagem(obrig ? 'Captura obrigatória: escolha a peça que pode comer.' : 'Essa peça não tem para onde ir.', true);
      }
      return this.selecionar(i);
    }
    this.limparSel();
  }

  // comando falado ou digitado
  comandar(texto) {
    const mesa = this.ativa;
    if (!mesa || !texto.trim()) return;
    const part = this.partidas[mesa];
    const t = texto.toLowerCase();
    if (/\b(desfaz|cancela|solta)\b/.test(t)) return this.limparSel();
    if (part.sit.fim) return this.mensagem('A partida acabou. Comece um jogo novo.', true);
    if (this.meuLadoDaVez(mesa) < 0) return this.mensagem(this.meuLado(mesa) < 0 ? 'Sente num dos lados para comandar.' : 'Espere a sua vez.', true);
    if (mesa === 'velha') {
      // "meio"/"centro" = b2; os cantos e lados vão pelas coordenadas
      const r = V.interpretar(part.st, X.casasNoTexto(/\b(meio|centro)\b/.test(t) ? 'b2' : t));
      return r.erro ? this.mensagem(r.erro, true) : this.jogar(mesa, r.lance);
    }
    let casas = X.casasNoTexto(t);
    const citouPeca = /\b(pe[aã]o|cavalo|bispo|torre|dama|rainha|rei)\b/.test(t);
    // só uma casa, e nela tem uma peça minha: é escolher a peça
    const minha = casas.length === 1 && this.minhaEm(casas[0]);
    // já tinha uma peça escolhida e falou só o destino
    if (this.sel >= 0 && casas.length === 1 && !minha && !citouPeca) casas = [this.sel, casas[0]];
    else if (minha && !citouPeca) {
      this.selecionar(casas[0]);
      return this.mensagem(`Escolhida a peça em ${X.casaNome(casas[0])}. Para onde?`);
    }
    const r = mesa === 'xadrez'
      ? X.interpretar(part.st, casas.length === 2 && this.sel >= 0 ? `${X.casaNome(casas[0])} ${X.casaNome(casas[1])} ${t}` : t)
      : D.interpretar(part.st, casas);
    if (r.erro) return this.mensagem(r.erro, true);
    this.jogar(mesa, r.lance);
  }

  minhaEm(i) {
    const part = this.partidas[this.ativa];
    const p = part.st.b[i];
    return !!p && (this.ativa === 'xadrez' ? (p === p.toUpperCase() ? 'w' : 'b') : p.toLowerCase()) === part.st.vez;
  }

  // ---------------------------------------------------------------- entrar / sair
  maisPerto(pos) {
    for (const [tipo, m] of Object.entries(this.mesas)) if (m.perto(pos)) return tipo;
    return null;
  }

  rotulo(mesa) {
    const part = this.partidas[mesa];
    const livre = part.lugares.some((l) => !l) || this.meuLado(mesa) >= 0;
    return livre ? `Comandar: ${MESAS[mesa].nome}` : `Assistir: ${MESAS[mesa].nome}`;
  }

  entrar(mesa) {
    this.ativa = mesa;
    this.zoom = 1;
    this.giro = 0;
    // já sentado em algum lado? continua. Senão senta no primeiro livre.
    const part = this.partidas[mesa];
    if (this.meuLado(mesa) < 0) {
      const livre = part.lugares.findIndex((l) => !l);
      if (livre >= 0) this.sentar(livre);
    }
    this.atualizarCamera();
    $('#jogo-hud').hidden = false;
    document.body.classList.add('jogo-on');
    this.atualizarHud();
    $('#jh-cmd').placeholder = {
      xadrez: 'Comande: "cavalo f3", "e2 e4", "roque"',
      dama: 'Comande: "c3 d4", "d4 f6 d8"',
      velha: 'Comande: "b2", "meio", "a1"',
    }[mesa];
    this.mensagem({
      xadrez: 'Clique numa peça e depois na casa — ou fale/digite: "cavalo f3", "e2 e4", "roque".',
      dama: 'Clique numa pedra e depois na casa — ou fale/digite: "c3 d4". Comer é obrigatório.',
      velha: 'Clique na casa — ou fale/digite: "b2", "meio", "a1". Três em linha ganha.',
    }[mesa]);
  }

  sair() {
    if (!this.ativa) return;
    this.mesas[this.ativa].marcar(-1);
    this.mesas[this.ativa].apontar(-1);
    this.ativa = null;
    this.sel = -1;
    this.player.override = null;
    this.pararVoz();
    $('#jogo-hud').hidden = true;
    document.body.classList.remove('jogo-on');
    this.world.canvas.style.cursor = '';
  }

  sentar(lado) {
    const mesa = this.ativa;
    this.emitir('jogo-sentar', { mesa, lado }, (r) => {
      if (r?.erro) return this.mensagem(r.erro, true);
      // fica de pé na beira do tabuleiro, do seu lado, como quem comanda
      const pos = this.mesas[mesa].posComandante(lado);
      this.player.teleport(pos, lado === 0 ? 0 : Math.PI);
      this.atualizarCamera(lado);
    });
  }

  atualizarCamera(ladoForcado = null) {
    if (!this.ativa) return;
    const lado = ladoForcado ?? this.meuLado(this.ativa);
    this.player.override = this.mesas[this.ativa].pose(lado < 0 ? 0 : lado, this.zoom, this.giro);
  }

  // ---------------------------------------------------------------- voz
  alternarVoz() {
    if (this.ouvindo) return this.pararVoz();
    if (!Reconhecimento) return this.mensagem('Este navegador não reconhece voz. Use o Chrome ou o Edge — ou digite o comando.', true);
    const rec = new Reconhecimento();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0].transcript.trim();
        $('#jh-cmd').value = txt;
        if (!r.isFinal) continue;
        // a primeira alternativa que vire um lance válido ganha (o "bê" às vezes sai "vê")
        const alts = [...r].map((a) => a.transcript);
        const boa = alts.find((a) => this.entende(a)) || alts[0];
        $('#jh-cmd').value = '';
        this.mensagem(`"${boa}"`);
        this.comandar(boa);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') this.mensagem('O navegador bloqueou o microfone para o reconhecimento de voz.', true);
      else if (e.error !== 'no-speech' && e.error !== 'aborted') this.mensagem(`Voz: ${e.error}`, true);
    };
    rec.onend = () => {
      // o Chrome desliga sozinho depois de um tempo em silêncio: liga de novo
      if (this.ouvindo && this.rec === rec) {
        try { rec.start(); } catch { this.pararVoz(); }
      }
    };
    try {
      rec.start();
    } catch {
      return;
    }
    this.rec = rec;
    this.ouvindo = true;
    $('#jh-voz').classList.add('on');
    this.mensagem('Ouvindo… fale o lance. Ex.: "cavalo f3", "peão e4", "bispo toma c6".');
  }

  // o texto vira algum lance válido? (para escolher entre as alternativas da voz)
  entende(txt) {
    const mesa = this.ativa;
    if (!mesa) return false;
    const st = this.partidas[mesa].st;
    if (mesa === 'xadrez') return !!X.interpretar(st, txt).lance;
    if (mesa === 'velha') return !!V.interpretar(st, X.casasNoTexto(txt)).lance;
    return !!D.interpretar(st, X.casasNoTexto(txt)).lance;
  }

  pararVoz() {
    this.ouvindo = false;
    const rec = this.rec;
    this.rec = null;
    try { rec?.stop(); } catch { /* já parou */ }
    $('#jh-voz')?.classList.remove('on');
  }

  // ---------------------------------------------------------------- HUD
  mensagem(txt, erro = false) {
    const el = $('#jh-msg');
    if (!el) return;
    el.textContent = txt;
    el.classList.toggle('erro', erro);
  }

  atualizarHud() {
    const mesa = this.ativa;
    if (!mesa) return;
    const part = this.partidas[mesa];
    const def = MESAS[mesa];
    $('#jh-titulo').textContent = def.nome;
    const eu = this.selfId();
    for (const lado of [0, 1]) {
      const id = part.lugares[lado];
      const el = $(`#jh-lado${lado}`);
      el.querySelector('b').textContent = def.lados[lado];
      el.querySelector('span').textContent = id ? this.nomeLugar(id) : 'livre';
      el.classList.toggle('vez', !part.sit.fim && COR.indexOf(part.st.vez) === lado);
      const btn = el.querySelector('button');
      btn.hidden = !!id && id !== eu && !(id === 'bot' && part.botDono === eu);
      btn.textContent = !id ? 'Sentar' : id === eu ? 'Levantar' : 'Tirar';
      btn.dataset.acao = !id ? 'sentar' : id === eu ? 'levantar' : 'tirar-bot';
    }
    const meu = this.meuLado(mesa);
    const outro = meu < 0 ? -1 : 1 - meu;
    $('#jh-bot').hidden = !(meu >= 0 && !part.lugares[outro]);
    $('#jh-nivel').hidden = !part.lugares.includes('bot') && $('#jh-bot').hidden;
    let status;
    if (part.sit.fim) {
      const v = part.sit.vencedor;
      status = v ? `${part.sit.motivo} — ${mesa === 'velha' ? 'venceu o' : 'venceram as'} ${def.lados[COR.indexOf(v)]}` : part.sit.motivo;
    } else {
      const vez = COR.indexOf(part.st.vez);
      status = this.meuLadoDaVez(mesa) >= 0 ? 'Sua vez de comandar' : `Vez ${mesa === 'velha' ? 'do' : 'das'} ${def.lados[vez]}${this.nomeLugar(part.lugares[vez], ' · ')}`;
      if (mesa === 'xadrez' && part.sit.xeque) status += ' — XEQUE!';
    }
    $('#jh-status').textContent = status;
    $('#jh-novo').hidden = !(meu >= 0 || !part.lugares.some((l) => l && l !== 'bot'));
    $('#jh-form').hidden = meu < 0;
  }

  ligarInterface() {
    const canvas = this.world.canvas;
    const raio = (e) => {
      const r = canvas.getBoundingClientRect();
      this.ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.ponteiro, this.world.camera);
      return this.mesas[this.ativa].casaNoRaio(this.raycaster);
    };
    canvas.addEventListener('pointermove', (e) => {
      if (!this.ativa || document.pointerLockElement) return;
      const i = raio(e);
      this.mesas[this.ativa].apontar(i);
      canvas.style.cursor = i >= 0 ? 'pointer' : '';
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.ativa || document.pointerLockElement || e.button !== 0) return;
      this.clicarCasa(raio(e));
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.ativa) return;
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.45, 1.6);
      this.atualizarCamera();
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (!this.ativa || document.activeElement?.tagName === 'INPUT') return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.giro -= 0.15;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.giro += 0.15;
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.zoom = Math.max(0.45, this.zoom * 0.92);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.zoom = Math.min(1.6, this.zoom * 1.08);
      else if (e.code === 'Space') {
        e.preventDefault();
        this.alternarVoz();
        return;
      } else return;
      this.atualizarCamera();
    });

    $('#jh-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('#jh-cmd');
      this.comandar(inp.value);
      inp.value = '';
      inp.blur();
    });
    $('#jh-voz').addEventListener('click', () => this.alternarVoz());
    // botão clicado não fica com o foco: senão o Espaço (voz) o apertaria de novo
    $('#jogo-hud').addEventListener('click', (e) => e.target.closest('button')?.blur());
    $('#jh-novo').addEventListener('click', () => this.emitir('jogo-novo', { mesa: this.ativa }));
    $('#jh-bot').addEventListener('click', () => {
      const meu = this.meuLado(this.ativa);
      this.emitir('jogo-bot', { mesa: this.ativa, lado: 1 - meu, nivel: this.nivel }, (r) => r?.erro && this.mensagem(r.erro, true));
    });
    $('#jh-nivel').addEventListener('change', (e) => {
      this.nivel = Number(e.target.value);
      // o servidor guarda o nível: a vitória contra o computador difícil vale mais moedas
      if (this.ativa) this.emitir('jogo-nivel', { mesa: this.ativa, nivel: this.nivel });
    });
    for (const lado of [0, 1]) {
      $(`#jh-lado${lado} button`).addEventListener('click', (e) => {
        const acao = e.currentTarget.dataset.acao;
        if (acao === 'sentar') this.sentar(lado);
        else if (acao === 'levantar') this.emitir('jogo-levantar', { mesa: this.ativa, lado });
        else this.emitir('jogo-levantar', { mesa: this.ativa, lado });
      });
    }
  }

  update(dt, t) {
    const cam = this.world.camera.position;
    for (const m of Object.values(this.mesas)) m.update(dt, t, cam);
  }
}
