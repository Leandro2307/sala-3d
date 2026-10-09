// O que aparece por cima do jogo nas arenas (mata-mata e mata-mata em times): a lista de abates no
// canto (quem derrubou quem, com o quê) e as faixas grandes no meio da tela, com a voz do locutor:
// DOUBLE KILL, TRIPLE KILL e assim por diante (o servidor conta a sequência, ver abates.js), PRIMEIRO
// SANGUE, ACE, e os avisos de rodada do modo em times.
import { ARMAS } from './armas-dados.js';
import { sfx, sfxLigado } from './sfx.js';

// nome de cada sequência de abates (2 = dois em seguida, sem dar tempo de respirar)
const SERIES = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'PENTA KILL', 'HEXA KILL'];
export function nomeDaSerie(n) {
  if (n < 2) return '';
  return SERIES[n] || `MONSTER KILL ×${n}`;
}
// o que o locutor fala (em inglês, como nos jogos)
const FALA = ['', '', 'Double kill!', 'Triple kill!', 'Quadra kill!', 'Penta kill!', 'Hexa kill!'];

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nomeArma = (a) => (a === 'soco' ? 'soco' : ARMAS[a]?.nome || '');

let vozes = null;
function falar(texto) {
  if (!sfxLigado() || !window.speechSynthesis) return;
  try {
    vozes ||= speechSynthesis.getVoices();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'en-US';
    u.voice = vozes.find((v) => /^en(-|_)US/i.test(v.lang) && /male|david|guy|daniel/i.test(v.name)) || vozes.find((v) => /^en/i.test(v.lang)) || null;
    u.rate = 0.92;
    u.pitch = 0.55; // grave, de locutor
    u.volume = 1;
    speechSynthesis.cancel(); // uma faixa nova corta a anterior: senão a fila atrasa
    speechSynthesis.speak(u);
  } catch { /* sem voz: fica a faixa */ }
}
if (typeof window !== 'undefined' && window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { vozes = speechSynthesis.getVoices(); };

export class Anuncios {
  constructor() {
    estilo();
    this.feed = document.createElement('div');
    this.feed.id = 'abates-feed';
    this.faixaEl = document.createElement('div');
    this.faixaEl.id = 'abates-faixa';
    this.faixaEl.hidden = true;
    document.body.append(this.feed, this.faixaEl);
    this.fila = []; // faixas esperando a da vez sair
    this.ate = 0;
  }

  // Um abate chegou do servidor ('mm-abate'). eu: o meu id; cores: (time) => cor, no modo em times
  abate(m, eu, cores = null) {
    const corDe = (q) => (cores && q?.time != null ? cores(q.time) : q?.cor) || '#f8fafc';
    const linha = document.createElement('div');
    linha.className = 'abate' + (m.autor?.id === eu ? ' meu' : '') + (m.vitima?.id === eu ? ' caiu' : '');
    const arma = nomeArma(m.arma);
    linha.innerHTML = m.autor
      ? `<b style="color:${corDe(m.autor)}">${esc(m.autor.nome)}</b><i>${esc(arma || '✖')}</i><b style="color:${corDe(m.vitima)}">${esc(m.vitima.nome)}</b>`
      : `<b style="color:${corDe(m.vitima)}">${esc(m.vitima.nome)}</b><i>caiu</i>`;
    this.feed.prepend(linha);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
    setTimeout(() => linha.classList.add('saindo'), 6500);
    setTimeout(() => linha.remove(), 7000);
    if (!m.autor) return;
    const meu = m.autor.id === eu;
    const cor = corDe(m.autor);
    // a sequência manda; primeiro sangue e ace vêm depois, na fila
    if (m.serie >= 2) {
      this.faixa(nomeDaSerie(m.serie), meu ? 'você' : m.autor.nome, cor, { fala: FALA[m.serie] || 'Monster kill!', nivel: m.serie, grande: meu });
    }
    if (m.primeiro) this.faixa('PRIMEIRO SANGUE', meu ? 'você' : m.autor.nome, cor, { fala: 'First blood!', nivel: 1, grande: meu });
    if (m.ace) this.faixa('ACE', `${meu ? 'você' : m.autor.nome} derrubou o time inteiro`, cor, { fala: 'Ace!', nivel: 6, grande: true });
  }

  // Faixa grande no meio da tela. fala: o que o locutor diz; nivel: quanto mais alto, mais forte o som.
  // prioridade (avisos de rodada): passa na frente das que esperam, e a da vez sai logo
  faixa(titulo, sub, cor = '#facc15', { fala = null, nivel = 0, grande = false, dur = 1700, prioridade = false } = {}) {
    if (prioridade && this.fila.length > 1) this.fila.splice(1);
    this.fila.push({ titulo, sub, cor, fala, nivel, grande, dur });
    if (this.fila.length === 1) this.proxima();
    else if (prioridade) this.tirar(350);
  }

  proxima() {
    const f = this.fila[0];
    if (!f) return;
    // fila comprida (vários abates de uma vez): cada uma fica menos tempo
    const dur = this.fila.length > 1 ? Math.min(f.dur, 900) : f.dur;
    const el = this.faixaEl;
    el.hidden = false;
    el.className = f.grande ? 'grande' : '';
    el.style.setProperty('--cor', f.cor);
    el.innerHTML = `<strong>${esc(f.titulo)}</strong>${f.sub ? `<span>${esc(f.sub)}</span>` : ''}`;
    // recomeça a animação de entrada
    void el.offsetWidth;
    el.classList.add('entra');
    if (f.nivel) sfx.serie?.(f.nivel);
    if (f.fala) falar(f.fala);
    this.tirar(dur);
  }

  // a da vez sai daqui a ms (e entra a próxima)
  tirar(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const el = this.faixaEl;
      el.classList.remove('entra');
      el.classList.add('sai');
      this.timer = setTimeout(() => {
        el.hidden = true;
        el.classList.remove('sai');
        this.fila.shift();
        this.proxima();
      }, 260);
    }, ms);
  }

  limpar() {
    this.feed.replaceChildren();
    this.fila.length = 0;
    clearTimeout(this.timer);
    this.faixaEl.hidden = true;
  }
}

function estilo() {
  if (document.getElementById('abates-estilo')) return;
  const css = document.createElement('style');
  css.id = 'abates-estilo';
  css.textContent = `
#abates-feed { position: fixed; top: 48px; left: 14px; z-index: 31; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; pointer-events: none;
  font: 700 13px 'Plus Jakarta Sans', system-ui, sans-serif; }
#abates-feed .abate { display: flex; gap: 8px; align-items: center; padding: 4px 10px; border-radius: 8px; background: rgba(15,23,42,.78); color: #f8fafc;
  transition: opacity .5s; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
#abates-feed .abate i { font-style: normal; font-weight: 600; font-size: 11px; color: #cbd5e1; padding: 1px 6px; border-radius: 5px; background: rgba(255,255,255,.1); }
#abates-feed .abate.meu { box-shadow: inset 0 0 0 2px #facc15; }
#abates-feed .abate.caiu { box-shadow: inset 0 0 0 2px #ef4444; }
#abates-feed .abate.saindo { opacity: 0; }
#abates-faixa { position: fixed; left: 50%; top: 24%; z-index: 32; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px;
  pointer-events: none; text-align: center; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
#abates-faixa[hidden] { display: none; }
#abates-faixa strong { font-size: min(40px, 6.4vw); font-weight: 900; letter-spacing: .06em; color: #fff; font-style: italic; white-space: nowrap;
  text-shadow: 0 0 18px var(--cor), 0 0 4px var(--cor), 0 3px 0 rgba(0,0,0,.55); -webkit-text-stroke: 1px rgba(0,0,0,.35); }
#abates-faixa.grande strong { font-size: min(58px, 7vw); }
#abates-faixa span { font-size: 16px; font-weight: 800; color: var(--cor); text-shadow: 0 1px 3px rgba(0,0,0,.8); background: rgba(15,23,42,.6); padding: 2px 10px; border-radius: 8px; }
#abates-faixa.entra { animation: faixa-entra .32s cubic-bezier(.2,1.6,.4,1) both; }
#abates-faixa.sai { animation: faixa-sai .26s ease-in both; }
@keyframes faixa-entra { from { opacity: 0; transform: translate(-50%, -50%) scale(1.8); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
@keyframes faixa-sai { to { opacity: 0; transform: translate(-50%, -60%) scale(.9); } }
@media (max-width: 640px) {
  #abates-feed { top: 44px; left: 8px; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { #abates-faixa.entra, #abates-faixa.sai { animation: none; } }`;
  document.head.appendChild(css);
}
