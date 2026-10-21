// Mata-mata em times (Autobots × Decepticons), numa arena própria no céu. O portal fica ao lado dos
// do surf e do mata-mata (E no portal; Esc volta para o chão).
//
// Rodadas como no CS: todo mundo nasce no lado do seu time com pistola, e as outras armas ficam no
// chão. Quem cai na rodada vira espectador: a câmera segue um colega de pé (clique ou ← → troca) até
// a rodada acabar. Vence a rodada o time que derrubar o outro inteiro, ou que tiver mais gente de pé
// quando o tempo acaba; quem fizer BATALHA.vencer rodadas leva a partida. Tiro em colega não pega.
// O servidor (batalha-servidor.js) é quem manda: times, fase, relógio e quem está de pé.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BATALHA, TIMES, naBatalha } from './batalha-dados.js';
import { PORTAIS } from './ceu-dados.js';
import { textura, placaTexto } from './ceu.js';
import { criarArma, ARMAS } from './armas.js';
import { isTouch } from './touch.js';

const FONTE = (p, peso = 800) => `${peso} ${p}px 'Plus Jakarta Sans', system-ui, sans-serif`;
const VALENDO = ['preparo', 'luta', 'fimRodada'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ a arena
export function construirArenaTimes(world) {
  const A = BATALHA;
  const g = new THREE.Group();
  world.fora.add(g);
  // As caixas viram uma malha só por material (são ~70: uma por caixa seriam 70 desenhos). Cada uma
  // continua sendo uma colisão; as malhas fundidas seguram a câmera e o tiro.
  const porMaterial = new Map();
  const caixa = (x0, y0, z0, x1, y1, z1, mat) => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate(A.x + (x0 + x1) / 2, A.y + (y0 + y1) / 2, A.z + (z0 + z1) / 2);
    if (!porMaterial.has(mat)) porMaterial.set(mat, []);
    porMaterial.get(mat).push(geo);
    world.addBox({ min: [A.x + x0, A.y + y0, A.z + z0], max: [A.x + x1, A.y + y1, A.z + z1] });
  };
  // chão de chapas de metal, paredes de aço, divisórias, cubos de energon e a plataforma
  const chapas = textura(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6b7a90';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#76869c';
    ctx.fillRect(6, 6, w / 2 - 12, h / 2 - 12);
    ctx.fillRect(w / 2 + 6, h / 2 + 6, w / 2 - 12, h / 2 - 12);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  chapas.wrapS = chapas.wrapT = THREE.RepeatWrapping;
  chapas.repeat.set(A.lx / 6, A.lz / 6);
  const listras = textura(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#3f4652';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#facc15';
    for (let i = -h; i < w; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, h);
      ctx.lineTo(i + 16, h);
      ctx.lineTo(i + 16 + h, 0);
      ctx.lineTo(i + h, 0);
      ctx.fill();
    }
  });
  // metal sem mapa de reflexo fica preto: pouco "metalness", e a cor clara faz o papel do brilho
  const matChao = new THREE.MeshStandardMaterial({ map: chapas, roughness: 0.75, metalness: 0.1 });
  const matParede = new THREE.MeshStandardMaterial({ color: 0x8a96a8, roughness: 0.7, metalness: 0.1 });
  const matDivisoria = new THREE.MeshStandardMaterial({ color: 0xa3adbb, roughness: 0.65, metalness: 0.1 });
  const matMureta = new THREE.MeshStandardMaterial({ map: listras, roughness: 0.8, metalness: 0.05 });
  const matEnergon = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.9 });
  const matPlataforma = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6, metalness: 0.1 });
  caixa(-A.lx / 2 - 1, -1.5, -A.lz / 2 - 1, A.lx / 2 + 1, 0, A.lz / 2 + 1, matChao);
  const t = 1;
  caixa(-A.lx / 2 - t, 0, -A.lz / 2 - t, A.lx / 2 + t, A.parede, -A.lz / 2, matParede);
  caixa(-A.lx / 2 - t, 0, A.lz / 2, A.lx / 2 + t, A.parede, A.lz / 2 + t, matParede);
  caixa(-A.lx / 2 - t, 0, -A.lz / 2, -A.lx / 2, A.parede, A.lz / 2, matParede);
  caixa(A.lx / 2, 0, -A.lz / 2, A.lx / 2 + t, A.parede, A.lz / 2, matParede);
  for (const c of A.caixas) {
    const alto = c[4] - c[1];
    const larg = Math.max(c[3] - c[0], c[5] - c[2]);
    const noMeio = Math.abs(c[0] + c[3]) / 2 <= 8.3 && Math.abs(c[2] + c[5]) / 2 <= 4.1 && c[1] < 3.01;
    const mat = noMeio ? matPlataforma : alto <= 1.31 ? matMureta : alto <= 3.01 && larg <= 2.1 ? matEnergon : matDivisoria;
    caixa(...c, mat);
  }
  for (const [mat, geos] of porMaterial) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = mat !== matChao;
    m.receiveShadow = true;
    g.add(m);
    world.cameraBlockers.push(m);
    for (const geo of geos) geo.dispose();
  }

  // as cores dos times: o chão do nascimento, uma faixa de luz no alto da parede e a bandeira
  TIMES.forEach((time, k) => {
    const s = k ? 1 : -1; // o time 0 nasce a oeste (x negativo)
    const cor = new THREE.Color(time.cor);
    const zona = new THREE.Mesh(new THREE.PlaneGeometry(12, A.lz - 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.13, depthWrite: false, toneMapped: false }));
    zona.position.set(A.x + s * (A.lx / 2 - 6), A.y + 0.02, A.z);
    const luz = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, A.lz), new THREE.MeshBasicMaterial({ color: cor, toneMapped: false }));
    luz.position.set(A.x + s * (A.lx / 2 - 0.1), A.y + A.parede - 0.3, A.z);
    for (const lado of [-1, 1]) {
      const faixa = new THREE.Mesh(new THREE.BoxGeometry(A.lx / 2, 0.25, 0.2), luz.material);
      faixa.position.set(A.x + s * A.lx / 4, A.y + A.parede - 0.3, A.z + lado * (A.lz / 2 - 0.1));
      g.add(faixa);
    }
    const bandeira = textura(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(11,16,32,0.92)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = time.cor;
      ctx.fillRect(0, 0, w, 14);
      ctx.fillRect(0, h - 14, w, 14);
      ctx.font = FONTE(130, 900);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(time.nome.toUpperCase(), w / 2, h / 2 + 6);
    });
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: bandeira, toneMapped: false }));
    placa.position.set(A.x + s * (A.lx / 2 - 0.08), A.y + A.parede + 2.6, A.z);
    placa.rotation.y = -s * Math.PI / 2;
    g.add(zona, luz, placa);
  });

  // a galeria de vidro (colide, mas não segura câmera nem tiro)
  const G = A.galeria;
  world.addBox({ min: [A.x - G.l / 2, A.y + G.y - 0.3, A.z - G.l / 2], max: [A.x + G.l / 2, A.y + G.y, A.z + G.l / 2] });
  const vidro = new THREE.Mesh(new THREE.BoxGeometry(G.l, 0.3, G.l), new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.2, depthWrite: false }));
  vidro.position.set(A.x, A.y + G.y - 0.15, A.z);
  const borda = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(G.l, 1.1, G.l)), new THREE.LineBasicMaterial({ color: 0xf59e0b }));
  borda.position.set(A.x, A.y + G.y + 0.55, A.z);
  for (const [dx, dz, w, d] of [[0, -G.l / 2, G.l, 0.2], [0, G.l / 2, G.l, 0.2], [-G.l / 2, 0, 0.2, G.l], [G.l / 2, 0, 0.2, G.l]]) {
    world.addBox({ min: [A.x + dx - w / 2, A.y + G.y, A.z + dz - d / 2], max: [A.x + dx + w / 2, A.y + G.y + 1.1, A.z + dz + d / 2] });
  }
  const placaGaleria = placaTexto('GALERIA', '#f59e0b', 3);
  placaGaleria.position.set(A.x, A.y + G.y + 2.4, A.z);
  g.add(vidro, borda, placaGaleria);

  // pedestais das armas
  const itens = A.itens.map((it) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.2, 20), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
    base.position.set(A.x + it.x, A.y + it.y + 0.1, A.z + it.z);
    const luz = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.6, toneMapped: false }));
    luz.position.set(A.x + it.x, A.y + it.y + 0.21, A.z + it.z);
    const nome = placaTexto(ARMAS[it.tipo]?.nome || it.tipo, '#f59e0b', 2.2);
    nome.position.set(A.x + it.x, A.y + it.y + 1.9, A.z + it.z);
    const segura = new THREE.Group();
    segura.position.set(A.x + it.x, A.y + it.y + 1.0, A.z + it.z);
    g.add(base, luz, nome, segura);
    criarArma(it.tipo).then((arma) => {
      arma.scale.multiplyScalar(1.8);
      segura.add(arma);
    }).catch(() => {});
    return { segura, luz, nome };
  });

  // placar, nas duas paredes compridas, por cima, virado para dentro
  const placar = textura(768, 448, (ctx, w, h, e) => {
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    const p = e?.placar || [0, 0];
    ctx.textBaseline = 'middle';
    TIMES.forEach((time, k) => {
      const x0 = k ? w / 2 : 0;
      ctx.fillStyle = time.cor;
      ctx.fillRect(x0, 0, w / 2, 70);
      ctx.fillStyle = '#fff';
      ctx.font = FONTE(34, 900);
      ctx.textAlign = 'center';
      ctx.fillText(`${time.nome.toUpperCase()}  ${p[k]}`, x0 + w / 4, 37);
      const lista = (e?.jogadores || []).filter((j) => j.time === k).sort((a, b) => b.abates - a.abates || a.mortes - b.mortes);
      ctx.font = FONTE(25, 700);
      lista.slice(0, 8).forEach((j, i) => {
        const y = 102 + i * 36;
        ctx.globalAlpha = j.vivo ? 1 : 0.45;
        ctx.textAlign = 'left';
        ctx.fillStyle = j.cor;
        ctx.fillText(`${j.vivo ? '●' : '✖'} ${j.nome.slice(0, 12)}`, x0 + 18, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`${j.abates} / ${j.mortes}`, x0 + w / 2 - 18, y);
        ctx.globalAlpha = 1;
      });
    });
    ctx.fillStyle = '#94a3b8';
    ctx.font = FONTE(22, 700);
    ctx.textAlign = 'center';
    const rodape = !e ? 'arena vazia' : e.fase === 'espera' ? 'esperando gente nos dois times' : `rodada ${e.rodada} · até ${e.vencer}`;
    ctx.fillText(rodape, w / 2, h - 22);
  });
  for (const s of [-1, 1]) {
    const quadro = new THREE.Mesh(new THREE.PlaneGeometry(11, 6.4), new THREE.MeshBasicMaterial({ map: placar, toneMapped: false }));
    quadro.position.set(A.x, A.y + A.parede + 3.4, A.z + s * (A.lz / 2 - 0.05));
    quadro.rotation.y = s > 0 ? Math.PI : 0;
    g.add(quadro);
  }
  return { grupo: g, itens, placar };
}

// ------------------------------------------------------------------ o jogo no navegador
export class Batalha {
  // opts: world, player, sfx, toast, ligado(), socket(), combat(), meuId(), armar(id, tipo|null),
  // avatarDe(id), anuncios, aoEntrar()
  constructor(opts) {
    Object.assign(this, opts);
    this.a3d = opts.world.ceu.times;
    this.ativo = false;
    this.arma = null; // a minha arma na arena
    this.estado = null;
    this.armados = new Set();
    this.caidos = new Set(); // ids dos outros que ficam no chão até a rodada acabar
    this.pediu = new Map();
    this.rodadaVista = 0;
    this.faseVista = null;
    this.fimEm = 0;
    this.alvo = null; // id de quem estou assistindo
    this.caiuEm = 0;
    this.estavaKo = false;
    this.foraDesde = 0;
    this.contagem = -1;
    this.marcas = new Map(); // id -> sprite em cima dos colegas
    this.montarHud();
  }

  ligar(socket) {
    socket.on('bt-estado', (e) => this.recebeu(e));
  }

  ver() {
    this.socket()?.emit('bt-ver', (e) => this.recebeu(e));
  }

  get meu() {
    const id = this.meuId();
    return this.estado?.jogadores.find((j) => j.id === id) || null;
  }

  // quem está nesta batalha (para o main.js não mostrar o aviso de nocaute para a sala inteira)
  temJogador(id) {
    return !!this.estado?.jogadores.some((j) => j.id === id);
  }

  // o meu tiro (ou soco) pode pegar nele? Em times, só em adversário de pé; e quem está dentro não
  // acerta quem está fora, nem o contrário (o servidor confere de novo)
  podeAcertar(id) {
    const e = this.estado;
    if (!e) return true;
    const eu = this.meu;
    const ele = e.jogadores.find((j) => j.id === id);
    if (!eu && !ele) return true;
    if (!eu || !ele) return false;
    return eu.vivo && ele.vivo && eu.time !== ele.time;
  }

  // caído na rodada (o 'ko' chegou com fica): o boneco não levanta até a próxima
  manterCaido(id) {
    this.caidos.add(id);
  }

  // parado: na contagem antes de valer, ou assistindo
  get congelado() {
    const e = this.estado;
    return this.ativo && !!e && (e.fase === 'preparo' || (VALENDO.includes(e.fase) && !!this.meu && !this.meu.vivo));
  }

  get espectando() {
    return this.ativo && !!this.alvo;
  }

  pertoDoPortal() {
    const p = this.player.pos;
    return !this.ativo && this.ligado() && p.y < 5 && Math.hypot(p.x - PORTAIS.times.x, p.z - PORTAIS.times.z) < 2.6;
  }

  entrar() {
    if (this.ativo) return;
    this.socket()?.emit('bt-entrar', (r) => {
      if (!r?.ok) {
        this.toast('O mata-mata em times está desligado nesta sala.', 'info', 2600);
        return;
      }
      this.ativo = true;
      this.aoEntrar?.();
      this.arma = BATALHA.inicial;
      this.rodadaVista = -1; // a primeira notícia do servidor já põe no lugar
      this.hud.hidden = false;
      this.sfx.teleport();
      this.anuncios.limpar();
      this.ver();
      this.toast(isTouch
        ? 'Mata-mata em times: derrube o time inteiro do outro lado. Caiu, assiste até a rodada acabar. Armas no chão; a mira atira. O X do canto sai.'
        : 'Mata-mata em times: derrube o time inteiro do outro lado. Caiu, assiste até a rodada acabar. Armas no chão; clique ou X atira. N troca de time · Esc sai.', 'info', 8000);
    });
  }

  sair(avisar = true) {
    if (!this.ativo) return;
    this.ativo = false;
    this.arma = null;
    this.alvo = null;
    this.player.espectar = null;
    if (avisar) this.socket()?.emit('bt-sair');
    this.hud.hidden = true;
    this.hudEspectador.hidden = true;
    this.hudContagem.hidden = true;
    this.armar(this.meuId(), null);
    const c = this.combat();
    c.semVoltar = false;
    c.semRegen = false;
    if (c.knockedOut) c.reset();
    for (const s of this.marcas.values()) s.visible = false;
    this.anuncios.limpar();
    if (naBatalha(this.player.pos)) this.player.teleport([PORTAIS.times.x + 3, 0, PORTAIS.times.z], -Math.PI / 2);
  }

  trocarTime() {
    if (!this.ativo) return;
    this.socket()?.emit('bt-trocar', (r) => {
      if (r?.erro) this.toast(r.erro, 'info', 3000);
    });
  }

  // no lado do meu time, na vaga que o servidor deu, de frente para o meio
  nascer() {
    const j = this.meu;
    if (!j) return;
    const vagas = BATALHA.nascer[j.time];
    const [x, y, z] = this.estado.fase === 'espera' ? vagas[Math.floor(Math.random() * vagas.length)] : vagas[j.vaga % vagas.length];
    this.player.teleport([BATALHA.x + x, BATALHA.y + y, BATALHA.z + z], Math.atan2(x, z));
    this.player.vel.set(0, 0, 0);
  }

  // entrou com a rodada valendo: espera na galeria, acima do meio da arena
  irParaGaleria() {
    this.player.teleport([BATALHA.x + (Math.random() - 0.5) * 4, BATALHA.y + BATALHA.galeria.y, BATALHA.z + (Math.random() - 0.5) * 4], Math.PI / 2);
    this.player.vel.set(0, 0, 0);
  }

  recebeu(e) {
    const antes = this.estado;
    this.estado = e;
    this.fimEm = e ? performance.now() + e.resta : 0;
    const lista = e?.jogadores || [];
    const ids = new Set(lista.map((j) => j.id));
    // armas na mão de quem está na arena (e de volta à de sempre para quem saiu)
    for (const j of lista) this.armar(j.id, j.arma);
    for (const id of this.armados) if (!ids.has(id)) this.armar(id, null);
    this.armados = ids;
    // quem ficou no chão levanta quando o servidor diz que está de pé (rodada nova) ou saiu
    for (const id of this.caidos) {
      const j = lista.find((x) => x.id === id);
      if (j && !j.vivo) continue;
      this.caidos.delete(id);
      const av = this.avatarDe(id);
      if (av) {
        av.setKo(false);
        av.setHealth(1);
      }
    }
    this.a3d.placar.userData.redesenhar(e);
    const eu = lista.find((j) => j.id === this.meuId());
    if (this.ativo && !eu) return this.sair(false); // o servidor tirou (desligado, reconexão)
    if (!this.ativo || !e) return;
    if (eu.arma !== this.arma) {
      if (eu.arma !== BATALHA.inicial && eu.vivo) {
        this.toast(`Pegou: ${ARMAS[eu.arma]?.nome || eu.arma}`, 'info', 1600);
        this.sfx.checkpoint();
      }
      this.arma = eu.arma;
    }
    const cor = TIMES[eu.time].cor;
    const c = this.combat();
    // rodada nova: levanta (se estava caído), nasce no lado do time e espera a contagem
    if (e.rodada !== this.rodadaVista && (e.fase === 'preparo' || e.fase === 'luta')) {
      this.rodadaVista = e.rodada;
      this.alvo = null;
      this.player.espectar = null;
      if (eu.vivo) {
        if (c.knockedOut) {
          c.reset();
          this.socket()?.emit('revive');
        }
        c.health = 100;
        c.onState?.(c.health, c.inRing);
        this.nascer();
      } else {
        this.irParaGaleria();
      }
      this.anuncios.faixa(`RODADA ${e.rodada}`, `você é ${TIMES[eu.time].nome} · ${e.placar[0]} × ${e.placar[1]}`, cor, { dur: 1900, grande: true, prioridade: true });
    } else if (antes === null || this.rodadaVista === -1) {
      // acabou de entrar: na espera nasce; com a rodada valendo, vai para a galeria assistir
      this.rodadaVista = e.rodada;
      if (eu.vivo) this.nascer();
      else this.irParaGaleria();
    }
    if (e.fase !== this.faseVista) {
      const fase = e.fase;
      this.faseVista = fase;
      if (fase === 'luta') {
        this.sfx.rodada();
        this.anuncios.faixa('VALENDO!', '', cor, { dur: 900, prioridade: true });
      } else if (fase === 'fimRodada') {
        const v = e.vencedor;
        if (v >= 0) {
          this.anuncios.faixa(`${TIMES[v].nome.toUpperCase()} VENCERAM A RODADA`, `${TIMES[0].nome} ${e.placar[0]} × ${e.placar[1]} ${TIMES[1].nome}`, TIMES[v].cor, { dur: 3500, grande: v === eu.time });
          if (v === eu.time) this.sfx.finish();
          else this.sfx.derrota();
        } else {
          this.anuncios.faixa('EMPATE', 'ninguém leva a rodada', '#94a3b8', { dur: 3000 });
        }
      } else if (fase === 'fimPartida') {
        const v = e.campeao;
        this.anuncios.faixa(`${TIMES[v].nome.toUpperCase()} LEVARAM A PARTIDA!`, `${e.placar[0]} × ${e.placar[1]}`, TIMES[v].cor, { dur: 6000, grande: true, fala: v === eu.time ? 'Victory!' : 'Defeat!', prioridade: true });
        if (v === eu.time) this.sfx.finish();
        else this.sfx.derrota();
      } else if (fase === 'espera' && antes) {
        this.toast('Esperando gente no outro time para começar a rodada…', 'info', 4000);
      }
    }
    // trocou de time na espera: nasce do lado novo
    if (antes && e.fase === 'espera') {
      const eraEu = antes.jogadores.find((j) => j.id === eu.id);
      if (eraEu && eraEu.time !== eu.time) this.nascer();
    }
    if (!eu.vivo && VALENDO.includes(e.fase) && !this.caiuEm) this.caiuEm = performance.now();
    if (eu.vivo) this.caiuEm = 0;
    this.atualizarHud();
  }

  // quem dá para assistir: colegas de pé primeiro, senão qualquer um de pé
  assistiveis() {
    const e = this.estado;
    const eu = this.meu;
    if (!e || !eu) return [];
    const vivos = e.jogadores.filter((j) => j.vivo && j.id !== eu.id && this.avatarDe(j.id));
    const colegas = vivos.filter((j) => j.time === eu.time);
    return colegas.length ? colegas : vivos;
  }

  trocarAlvo(passo = 1) {
    const lista = this.assistiveis();
    if (!lista.length) return;
    const i = lista.findIndex((j) => j.id === this.alvo);
    this.alvo = lista[(i + passo + lista.length) % lista.length].id;
    this.sfx.bip();
  }

  update(dt) {
    const agora = performance.now();
    const e = this.estado;
    // as armas do chão giram; some a que foi pega (volta sozinha)
    this.a3d.itens.forEach((it, i) => {
      const fora = (e?.itens?.[i] ?? 0) > 0;
      it.segura.visible = !fora;
      it.luz.material.opacity = fora ? 0.12 : 0.6;
      it.segura.rotation.y += dt * 1.6;
      it.segura.position.y = BATALHA.y + BATALHA.itens[i].y + 1.0 + Math.sin(agora / 400 + i) * 0.08;
    });
    const c = this.combat();
    if (!this.ativo) return;
    if (!this.ligado()) return this.sair();
    const eu = this.meu;
    const valendo = !!e && VALENDO.includes(e.fase);
    c.semVoltar = valendo;
    c.semRegen = valendo;
    this.atualizarMarcas();
    this.atualizarRelogio(agora);
    const p = this.player.pos;
    // saiu da arena por outro caminho (teleporte, R): sai do jogo
    if (!naBatalha(p) && !this.espectando) {
      this.foraDesde ||= agora;
      if (agora - this.foraDesde > 1500) this.sair();
      return;
    }
    this.foraDesde = 0;
    if (!eu) return;
    // caiu lá de baixo (não deveria, com as paredes): volta ao nascimento
    if (p.y < BATALHA.y - 20 && eu.vivo) this.nascer();
    // na espera quem cai levanta (o combate conta o tempo): nasce de novo no lado do time
    const ko = c.knockedOut;
    if (this.estavaKo && !ko && e?.fase === 'espera') this.nascer();
    this.estavaKo = ko;
    // espectador: um tempinho para ver a própria queda, e a câmera vai para um colega
    const assistindo = !eu.vivo && valendo && agora - this.caiuEm > 1300;
    if (assistindo) {
      const lista = this.assistiveis();
      if (!lista.some((j) => j.id === this.alvo)) this.alvo = lista[0]?.id || null;
      const av = this.alvo && this.avatarDe(this.alvo);
      this.player.espectar = av ? av.group.position : null;
    } else {
      this.alvo = null;
      this.player.espectar = null;
    }
    this.hudEspectador.hidden = !assistindo;
    if (assistindo) {
      const j = e.jogadores.find((x) => x.id === this.alvo);
      this.hudAlvo.textContent = j ? j.nome : 'ninguém de pé';
      this.hudAlvo.style.color = j ? TIMES[j.time].cor : '';
    }
    if (ko || !eu.vivo || e?.fase === 'preparo') return;
    // passou por cima de uma arma: pega
    BATALHA.itens.forEach((it, i) => {
      if ((e?.itens?.[i] ?? 0) > 0 || it.tipo === this.arma) return;
      if (Math.hypot(p.x - (BATALHA.x + it.x), p.z - (BATALHA.z + it.z)) > 1.3 || Math.abs(p.y - (BATALHA.y + it.y)) > 1.5) return;
      if (agora - (this.pediu.get(i) || 0) < 1000) return;
      this.pediu.set(i, agora);
      this.socket()?.emit('bt-pegar', i);
    });
  }

  // losango na cor do time em cima dos colegas (através das paredes, como no CS)
  atualizarMarcas() {
    const e = this.estado;
    const eu = this.meu;
    const vistos = new Set();
    for (const j of e?.jogadores || []) {
      if (!eu || j.id === eu.id || j.time !== eu.time || !j.vivo) continue;
      const av = this.avatarDe(j.id);
      if (!av) continue;
      let s = this.marcas.get(j.id);
      if (!s) {
        const tex = textura(64, 64, (ctx, w, h) => {
          ctx.fillStyle = TIMES[j.time].cor;
          ctx.strokeStyle = '#0b1020';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(w / 2, h - 6);
          ctx.lineTo(w - 10, h / 2 - 4);
          ctx.lineTo(w / 2, 6);
          ctx.lineTo(10, h / 2 - 4);
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
        });
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
        s.scale.set(0.55, 0.55, 1);
        s.renderOrder = 10;
        s.userData.time = j.time;
        this.world.fora.add(s);
        this.marcas.set(j.id, s);
      }
      if (s.userData.time !== j.time) s.material.map.userData.redesenhar();
      av.tag.sprite.getWorldPosition(s.position);
      s.position.y += 0.7;
      s.visible = true;
      vistos.add(j.id);
    }
    for (const [id, s] of this.marcas) {
      if (vistos.has(id)) continue;
      s.visible = false;
      if (!e?.jogadores.some((j) => j.id === id)) {
        s.material.map.dispose();
        s.material.dispose();
        s.removeFromParent();
        this.marcas.delete(id);
      }
    }
  }

  atualizarRelogio(agora) {
    const e = this.estado;
    if (!e) return;
    const resta = Math.max(0, (this.fimEm - agora) / 1000);
    const txt = e.fase === 'espera' ? 'espera' : e.fase === 'luta' ? mmss(resta) : e.fase === 'preparo' ? `0:0${Math.ceil(resta)}` : '—';
    if (this.hudTempo.textContent !== txt) this.hudTempo.textContent = txt;
    // contagem grande no meio da tela
    const n = e.fase === 'preparo' ? Math.ceil(resta) : -1;
    if (n !== this.contagem) {
      this.contagem = n;
      this.hudContagem.hidden = n <= 0;
      if (n > 0) {
        this.hudContagem.textContent = n;
        this.hudContagem.classList.remove('pulsa');
        void this.hudContagem.offsetWidth;
        this.hudContagem.classList.add('pulsa');
        if (n <= 3) this.sfx.bip();
      }
    }
  }

  atualizarHud() {
    const e = this.estado;
    const eu = this.meu;
    if (!e || !eu) return;
    this.hudPlacar[0].textContent = e.placar[0];
    this.hudPlacar[1].textContent = e.placar[1];
    this.hudRodada.textContent = e.fase === 'espera' ? 'esperando o outro time' : `rodada ${e.rodada} · até ${e.vencer}`;
    TIMES.forEach((time, k) => {
      const lista = e.jogadores.filter((j) => j.time === k);
      this.hudVivos[k].innerHTML = lista.map((j) => `<i class="${j.vivo ? '' : 'caiu'}${j.id === eu.id ? ' eu' : ''}" title="${j.nome.replace(/"/g, '')}"></i>`).join('');
    });
    this.hud.style.setProperty('--meu', TIMES[eu.time].cor);
    this.hudEu.textContent = `${TIMES[eu.time].nome} · ${ARMAS[this.arma]?.nome || ''} · ${eu.abates} abates · ${eu.mortes} mortes`;
  }

  montarHud() {
    estilo();
    this.hud = document.createElement('div');
    this.hud.className = 'bt-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = `
      <div class="bt-placar">
        <div class="bt-time" style="--cor:${TIMES[0].cor}"><span>${TIMES[0].nome}</span><b>0</b><div class="bt-vivos"></div></div>
        <div class="bt-meio"><b>0:00</b><small>rodada 1</small></div>
        <div class="bt-time dir" style="--cor:${TIMES[1].cor}"><span>${TIMES[1].nome}</span><b>0</b><div class="bt-vivos"></div></div>
      </div>
      <div class="bt-eu"></div>`;
    this.hudPlacar = [...this.hud.querySelectorAll('.bt-time b')];
    this.hudVivos = [...this.hud.querySelectorAll('.bt-vivos')];
    this.hudTempo = this.hud.querySelector('.bt-meio b');
    this.hudRodada = this.hud.querySelector('.bt-meio small');
    this.hudEu = this.hud.querySelector('.bt-eu');
    this.hudEspectador = document.createElement('div');
    this.hudEspectador.className = 'bt-espectador';
    this.hudEspectador.hidden = true;
    this.hudEspectador.innerHTML = `ESPECTADOR · assistindo <b></b><small>${isTouch ? 'toque aqui para trocar' : 'clique ou <kbd>←</kbd> <kbd>→</kbd> troca · <kbd>N</kbd> troca de time · <kbd>Esc</kbd> sai'}</small>`;
    this.hudAlvo = this.hudEspectador.querySelector('b');
    // no celular não tem clique nem setas: tocar na faixa troca de quem se assiste
    this.hudEspectador.addEventListener('pointerdown', () => this.trocarAlvo(1));
    this.hudContagem = document.createElement('div');
    this.hudContagem.className = 'bt-contagem';
    this.hudContagem.hidden = true;
    document.body.append(this.hud, this.hudEspectador, this.hudContagem);
  }
}

function estilo() {
  if (document.getElementById('bt-estilo')) return;
  const css = document.createElement('style');
  css.id = 'bt-estilo';
  css.textContent = `
.bt-hud { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 30; display: flex; flex-direction: column; align-items: center; gap: 4px;
  pointer-events: none; font: 700 13px 'Plus Jakarta Sans', system-ui, sans-serif; color: #f8fafc; }
.bt-hud[hidden], .bt-espectador[hidden], .bt-contagem[hidden] { display: none; }
.bt-placar { display: flex; align-items: stretch; border-radius: 12px; overflow: hidden; background: rgba(15,23,42,.85); box-shadow: 0 0 0 2px var(--meu, transparent); }
.bt-time { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; align-items: center; column-gap: 10px; padding: 6px 12px; border-left: 4px solid var(--cor); }
.bt-time.dir { border-left: 0; border-right: 4px solid var(--cor); }
.bt-time span { font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--cor); }
.bt-time b { grid-row: span 2; font-size: 28px; font-variant-numeric: tabular-nums; }
.bt-time.dir b { order: -1; }
.bt-vivos { display: flex; gap: 3px; }
.bt-vivos i { width: 9px; height: 9px; border-radius: 50%; background: var(--cor); }
.bt-vivos i.caiu { background: rgba(255,255,255,.18); }
.bt-vivos i.eu { box-shadow: 0 0 0 2px #fff; }
.bt-meio { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px 14px; background: rgba(255,255,255,.06); min-width: 92px; }
.bt-meio b { font-size: 22px; font-variant-numeric: tabular-nums; }
.bt-meio small { font-size: 11px; color: #94a3b8; font-weight: 600; }
.bt-eu { padding: 3px 10px; border-radius: 8px; background: rgba(15,23,42,.7); font-size: 12px; font-weight: 600; color: #cbd5e1; }
.bt-espectador { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 30; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 18px; border-radius: 12px; background: rgba(15,23,42,.85); color: #f8fafc; font: 800 15px 'Plus Jakarta Sans', system-ui, sans-serif; pointer-events: none; letter-spacing: .02em; }
.bt-espectador small { font-weight: 600; font-size: 12px; color: #cbd5e1; letter-spacing: 0; }
.bt-espectador kbd { padding: 0 6px; border-radius: 5px; background: rgba(255,255,255,.16); font: inherit; font-weight: 800; }
.bt-contagem { position: fixed; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 31; pointer-events: none; color: #fff;
  font: 900 120px 'Plus Jakarta Sans', system-ui, sans-serif; text-shadow: 0 0 30px rgba(245,158,11,.9), 0 4px 0 rgba(0,0,0,.5); }
.bt-contagem.pulsa { animation: bt-pulsa .9s ease-out both; }
@keyframes bt-pulsa { from { opacity: 0; transform: translate(-50%, -50%) scale(1.6); } 25% { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: .2; transform: translate(-50%, -50%) scale(.85); } }
@media (max-width: 640px) { .bt-time b { font-size: 20px; } .bt-meio b { font-size: 17px; } .bt-contagem { font-size: 80px; } .bt-eu { font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .bt-contagem.pulsa { animation: none; } }`;
  document.head.appendChild(css);
}
