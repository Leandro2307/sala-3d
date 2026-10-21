// Mesa de dados: dois dados de 6 lados num "poço" de feltro ao lado do jogo da velha.
// Quem chega aperta E, escolhe a aposta (contra a banca) e rola. Quem sorteia é o servidor;
// aqui só se anima: os dados voam, quicam, giram e param com a face sorteada para cima.
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { isTouch } from './touch.js';
import { MESAS_NOVO } from './cidade-dados.js';

// ao lado do jogo da velha (no mundo novo, na praça dos jogos: cidade-dados.js)
export const MESA_DADOS = { ...MESAS_NOVO.dados };
const FELTRO = { w: 11, d: 8 };
const Y = 0.17;
const T = 1.1; // lado do dado
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const $ = (s) => document.querySelector(s);
// feltro e placa desenhados em escala: no celular o canvas tem a metade
const ESCALA = isTouch ? 0.5 : 1;

// aposta -> quanto paga por moeda (igual ao servidor)
const PAGA_SOMA = { 2: 30, 3: 15, 4: 10, 5: 7, 6: 6, 7: 4, 8: 6, 9: 7, 10: 10, 11: 15, 12: 30 };
const APOSTAS = {
  baixo: { nome: 'Baixo (2 a 6)', paga: 1 },
  sete: { nome: 'Sete', paga: 4 },
  alto: { nome: 'Alto (8 a 12)', paga: 1 },
  dupla: { nome: 'Dupla (iguais)', paga: 4 },
  soma: { nome: 'Soma exata', paga: null },
};

// faces na ordem do BoxGeometry (+x, -x, +y, -y, +z, -z); opostas somam 7
const FACES = [3, 4, 1, 6, 2, 5];
const NORMAL = {
  1: new THREE.Vector3(0, 1, 0), 6: new THREE.Vector3(0, -1, 0),
  3: new THREE.Vector3(1, 0, 0), 4: new THREE.Vector3(-1, 0, 0),
  2: new THREE.Vector3(0, 0, 1), 5: new THREE.Vector3(0, 0, -1),
};
const PONTOS = {
  1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};

function faceTex(v) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fbf7ee';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#d9d0bd';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 246);
  ctx.fillStyle = v === 1 ? '#d6203a' : '#171923';
  for (const [x, y] of PONTOS[v]) {
    ctx.beginPath();
    ctx.arc(x * 256, y * 256, v === 1 ? 34 : 24, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function texturaFeltro() {
  // desenhado em W x H, encolhido no celular
  const W = 1024;
  const H = Math.round(W * FELTRO.d / FELTRO.w);
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * ESCALA);
  cv.height = Math.round(H * ESCALA);
  const ctx = cv.getContext('2d');
  ctx.setTransform(ESCALA, 0, 0, ESCALA, 0, 0);
  ctx.fillStyle = '#0f5a3a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255, 230, 160, 0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.fillStyle = 'rgba(255, 230, 160, 0.5)';
  ctx.font = `800 64px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DADOS', W / 2, H / 2 - 40);
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('baixo 1:1  ·  sete 4:1  ·  alto 1:1  ·  dupla 4:1', W / 2, H / 2 + 30);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function placaResultado() {
  // desenhada em 1024 x 256, encolhida no celular
  const cv = document.createElement('canvas');
  cv.width = 1024 * ESCALA;
  cv.height = 256 * ESCALA;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  sprite.scale.set(8, 2, 1);
  sprite.renderOrder = 10;
  sprite.visible = false;
  const escrever = (linha1, linha2, cor) => {
    const ctx = cv.getContext('2d');
    ctx.setTransform(ESCALA, 0, 0, ESCALA, 0, 0); // a cada escrita: scale() somaria com o da anterior
    ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = 'rgba(12, 14, 22, 0.86)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 1008, 240, 40);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 104px ${FONT}`;
    ctx.fillText(linha1, 512, 92);
    ctx.fillStyle = cor;
    ctx.font = `700 52px ${FONT}`;
    ctx.fillText(linha2, 512, 190);
    tex.needsUpdate = true;
  };
  return { sprite, escrever };
}

const easeOut = (t) => 1 - (1 - t) ** 3;

export class Dados {
  constructor({ world, player, emitir, toast, selfId, saldo, aoTerminar }) {
    this.world = world;
    this.player = player;
    this.emitir = emitir;
    this.toast = toast;
    this.selfId = selfId;
    this.saldo = saldo;
    this.aoTerminar = aoTerminar; // (evento) quando os dados param — aí o saldo novo aparece
    this.fila = [];
    this.atual = null;
    this.ativo = false;
    this.aposta = 'alto';
    this.historico = [];
    this.construir();
    this.ligarInterface();
  }

  construir() {
    const g = new THREE.Group();
    g.position.set(MESA_DADOS.x, 0, MESA_DADOS.z);
    this.grupo = g;
    this.world.fora.add(g);
    const praca = 16;
    const pedra = new THREE.Mesh(new THREE.BoxGeometry(praca, 0.15, praca), new THREE.MeshStandardMaterial({ color: 0x4b4f5c, roughness: 0.95 }));
    pedra.position.y = 0.075;
    pedra.receiveShadow = true;
    g.add(pedra);
    this.world.addBox({ min: [MESA_DADOS.x - praca / 2, 0, MESA_DADOS.z - praca / 2], max: [MESA_DADOS.x + praca / 2, 0.15, MESA_DADOS.z + praca / 2] });

    const feltro = new THREE.Mesh(new THREE.PlaneGeometry(FELTRO.w, FELTRO.d), new THREE.MeshStandardMaterial({ map: texturaFeltro(), roughness: 0.95 }));
    feltro.rotation.x = -Math.PI / 2;
    feltro.position.y = Y;
    feltro.receiveShadow = true;
    g.add(feltro);
    // borda de madeira em volta do feltro (baixinha: dá para ver os dados de pé)
    const madeira = new THREE.MeshStandardMaterial({ color: 0x5b3420, roughness: 0.55 });
    const ouro = new THREE.MeshStandardMaterial({ color: 0xf5c451, metalness: 0.8, roughness: 0.3 });
    for (const [w, d, x, z] of [
      [FELTRO.w + 1, 0.5, 0, FELTRO.d / 2 + 0.25], [FELTRO.w + 1, 0.5, 0, -FELTRO.d / 2 - 0.25],
      [0.5, FELTRO.d, FELTRO.w / 2 + 0.25, 0], [0.5, FELTRO.d, -FELTRO.w / 2 - 0.25, 0],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), madeira);
      b.position.set(x, 0.5, z);
      b.castShadow = b.receiveShadow = true;
      const friso = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), ouro);
      friso.position.set(x, 0.88, z);
      g.add(b, friso);
    }
    const luz = new THREE.PointLight(0xfff0c8, 90, 26, 1.5);
    luz.position.set(0, 8, 0);
    g.add(luz);

    const mats = FACES.map((v) => new THREE.MeshStandardMaterial({ map: faceTex(v), roughness: 0.35 }));
    const geo = new THREE.BoxGeometry(T, T, T);
    this.dados = [0, 1].map((k) => {
      const d = new THREE.Mesh(geo, mats);
      d.castShadow = true;
      d.position.set(k ? 1.2 : -1.2, Y + T / 2, 0);
      g.add(d);
      return d;
    });
    const placa = placaResultado();
    placa.sprite.position.set(0, 5.2, 0);
    g.add(placa.sprite);
    this.placa = placa;
  }

  perto(p) {
    return Math.abs(p.x - MESA_DADOS.x) < 9.5 && Math.abs(p.z - MESA_DADOS.z) < 9.5;
  }

  pose() {
    return {
      position: new THREE.Vector3(MESA_DADOS.x, 11, MESA_DADOS.z + 11),
      target: new THREE.Vector3(MESA_DADOS.x, 0, MESA_DADOS.z + 0.5),
    };
  }

  // chegou uma jogada do servidor: entra na fila de animação
  receber(ev) {
    this.fila.push(ev);
  }

  iniciar(ev) {
    // os dois saem da beira de cá do feltro e param perto do meio, cada um num canto
    const finais = [new THREE.Vector3(-1.1 + Math.random() * 0.6, Y + T / 2, -0.8 + Math.random() * 1.2), new THREE.Vector3(1.0 + Math.random() * 0.8, Y + T / 2, -0.6 + Math.random() * 1.4)];
    this.atual = {
      ev,
      t: 0,
      dur: 2.3,
      quiques: 0,
      dados: this.dados.map((d, k) => {
        const final = finais[k];
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
        const qFinal = yaw.multiply(new THREE.Quaternion().setFromUnitVectors(NORMAL[k ? ev.b : ev.a], new THREE.Vector3(0, 1, 0)));
        return {
          d,
          de: new THREE.Vector3(-3 + k * 1.4, Y + 3.5, FELTRO.d / 2 - 0.6),
          final,
          qFinal,
          eixo: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
          giro: Math.PI * (6 + Math.random() * 4),
        };
      }),
    };
    this.placa.sprite.visible = false;
    sfx.pedraPasso?.(0.3);
  }

  update(dt) {
    if (!this.atual) {
      const prox = this.fila.shift();
      if (prox) this.iniciar(prox);
      return;
    }
    const a = this.atual;
    // dados voando: a sombra do sol muda (até o quadro em que param), se a mesa aparece e está na
    // área da sombra (ver Mesa.marcarSombra, em tabuleiros.js)
    const w = this.world;
    if (this.grupo.visible && w.fora.visible && (w.pertoDoSol?.(this.grupo.position) ?? true)) w.marcarSombra?.();
    a.t += dt;
    const t = Math.min(1, a.t / a.dur);
    const k = easeOut(t);
    const q = new THREE.Quaternion();
    for (const x of a.dados) {
      x.d.position.lerpVectors(x.de, x.final, k);
      // quica 3 vezes, cada vez mais baixo
      const pulo = Math.abs(Math.cos(t * Math.PI * 3.5)) * 2.6 * (1 - t) ** 1.6;
      x.d.position.y = Y + T / 2 + pulo + (1 - t) ** 6 * 1.5;
      q.setFromAxisAngle(x.eixo, x.giro * (1 - k));
      x.d.quaternion.copy(x.qFinal).multiply(q);
    }
    // estalo a cada quique
    const quiques = Math.floor(t * 3.5 + 0.5);
    if (quiques > a.quiques && t < 0.9) {
      a.quiques = quiques;
      sfx.dado?.(Math.max(0.15, 1 - t));
    }
    if (t >= 1) {
      for (const x of a.dados) {
        x.d.position.copy(x.final);
        x.d.quaternion.copy(x.qFinal);
      }
      this.terminou(a.ev);
      this.atual = null;
    }
  }

  terminou(ev) {
    const soma = ev.a + ev.b;
    let linha2 = ev.nome;
    let cor = '#c7cede';
    if (ev.aposta) {
      linha2 = ev.ganhou ? `${ev.nome} ganhou ${ev.delta} moedas!` : `${ev.nome} perdeu ${-ev.delta}`;
      cor = ev.ganhou ? '#6ee7c8' : '#ff8a9a';
    }
    this.placa.escrever(`${ev.a} + ${ev.b} = ${soma}${ev.a === ev.b ? '  DUPLA' : ''}`, linha2, cor);
    this.placa.sprite.visible = true;
    clearTimeout(this.esconder);
    this.esconder = setTimeout(() => { this.placa.sprite.visible = false; }, 6000);
    if (ev.aposta && ev.ganhou) sfx.moeda?.();
    this.historico.unshift(ev);
    this.historico.length = Math.min(this.historico.length, 8);
    if (this.ativo) this.atualizarHud();
    this.aoTerminar?.(ev);
  }

  // ---------------------------------------------------------------- painel
  entrar() {
    this.ativo = true;
    this.player.override = this.pose();
    $('#dados-hud').hidden = false;
    document.body.classList.add('jogo-on');
    this.atualizarHud();
  }

  sair() {
    if (!this.ativo) return;
    this.ativo = false;
    this.player.override = null;
    $('#dados-hud').hidden = true;
    document.body.classList.remove('jogo-on');
  }

  pagamento() {
    if (this.aposta === 'soma') return PAGA_SOMA[Number($('#dh-soma').value)];
    return APOSTAS[this.aposta].paga;
  }

  atualizarHud() {
    $('#dh-saldo').textContent = this.saldo();
    for (const b of document.querySelectorAll('#dh-tipos [data-tipo]')) b.classList.toggle('on', b.dataset.tipo === this.aposta);
    $('#dh-soma').disabled = this.aposta !== 'soma';
    const qtd = Math.floor(Number($('#dh-qtd').value) || 0);
    $('#dh-paga').textContent = qtd > 0 ? `Se ganhar: +${qtd * this.pagamento()} moedas (paga ${this.pagamento()} por 1)` : `Paga ${this.pagamento()} por 1`;
    $('#dh-hist').innerHTML = this.historico.map((ev) => {
      const s = ev.a + ev.b;
      const res = ev.aposta ? (ev.ganhou ? `<b class="g">+${ev.delta}</b>` : `<b class="p">${ev.delta}</b>`) : '';
      return `<li><span class="dh-dado">${ev.a}</span><span class="dh-dado">${ev.b}</span> = ${s} <small>${esc(ev.nome)}</small> ${res}</li>`;
    }).join('') || '<li class="vazio">Ninguém rolou ainda.</li>';
  }

  rolar(apostar = true) {
    const qtd = apostar ? Math.floor(Number($('#dh-qtd').value) || 0) : 0;
    if (apostar && qtd <= 0) return this.msg('Escolha quanto apostar (ou use "Só rolar").', true);
    if (qtd > this.saldo()) return this.msg(`Você só tem ${this.saldo()} moedas.`, true);
    if (this.atual || this.fila.length) return this.msg('Espere os dados pararem.', true);
    this.emitir('dados-rolar', { tipo: this.aposta, valor: Number($('#dh-soma').value), qtd }, (r) => {
      if (r?.erro) this.msg(r.erro, true);
      else this.msg(qtd ? `Apostou ${qtd} em ${APOSTAS[this.aposta].nome.toLowerCase()}${this.aposta === 'soma' ? ` ${$('#dh-soma').value}` : ''}…` : 'Rolando…');
    });
  }

  msg(txt, erro = false) {
    const el = $('#dh-msg');
    el.textContent = txt;
    el.classList.toggle('erro', erro);
  }

  ligarInterface() {
    $('#dh-tipos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tipo]');
      if (!b) return;
      this.aposta = b.dataset.tipo;
      this.atualizarHud();
    });
    $('#dh-soma').addEventListener('change', () => this.atualizarHud());
    $('#dh-qtd').addEventListener('input', () => this.atualizarHud());
    $('#dh-rapidos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-qtd]');
      if (!b) return;
      const v = b.dataset.qtd;
      $('#dh-qtd').value = v === 'tudo' ? this.saldo() : v === 'metade' ? Math.floor(this.saldo() / 2) : v;
      this.atualizarHud();
    });
    $('#dh-rolar').addEventListener('click', () => this.rolar(true));
    $('#dh-so').addEventListener('click', () => this.rolar(false));
    $('#dados-hud').addEventListener('click', (e) => e.target.closest('button')?.blur());
    window.addEventListener('keydown', (e) => {
      if (!this.ativo || e.code !== 'Space' || document.activeElement?.tagName === 'INPUT') return;
      e.preventDefault();
      this.rolar(true);
    });
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
