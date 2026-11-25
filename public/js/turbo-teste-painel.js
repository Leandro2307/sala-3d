// O painel do teste da conexão (turbo-teste.js) na tela de quem joga: as etapas, a velocidade e o tempo de resposta ao
// vivo e, no fim, a nota com o direto e o TURN lado a lado. Só desenha: as medidas vêm prontas.
// Cores: direto azul, TURN laranja (validadas contra o fundo daqui, inclusive para daltônicos); o texto nunca usa
// a cor da série, e a nota tem símbolo e palavra, não só cor.

const COR = { direto: '#3987e5', turn: '#d95926', fundo: '#141927', grade: '#26304a', texto: '#eef2ff', fraco: '#aab4d0' };
const JANELA_MS = 60_000; // o teste inteiro cabe no gráfico; passando disso, ele anda
const ETAPAS = [['resposta', 'Resposta'], ['direto', 'Direto'], ['turn', 'Servidor'], ['imagem', 'Imagem'], ['fim', 'Pronto']];
const num = (v, casas = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas }));
const fmtMbps = (kbps) => `${num(kbps / 1000, kbps < 10_000 && kbps % 1000 ? 1 : 0)} Mbps`;

const CSS = `
.tc-painel{position:absolute;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;padding:12px 12px 64px;pointer-events:none;background:rgba(6,8,14,.45);color:${COR.texto};font:14px/1.4 system-ui,sans-serif;box-sizing:border-box}
.tc-caixa{box-sizing:border-box;pointer-events:auto;width:min(760px,100%);max-height:100%;overflow:hidden;padding:16px 18px;border-radius:14px;background:${COR.fundo};border:1px solid #2b3450;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.tc-topo{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.tc-topo b{display:block;font-size:16px}
.tc-topo p{margin:1px 0 0;color:${COR.fraco};font-size:13px}
.tc-topo button{flex:none;background:none;border:0;color:${COR.fraco};padding:4px 6px;font:inherit;font-size:12px;cursor:pointer;opacity:.75}
.tc-topo button:hover,.tc-topo button:focus-visible{opacity:1;text-decoration:underline}
.tc-etapas{display:flex;gap:6px;margin:12px 0 10px;padding:0;list-style:none}
.tc-etapas li{flex:1;min-width:0;font-size:12px;color:${COR.fraco};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-etapas li::before{content:'';display:block;height:4px;border-radius:99px;background:#26304a;margin-bottom:4px}
.tc-etapas li.foi::before{background:#8fa3cf}
.tc-etapas li.agora{color:${COR.texto};font-weight:600}
.tc-etapas li.agora::before{background:linear-gradient(90deg,#eef2ff 50%,#26304a 50%);background-size:200% 100%;animation:tc-anda 1.2s linear infinite}
@keyframes tc-anda{from{background-position:100% 0}to{background-position:-100% 0}}
@media (prefers-reduced-motion:reduce){.tc-etapas li.agora::before{animation:none;background:#eef2ff}}
.tc-graficos{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.tc-graficos figure{margin:0;min-width:0}
.tc-graficos figcaption{display:flex;align-items:baseline;justify-content:space-between;gap:8px;color:${COR.fraco};font-size:12px}
.tc-graficos figcaption strong{color:${COR.texto};font-size:22px;font-weight:650;font-variant-numeric:tabular-nums}
.tc-graficos figcaption small{font-size:12px;color:${COR.fraco};font-weight:400}
.tc-graficos canvas{display:block;width:100%;height:112px}
.tc-pe{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:8px;font-size:13px;color:#cdd6f4;min-height:20px}
.tc-legenda{display:flex;gap:12px;flex:none;color:${COR.fraco};font-size:12px}
.tc-legenda i,.tc-rota i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.tc-fim{background:none;align-items:flex-start;padding:56px 12px 12px}
.tc-fim .tc-caixa{pointer-events:none;width:min(520px,100%)}
.tc-nota{display:flex;gap:12px;align-items:center}
.tc-nota .tc-n{flex:none;display:grid;place-items:center;width:58px;height:58px;border-radius:50%;border:4px solid var(--c);font-size:21px;font-weight:700;font-variant-numeric:tabular-nums}
.tc-nota b{display:block;font-size:17px}
.tc-nota span{color:#cdd6f4}
.tc-rotas{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;font-variant-numeric:tabular-nums}
.tc-rotas th{font-weight:400;color:${COR.fraco};font-size:12px;text-align:right;padding:2px 0 2px 12px}
.tc-rotas th:first-child,.tc-rotas td:first-child{text-align:left;padding-left:0}
.tc-rotas td{text-align:right;padding:4px 0 4px 12px;border-top:1px solid ${COR.grade}}
.tc-rotas tr.usa td{font-weight:650}
.tc-rotas em{font-style:normal;font-size:11px;border:1px solid #4a587f;border-radius:99px;padding:0 7px;margin-left:8px;font-weight:400;color:#cdd6f4}
.tc-dica{margin:10px 0 0;color:#cdd6f4;font-size:13px}
@media (max-height:460px){.tc-painel{padding:6px 10px}.tc-caixa{padding:10px 14px}.tc-topo p{display:none}.tc-etapas{margin:6px 0}.tc-graficos canvas{height:80px}.tc-graficos figcaption strong{font-size:18px}.tc-fim{padding-top:8px}}
@media (max-width:520px) and (min-height:461px){.tc-graficos{grid-template-columns:1fr;gap:8px}.tc-graficos canvas{height:84px}.tc-etapas li{font-size:11px}.tc-legenda{display:none}}`;

let estilo = null;
// Registrado já no import, antes do teclado do jogo (que segura as teclas na mesma fase)
let aberto = null;
if (typeof addEventListener === 'function' && typeof document !== 'undefined') addEventListener('keydown', (e) => {
  if (e.key !== 'F7' || !aberto) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  aberto.onPular?.();
}, true);

// Um degrau "bonito" acima do maior valor, para o eixo não pular a cada ponto
export function tetoDoEixo(maior, minimo) {
  const v = Math.max(maior * 1.12, minimo);
  for (const k of [10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000]) if (v <= k) return k;
  return Math.ceil(v / 1000) * 1000;
}

// Uma linha por rota (direto, turn) no mesmo eixo. pontos: [{ em, rota, v }]
class Grafico {
  constructor(tela, { minimo, unidade, area = false }) {
    Object.assign(this, { tela, minimo, unidade, area, pontos: [] });
    this.eixo = minimo;
  }

  por(em, rota, v) {
    if (v == null || !Number.isFinite(v)) return;
    this.pontos.push({ em, rota, v });
    if (this.pontos.length > 1600) this.pontos.shift();
  }

  desenhar(inicio, agora) {
    const c = this.tela;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const de = Math.max(inicio, agora - JANELA_MS);
    const dura = Math.max(20_000, agora - de);
    const visiveis = this.pontos.filter((p) => p.em >= de);
    const alvo = tetoDoEixo(visiveis.reduce((m, p) => Math.max(m, p.v), 0), this.minimo);
    this.eixo += (alvo - this.eixo) * 0.25; // o eixo desliza, não pula
    const esq = 30;
    const cima = 8;
    const baixo = h - 6;
    const x = (em) => esq + ((em - de) / dura) * (w - esq - 8);
    const y = (v) => baixo - (Math.min(v, this.eixo) / this.eixo) * (baixo - cima);
    g.font = '11px system-ui,sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.lineWidth = 1;
    for (const f of [0, 0.5, 1]) {
      const v = alvo * f;
      const yy = Math.round(y(v)) + 0.5;
      if (yy < cima - 6) continue;
      g.strokeStyle = COR.grade;
      g.beginPath();
      g.moveTo(esq, yy);
      g.lineTo(w - 8, yy);
      g.stroke();
      g.fillStyle = COR.fraco;
      g.fillText(num(v, v % 1 ? 1 : 0), esq - 6, Math.max(6, yy));
    }
    for (const rota of ['direto', 'turn']) {
      const l = visiveis.filter((p) => p.rota === rota);
      if (!l.length) continue;
      // um silêncio de mais de 1,5 s (a outra rota sendo medida) separa a linha
      let trecho = [];
      const fechar = () => {
        if (!trecho.length) return;
        g.beginPath();
        trecho.forEach((p, i) => (i ? g.lineTo(x(p.em), y(p.v)) : g.moveTo(x(p.em), y(p.v))));
        g.strokeStyle = COR[rota];
        g.lineWidth = 2;
        g.lineJoin = 'round';
        g.stroke();
        if (this.area && trecho.length > 1) {
          g.lineTo(x(trecho.at(-1).em), baixo);
          g.lineTo(x(trecho[0].em), baixo);
          g.closePath();
          g.globalAlpha = 0.16;
          g.fillStyle = COR[rota];
          g.fill();
          g.globalAlpha = 1;
        }
        trecho = [];
      };
      for (const p of l) {
        if (trecho.length && p.em - trecho.at(-1).em > 1500) fechar();
        trecho.push(p);
      }
      const ult = trecho.at(-1);
      fechar();
      if (ult && agora - ult.em < 1500) {
        g.beginPath();
        g.arc(x(ult.em), y(ult.v), 4, 0, 7);
        g.fillStyle = COR[rota];
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = COR.fundo;
        g.stroke();
      }
    }
  }
}

const SIMBOLO = { otima: ['✓', '#0aac23'], boa: ['✓', '#0aac23'], regular: ['!', '#fbb315'], ruim: ['✕', '#dc3c3d'] };

export class PainelTeste {
  // dentro: o elemento da tela cheia (#focus); onPular(): o botão ou a tecla F7 (com o mouse preso não há clique)
  constructor({ dentro, onPular }) {
    Object.assign(this, { dentro, onPular, el: null });
  }

  base(classe = '') {
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.textContent = CSS;
      document.head.append(estilo);
    }
    this.fechar();
    const el = document.createElement('div');
    el.className = `tc-painel ${classe}`.trim();
    this.el = el;
    this.dentro()?.append(el);
    return el;
  }

  mostrar() {
    const el = this.base();
    el.innerHTML = `<div class="tc-caixa" role="status" aria-label="Teste da conexão">
<div class="tc-topo"><div><b>Ajustando o jogo para a sua conexão</b><p>É isto que deixa a imagem lisa: ele acha o melhor caminho até o PC do jogo.</p></div><button type="button">pular (F7)</button></div>
<ol class="tc-etapas">${ETAPAS.map(([id, nome]) => `<li data-e="${id}">${nome}</li>`).join('')}</ol>
<div class="tc-graficos">
<figure><figcaption>Velocidade<span><strong data-v="mbps">–</strong> <small>Mbps</small></span></figcaption><canvas data-g="mbps" role="img" aria-label="Velocidade ao longo do teste"></canvas></figure>
<figure><figcaption>Tempo de resposta<span><strong data-v="rtt">–</strong> <small>ms</small></span></figcaption><canvas data-g="rtt" role="img" aria-label="Tempo de resposta ao longo do teste"></canvas></figure>
</div>
<div class="tc-pe"><span data-v="texto"></span><span class="tc-legenda"><span><i style="background:${COR.direto}"></i>direto</span><span><i style="background:${COR.turn}"></i>servidor (TURN)</span></span></div></div>`;
    el.querySelector('button').addEventListener('click', () => this.onPular?.());
    const q = (s) => el.querySelector(s);
    this.v = { mbps: q('[data-v="mbps"]'), rtt: q('[data-v="rtt"]'), texto: q('[data-v="texto"]') };
    this.g = { mbps: new Grafico(q('[data-g="mbps"]'), { minimo: 10, area: true }), rtt: new Grafico(q('[data-g="rtt"]'), { minimo: 20 }) };
    this.inicio = performance.now();
    this.etapa('resposta');
    aberto = this;
    const volta = () => {
      if (this.el !== el) return;
      const agora = performance.now();
      this.g.mbps.desenhar(this.inicio, agora);
      this.g.rtt.desenhar(this.inicio, agora);
      this.raf = requestAnimationFrame(volta);
    };
    this.raf = requestAnimationFrame(volta);
  }

  etapa(id) {
    if (!this.el) return;
    const n = ETAPAS.findIndex(([e]) => e === id);
    if (n < 0) return;
    this.el.querySelectorAll('.tc-etapas li').forEach((li, i) => {
      li.classList.toggle('foi', i < n);
      li.classList.toggle('agora', i === n);
    });
  }

  progresso({ texto, etapa }) {
    if (!this.el || !this.v) return;
    if (etapa) this.etapa(etapa);
    this.v.texto.textContent = texto || '';
  }

  // ao vivo (10 por segundo): { rota, mbps, rttMs }
  vivo({ rota, mbps, rttMs }) {
    if (!this.el || !this.g) return;
    const agora = performance.now();
    this.g.mbps.por(agora, rota, mbps);
    if (rttMs != null) this.g.rtt.por(agora, rota, rttMs);
    if (agora - (this.escritoEm || 0) < 200) return; // o número não treme
    this.escritoEm = agora;
    if (mbps != null) this.v.mbps.textContent = num(mbps, mbps < 10 ? 1 : 0);
    if (rttMs != null) this.v.rtt.textContent = num(rttMs);
  }

  // o resultado por uns segundos, sem tapar o jogo
  resultado(r, nomeDoModo) {
    const el = this.base('tc-fim');
    const caixa = document.createElement('div');
    caixa.className = 'tc-caixa';
    caixa.setAttribute('role', 'status');
    const [simbolo, cor] = SIMBOLO[r.nota?.nivel] || SIMBOLO.boa;
    const linha = (rota, nome, x) => (!x || x.erro ? '' : `<tr class="${(r.rota === 'turn') === (rota === 'turn') ? 'usa' : ''}"><td class="tc-rota"><i style="background:${COR[rota]}"></i>${nome}${(r.rota === 'turn') === (rota === 'turn') ? '<em>escolhido</em>' : ''}</td><td>${num(x.rttMs)} ms</td><td>${x.livre ? 'mais de ' : ''}${fmtMbps(x.tetoKbps)}</td><td>${num(x.tremidoMs)} ms</td></tr>`);
    const direto = r.jaTurn ? null : r.direto;
    const turn = r.jaTurn ? r.direto : r.turn;
    caixa.innerHTML = `<div class="tc-nota" style="--c:${cor}"><div class="tc-n">${num(r.nota?.nota)}</div><div><b></b><span></span></div></div>
<table class="tc-rotas"><thead><tr><th>Caminho</th><th>Resposta</th><th>Velocidade</th><th>Oscilação</th></tr></thead><tbody>${linha('direto', 'Direto', direto)}${linha('turn', 'Servidor (TURN)', turn)}</tbody></table><p class="tc-dica"></p>`;
    caixa.querySelector('.tc-nota b').textContent = `${simbolo} Conexão ${r.nota?.rotulo || ''}`.trim();
    caixa.querySelector('.tc-nota span').textContent = `${nomeDoModo} · ${r.codec === 'h265' ? 'H.265' : 'H.264'}${r.tratar ? ' · imagem tratada no PC do jogo' : ''}${r.previsto ? ` · atraso de uns ${num(Math.round(r.previsto.atrasoMs / 5) * 5)} ms` : ''}`;
    const dica = caixa.querySelector('.tc-dica');
    if (r.nota?.dicas?.length) dica.textContent = r.nota.dicas[0];
    else dica.remove();
    el.append(caixa);
    this.some = setTimeout(() => this.fechar(), 9000);
  }

  fechar() {
    clearTimeout(this.some);
    cancelAnimationFrame(this.raf);
    if (aberto === this) aberto = null;
    this.el?.remove();
    this.el = this.v = this.g = null;
  }
}

export function textoDoResultado(r) {
  return `${r.nota ? `${r.nota.nota} · ` : ''}${r.rota === 'turn' ? 'TURN' : 'direto'} · ${r.livre ? 'mais de ' : 'até '}${fmtMbps(r.tetoKbps)} · ${r.rttMs != null ? `${Math.round(r.rttMs)} ms` : '–'} · ${r.codec === 'h265' ? 'H.265' : 'H.264'}`;
}
