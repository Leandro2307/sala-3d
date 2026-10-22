// Caça-Fantasmas (como o Phasmophobia): o portal fica no meio da pracinha da aventura (E nele).
// Quem entra primeiro escolhe uma das 5 casas; quem vem depois cai na mesma investigação. Todo
// mundo nasce na rua, ao lado da van, de noite. Lá dentro: lanterna (F), os aparelhos (1 a 9, ou
// a roda do mouse; clique usa), portas, luzes, disjuntor e esconderijos (E), e o diário (J), onde
// se marcam as provas e se escolhe qual dos 12 monstros é. O botão vermelho da van termina a
// investigação: quem acertou ganha moedas.
//
// O servidor (fantasmas-servidor.js) manda no fantasma. Aqui: a casa em 3D (fantasmas-3d.js,
// baixado só na hora de entrar), a noite, a sanidade de cada um, os aparelhos, os sustos e os
// sons (fantasmas-som.js).
import * as THREE from 'three';
import {
  CASAS_RESUMO, ITENS, ITEM, PROVAS, IDS_PROVAS, MONSTROS, MONSTRO, JOGO, casa as dadosDaCasa, salaEm, paraCasa, possiveis,
} from './fantasmas-dados.js';
import { PORTAL_FANTASMAS } from './parque-dados.js';
import { hud, texturaViva, FONTE } from './hud-jogos.js';
import { SomFantasma } from './fantasmas-som.js';
import { isTouch } from './touch.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const COR = '#a3e635';
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _f = new THREE.Vector3();
const PERGUNTAS = [['onde', 'Onde você está?'], ['idade', 'Quantos anos você tem?'], ['quem', 'O que você quer?']];

// ------------------------------------------------------------------ o portal (parte do mundo)
export function construirPortalFantasmas(world) {
  const g = new THREE.Group();
  world.fora.add(g);
  const P = PORTAL_FANTASMAS;
  g.position.set(P.x, 0, P.z);
  // um arco de pedra velha, gótico
  const pedra = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.95 });
  const pilar = new THREE.BoxGeometry(0.55, 3.2, 0.55);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(pilar, pedra);
    m.position.set(s * 1.55, 1.6, 0);
    m.castShadow = true;
    g.add(m);
    world.addBox({ min: [P.x + s * 1.55 - 0.3, 0, P.z - 0.3], max: [P.x + s * 1.55 + 0.3, 3.2, P.z + 0.3] });
  }
  const arco = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.28, 8, 24, Math.PI), pedra);
  arco.position.y = 3.2;
  arco.castShadow = true;
  g.add(arco);
  // o redemoinho: um shader que gira em verde e roxo
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float t; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 0.75);
        float r = length(p);
        float a = atan(p.y, p.x);
        float espiral = sin(a * 3.0 + r * 18.0 - t * 2.5) * 0.5 + 0.5;
        float borda = smoothstep(0.5, 0.2, r);
        vec3 c = mix(vec3(0.05, 0.0, 0.08), vec3(0.45, 0.9, 0.2), espiral * (1.0 - r * 1.4));
        c += vec3(0.5, 0.2, 0.8) * pow(1.0 - r, 6.0);
        gl_FragColor = vec4(c, borda * 0.92);
      }`,
  });
  const vortice = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.5), mat);
  vortice.position.y = 2.2;
  g.add(vortice);
  // velas no chão e a névoa
  const velas = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xe8e2cf, roughness: 0.6 }));
    v.position.set(Math.cos(a) * 2.6, 0.15, Math.sin(a) * 2.6 + 0.8);
    const chama = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }));
    chama.position.y = 0.2;
    chama.scale.y = 1.8;
    v.add(chama);
    g.add(v);
    velas.push(chama);
  }
  const placa = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texturaViva(THREE, 512, 128, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(10,8,14,0.92)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = COR;
      ctx.fillRect(0, h - 12, w, 12);
      ctx.fillStyle = '#f8fafc';
      ctx.font = FONTE(50);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CAÇA-FANTASMAS', w / 2, h / 2 - 4);
    }),
    transparent: true,
    depthWrite: false,
  }));
  placa.scale.set(4.4, 1.1, 1);
  placa.position.y = 5.2;
  g.add(placa);
  const luz = new THREE.PointLight(0x84cc16, 6, 9, 1.6);
  luz.position.set(0, 2, 0.8);
  g.add(luz);
  world.decorAnimated.push((t) => {
    mat.uniforms.t.value = t;
    vortice.rotation.y = Math.sin(t * 0.4) * 0.15;
    luz.intensity = 5 + Math.sin(t * 7) * 1.2 + Math.sin(t * 13) * 0.6;
    velas.forEach((c, i) => { c.scale.y = 1.6 + Math.sin(t * 11 + i) * 0.3; });
  });
  return { grupo: g };
}

// ------------------------------------------------------------------ a tela (HTML por cima do 3D)
let css = false;
function estilos() {
  if (css) return;
  css = true;
  const s = document.createElement('style');
  s.textContent = `
#fs-hud { position: fixed; inset: 0; z-index: 29; pointer-events: none; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #e2e8f0; }
#fs-hud[hidden] { display: none; }
#fs-vinheta { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,.75) 100%); transition: background .4s; }
#fs-hud.cacada #fs-vinheta { animation: fs-pulso .9s infinite; }
@keyframes fs-pulso { 0%,100% { box-shadow: inset 0 0 120px 30px rgba(120,0,0,.55); } 50% { box-shadow: inset 0 0 180px 60px rgba(160,0,0,.75); } }
#fs-grao { position: absolute; inset: -50%; opacity: .07; background-size: 160px 160px; mix-blend-mode: screen; }
#fs-info { position: absolute; top: 62px; left: 14px; padding: 10px 14px; border-radius: 12px; background: rgba(5,6,10,.72); min-width: 220px; font-size: 13px; }
#fs-info b { display: block; font-size: 14px; color: ${COR}; }
#fs-info small { color: #94a3b8; }
#fs-san { margin-top: 6px; height: 7px; border-radius: 4px; background: #1e293b; overflow: hidden; }
#fs-san i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #ef4444, #facc15, #4ade80); background-size: 220px 100%; transition: width .5s; }
#fs-mira { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%; background: rgba(255,255,255,.55); }
#fs-itens { position: absolute; left: 50%; bottom: 70px; transform: translateX(-50%); display: flex; gap: 5px; pointer-events: auto; }
#fs-itens button { position: relative; width: 56px; height: 56px; border-radius: 10px; border: 1px solid rgba(148,163,184,.25); background: rgba(5,6,10,.72); color: #cbd5e1;
  font: 600 10px/1.1 inherit; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; padding: 2px; }
#fs-itens button span { font-size: 20px; line-height: 1; }
#fs-itens button.on { border-color: ${COR}; background: rgba(40,60,10,.8); color: #fff; box-shadow: 0 0 14px rgba(163,230,53,.35); }
#fs-itens button.ligado::after { content: ''; position: absolute; top: 5px; right: 5px; width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 6px #4ade80; }
#fs-itens button em { position: absolute; top: 3px; left: 5px; font-style: normal; font-size: 9px; color: #64748b; }
#fs-itens button b { position: absolute; bottom: 2px; right: 5px; font-size: 10px; color: #facc15; }
#fs-leitura { position: absolute; left: 50%; bottom: 136px; transform: translateX(-50%); padding: 6px 14px; border-radius: 10px; background: rgba(5,6,10,.72); font: 700 15px monospace; color: #a7f3d0; white-space: nowrap; }
#fs-leitura:empty { display: none; }
#fs-botoes { position: absolute; top: 62px; right: 14px; display: flex; gap: 6px; pointer-events: auto; }
#fs-botoes button { padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(148,163,184,.25); background: rgba(5,6,10,.72); color: #e2e8f0; font: 700 13px inherit; cursor: pointer; }
#fs-botoes button.on { border-color: #facc15; color: #facc15; }
#fs-nv { position: fixed; inset: 0; z-index: 28; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 2px, rgba(0,0,0,0) 2px 4px), radial-gradient(ellipse, rgba(0,40,0,0) 50%, rgba(0,10,0,.8) 100%); }
#fs-nv[hidden] { display: none; }
#fs-nv span { position: absolute; top: 18px; right: 200px; color: #ef4444; font: 700 18px monospace; animation: fs-pisca 1s infinite; }
@keyframes fs-pisca { 50% { opacity: 0; } }
#fs-escondido { position: fixed; inset: 0; z-index: 28; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,.96) 0 34px, rgba(0,0,0,.55) 34px 46px); }
#fs-escondido[hidden] { display: none; }
#fs-flash { position: fixed; inset: 0; z-index: 40; pointer-events: none; background: #7f0000; opacity: 0; }
#fs-morto { position: fixed; inset: 0; z-index: 39; pointer-events: none; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #fca5a5;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif; text-shadow: 0 0 24px #000; }
#fs-morto b { font-size: clamp(36px, 7vw, 84px); letter-spacing: .08em; }
#fs-morto[hidden] { display: none; }
.fs-modal { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(2,3,6,.78); font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #e2e8f0; padding: 16px; }
.fs-modal[hidden] { display: none; }
.fs-caixa { position: relative; width: min(1040px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: #0b0d12; border: 1px solid #263041; border-radius: 18px; padding: 22px 26px 18px; box-shadow: 0 20px 80px rgba(0,0,0,.6); font-size: 15px; line-height: 1.5; }
.fs-caixa h2 { margin: 0 0 6px; font-size: 26px; line-height: 1.2; color: ${COR}; }
.fs-caixa h3 { margin: 18px 0 10px; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #94a3b8; }
.fs-caixa > p { margin: 0 0 14px; color: #cbd5e1; font-size: 15px; }
.fs-caixa > .fs-lead { font-size: 16.5px; color: #e2e8f0; max-width: 62ch; }
.fs-caixa > .fs-credito { margin: 14px 0 0; font-size: 12.5px; color: #64748b; }
.fs-caixa kbd { display: inline-block; min-width: 1.7em; padding: 0 6px; margin: 0 1px; border-radius: 6px; border: 1px solid #334155; border-bottom-width: 2px; background: #1e293b; color: #f1f5f9; font-family: inherit; font-size: 13px; font-weight: 800; line-height: 1.5; text-align: center; }
.fs-fechar { position: sticky; top: 0; float: right; z-index: 1; margin-left: 12px; border: 1px solid #334155; background: #1e293b; color: #f1f5f9; border-radius: 10px; padding: 8px 14px; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.55); }
.fs-fechar:hover { background: #334155; }
.fs-colunas { display: grid; grid-template-columns: 1.2fr 1fr; gap: 0 24px; }
.fs-passos { list-style: none; counter-reset: passo; margin: 0; padding: 0; display: grid; gap: 8px; }
.fs-passos li { counter-increment: passo; position: relative; padding: 11px 14px 11px 52px; border-radius: 12px; background: #11151d; border: 1px solid #1f2937; }
.fs-passos li::before { content: counter(passo); position: absolute; left: 14px; top: 12px; width: 26px; height: 26px; border-radius: 50%; background: ${COR}; color: #0b0d12; font-weight: 800; font-size: 14px; display: grid; place-items: center; }
.fs-passos b { color: #f8fafc; font-size: 15.5px; }
.fs-passos p { margin: 3px 0 0; color: #cbd5e1; font-size: 14.5px; }
.fs-passos p b { font-size: inherit; }
.fs-perigo { margin-top: 12px; padding: 0 16px 10px; border-radius: 12px; border: 1px solid #7f1d1d; background: #170b0e; }
.fs-perigo h3 { margin-top: 12px; color: #fca5a5; }
.fs-perigo ul { margin: 0; padding-left: 18px; }
.fs-perigo li { margin: 6px 0; color: #e2e8f0; font-size: 14.5px; }
.fs-perigo b { color: #fecaca; }
.fs-nota { margin: -4px 0 10px; color: #94a3b8; font-size: 14px; }
.fs-casas { display: grid; gap: 8px; }
.fs-casas button { display: block; width: 100%; text-align: left; padding: 12px 14px; border-radius: 12px; border: 1px solid #1f2937; border-left: 4px solid var(--c); background: #11151d; color: inherit; cursor: pointer; font: inherit; transition: background .15s, border-color .15s; }
.fs-casas button:hover, .fs-casas button:focus-visible { border-color: var(--c); background: #171d28; outline: none; }
.fs-casas b { display: block; color: var(--c); font-size: 16px; }
.fs-casas small { display: block; color: #94a3b8; margin: 1px 0 4px; font-size: 13px; }
.fs-casas span { display: block; font-size: 14px; color: #cbd5e1; }
.fs-casas em { display: block; margin-top: 6px; font-style: normal; font-weight: 800; font-size: 13.5px; color: var(--c); }
.fs-casas .fs-casa-unica { padding: 16px; }
.fs-mais { margin-top: 10px; border-top: 1px solid #1f2937; }
.fs-mais summary { cursor: pointer; padding: 12px 0 4px; font-weight: 800; font-size: 15px; color: #e2e8f0; }
.fs-mais summary::marker { color: ${COR}; }
.fs-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; padding: 8px 0 4px; }
.fs-lista > div { display: flex; gap: 10px; align-items: flex-start; padding: 9px 12px; border-radius: 10px; background: #11151d; }
.fs-lista span { font-size: 22px; line-height: 1.2; }
.fs-lista i { flex: none; width: 12px; height: 12px; margin-top: 5px; border-radius: 50%; }
.fs-lista p { margin: 0; font-size: 14px; color: #cbd5e1; }
.fs-lista b { display: block; color: #f1f5f9; font-size: 14.5px; }
.fs-controles { margin: 6px 0 4px; padding-left: 18px; }
.fs-controles li { margin: 7px 0; color: #cbd5e1; }
.fs-provas { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.fs-provas button { display: inline-flex; align-items: center; gap: 7px; padding: 9px 12px; border-radius: 10px; border: 1px solid #334155; background: #11151d; color: #e2e8f0; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.fs-provas button i { width: 10px; height: 10px; border-radius: 50%; }
.fs-provas button.sim { border-color: #4ade80; background: #0f2a17; color: #bbf7d0; }
.fs-provas button.nao { border-color: #7f1d1d; background: #1a0b0d; color: #94a3b8; text-decoration: line-through; }
.fs-caixa > .fs-legenda { margin: 0 0 14px; font-size: 13.5px; color: #94a3b8; }
.fs-contagem { display: inline-block; margin-left: 10px; text-transform: none; letter-spacing: 0; padding: 2px 10px; border-radius: 999px; background: #1e293b; color: #e2e8f0; font-size: 13px; font-weight: 800; vertical-align: middle; }
.fs-monstros { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.fs-monstros button { text-align: left; padding: 12px 14px; border-radius: 12px; border: 1px solid #1f2937; background: #11151d; color: inherit; cursor: pointer; font: inherit; }
.fs-monstros button:hover { border-color: #334155; }
.fs-monstros button.fora { opacity: .3; }
.fs-monstros button.escolhido { border-color: #facc15; box-shadow: 0 0 0 1px #facc15 inset; background: #1a1708; }
.fs-monstros b { color: var(--c); font-size: 16.5px; }
.fs-monstros i { display: inline-block; font-style: normal; font-size: 12.5px; font-weight: 700; padding: 3px 8px; border-radius: 7px; margin: 6px 4px 0 0; background: #1e293b; color: #cbd5e1; }
.fs-monstros i.tem { background: #14532d; color: #bbf7d0; }
.fs-monstros p { margin: 7px 0 0; font-size: 13.5px; line-height: 1.45; color: #cbd5e1; }
.fs-monstros p em { color: #fca5a5; font-style: normal; font-weight: 700; }
.fs-monstros p u { color: #86efac; text-decoration: none; font-weight: 700; }
.fs-caixa > .fs-dica { margin: 14px 0 0; font-size: 14px; color: #cbd5e1; }
@media (max-width: 760px) { .fs-colunas { grid-template-columns: 1fr; } .fs-caixa { padding: 16px; } .fs-caixa h2 { font-size: 22px; } }
.fs-fim li { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid #1f2937; list-style: none; }
.fs-fim ul { padding: 0; margin: 10px 0 0; }
.fs-fim li i { width: 10px; height: 10px; border-radius: 50%; }
.fs-fim li span { flex: 1; }
.fs-fim li em { font-style: normal; color: #facc15; }
body.touch #fs-itens { bottom: auto; top: calc(56px + env(safe-area-inset-top)); left: 50%; gap: 3px; }
body.touch #fs-itens button { width: 40px; height: 40px; font-size: 0; }
body.touch #fs-itens button span { font-size: 17px; }
body.touch #fs-itens button em { display: none; }
body.touch #fs-info { top: auto; bottom: 10px; left: 50%; transform: translateX(-50%); min-width: 0; font-size: 11px; padding: 6px 10px; }
body.touch #fs-leitura { bottom: auto; top: calc(104px + env(safe-area-inset-top)); }
body.touch #fs-botoes { top: auto; bottom: calc(60px + env(safe-area-inset-bottom)); right: auto; left: 50%; transform: translateX(-50%); }
`;
  document.head.appendChild(s);
}

const ICONES = { emf: '📡', spirit: '📻', termo: '🌡️', camera: '📹', uv: '🔦', livro: '📖', dots: '🟩', crucifixo: '✝️', incenso: '🪔' };
const CURTOS = { emf: 'EMF', spirit: 'Spirit', termo: 'Termo', camera: 'Câmera', uv: 'UV', livro: 'Livro', dots: 'D.O.T.S', crucifixo: 'Cruz', incenso: 'Incenso' };

// ------------------------------------------------------------------ o jogo no navegador
export class Fantasmas {
  // opts: world, player, sfx, clima, ligado(), aoEntrar(), falando(), posDe(id)
  constructor(opts) {
    Object.assign(this, opts);
    this.id = 'fantasmas';
    this.socket = null;
    this.eu = null;
    this.e = null; // o estado da investigação (servidor)
    this.dentro = false;
    this.carregando = false;
    this.mod = null; // fantasmas-3d.js
    this.casas = new Map(); // id -> Casa3D (montada uma vez)
    this.casa3d = null;
    this.C = null;
    this.monstro = null; // Monstro3D
    this.monstroModelo = '';
    this.mao = null;
    this.remota = null;
    this.som = new SomFantasma();
    this.colocados = new Map(); // id -> grupo 3D
    this.leiturasEmf = []; // { x, z, nivel, ate }
    this.g = null; // o fantasma (último 'fs-g'): [x, z, rot, vis, anim]
    this.outros = new Map(); // id -> [l, dx, dy, dz, h, item]
    this.zerar();
    // a roda do mouse troca o aparelho
    window.addEventListener('wheel', (ev) => {
      if (this.dentro && document.pointerLockElement) this.roda(ev.deltaY);
    }, { passive: true });
  }

  zerar() {
    this.sanidade = 100;
    this.morto = false;
    this.item = 0;
    this.ligados = { emf: true, camera: false, uv: false };
    this.lanterna = false;
    this.incensos = ITEM.incenso.limite;
    this.remedioTomado = false;
    this.provas = Object.fromEntries(IDS_PROVAS.map((p) => [p, 0])); // 1 tem, -1 não tem
    this.palpite = null;
    this.escondido = -1;
    this.folego = 1;
    this.cansado = 0;
    this.vistoNesta = false; // já perdeu sanidade por ver esta aparição
    this.visAntes = 0;
    this.terminarEm = 0;
    this.sairEm = 0;
    this.spirit = { ate: 0, texto: '', pergunta: 0 };
    this.atividade = new Array(24).fill(0);
    this.ultimoEnvio = 0;
    this.proxRaio = performance.now() + 20000;
    this.raio = 0;
    this.susto = null;
    this.passoT = 0;
    this.vozT = 2; // a próxima voz do monstro na caçada
    this.ferraoEm = 0; // o último ferrão (ele chegou perto na caçada)
    this.leituraT = 0;
    this.monitorT = 0;
    this.telasT = 0;
    this.digitaisChave = '';
  }

  // ---------------------------------------------------------------- rede
  ligar(socket) {
    this.socket = socket;
    socket.on('fs-estado', (e) => this.estado(e));
    socket.on('fs-g', (m) => this.recebeuG(m));
    socket.on('fs-ev', (e) => this.evento(e));
  }

  ver() {
    if (this.dentro) this.socket?.emit('fs-ver', (r) => r && this.estado(r.estado));
  }

  estado(e) {
    const antes = this.e;
    this.e = e;
    if (!this.dentro || this.carregando) return;
    if (!e) {
      // acabou (ou o dono desligou): de volta para a praça
      this.sair(false);
      return;
    }
    const meu = e.jogadores.find((j) => j.id === this.eu);
    if (!meu) return this.sair(false);
    if (meu.morto && !this.morto) this.morrer();
    const c = this.casa3d;
    if (!c) return;
    e.portas.forEach((a, i) => c.porta(i, a, !antes));
    e.luzes.forEach((a, i) => c.luz(i, a && e.disjuntor));
    this.trancada = e.trancada;
    // o que está no chão
    const vivos = new Set();
    for (const p of e.colocados) {
      vivos.add(p.id);
      let g3 = this.colocados.get(p.id);
      const chave = `${p.escrito}:${p.usos}`;
      if (g3 && g3.userData.chave !== chave) {
        g3.parent?.remove(g3);
        g3 = null;
      }
      if (!g3) {
        g3 = this.mod.criarColocado(p, c);
        g3.userData.chave = chave;
        g3.userData.def = p;
        this.colocados.set(p.id, g3);
      }
      g3.userData.def = p;
    }
    for (const [id, g3] of this.colocados) {
      if (vivos.has(id)) continue;
      g3.parent?.remove(g3);
      this.colocados.delete(id);
    }
    // digitais (refaz só quando a lista muda)
    const chaveD = JSON.stringify(e.digitais);
    if (chaveD !== this.digitaisChave) {
      this.digitaisChave = chaveD;
      c.marcarDigitais(e.digitais);
    }
    if (e.fim && !antes?.fim) this.mostrarFim(e.fim);
    this.atualizarHud();
  }

  recebeuG(m) {
    if (!this.dentro || !m) return;
    this.g = m.g;
    this.outros.clear();
    for (const [id, l, dx, dy, dz, h, item] of m.j) this.outros.set(id, { l, d: [dx, dy, dz], h, item });
    if (this.monstro && this.C) {
      const o = this.C.origem;
      this.monstro.receber(m.g[0] + o.x, o.y, m.g[1] + o.z, m.g[2], m.g[4]);
    }
  }

  // posição do mundo de um ponto da casa
  mundo(x, z, y = 1) {
    const o = this.C.origem;
    return _v2.set(x + o.x, y + o.y, z + o.z).clone();
  }

  // eu, nas coordenadas da casa
  aqui() {
    return paraCasa(this.C, this.player.pos.x, this.player.pos.y, this.player.pos.z);
  }

  distAqui(x, z) {
    const p = this.aqui();
    return Math.hypot(p.x - x, p.z - z);
  }

  evento(e) {
    if (!this.dentro || !this.casa3d || !e) return;
    const c = this.casa3d;
    const pos = e.x !== undefined ? this.mundo(e.x, e.z, 1.2) : null;
    const perto = e.x !== undefined ? this.distAqui(e.x, e.z) : 99;
    if (e.emf) this.leiturasEmf.push({ x: e.x, z: e.z, nivel: e.emf, ate: performance.now() + 20000 });
    const fantasma = !e.quem;
    if (fantasma && e.t !== 'spirit' && e.t !== 'incenso') this.atividade[this.atividade.length - 1] = Math.min(1, this.atividade[this.atividade.length - 1] + 0.35);
    switch (e.t) {
      case 'porta':
        c.porta(e.i, e.aberta);
        if (c.portas[e.i]) c.portas[e.i].rapida = !!e.bate;
        this.som.tocar(e.bate ? 'bate' : 'rangido', pos, e.bate ? 1 : 0.8);
        if (fantasma && perto < 6) this.perder(e.bate ? JOGO.sanidadeSusto : 1);
        if (e.bate && perto < 6) this.player.addShake?.(0.4);
        this.world.marcarSombra?.();
        break;
      case 'luz':
        c.luz(e.i, e.acesa && this.e?.disjuntor !== false);
        this.som.tocar('clique', pos);
        break;
      case 'arremesso':
        c.arremessar(e.i, e.v);
        if (perto < 5) this.perder(JOGO.sanidadeSusto);
        break;
      case 'passos': {
        // três ou quatro passos andando de onde ele está
        const n = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
          setTimeout(() => {
            if (!this.dentro) return;
            this.som.tocar('passo', this.mundo(e.x + Math.sin(e.rot) * k * 0.6, e.z + Math.cos(e.rot) * k * 0.6, 0.2), 0.9);
          }, k * 520);
        }
        break;
      }
      case 'disjuntor':
        this.som.tocar('bate', this.casa3d.disjuntor ? this.mundo(this.casa3d.disjuntor.x, this.casa3d.disjuntor.z, 1.5) : null, 0.6);
        if (!e.ligado && !e.quem) hud.mensagem('As luzes apagaram', 'O disjuntor caiu', 2200, '#94a3b8');
        break;
      case 'pisca':
        if (c.luzes[e.i]) c.luzes[e.i].pisca = e.dur;
        this.som.tocar('chiado', pos, 0.4);
        break;
      case 'aparece':
        this.vistoNesta = false;
        if (this.C.comodos[e.sala] && c.luzes[e.sala]) c.luzes[e.sala].pisca = e.dur;
        if (e.para === this.eu) {
          this.som.tocar('respira', pos, 0.8);
          if (Math.random() < 0.5) this.som.ferroada(0.55);
        }
        break;
      case 'some':
        this.som.tocar('teleporte', pos, 0.5);
        break;
      case 'som':
        if (perto < 18) this.som.tocar(e.som, pos, e.som === 'grito' ? 0.8 : 1);
        if (e.para === this.eu) this.perder(e.som === 'grito' ? 8 : 5);
        break;
      case 'cacada':
        this.som.inicioCacada();
        this.vozT = 2.5;
        this.som.tocar('bate', this.mundo(this.C.entrada.x, this.C.entrada.z, 1.2), 1);
        this.player.addShake?.(0.5);
        break;
      case 'fimCacada':
        this.som.estatica(0);
        break;
      case 'morte':
        if (e.id === this.eu) this.morrer(true);
        else {
          this.som.morteDeOutro(pos, 1);
          hud.mensagem(`${e.nome} morreu`, 'O fantasma pegou', 3000, '#ef4444');
          this.perder(15);
        }
        break;
      case 'crucifixo':
        this.som.tocar('chiado', pos, 1);
        hud.mensagem('O crucifixo queimou!', e.usos ? 'Ele segurou uma caçada (ainda tem 1 uso)' : 'Ele segurou uma caçada (acabou)', 2600, '#facc15');
        break;
      case 'escrita':
        this.som.tocar('escrita', pos, 0.7);
        break;
      case 'spirit':
        if (e.quem !== this.eu && perto < 12) {
          this.som.falar(e.resp, { tom: 0.1, ritmo: 0.6 });
          hud.mensagem(`“${e.resp}”`, 'Spirit Box', 2400, '#f97316');
        }
        break;
      case 'incenso':
        this.fumaca?.acender(e.x, 1.2, e.z, 7);
        if (e.quem !== this.eu) this.som.tocar('fosforo', pos, 0.6);
        break;
      case 'trancada':
        this.som.tocar('trancada', pos, 1);
        if (perto < 4) hud.mensagem('A porta está trancada!', 'Esconda-se!', 1800, '#ef4444');
        break;
      default:
    }
  }

  perder(n) {
    if (this.morto) return;
    this.sanidade = Math.max(0, this.sanidade - n);
  }

  // ---------------------------------------------------------------- entrar
  pertoDoPortal() {
    const p = this.player.pos;
    return !this.dentro && this.ligado() && p.y < 5 && Math.hypot(p.x - PORTAL_FANTASMAS.x, p.z - PORTAL_FANTASMAS.z) < 2.8;
  }

  usarE() {
    if (this.dentro) return this.interagir();
    if (!this.pertoDoPortal() || this.carregando) return false;
    this.socket?.emit('fs-ver', (r) => {
      if (!r) return;
      if (r.estado?.fase === 'fim') return hud.mensagem('Caça-Fantasmas', 'A investigação está acabando. Tente já já.', 2500, COR);
      // com investigação em andamento, o mesmo modal explica o jogo e só tem o botão de entrar nela
      this.escolherCasa(r.estado?.casa || null);
    });
    return true;
  }

  // O modal da entrada: o que é, como se joga em 4 passos, o perigo da caçada, a escolha da casa (ou
  // entrar na que já está em andamento), e embaixo, para abrir, os aparelhos, as provas e os
  // controles. emAndamento: o id da casa em que o time já está (null: quem entra escolhe).
  escolherCasa(emAndamento = null) {
    estilos();
    let m = document.getElementById('fs-escolha');
    if (!m) {
      m = document.createElement('div');
      m.id = 'fs-escolha';
      m.className = 'fs-modal';
      document.body.appendChild(m);
      m.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-casa]');
        if (b) {
          this.fecharModal(m);
          this.entrar(b.dataset.casa || null);
        } else if (ev.target.closest('.fs-fechar') || ev.target === m) this.fecharModal(m);
      });
    }
    const andamento = emAndamento && CASAS_RESUMO.find((c) => c.id === emAndamento);
    const TAMANHO = { pequena: 'Boa para começar', media: 'Para quem já jogou', grande: 'Difícil: muitos cômodos e caçada longa' };
    const casas = andamento
      ? `<p class="fs-nota">O time já está investigando esta casa. Você entra junto, na mesma partida.</p>
        <div class="fs-casas"><button type="button" data-casa="" style="--c:${andamento.cor}" class="fs-casa-unica">
          <b>${esc(andamento.nome)}</b><small>${esc(andamento.sub)}</small><span>${esc(andamento.desc)}</span><em>Entrar na investigação →</em></button></div>`
      : `<p class="fs-nota">Quem entrar depois de você cai na mesma casa.</p>
        <div class="fs-casas">${CASAS_RESUMO.map((c) => `<button type="button" data-casa="${c.id}" style="--c:${c.cor}">
          <b>${esc(c.nome)}</b><small>${esc(c.sub)} · ${esc(TAMANHO[c.tam] || '')}</small><span>${esc(c.desc)}</span><em>Entrar →</em></button>`).join('')}</div>`;
    const controles = isTouch
      ? `<li>Toque num aparelho na barra de cima para escolher, e toque de novo para usar</li>
        <li><b>🔦 Lanterna</b> e <b>📓 Diário</b>: os botões embaixo da tela</li>
        <li><b>E</b>: abre portas, acende luzes, liga o disjuntor, pega o que você pôs no chão e entra no armário</li>`
      : `<li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> anda · <kbd>Shift</kbd> corre (cansa rápido) · o mouse olha</li>
        <li><kbd>F</kbd> liga e desliga a lanterna</li>
        <li><kbd>1</kbd> a <kbd>9</kbd> (ou a roda do mouse) trocam o aparelho · <kbd>Clique</kbd> usa</li>
        <li><kbd>E</kbd> abre portas, acende luzes, liga o disjuntor, pega o que você pôs no chão e entra no armário</li>
        <li><kbd>J</kbd> abre o diário</li>`;
    m.innerHTML = `<div class="fs-caixa fs-entrada" role="dialog" aria-labelledby="fs-titulo">
      <button class="fs-fechar" type="button">Fechar ✕</button>
      <h2 id="fs-titulo">👻 Caça-Fantasmas</h2>
      <p class="fs-lead">Uma casa assombrada, de noite. Ache as provas, descubra <b>qual dos 12 monstros</b> mora lá e saia vivo.
        Dá para ir sozinho, mas em grupo é bem melhor.</p>
      <div class="fs-colunas">
        <div>
          <h3>Como jogar</h3>
          <ol class="fs-passos">
            <li><b>Ache o cômodo dele</b><p>Ande pela casa com a lanterna. Onde ele vive o leitor EMF apita, o termômetro cai e as coisas se mexem sozinhas.</p></li>
            <li><b>Junte 3 provas</b><p>Cada monstro deixa <b>3 das 7 provas</b>. Use os aparelhos no cômodo dele: cada um mostra uma prova (lista lá embaixo).</p></li>
            <li><b>Marque no diário</b><p>No diário, marque o que achou (✓) e o que não tem (✗). Os monstros que não batem ficam apagados.</p></li>
            <li><b>Termine na van</b><p>Escolha o monstro no diário, volte à van e aperte o <b>botão vermelho</b>. Acertou: <b>+${JOGO.moedas.acertou} moedas</b> (+${JOGO.moedas.acertouMorto} se morreu). Só sobreviver: +${JOGO.moedas.sobreviveu}.</p></li>
          </ol>
          <div class="fs-perigo">
            <h3>⚠️ Cuidado com a caçada</h3>
            <ul>
              <li>A <b>sanidade</b> (a barra no canto) cai no escuro e toda vez que você vê o fantasma. Luz acesa ajuda, e o remédio da van devolve ${JOGO.remedio}% (uma vez).</li>
              <li>Com a sanidade baixa ele <b>caça</b>: as luzes piscam, a porta da rua tranca e ele vem atrás de alguém. Se pegar, você morre.</li>
              <li>Ele acha quem ele vê, quem está com a lanterna ou um aparelho ligado e quem fala no microfone. Para escapar: <b>esconda-se num armário</b>, apague tudo e fique calado.</li>
              <li>O <b>crucifixo</b> no chão impede caçadas perto dele, e o <b>incenso</b> aceso perto dele o acalma (ou o cega, na caçada).</li>
            </ul>
          </div>
        </div>
        <div>
          <h3>${andamento ? 'Investigação em andamento' : 'Escolha a casa'}</h3>
          ${casas}
        </div>
      </div>
      <details class="fs-mais">
        <summary>Os 9 aparelhos</summary>
        <div class="fs-lista">${ITENS.map((it) => `<div><span>${ICONES[it.id]}</span><p><b>${isTouch ? '' : `<kbd>${it.tecla}</kbd> `}${esc(it.nome)}</b>${esc(it.dica)}${it.limite ? ` · você tem ${it.limite}` : ''}</p></div>`).join('')}</div>
      </details>
      <details class="fs-mais">
        <summary>As 7 provas</summary>
        <div class="fs-lista">${IDS_PROVAS.map((p) => `<div><i style="background:${PROVAS[p].cor}"></i><p><b>${esc(PROVAS[p].nome)}</b>${esc(PROVAS[p].dica)}</p></div>`).join('')}</div>
      </details>
      <details class="fs-mais">
        <summary>Controles</summary>
        <ul class="fs-controles">${controles}</ul>
      </details>
      <p class="fs-credito">Monstro 3D: “Ghost Lady v2”, de Loves_Art (Sketchfab), licença CC BY 4.0.</p>
    </div>`;
    this.abrirModal(m);
  }

  abrirModal(m) {
    m.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.player.enabled = false;
    this.player.keys.clear();
  }

  fecharModal(m) {
    m.hidden = true;
    this.player.enabled = true;
  }

  entrar(casaId) {
    if (this.carregando) return;
    this.carregando = true;
    hud.mensagem('Caça-Fantasmas', 'Indo para a casa...', 3000, COR);
    // sem resposta do servidor (caiu, reconectando): o portal não fica travado
    const desiste = setTimeout(() => { this.carregando = false; }, 15000);
    this.socket?.emit('fs-entrar', { casa: casaId }, async (r) => {
      clearTimeout(desiste);
      if (!r?.ok) {
        this.carregando = false;
        if (r?.erro) hud.mensagem('Caça-Fantasmas', 'Não deu para entrar agora.', 2200, '#fb7185');
        return;
      }
      try {
        if (!this.mod) this.mod = await import('./fantasmas-3d.js');
        const C = dadosDaCasa(r.casa);
        this.C = C;
        let c = this.casas.get(C.id);
        if (!c) {
          c = new this.mod.Casa3D(this.world, C);
          this.casas.set(C.id, c);
        }
        this.casa3d = c;
        // o monstro: o modelo vem no estado
        const mx = this.e?.mx;
        const def = MONSTROS.find((m) => m.modelo === mx) || MONSTROS[0];
        if (!this.monstro || this.monstroModelo !== def.modelo) {
          this.monstro?.destruir();
          this.monstro = await this.mod.carregarMonstro(this.world, def);
          this.monstroModelo = def.modelo;
        }
      } catch (err) {
        console.warn('[fantasmas] não carregou:', err);
        this.carregando = false;
        this.socket?.emit('fs-sair');
        hud.mensagem('Caça-Fantasmas', 'Não deu para carregar. Tente de novo.', 2500, '#fb7185');
        return;
      }
      this.carregando = false;
      this.comecar();
    });
  }

  comecar() {
    const C = this.C;
    const w = this.world;
    const pl = this.player;
    this.zerar();
    this.dentro = true;
    this.aoEntrar?.();
    this.casa3d.ativar();
    // a mão, a lanterna dos outros, orbes e fumaça
    if (!this.mao) this.mao = this.mod.criarMao(w);
    this.mao.grupo.visible = true;
    const sombra = w.renderer.shadowMap.enabled;
    this.mao.lanterna.castShadow = sombra;
    if (sombra) {
      this.mao.lanterna.shadow.mapSize.set(1024, 1024);
      this.mao.lanterna.shadow.bias = -0.0004;
      this.mao.lanterna.shadow.normalBias = 0.03;
      this.mao.lanterna.shadow.camera.near = 0.2;
    }
    if (!this.remota) this.remota = this.mod.criarLanternaRemota(w);
    this.remota.visible = true;
    this.orbes = this.mod.criarOrbes(this.casa3d);
    this.fumaca = this.mod.criarFumaca(this.casa3d);
    // a noite
    this.noite(true);
    // em primeira pessoa e no passo de gente com medo
    this.modoAntes = pl.mode;
    pl.mode = 'first';
    pl.limites = { andar: 1.8, correr: 3.1, pulo: 4.2 };
    const ch = C.chegada;
    const o = C.origem;
    pl.teleport([ch.x + o.x + (Math.random() - 0.5) * 2, o.y, ch.z + o.z + (Math.random() - 0.5)], 0);
    this.sfx.teleport();
    this.som.ambiente(true);
    this.montarHud();
    this.world.aquecerShaders?.({ malhas: false });
    if (this.e) this.estado(this.e);
    const e = this.e;
    hud.mensagem(C.nome, e ? `O fantasma se chama ${e.nome}. Boa sorte.` : 'Boa sorte.', 4500, COR);
  }

  // ---------------------------------------------------------------- a noite (e a volta do dia)
  noite(ligar) {
    const w = this.world;
    const ceu = w.natureza?.ceu;
    if (ligar) {
      this.diaAntes = { sol: w.sun?.intensity, alturaSol: w.alturaSol, offset: w.sunOffset?.clone() };
      w.luzNoturna = { hemi: 0.07, ambiente: 0 };
      if (w.sun) {
        w.sun.color.set(0x7d93d6);
        w.sun.intensity = 0.32;
        w.sunOffset.set(-40, 50, -30);
      }
      w.alturaSol = this.C.origem.y;
      if (w.hemi) {
        w.hemi.color.set(0x5a6890);
        w.hemi.groundColor.set(0x0b0c12);
      }
      w.renderer.toneMappingExposure = 1.0;
      const fog = w.scene.fog;
      if (fog) {
        fog.color.set(0x05070c);
        fog.near = 5;
        fog.far = 70;
      }
      if (ceu) {
        const u = ceu.mat.uniforms;
        u.topo.value.set(0x010206);
        u.meio.value.set(0x03050c);
        u.horizonte.value.set(0x0a0f1c);
        u.base.value.set(0x020305);
        u.brilho.value.set(0x0b1222);
        u.disco.value.setRGB(0, 0, 0);
        ceu.estrelas.visible = true;
        ceu.estrelasMat.uniforms.visivel.value = 1;
        if (ceu.nuvensMat) {
          ceu.nuvensMat.color.set(0x111318);
          ceu.nuvensMat.emissive.set(0x05060a);
          ceu.nuvensMat.emissiveIntensity = 0.2;
        }
      }
    } else {
      w.luzNoturna = null;
      if (this.diaAntes) {
        w.alturaSol = this.diaAntes.alturaSol ?? null;
        if (this.diaAntes.offset) w.sunOffset.copy(this.diaAntes.offset);
      }
      // o clima refaz cores, sol, névoa, exposição e céu no próximo quadro
      if (this.clima) this.clima.pronto = false;
      w.renderer.domElement.style.filter = '';
    }
    w.marcarSombra?.();
  }

  // ---------------------------------------------------------------- sair
  // voltar: de volta ao portal (quem foi para outro lugar pelo mapa já está lá)
  sair(avisar = true, voltar = true) {
    if (!this.dentro) return;
    this.dentro = false;
    if (avisar) this.socket?.emit('fs-sair');
    this.casa3d?.desativar();
    if (this.monstro) this.monstro.grupo.visible = false;
    if (this.mao) {
      this.mao.grupo.visible = false;
      this.mao.lanterna.intensity = 0;
      this.mao.uv.intensity = 0;
    }
    if (this.remota) {
      this.remota.intensity = 0;
      this.remota.visible = false;
    }
    for (const g3 of this.colocados.values()) g3.parent?.remove(g3);
    this.colocados.clear();
    this.orbes?.pts.parent?.remove(this.orbes.pts);
    this.fumaca = null;
    this.orbes = null;
    this.noite(false);
    this.som.parar();
    const pl = this.player;
    pl.limites = null;
    pl.override = null;
    pl.mode = this.modoAntes || pl.mode;
    this.escondido = -1;
    for (const id of ['fs-hud', 'fs-nv', 'fs-escondido', 'fs-morto', 'fs-diario']) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }
    const fim = document.getElementById('fs-fim');
    if (fim && !fim.hidden) setTimeout(() => { fim.hidden = true; }, 6000);
    hud.placar('');
    this.world.renderer.domElement.style.filter = '';
    if (voltar) pl.teleport([PORTAL_FANTASMAS.x + (Math.random() - 0.5) * 2, 0, PORTAL_FANTASMAS.z + 3.5], 0);
    this.world.aquecerShaders?.({ malhas: false });
  }

  esc() {
    const d = document.getElementById('fs-diario');
    if (d && !d.hidden) {
      this.fecharModal(d);
      return true;
    }
    if (!this.dentro) return false;
    const agora = performance.now();
    if (agora - this.sairEm < 3000) {
      this.sair();
      hud.mensagem('Saiu da investigação', '', 1500, COR);
    } else {
      this.sairEm = agora;
      hud.mensagem('Sair da investigação?', 'Aperte Esc de novo para sair', 2600, '#facc15');
    }
    return true;
  }

  teclaR() {
    return this.dentro; // nada de voltar ao começo lá dentro
  }

  // as teclas de dentro da casa (main.js chama antes dos atalhos de sempre)
  tecla(e) {
    if (!this.dentro) return false;
    const c = e.code;
    if (c.startsWith('Digit') || c.startsWith('Numpad')) {
      const n = Number(c.replace(/\D/g, ''));
      if (n >= 1 && n <= ITENS.length) this.escolherItem(n - 1);
      return true;
    }
    if (c === 'KeyF') {
      this.alternarLanterna();
      return true;
    }
    if (c === 'KeyJ') {
      this.abrirDiario();
      return true;
    }
    // poderes, carro, sentar, terceira pessoa e as armas ficam do lado de fora
    return ['KeyQ', 'KeyG', 'KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'Tab'].includes(c);
  }

  // a roda do mouse troca o aparelho
  roda(dy) {
    if (!this.dentro) return false;
    this.escolherItem((this.item + (dy > 0 ? 1 : -1) + ITENS.length) % ITENS.length);
    return true;
  }

  escolherItem(i) {
    if (this.morto) return;
    const antes = ITENS[this.item].id;
    this.item = i;
    const id = ITENS[i].id;
    if (antes === 'camera' && id !== 'camera') this.ligados.camera = false;
    if (antes === 'uv' && id !== 'uv') this.ligados.uv = false;
    this.som.tocar('clique', null, 0.4);
    hud.mensagem(ITENS[i].nome, ITENS[i].dica, 1500, COR);
    this.atualizarHud();
  }

  alternarLanterna() {
    if (this.morto) return;
    this.lanterna = !this.lanterna;
    this.som.tocar('clique', null, 0.6);
    this.atualizarHud();
  }

  // ---------------------------------------------------------------- usar o aparelho (clique)
  apertou() {
    if (!this.dentro) return false;
    if (this.morto || this.escondido >= 0) return true;
    const it = ITENS[this.item].id;
    const p = this.aqui();
    switch (it) {
      case 'emf':
      case 'camera':
      case 'uv':
        this.ligados[it] = !this.ligados[it];
        this.som.tocar('clique', null, 0.5);
        break;
      case 'termo':
        break;
      case 'spirit': {
        if (performance.now() < this.spirit.ate) break;
        const [q, texto] = PERGUNTAS[this.spirit.pergunta++ % PERGUNTAS.length];
        this.spirit = { ...this.spirit, ate: performance.now() + 2600, texto: '...', perguntou: texto };
        hud.mensagem(texto, 'Spirit Box', 1600, '#f97316');
        this.som.varredura(2.2);
        this.socket?.emit('fs-spirit', { x: p.x, z: p.z, q }, (r) => {
          setTimeout(() => {
            if (!this.dentro) return;
            if (r?.resp) {
              this.spirit.texto = r.resp;
              this.spirit.ate = performance.now() + 3000;
              this.som.falar(r.resp, { tom: 0.1, ritmo: 0.6 });
              hud.mensagem(`“${r.resp}”`, 'O Spirit Box respondeu!', 2800, '#f97316');
              this.perder(3);
            } else this.spirit.texto = '— sem resposta —';
          }, 1500);
        });
        break;
      }
      case 'livro':
      case 'dots':
      case 'crucifixo':
        this.porNoChao(it);
        break;
      case 'incenso':
        if (this.incensos <= 0) {
          hud.mensagem('Acabou o incenso', '', 1400, '#94a3b8');
          break;
        }
        this.incensos--;
        this.som.tocar('fosforo', null, 0.8);
        this.socket?.emit('fs-incenso', { x: p.x, z: p.z });
        break;
      default:
    }
    this.atualizarHud();
    return true;
  }

  soltou() {}

  ativo() {
    return this.dentro; // no celular o botão de ação usa o aparelho
  }

  porNoChao(t) {
    const C = this.C;
    const p = this.aqui();
    this.world.camera.getWorldDirection(_f);
    _f.y = 0;
    _f.normalize();
    const x = p.x + _f.x * 1.0;
    const z = p.z + _f.z * 1.0;
    const meus = (this.e?.colocados || []).filter((c) => c.dono === this.eu && c.t === t).length;
    if (meus >= ITEM[t].limite) return hud.mensagem(`Você já pôs ${ITEM[t].limite}`, 'Pegue um de volta com E', 1600, '#94a3b8');
    const sala = salaEm(C, x, z);
    if (!sala && t !== 'crucifixo') return hud.mensagem('Ponha dentro da casa', '', 1400, '#94a3b8');
    // o projetor olha para onde eu olho; o livro, aberto para mim
    const giro = Math.atan2(-_f.x, -_f.z);
    this.socket?.emit('fs-por', { t, x, z, y: 0, giro }, (r) => {
      if (r?.erro === 'limite') hud.mensagem('Limite atingido', '', 1400, '#94a3b8');
      else if (r?.id) this.som.tocar('pancada', this.mundo(x, z, 0.1), 0.4);
    });
  }

  // ---------------------------------------------------------------- E: portas, luzes, esconder...
  alvoDoE() {
    if (!this.C || !this.casa3d) return null;
    const C = this.C;
    const c = this.casa3d;
    const p = this.aqui();
    this.world.camera.getWorldDirection(_f);
    const olhando = (x, z, y = 1.2, max = 1.8, cone = 0.45) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const dy = y - (p.y + 1.6);
      const d = Math.hypot(dx, dy, dz);
      if (d > max) return null;
      const dot = (dx * _f.x + dy * _f.y + dz * _f.z) / (d || 1);
      return dot > cone || d < 0.7 ? d : null;
    };
    let melhor = null;
    const ver = (d, alvo) => {
      if (d !== null && (!melhor || d < melhor.d)) melhor = { d, ...alvo };
    };
    if (this.escondido >= 0) return { tipo: 'sair', texto: 'Sair do esconderijo' };
    if (this.morto) return null;
    for (const s of C.interruptores) ver(olhando(s.x, s.z, s.y, 1.7, 0.6), { tipo: 'luz', i: C.comodos.indexOf(C.sala[s.sala]), texto: this.e?.luzes[C.comodos.indexOf(C.sala[s.sala])] ? 'Apagar a luz' : 'Acender a luz' });
    if (c.disjuntor) ver(olhando(c.disjuntor.x, c.disjuntor.z, 1.5, 1.8, 0.5), { tipo: 'disjuntor', texto: this.e?.disjuntor ? 'Desligar o disjuntor' : 'Ligar o disjuntor' });
    c.portas.forEach((pt, i) => {
      if (!pt) return;
      ver(olhando(pt.def.x, pt.def.z, 1.1, 2.0, 0.5), { tipo: 'porta', i, texto: pt.aberta ? 'Fechar a porta' : 'Abrir a porta' });
    });
    for (const h of C.esconderijos) {
      const m = C.moveis[h.movel];
      const giro = (m.r * Math.PI) / 2;
      const fx = m.x + Math.sin(giro) * (m.d / 2 + 0.3);
      const fz = m.z + Math.cos(giro) * (m.d / 2 + 0.3);
      const d = olhando(fx, fz, 1.1, 1.6, 0.3);
      ver(d === null ? null : d + 0.3, { tipo: 'esconder', i: h.i, texto: m.t === 'armario' ? 'Entrar no armário' : 'Entrar no guarda-roupa' });
    }
    for (const g3 of this.colocados.values()) {
      const def = g3.userData.def;
      ver(olhando(def.x, def.z, 0.1, 1.8, 0.5), { tipo: 'pegar', id: def.id, texto: `Pegar ${ITEM[def.t].nome.toLowerCase()}` });
    }
    const v = c.van;
    if (v) {
      ver(olhando(v.monitor.x, v.monitor.z, v.monitor.y + 0.3, 2.2, 0.4), { tipo: 'diario', texto: 'Ver o diário (monitor)' });
      if (!this.remedioTomado) ver(olhando(v.remedio.x, v.remedio.z, v.remedio.y + 0.3, 1.8, 0.4), { tipo: 'remedio', texto: 'Tomar o remédio (+40% de sanidade)' });
      ver(olhando(v.botao.x, v.botao.z, v.botao.y + 0.3, 1.8, 0.5), { tipo: 'terminar', texto: 'Terminar a investigação' });
    }
    return melhor;
  }

  interagir() {
    const a = this.alvoDoE();
    if (!a) return this.dentro;
    const C = this.C;
    switch (a.tipo) {
      case 'luz':
        this.socket?.emit('fs-luz', a.i);
        break;
      case 'disjuntor':
        this.socket?.emit('fs-disjuntor');
        break;
      case 'porta':
        if (C.portas[a.i].rua && this.trancada) {
          this.som.tocar('trancada', this.mundo(C.portas[a.i].x, C.portas[a.i].z), 1);
          hud.mensagem('A porta está trancada!', 'Esconda-se!', 1600, '#ef4444');
        } else this.socket?.emit('fs-porta', a.i);
        break;
      case 'esconder':
        this.esconder(a.i);
        break;
      case 'sair':
        this.esconder(-1);
        break;
      case 'pegar':
        this.socket?.emit('fs-pegar', a.id);
        this.som.tocar('clique', null, 0.5);
        break;
      case 'diario':
        this.abrirDiario();
        break;
      case 'remedio':
        this.remedioTomado = true;
        this.sanidade = Math.min(100, this.sanidade + JOGO.remedio);
        this.som.tocar('comprimidos', null, 0.8);
        hud.mensagem('Remédio tomado', `Sanidade: ${Math.round(this.sanidade)}%`, 2000, '#4ade80');
        break;
      case 'terminar': {
        const agora = performance.now();
        if (!this.palpite && agora - this.terminarEm > 3000) {
          this.terminarEm = agora;
          hud.mensagem('Você ainda não escolheu o monstro', 'Abra o diário (J). Aperte E de novo para terminar assim mesmo.', 3000, '#facc15');
        } else if (agora - this.terminarEm < 3000 || this.palpite) {
          if (this.palpite && agora - this.terminarEm > 3000) {
            this.terminarEm = agora;
            hud.mensagem('Terminar a investigação?', `Seu palpite: ${MONSTRO[this.palpite].nome}. Aperte E de novo.`, 3000, '#facc15');
          } else this.socket?.emit('fs-terminar');
        }
        break;
      }
      default:
    }
    return true;
  }

  esconder(i) {
    const pl = this.player;
    if (i < 0) {
      this.escondido = -1;
      pl.override = null;
      pl.limites = { andar: 1.8, correr: 3.1, pulo: 4.2 };
      this.som.tocar('rangido', null, 0.5);
    } else {
      const h = this.C.esconderijos[i];
      const m = this.C.moveis[h.movel];
      const giro = (m.r * Math.PI) / 2;
      const o = this.C.origem;
      const dx = Math.sin(giro);
      const dz = Math.cos(giro);
      // fico em pé na frente, e a câmera vai para dentro, olhando pela fresta
      pl.teleport([m.x + dx * (m.d / 2 + 0.42) + o.x, o.y, m.z + dz * (m.d / 2 + 0.42) + o.z]);
      pl.limites = { andar: 0, correr: 0, pulo: 0 };
      pl.override = {
        position: new THREE.Vector3(m.x + dx * (m.d / 2 - 0.15) + o.x, o.y + 1.55, m.z + dz * (m.d / 2 - 0.15) + o.z),
        target: new THREE.Vector3(m.x + dx * 4 + o.x, o.y + 1.3, m.z + dz * 4 + o.z),
      };
      this.escondido = i;
      this.lanterna = false;
      this.som.tocar('rangido', null, 0.5);
    }
    this.enviar(true);
    this.atualizarHud();
  }

  // ---------------------------------------------------------------- morrer
  morrer(comSusto = false) {
    if (this.morto) return;
    this.morto = true;
    this.lanterna = false;
    this.ligados.camera = false;
    if (this.escondido >= 0) this.esconder(-1);
    if (comSusto && this.monstro) {
      // o susto: ele cara a cara, o grito e a tela vermelha
      this.susto = { t: 0 };
      this.som.susto(1);
      this.player.addShake?.(1.4);
      const fl = document.getElementById('fs-flash');
      if (fl) {
        fl.style.transition = 'none';
        fl.style.opacity = '0.75';
        requestAnimationFrame(() => {
          fl.style.transition = 'opacity 1.6s';
          fl.style.opacity = '0';
        });
      }
    }
    setTimeout(() => {
      if (!this.dentro) return;
      const m = document.getElementById('fs-morto');
      if (m) {
        m.hidden = false;
        setTimeout(() => { m.hidden = true; }, 5000);
      }
      this.world.renderer.domElement.style.filter = 'grayscale(1) contrast(1.15) brightness(1.4)';
      this.world.luzNoturna = { hemi: 0.5, ambiente: 0 };
    }, comSusto ? 1400 : 0);
  }

  // ---------------------------------------------------------------- a tela
  montarHud() {
    estilos();
    if (!document.getElementById('fs-hud')) {
      const d = document.createElement('div');
      d.id = 'fs-hud';
      d.innerHTML = `<div id="fs-vinheta"></div><div id="fs-grao"></div><div id="fs-mira"></div>
        <div id="fs-info"></div><div id="fs-leitura"></div><div id="fs-itens"></div>
        <div id="fs-botoes"><button type="button" data-b="lanterna">🔦 Lanterna</button><button type="button" data-b="diario">📓 Diário</button><button type="button" data-b="sair">Sair</button></div>`;
      document.body.appendChild(d);
      const nv = document.createElement('div');
      nv.id = 'fs-nv';
      nv.hidden = true;
      nv.innerHTML = '<span>● REC</span>';
      document.body.appendChild(nv);
      const es = document.createElement('div');
      es.id = 'fs-escondido';
      es.hidden = true;
      document.body.appendChild(es);
      const fl = document.createElement('div');
      fl.id = 'fs-flash';
      document.body.appendChild(fl);
      const mo = document.createElement('div');
      mo.id = 'fs-morto';
      mo.hidden = true;
      mo.innerHTML = '<b>VOCÊ MORREU</b><span>Você vaga pela casa como espírito. Ainda pode marcar o diário.</span>';
      document.body.appendChild(mo);
      d.querySelector('#fs-itens').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-i]');
        if (!b) return;
        const i = Number(b.dataset.i);
        if (i === this.item && isTouch) this.apertou();
        else this.escolherItem(i);
      });
      d.querySelector('#fs-botoes').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-b]')?.dataset.b;
        if (b === 'lanterna') this.alternarLanterna();
        else if (b === 'diario') this.abrirDiario();
        else if (b === 'sair') this.esc();
      });
      // o grão do filme
      const cv = document.createElement('canvas');
      cv.width = cv.height = 160;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      d.querySelector('#fs-grao').style.backgroundImage = `url(${cv.toDataURL()})`;
    }
    document.getElementById('fs-hud').hidden = false;
    this.atualizarHud();
  }

  atualizarHud() {
    const d = document.getElementById('fs-hud');
    if (!d || !this.dentro) return;
    const e = this.e;
    const C = this.C;
    const info = d.querySelector('#fs-info');
    info.innerHTML = `<b>${esc(C?.nome || '')}</b><small>Fantasma: ${esc(e?.nome || '?')}${e ? ` (${e.idade} anos)` : ''}</small>
      <div id="fs-san"><i style="width:${Math.round(this.sanidade)}%;background-position:${-220 + (this.sanidade / 100) * 220}px 0"></i></div>
      <small>Sanidade ${Math.round(this.sanidade)}%${this.morto ? ' · MORTO' : ''} · <kbd>J</kbd> diário</small>`;
    const meus = (t) => (e?.colocados || []).filter((c) => c.dono === this.eu && c.t === t).length;
    const itens = ITENS.map((it, i) => {
      let qtd = '';
      if (it.id === 'incenso') qtd = this.incensos;
      else if (it.limite) qtd = it.limite - meus(it.id);
      const lig = (it.id in this.ligados && this.ligados[it.id]) || it.id === 'termo';
      return `<button type="button" data-i="${i}" class="${i === this.item ? 'on' : ''} ${lig && i === this.item ? 'ligado' : ''}" title="${esc(it.nome)}"><em>${it.tecla}</em><span>${ICONES[it.id]}</span>${CURTOS[it.id]}${qtd !== '' ? `<b>${qtd}</b>` : ''}</button>`;
    }).join('');
    // só troca o HTML quando muda (trocar no meio de um toque perde o clique)
    if (itens !== this.itensHtml) {
      this.itensHtml = itens;
      d.querySelector('#fs-itens').innerHTML = itens;
    }
    d.querySelector('[data-b="lanterna"]').classList.toggle('on', this.lanterna);
  }

  // ---------------------------------------------------------------- o diário
  abrirDiario() {
    estilos();
    let m = document.getElementById('fs-diario');
    if (!m) {
      m = document.createElement('div');
      m.id = 'fs-diario';
      m.className = 'fs-modal';
      document.body.appendChild(m);
      m.addEventListener('click', (ev) => {
        const p = ev.target.closest('[data-prova]');
        const mo = ev.target.closest('[data-monstro]');
        if (p) {
          const id = p.dataset.prova;
          this.provas[id] = this.provas[id] === 0 ? 1 : this.provas[id] === 1 ? -1 : 0;
          this.desenharDiario(m);
        } else if (mo) {
          this.palpite = this.palpite === mo.dataset.monstro ? null : mo.dataset.monstro;
          this.socket?.emit('fs-palpite', this.palpite);
          this.desenharDiario(m);
        } else if (ev.target.closest('.fs-fechar') || ev.target === m) this.fecharModal(m);
      });
    }
    if (!m.hidden && m.dataset.aberto === '1') {
      this.fecharModal(m);
      m.dataset.aberto = '0';
      return;
    }
    m.dataset.aberto = '1';
    this.desenharDiario(m);
    this.abrirModal(m);
  }

  desenharDiario(m) {
    const sim = IDS_PROVAS.filter((p) => this.provas[p] === 1);
    const nao = IDS_PROVAS.filter((p) => this.provas[p] === -1);
    const servem = new Set(possiveis(sim, nao).map((x) => x.id));
    const e = this.e;
    const palpite = this.palpite && MONSTRO[this.palpite];
    m.innerHTML = `<div class="fs-caixa"><button class="fs-fechar" type="button">Fechar${isTouch ? '' : ' (J)'}</button>
      <h2>📓 Diário de investigação</h2>
      <p>${esc(this.C?.nome || '')} · O fantasma: <b>${esc(e?.nome || '?')}</b>${e ? `, ${e.idade} anos` : ''}.</p>
      <h3>1. As provas que você achou</h3>
      <div class="fs-provas">${IDS_PROVAS.map((p) => {
    const s = this.provas[p];
    return `<button type="button" data-prova="${p}" class="${s === 1 ? 'sim' : s === -1 ? 'nao' : ''}" title="${esc(PROVAS[p].dica)}"><i style="background:${PROVAS[p].cor}"></i>${s === 1 ? '✓ ' : s === -1 ? '✗ ' : ''}${esc(PROVAS[p].nome)}</button>`;
  }).join('')}</div>
      <p class="fs-legenda">Clique numa prova: 1ª vez <b>✓ achei</b>, 2ª vez <b>✗ não tem</b>, 3ª vez limpa. Cada monstro deixa 3 provas; passe o mouse numa prova para ver como achá-la.</p>
      <h3>2. Qual monstro é? <span class="fs-contagem">${servem.size === 1 ? 'Só 1 bate' : `${servem.size} de ${MONSTROS.length} batem`}</span></h3>
      <div class="fs-monstros">${MONSTROS.map((x) => `<button type="button" data-monstro="${x.id}" style="--c:${x.cor}" class="${servem.has(x.id) ? '' : 'fora'} ${this.palpite === x.id ? 'escolhido' : ''}">
        <b>${this.palpite === x.id ? '★ ' : ''}${esc(x.nome)}</b><br>${x.provas.map((p) => `<i class="${this.provas[p] === 1 ? 'tem' : ''}">${esc(PROVAS[p].curto)}</i>`).join('')}
        <p>${esc(x.desc)}</p><p><em>Força:</em> ${esc(x.forca)}</p><p><u>Fraqueza:</u> ${esc(x.fraqueza)}</p></button>`).join('')}</div>
      <p class="fs-dica">3. ${palpite ? `Seu palpite: <b style="color:${palpite.cor}">${esc(palpite.nome)}</b>. Volte à van e aperte o <b>botão vermelho</b> para terminar.` : 'Clique no monstro que você acha que é (★) e depois aperte o <b>botão vermelho</b> da van para terminar.'}
        Acertou: +${JOGO.moedas.acertou} moedas.</p></div>`;
  }

  mostrarFim(f) {
    estilos();
    let m = document.getElementById('fs-fim');
    if (!m) {
      m = document.createElement('div');
      m.id = 'fs-fim';
      m.className = 'fs-modal fs-fim';
      document.body.appendChild(m);
      m.addEventListener('click', (ev) => {
        if (ev.target.closest('.fs-fechar') || ev.target === m) m.hidden = true;
      });
    }
    const mon = MONSTRO[f.monstro];
    m.innerHTML = `<div class="fs-caixa"><button class="fs-fechar" type="button">Fechar</button>
      <h2>${f.motivo === 'mortos' ? 'Todos morreram' : 'Investigação encerrada'}</h2>
      <p>O fantasma era <b style="color:${mon.cor}">${esc(mon.nome)}</b> — ${esc(f.nome)}, ${f.idade} anos. O cômodo dele: ${esc(f.favorito)}.</p>
      <p>${esc(mon.desc)}</p>
      <ul>${f.jogadores.map((j) => `<li><i style="background:${esc(j.cor)}"></i><span>${esc(j.nome)}${j.morto ? ' (morto)' : ''} — palpite: ${j.palpite ? esc(MONSTRO[j.palpite]?.nome) : 'nenhum'} ${j.certo ? '✓' : '✗'}</span><em>${j.moedas ? `+${j.moedas} moedas` : ''}</em></li>`).join('')}</ul>
      <p class="fs-dica">Voltando para a praça em alguns segundos...</p></div>`;
    m.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const eu = f.jogadores.find((j) => j.id === this.eu);
    if (eu?.certo) this.sfx.finish?.();
  }

  // ---------------------------------------------------------------- o que vai para o servidor
  eletronico() {
    const it = ITENS[this.item].id;
    return !this.morto && ((it === 'emf' && this.ligados.emf) || it === 'spirit' || it === 'termo' || (it === 'camera' && this.ligados.camera) || (it === 'uv' && this.ligados.uv));
  }

  enviar(ja = false) {
    const agora = performance.now();
    if (!ja && agora - this.ultimoEnvio < 250) return;
    this.ultimoEnvio = agora;
    this.world.camera.getWorldDirection(_f);
    this.socket?.emit('fs-eu', {
      s: Math.round(this.sanidade * 10) / 10,
      l: this.lanterna && !this.morto,
      e: this.eletronico(),
      f: !!this.falando?.() && !this.morto,
      h: this.escondido,
      d: [Math.round(_f.x * 100) / 100, Math.round(_f.y * 100) / 100, Math.round(_f.z * 100) / 100],
      it: ITENS[this.item].id,
    });
  }

  // gente morta ou escondida não aparece para os outros
  oculto(id) {
    if (!this.dentro) return false;
    const j = this.e?.jogadores.find((x) => x.id === id);
    if (j?.morto && !this.morto) return true;
    return (this.outros.get(id)?.h ?? -1) >= 0;
  }

  // ---------------------------------------------------------------- todo quadro
  update(dt, t) {
    if (!this.dentro || !this.casa3d) return;
    if (!this.ligado()) return this.sair();
    const pl = this.player;
    const w = this.world;
    const cam = w.camera;
    const C = this.C;
    const c = this.casa3d;
    const e = this.e;
    const o = C.origem;
    if (pl.voando || pl.puloAlto || pl.veiculo || pl.sitting) this.aoEntrar?.();
    if (pl.mode !== 'first') pl.mode = 'first';
    const p = this.aqui();
    // foi para outro lugar (o mapa, o catálogo): saiu da investigação
    const T = C.terreno;
    if (Math.abs(p.y) > 40 || p.x < T.x0 - 60 || p.x > T.x1 + 60 || p.z < T.z0 - 60 || p.z > T.z1 + 60) return this.sair(true, false);
    const sala = salaEm(C, p.x, p.z);
    const naCasa = !!sala && Math.abs(p.y) < 3;
    const iSala = sala ? C.comodos.indexOf(sala) : -1;
    const luzAqui = naCasa && e?.disjuntor && e?.luzes[iSala];
    const cacando = !!e?.cacando;
    this.som.ouvinte(cam);
    this.som.dentro(naCasa);
    // fôlego: corre pouco e cansa
    if (pl.limites && this.escondido < 0) {
      const correndo = (pl.keys.has('ShiftLeft') || pl.keys.has('ShiftRight') || pl.runInput || pl.runLock) && Math.hypot(pl.vel.x, pl.vel.z) > 2;
      if (this.cansado > 0) this.cansado -= dt;
      if (correndo && this.cansado <= 0) {
        this.folego -= dt / 3.2;
        if (this.folego <= 0) {
          this.folego = 0;
          this.cansado = 2.5;
          this.som.tocar('respira', null, 0.35);
        }
      } else this.folego = Math.min(1, this.folego + dt / 6);
      pl.limites.correr = this.cansado > 0 ? 1.8 : 3.1;
      if (this.morto) Object.assign(pl.limites, { andar: 2.6, correr: 4, pulo: 4.2 });
    }
    // sanidade: cai no escuro dentro da casa
    if (naCasa && !this.morto) {
      const taxa = luzAqui ? JOGO.sanidadeClaro : JOGO.sanidadeEscuro;
      this.sanidade = Math.max(0, this.sanidade - taxa * dt * (cacando ? 0 : 1));
    }
    // o fantasma
    const g = this.g;
    const m = this.monstro;
    let distG = 99;
    let interferencia = 0;
    if (g && m) {
      distG = Math.hypot(g[0] - p.x, g[1] - p.z);
      const vis = g[3];
      let visivel = false;
      let opac = 1;
      let brilho = 0;
      if (vis === 1) {
        m.setModo('vulto');
        visivel = true;
        opac = 0.78 + Math.sin(t * 23) * 0.12;
        brilho = 0.3;
      } else if (vis === 2) {
        m.setModo('inteiro');
        visivel = true;
        opac = 0.92 + Math.sin(t * 31) * 0.08;
        brilho = 0.5;
      } else if (vis === 3) {
        m.setModo('dots');
        visivel = [...this.colocados.values()].some((g3) => g3.userData.def.t === 'dots' && Math.hypot(g3.userData.def.x - g[0], g3.userData.def.z - g[1]) < 6) || this.ligados.camera;
      } else if (vis === 4) {
        m.setModo('inteiro');
        // na caçada ele pisca
        const ritmo = (Math.sin(t * 9.1) + Math.sin(t * 5.3 + 1) + Math.sin(t * 13.7)) / 3;
        visivel = ritmo > (this.e?.pisca ?? -0.25);
        brilho = 1;
        interferencia = Math.max(0, 1 - distG / 14);
      }
      if (this.susto) {
        // o susto: ele colado na câmera, atacando
        this.susto.t += dt;
        cam.getWorldDirection(_f);
        m.alvo.copy(cam.position).addScaledVector(_f, 0.75);
        m.alvo.y = cam.position.y - m.def.altura * 0.88;
        m.pos.copy(m.alvo);
        m.alvoRot = Math.atan2(-_f.x, -_f.z);
        m.rot = m.alvoRot;
        m.setModo('inteiro');
        m.tocar('ataque');
        m.preso = true;
        visivel = this.susto.t < 1.3;
        brilho = 1.4;
        if (this.susto.t > 1.6) {
          this.susto = null;
          m.preso = false;
        }
      }
      m.update(dt, visivel, opac, brilho);
      // ver o fantasma tira sanidade (uma vez por aparição)
      if (vis && vis !== this.visAntes) this.vistoNesta = false;
      this.visAntes = vis;
      if (visivel && (vis === 1 || vis === 2 || vis === 4) && !this.vistoNesta && distG < 14 && !this.morto) {
        m.cabeca(_v);
        const dir = _v.sub(cam.position);
        cam.getWorldDirection(_f);
        if (dir.normalize().dot(_f) > 0.55) {
          this.vistoNesta = true;
          this.perder(JOGO.sanidadeEvento);
          this.som.ferroada(0.8);
        }
      }
      // perto, as coisas falham
      if (visivel && vis !== 3) interferencia = Math.max(interferencia, Math.max(0, 1 - distG / 8) * 0.8);
      // passos pesados na caçada
      if (vis === 4 && g[4] > 0) {
        this.passoT -= dt;
        if (this.passoT <= 0) {
          this.passoT = g[4] === 2 ? 0.34 : 0.55;
          this.som.tocar('passo', this.mundo(g[0], g[1], 0.2), 1.4);
        }
      }
    }
    // a caçada: o monstro fazendo barulho de onde está (rosnado, guincho, gemido...) e, quando chega
    // perto, o ferrão (no máximo a cada 5 s)
    if (cacando && g && !this.morto) {
      this.vozT -= dt;
      if (this.vozT <= 0) {
        this.vozT = 2.2 + Math.random() * 3.5;
        this.som.vozDaCacada(this.mundo(g[0], g[1], 1.4), Math.max(0, 1 - distG / 12));
      }
      if (distG < 4.5 && performance.now() - this.ferraoEm > 5000) {
        this.ferraoEm = performance.now();
        this.som.ferroada(1);
      }
    }
    // a caçada: estática, coração e luzes piscando
    this.som.estatica(cacando ? Math.max(0.15, 1 - distG / 12) : 0);
    const medo = cacando ? Math.max(0.25, 1 - distG / 18) : interferencia * 0.6;
    this.som.coracaoBate(this.morto ? 0 : medo, dt);
    document.getElementById('fs-hud')?.classList.toggle('cacada', cacando && !this.morto);
    c.animar(dt, t, interferencia);
    c.fisicaObjetos(dt, (pos, forca) => this.som.tocar('pancada', _v.set(pos.x + o.x, pos.y + o.y, pos.z + o.z).clone(), forca));
    c.seguirCamera(cam);
    c.luzUV(cam, this.ligados.uv && ITENS[this.item].id === 'uv' && !this.morto);
    // orbes: só pela câmera de visão noturna, no cômodo dele
    const nv = this.ligados.camera && ITENS[this.item].id === 'camera' && !this.morto;
    this.orbes?.update(t, e && e.orbes >= 0 ? C.comodos[e.orbes] : null, nv);
    this.fumaca?.update(dt);
    // os pontos do D.O.T.S. tremem
    for (const g3 of this.colocados.values()) {
      const pts = g3.userData.pontos;
      if (pts) pts.material.opacity = 0.55 + Math.random() * 0.35;
    }
    // a mão segue a câmera; lanterna e UV
    this.atualizarMao(dt, t, interferencia, cacando, distG);
    // as lanternas dos outros (só a de quem está mais perto)
    this.lanternaRemota();
    // visão noturna e o raio lá fora
    const nvEl = document.getElementById('fs-nv');
    if (nvEl) nvEl.hidden = !nv;
    if (!this.morto) {
      w.luzNoturna = { hemi: nv ? 1.4 : 0.07, ambiente: 0 };
      w.renderer.domElement.style.filter = nv ? 'grayscale(1) sepia(1) hue-rotate(55deg) saturate(3.2) brightness(1.15) contrast(1.15)' : '';
      this.relampago(t, naCasa);
    }
    const esEl = document.getElementById('fs-escondido');
    if (esEl) esEl.hidden = this.escondido < 0;
    // EMF e termômetro
    this.aparelhos(dt, p, sala);
    // a van: monitor
    this.monitorT -= dt;
    if (this.monitorT <= 0 && e) {
      this.monitorT = 1;
      this.atividade.push(this.atividade.at(-1) * 0.5);
      this.atividade.shift();
      const vivos = e.jogadores.filter((j) => !j.morto);
      c.desenharMonitor({
        casa: C.nome, nome: e.nome,
        media: vivos.length ? Math.round(vivos.reduce((s, j) => s + (j.id === this.eu ? this.sanidade : j.sanidade), 0) / vivos.length) : 0,
        jogadores: e.jogadores.map((j) => ({ ...j, sanidade: j.id === this.eu ? Math.round(this.sanidade) : j.sanidade })),
        atividade: this.atividade,
      });
    }
    // sanidade baixa: o susto de tela (o rosto dele por um instante)
    if (!this.morto && this.sanidade < 25 && !cacando && Math.random() < dt / 90 && m) this.sustoDeTela();
    this.enviar();
    this.telasT -= dt;
    if (this.telasT <= 0) {
      this.telasT = 0.5;
      this.atualizarHud();
    }
    this.placar();
  }

  atualizarMao(dt, t, interferencia, cacando, distG) {
    const mao = this.mao;
    const cam = this.world.camera;
    mao.grupo.position.copy(cam.position);
    mao.grupo.quaternion.slerp(cam.quaternion, Math.min(1, dt * 18));
    const it = ITENS[this.item].id;
    const pl = this.player;
    const anda = Math.hypot(pl.vel.x, pl.vel.z);
    for (const [id, g3] of Object.entries(mao.itens)) {
      g3.visible = id === it && !this.morto && this.escondido < 0;
      if (g3.visible) {
        g3.position.y = -0.16 + Math.sin(t * 7) * 0.004 * Math.min(1, anda);
        g3.position.x = 0.16 + Math.cos(t * 3.5) * 0.004 * Math.min(1, anda);
      }
    }
    // a lanterna falha perto dele (e na caçada)
    let f = 1;
    if (interferencia > 0 && Math.sin(t * 41) * Math.sin(t * 13.3) > 0.55 - interferencia) f = Math.random() < 0.5 ? 0 : 0.15;
    if (cacando && distG < 12 && Math.random() < 0.25) f = 0;
    mao.lanterna.intensity = this.lanterna && !this.morto ? 26 * f : 0;
    mao.uv.intensity = it === 'uv' && this.ligados.uv && !this.morto ? 26 * f : 0;
    const uvl = mao.itens.uv.userData.lente;
    if (uvl) uvl.material.color.set(this.ligados.uv ? 0xa855f7 : 0x2e1065);
    const brasa = mao.itens.incenso.userData.brasa;
    if (brasa) brasa.visible = this.incensos < ITEM.incenso.limite && performance.now() % 2000 < 1000;
    const rec = mao.itens.camera.userData.rec;
    if (rec) rec.visible = this.ligados.camera && t % 1 < 0.5;
  }

  lanternaRemota() {
    const l = this.remota;
    if (!l) return;
    let melhor = null;
    for (const [id, x] of this.outros) {
      if (id === this.eu || !x.l) continue;
      const pos = this.posDe?.(id);
      if (!pos) continue;
      const d = pos.distanceTo(this.player.pos);
      if (d < 30 && (!melhor || d < melhor.d)) melhor = { d, pos, x };
    }
    if (!melhor) {
      l.intensity = 0;
      return;
    }
    l.position.set(melhor.pos.x, melhor.pos.y + 1.5, melhor.pos.z);
    l.target.position.set(melhor.pos.x + melhor.x.d[0] * 5, melhor.pos.y + 1.5 + melhor.x.d[1] * 5, melhor.pos.z + melhor.x.d[2] * 5);
    l.target.updateMatrixWorld();
    l.intensity = 30;
  }

  relampago(t, naCasa) {
    const agora = performance.now();
    if (agora > this.proxRaio) {
      this.proxRaio = agora + 25000 + Math.random() * 40000;
      this.raio = agora;
      setTimeout(() => this.dentro && this.som.tocar('trovao', null, naCasa ? 0.6 : 1), 900 + Math.random() * 1600);
    }
    const dt = agora - this.raio;
    if (dt < 450) {
      const flash = dt < 70 || (dt > 160 && dt < 230) ? 1 : 0;
      if (flash) this.world.luzNoturna = { hemi: naCasa ? 0.6 : 2.2, ambiente: 0 };
    }
  }

  aparelhos(dt, p, sala) {
    const it = ITENS[this.item].id;
    const agora = performance.now();
    this.leiturasEmf = this.leiturasEmf.filter((l) => l.ate > agora);
    let emf = 1;
    for (const l of this.leiturasEmf) if (Math.hypot(l.x - p.x, l.z - p.z) < 2.6) emf = Math.max(emf, l.nivel);
    // o fantasma passando perto marca 2
    if (this.g && Math.hypot(this.g[0] - p.x, this.g[1] - p.z) < 2.2) emf = Math.max(emf, 2);
    if (this.e?.cacando && this.g && Math.hypot(this.g[0] - p.x, this.g[1] - p.z) < 10) emf = 1 + Math.floor(Math.random() * 5);
    const ligadoEmf = it === 'emf' && this.ligados.emf && !this.morto;
    const leds = this.mao.itens.emf.userData.leds;
    leds.forEach((led, i) => led.material.color.set(ligadoEmf && i < emf ? led.userData.cor : 0x1a1a1a));
    if (ligadoEmf) this.som.emf(emf, dt);
    // temperatura do cômodo (com um pouco de ruído do aparelho)
    const temp = sala && this.e ? this.e.temps[this.C.comodos.indexOf(sala)] : 9;
    this.leituraT -= dt;
    if (this.leituraT > 0) return;
    this.leituraT = 0.25;
    const tela = (alvo, texto, cor = '#a7f3d0', fundo = '#04110a') => {
      const t = this.mao.itens[alvo].userData.tela;
      if (!t) return;
      t.ctx.fillStyle = fundo;
      t.ctx.fillRect(0, 0, t.cv.width, t.cv.height);
      t.ctx.fillStyle = cor;
      t.ctx.font = `bold ${t.cv.height * 0.55}px monospace`;
      t.ctx.textAlign = 'center';
      t.ctx.textBaseline = 'middle';
      t.ctx.fillText(texto, t.cv.width / 2, t.cv.height / 2);
      t.tex.needsUpdate = true;
    };
    const ruido = (Math.random() - 0.5) * 0.6;
    const tTxt = `${(temp + ruido).toFixed(1)}°C`;
    tela('termo', tTxt, temp < 0 ? '#7dd3fc' : '#a7f3d0');
    const spirit = agora < this.spirit.ate ? this.spirit.texto : `${(88 + Math.random() * 20).toFixed(1)} FM`;
    tela('spirit', spirit.length > 12 ? spirit.slice(0, 12) : spirit, '#fdba74', '#1a0a04');
    let leitura = '';
    if (!this.morto) {
      if (it === 'emf') leitura = this.ligados.emf ? `EMF ${'▮'.repeat(emf)}${'▯'.repeat(5 - emf)} ${emf}` : 'EMF desligado (clique liga)';
      else if (it === 'termo') leitura = `🌡 ${tTxt}${temp < 0 ? ' ❄' : ''}`;
      else if (it === 'spirit') leitura = agora < this.spirit.ate ? `📻 ${this.spirit.texto}` : '📻 clique para perguntar';
      else if (it === 'camera') leitura = this.ligados.camera ? '📹 visão noturna' : '📹 clique liga a visão noturna';
      else if (it === 'uv') leitura = this.ligados.uv ? '🔦 UV ligada' : '🔦 clique liga a UV';
      else if (it === 'incenso') leitura = `🪔 ${this.incensos} incenso${this.incensos === 1 ? '' : 's'}`;
    }
    const el = document.getElementById('fs-leitura');
    if (el && el.textContent !== leitura) el.textContent = leitura;
  }

  sustoDeTela() {
    const m = this.monstro;
    if (!m || this.susto) return;
    // ele aparece um instante bem na frente e some
    this.susto = { t: 0.95 };
    this.som.susto(0.6, false);
    this.perder(5);
  }

  placar() {
    const e = this.e;
    if (!e) return;
    const vivos = e.jogadores.filter((j) => !j.morto).length;
    const min = Math.floor((Date.now() - e.desde) / 60000);
    hud.placar(`<b style="color:${COR}">👻</b><small>${vivos}/${e.jogadores.length} vivos · ${min} min${e.cacando ? ' · <b style="color:#ef4444">CAÇADA!</b>' : ''}</small>`);
  }

  dica(livre) {
    if (this.dentro) {
      if (!livre) return '';
      const a = this.alvoDoE();
      if (a) return `<kbd>E</kbd>${esc(a.texto)}`;
      return '';
    }
    if (!livre || !this.pertoDoPortal()) return '';
    const rolando = this.e && !this.e.fim;
    return `<kbd>E</kbd>${rolando ? 'Entrar na investigação em andamento' : 'Caça-Fantasmas: escolher a casa assombrada'}`;
  }

  lugar() {
    return { nome: 'Caça-Fantasmas', desc: '12 monstros, 5 casas assombradas', cor: COR, pos: [PORTAL_FANTASMAS.x, 0, PORTAL_FANTASMAS.z + 4], yaw: 0 };
  }
}
