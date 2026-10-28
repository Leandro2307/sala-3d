// Tutorial da interface na primeira visita e o nome de cada ícone ao passar o mouse.
//
// Tutorial: um véu desfocado cobre a sala com um buraco em volta do ícone da vez, e um balão ao
// lado diz o que ele faz (Próxima / Pular). O computador e o celular têm passos próprios: no
// celular a barra fica em cima e embaixo ficam o analógico e os botões. Ícone que não está na tela
// (compartilhar no celular, botões de jogos desligados na sala, o sino fora da Sala Comercial) é
// pulado. Visto até o fim ou pulado, não volta mais; Ajustes > "Tutorial da interface" mostra de
// novo, e ?tutorial=1 força (para testar).
//
// Dica ao passar o mouse: o data-tip do ícone (ou o aria-label dos botões de toque) num balão só,
// posto onde cabe: a barra fica embaixo no computador e em cima no celular, e no celular a fileira
// de ícones rola (o balão em CSS ficava cortado ou fora da tela).

const CHAVE = 'sala3d-tutorial-hud';
const semMovimento = matchMedia('(prefers-reduced-motion: reduce)');

// o que cada ícone é. alvo: seletores em ordem de preferência (vale o primeiro que estiver na
// tela); textoToque: quando no celular a explicação muda (tocar em vez de clicar)
const ICONES = {
  salas: { alvo: '#salas', nome: 'Suas salas', texto: 'As salas por onde você passou ficam nesta coluna, como no Discord. O + leva você para outra sala.' },
  jogosTopo: { alvo: '#hud-btn-jogos, #btn-jogos', nome: 'Jogos & Teleporte', texto: 'Mais de 20 jogos — futebol, kart, truco, xadrez… — e atalhos para ir direto até cada um.' },
  galera: { alvo: '#hud-btn-galera', nome: 'Ir até amigos', texto: 'Leva você para perto de quem está na sala.' },
  moedas: { alvo: '#moedas-chip', nome: 'Moedas', texto: 'Você ganha moedas no parkour, na pista e nos jogos de tabuleiro, e pode apostar na mesa de dados.' },
  bussola: {
    alvo: '#hud-bussola', nome: 'Bússola',
    texto: 'Mostra para onde você está olhando, os lugares e os amigos. Clique num nome para ir até lá.',
    textoToque: 'Mostra para onde você está olhando, os lugares e os amigos. Toque num nome para ver e de novo para ir até lá.',
  },
  mic: { alvo: '#btn-mic', nome: 'Microfone', tecla: 'M', texto: 'Liga e desliga a sua voz. O anel em volta acende quando você fala.' },
  cam: { alvo: '#btn-cam', nome: 'Câmera', tecla: 'K', texto: 'Liga a sua webcam: o seu rosto aparece no boneco para os outros.' },
  share: { alvo: '#btn-share', nome: 'Compartilhar tela', texto: 'Mostra uma aba, uma janela ou a tela inteira, com som, numa das telas da sala.' },
  react: { alvo: '#btn-react', nome: 'Reações', tecla: '1–6', texto: 'Emojis que saem em cima do seu boneco para todo mundo ver.' },
  view: { alvo: '#btn-view, #tb-view', nome: 'Visão', tecla: 'V', texto: 'Troca entre ver pelos olhos do boneco (1ª pessoa) e por trás dele (3ª pessoa).' },
  sino: { alvo: '#sino', nome: 'Sino da venda', tecla: 'B', texto: 'Fechou uma venda? Toque o sino para a sala inteira ouvir.' },
  sair: { alvo: '#btn-leave', nome: 'Sair da sala', texto: 'Desliga a voz e as telas e volta para a tela de entrada.' },
  mais: { alvo: '#btn-mais', nome: 'Mais botões', texto: 'Os ícones que não couberam na barra abrem todos aqui, numa grade.' },
  mapa: {
    alvo: '#btn-mapa', nome: 'Mapa', tecla: 'L',
    texto: 'A sala vista de cima. Clique numa área para ir direto até lá.',
    textoToque: 'A sala vista de cima. Toque numa área para ir direto até lá.',
  },
  salasBtn: {
    alvo: '#btn-salas', nome: 'Suas salas',
    texto: 'Mostra ou esconde a coluna das suas salas, à esquerda.',
    textoToque: 'Abre a lista das salas por onde você passou para pular de uma para outra.',
  },
  mesa: { alvo: '#btn-mesa', nome: 'Mesa de telas', tecla: 'Tab', texto: 'Todas as telas compartilhadas lado a lado, para ver tudo de uma vez.' },
  empresa: { alvo: '[data-panel="sala"]', nome: 'Sala da empresa', texto: 'O ambiente, os jogos e as pessoas da sala. Quem é dono muda tudo por aqui.' },
  telao: { alvo: '[data-panel="telao"]', nome: 'Telão', texto: 'Cole um link do YouTube, Twitch ou Kick e todo mundo assiste junto, no mesmo ponto.' },
  musica: { alvo: '[data-panel="musica"]', nome: 'Música', texto: 'Uma fila de músicas do YouTube tocando para a sala inteira.' },
  pessoas: { alvo: '[data-panel="people"]', nome: 'Pessoas', texto: 'Quem está na sala, o link para convidar amigos e o seu status.' },
  chat: { alvo: '[data-panel="chat"]', nome: 'Chat', tecla: 'T', texto: 'Mensagens para todos da sala. A bolinha verde avisa que chegou mensagem nova.' },
  jogos: { alvo: '#btn-jogos', nome: 'Jogos', texto: 'Mais de 20 jogos — futebol, kart, truco, xadrez… — e atalhos para ir direto até cada um.' },
  personagem: { alvo: '#btn-personagem', nome: 'Personagem', tecla: 'P', texto: 'Troque o boneco, a cor, a camiseta e a arma.' },
  ajustes: { alvo: '[data-panel="settings"]', nome: 'Ajustes', texto: 'Volume, microfone, câmera, qualidade gráfica e mais. Este tutorial também pode ser visto de novo por aqui.' },
  telaCheia: {
    alvo: '#btn-full, #tb-full', nome: 'Tela cheia',
    texto: 'Esconde as barras do navegador para a sala ocupar a tela toda. Esc sai.',
    textoToque: 'Usa a tela toda do celular, sem as barras do navegador.',
  },
  // só no celular
  analogico: { alvo: '#stick', nome: 'Analógico', texto: 'Arraste para andar; levando até a borda, você corre. Para olhar em volta, arraste o dedo em qualquer lugar da tela.' },
  pular: { alvo: '#tb-jump', nome: 'Pular', texto: 'Toque para pular. É assim que se sobe no parkour.' },
  correr: { alvo: '#tb-run', nome: 'Correr', texto: 'Liga e desliga a corrida.' },
  checkpoint: { alvo: '#tb-respawn', nome: 'Voltar', texto: 'Volta para o último checkpoint. De carro, põe você de volta na pista.' },
  limpar: { alvo: '#tb-hud', nome: 'Limpar a tela', texto: 'Esconde a interface para ver só a sala. Toque de novo para ela voltar.' },
  carro: { alvo: '#tb-car', nome: 'Carro', texto: 'Vira um carro: os pedais ficam à direita e o analógico vira o volante.' },
  soco: { alvo: '#tb-punch', nome: 'Soco', texto: 'Dá um soco em quem estiver na sua frente, em qualquer lugar da sala.' },
  tapa: { alvo: '#tb-tapa', nome: 'Tapa', texto: 'Dá um tapa de brincadeira em quem estiver perto.' },
  puloAlto: { alvo: '#tb-pulo', nome: 'Pulo alto', texto: 'Liga o superpulo: o botão de pular passa a ir bem mais alto.' },
  voar: { alvo: '#tb-voar', nome: 'Voar', texto: 'Liga o voo: o botão de pular sobe e aparece um para descer.' },
};

// na ordem em que aparecem na tela: no computador, de cima para baixo e da esquerda para a direita
const PASSOS_PC = [
  'salas', 'jogosTopo', 'galera', 'moedas', 'bussola',
  'mic', 'cam', 'share', 'react', 'view', 'sino', 'sair',
  'mapa', 'mesa', 'empresa', 'telao', 'musica', 'pessoas', 'chat', 'personagem', 'ajustes', 'telaCheia',
];
// no celular: primeiro andar (embaixo), depois a barra de cima
const PASSOS_TOQUE = [
  'analogico', 'pular', 'correr', 'checkpoint', 'view', 'limpar', 'carro', 'soco', 'tapa', 'puloAlto', 'voar', 'telaCheia',
  'mic', 'cam', 'share', 'react', 'sino', 'sair', 'mais',
  'mapa', 'salasBtn', 'mesa', 'empresa', 'telao', 'musica', 'pessoas', 'chat', 'jogos', 'personagem', 'ajustes',
  'bussola',
];

const FOLGA = 6; // o buraco passa um pouco da borda do ícone
const DISTANCIA = 14; // do buraco até o balão (a seta fica nesse vão)
const MARGEM = 10; // do balão até a borda da tela
const DURACAO = 320; // o buraco indo de um ícone para o outro

function lerVisto() {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
function gravarVisto() {
  try { localStorage.setItem(CHAVE, '1'); } catch { /* modo privado */ }
}

function visivel(el) {
  if (!el?.isConnected || el.closest('[hidden]')) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
}

// a barra do celular rola de lado: traz o ícone para o meio dela antes de medir (guardados: onde
// cada fileira estava antes, para voltar no fim)
function trazerParaVista(el, guardados) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (p.scrollWidth <= p.clientWidth + 1) continue;
    const ox = getComputedStyle(p).overflowX;
    if (ox !== 'auto' && ox !== 'scroll') continue;
    if (!guardados.has(p)) guardados.set(p, p.scrollLeft);
    const r = el.getBoundingClientRect();
    const rp = p.getBoundingClientRect();
    p.scrollLeft += (r.left + r.width / 2) - (rp.left + rp.width / 2);
    return;
  }
}

function acharAlvo(passo, guardados) {
  for (const sel of passo.alvo.split(',')) {
    const el = document.querySelector(sel.trim());
    if (!el) continue;
    trazerParaVista(el, guardados);
    if (visivel(el)) return el;
  }
  return null;
}

// o buraco: o retângulo do ícone com folga; redondo se o ícone é redondo
function buracoDe(el) {
  const r = el.getBoundingClientRect();
  const raio = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const menor = Math.min(r.width, r.height);
  return {
    x: r.left - FOLGA,
    y: r.top - FOLGA,
    w: r.width + FOLGA * 2,
    h: r.height + FOLGA * 2,
    r: raio >= menor / 2 - 1 ? menor / 2 + FOLGA : Math.max(10, raio + FOLGA),
  };
}

// a tela inteira menos o buraco (evenodd: o retângulo de dentro vira furo)
function caminho({ x, y, w, h, r }) {
  r = Math.min(r, w / 2, h / 2);
  const W = innerWidth + 2;
  const H = innerHeight + 2;
  return `path(evenodd, "M-1 -1H${W}V${H}H-1Z`
    + `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z")`;
}

const misturar = (a, b, t) => a + (b - a) * t;
const suave = (t) => 1 - (1 - t) ** 3;

// com o tutorial aberto o teclado não anda nem abre nada por baixo do véu. Fica aqui em cima (roda
// quando o main.js importa este módulo) para vir antes dos atalhos dele, que também ouvem na captura
let aberto = null;
window.addEventListener('keydown', (e) => aberto?.tecla(e), true);

export class TutorialHud {
  constructor({ toque = false } = {}) {
    this.toque = toque;
    this.passos = [];
    this.i = 0;
    this.raf = 0;
    this.atual = null; // o buraco desenhado agora
    this.aoFechar = null;
    this.raiz = null;
    this.rolados = new Map(); // fileiras que o tutorial rolou e onde estavam
    const refazer = () => this.raiz && this.mostrar(false);
    window.addEventListener('resize', refazer);
    window.visualViewport?.addEventListener('resize', refazer);
  }

  precisa() {
    return new URLSearchParams(location.search).get('tutorial') === '1' || !lerVisto();
  }

  // aoFechar: chamado ao terminar ou pular
  iniciar(aoFechar = null) {
    if (this.raiz) return;
    const lista = this.toque ? PASSOS_TOQUE : PASSOS_PC;
    this.passos = lista.map((k) => ICONES[k]).filter((p) => p && acharAlvo(p, this.rolados));
    if (!this.passos.length) {
      this.voltarRolagem();
      return aoFechar?.();
    }
    this.aoFechar = aoFechar;
    this.montar();
    this.i = 0;
    this.atual = null;
    this.mostrar(true);
  }

  montar() {
    const raiz = document.createElement('div');
    raiz.id = 'tour';
    raiz.innerHTML = `
      <div class="tour-veu"></div>
      <div class="tour-foco"></div>
      <div class="tour-balao" role="dialog" aria-modal="true" aria-labelledby="tour-nome" aria-describedby="tour-texto">
        <div class="tour-cab">
          <b id="tour-nome"></b><kbd class="tour-tecla" hidden></kbd>
          <span class="tour-conta"></span>
        </div>
        <p id="tour-texto"></p>
        <div class="tour-acoes">
          <button type="button" class="tour-pular" data-tour="pular">Pular</button>
          <button type="button" class="primary small" data-tour="proxima">Próxima</button>
        </div>
      </div>`;
    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tour]');
      if (b?.dataset.tour === 'proxima') this.proxima();
      else if (b?.dataset.tour === 'pular') this.fechar();
    });
    // nada passa para a sala por baixo (o 3D gira com o arrasto, os botões de toque respondem)
    for (const tipo of ['pointerdown', 'touchstart', 'wheel', 'contextmenu']) {
      raiz.addEventListener(tipo, (e) => {
        if (!e.target.closest('button')) e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
    }
    document.body.append(raiz);
    this.raiz = raiz;
    aberto = this;
    this.veu = raiz.querySelector('.tour-veu');
    this.foco = raiz.querySelector('.tour-foco');
    this.balao = raiz.querySelector('.tour-balao');
    document.body.classList.add('em-tutorial');
    requestAnimationFrame(() => raiz.classList.add('on'));
  }

  proxima() {
    if (this.i >= this.passos.length - 1) return this.fechar();
    this.i++;
    this.mostrar(true);
  }

  anterior() {
    if (this.i === 0) return;
    this.i--;
    this.mostrar(true);
  }

  // animar: o buraco vai do ícone de antes até o novo; sem animar (tela girou): pula direto
  mostrar(animar) {
    let el = null;
    // o ícone pode ter sumido depois da lista montada (o painel abriu, o jogo mudou): pula ele
    while (this.i < this.passos.length) {
      el = acharAlvo(this.passos[this.i], this.rolados);
      if (el) break;
      this.passos.splice(this.i, 1);
    }
    if (!el) return this.fechar();
    const passo = this.passos[this.i];
    const destino = buracoDe(el);
    cancelAnimationFrame(this.raf);
    const de = this.atual;
    const tempo = animar && de && !semMovimento.matches ? DURACAO : 0;
    this.balao.classList.add('trocando');
    const t0 = performance.now();
    const quadro = (agora) => {
      const t = tempo ? Math.min(1, (agora - t0) / tempo) : 1;
      const k = suave(t);
      this.desenhar(de ? {
        x: misturar(de.x, destino.x, k),
        y: misturar(de.y, destino.y, k),
        w: misturar(de.w, destino.w, k),
        h: misturar(de.h, destino.h, k),
        r: misturar(de.r, destino.r, k),
      } : destino);
      if (t < 1) this.raf = requestAnimationFrame(quadro);
      else this.preencher(passo, destino);
    };
    // o balão some antes de o buraco andar, e volta já no lugar novo
    if (tempo) this.raf = requestAnimationFrame(quadro);
    else quadro(t0);
  }

  desenhar(b) {
    this.atual = b;
    this.veu.style.clipPath = caminho(b);
    this.foco.style.transform = `translate(${b.x}px, ${b.y}px)`;
    this.foco.style.width = `${b.w}px`;
    this.foco.style.height = `${b.h}px`;
    this.foco.style.borderRadius = `${b.r}px`;
  }

  preencher(passo, buraco) {
    const b = this.balao;
    b.querySelector('#tour-nome').textContent = passo.nome;
    const tecla = b.querySelector('.tour-tecla');
    tecla.hidden = this.toque || !passo.tecla;
    tecla.textContent = passo.tecla || '';
    b.querySelector('#tour-texto').textContent = (this.toque && passo.textoToque) || passo.texto;
    const n = this.passos.length;
    b.querySelector('.tour-conta').textContent = `${this.i + 1} de ${n}`;
    const ultima = this.i === n - 1;
    const prox = b.querySelector('[data-tour="proxima"]');
    prox.textContent = ultima ? 'Concluir' : 'Próxima';
    b.querySelector('[data-tour="pular"]').hidden = ultima;
    this.posicionar(buraco);
    b.classList.remove('trocando');
    prox.focus({ preventScroll: true });
  }

  // o balão vai para o lado do ícone onde cabe inteiro: em cima de quem está embaixo, embaixo de
  // quem está em cima; a coluna das salas (alta demais) fica do lado
  posicionar(h) {
    const b = this.balao;
    const cs = getComputedStyle(this.raiz); // o padding do #tour é a área segura (entalhe do iPhone)
    const m = {
      t: MARGEM + parseFloat(cs.paddingTop), r: MARGEM + parseFloat(cs.paddingRight),
      b: MARGEM + parseFloat(cs.paddingBottom), l: MARGEM + parseFloat(cs.paddingLeft),
    };
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    const W = innerWidth;
    const H = innerHeight;
    const cx = h.x + h.w / 2;
    const cy = h.y + h.h / 2;
    const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
    const lados = {
      baixo: () => ({ ok: h.y + h.h + DISTANCIA + bh <= H - m.b, x: limitar(cx - bw / 2, m.l, W - m.r - bw), y: h.y + h.h + DISTANCIA }),
      cima: () => ({ ok: h.y - DISTANCIA - bh >= m.t, x: limitar(cx - bw / 2, m.l, W - m.r - bw), y: h.y - DISTANCIA - bh }),
      direita: () => ({ ok: h.x + h.w + DISTANCIA + bw <= W - m.r, x: h.x + h.w + DISTANCIA, y: limitar(cy - bh / 2, m.t, H - m.b - bh) }),
      esquerda: () => ({ ok: h.x - DISTANCIA - bw >= m.l, x: h.x - DISTANCIA - bw, y: limitar(cy - bh / 2, m.t, H - m.b - bh) }),
    };
    const ordem = cy > H / 2 ? ['cima', 'baixo', 'direita', 'esquerda'] : ['baixo', 'cima', 'direita', 'esquerda'];
    let lado = ordem.find((l) => lados[l]().ok);
    let pos;
    if (lado) pos = lados[lado]();
    else {
      // não coube em lado nenhum (tela muito baixa): no meio, sem seta
      lado = 'meio';
      pos = { x: (W - bw) / 2, y: limitar(cy > H / 2 ? m.t : H - m.b - bh, m.t, H - m.b - bh) };
    }
    b.dataset.lado = lado;
    const seta = lado === 'cima' || lado === 'baixo'
      ? limitar(cx - pos.x, 20, bw - 20)
      : limitar(cy - pos.y, 20, bh - 20);
    b.style.setProperty('--seta', `${seta}px`);
    b.style.left = `${Math.round(pos.x)}px`;
    b.style.top = `${Math.round(pos.y)}px`;
  }

  tecla(e) {
    e.stopImmediatePropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const noBotao = e.target.closest?.('.tour-balao button');
    if (e.key === 'Escape') { e.preventDefault(); this.fechar(); }
    else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !noBotao)) { e.preventDefault(); this.proxima(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.anterior(); }
    else if (e.key === 'Tab') {
      // o foco fica no balão
      e.preventDefault();
      const bs = [...this.balao.querySelectorAll('button:not([hidden])')];
      const k = bs.indexOf(document.activeElement);
      bs[(k + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]?.focus();
    } else if (!noBotao) e.preventDefault();
  }

  fechar() {
    if (!this.raiz) return;
    gravarVisto();
    cancelAnimationFrame(this.raf);
    const raiz = this.raiz;
    this.raiz = null;
    aberto = null;
    raiz.classList.remove('on');
    document.body.classList.remove('em-tutorial');
    setTimeout(() => raiz.remove(), semMovimento.matches ? 0 : 220);
    this.voltarRolagem();
    const fim = this.aoFechar;
    this.aoFechar = null;
    fim?.();
  }

  // a fileira de ícones do celular volta para onde estava
  voltarRolagem() {
    for (const [p, x] of this.rolados) p.scrollLeft = x;
    this.rolados.clear();
  }
}

// ------------------------------------------------------------------ nome do ícone ao passar o mouse
const COM_DICA = '[data-tip], #touch .tb[aria-label]';

export function dicasAoPassar() {
  const dica = document.createElement('div');
  dica.id = 'dica-hud';
  dica.setAttribute('role', 'tooltip');
  dica.hidden = true;
  document.body.append(dica);
  let alvo = null;
  let timer = 0;
  let sumiu = 0;

  const esconder = () => {
    clearTimeout(timer);
    if (!dica.hidden) sumiu = performance.now();
    alvo = null;
    dica.hidden = true;
    dica.classList.remove('on');
  };
  const mostrar = () => {
    if (!alvo?.isConnected || !visivel(alvo)) return esconder();
    const txt = alvo.dataset.tip || alvo.getAttribute('aria-label') || '';
    if (!txt) return esconder();
    // "Mapa (L)": o nome e o atalho numa tecla; parênteses longos são parte do texto
    const m = txt.match(/^(.*?)\s*\(([^()]{1,6})\)$/);
    dica.textContent = m ? m[1] : txt;
    if (m) {
      const k = document.createElement('kbd');
      k.textContent = m[2];
      dica.append(k);
    }
    dica.hidden = false;
    const r = alvo.getBoundingClientRect();
    const dw = dica.offsetWidth;
    const dh = dica.offsetHeight;
    const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
    let x;
    let y;
    if (alvo.dataset.tipLado === 'direita') {
      x = r.right + 10;
      y = r.top + r.height / 2 - dh / 2;
    } else {
      x = r.left + r.width / 2 - dw / 2;
      // a barra do computador está embaixo (o nome vai em cima); a do celular, em cima
      const emCima = r.top + r.height / 2 > innerHeight / 2 && r.top - dh - 10 >= 6;
      y = emCima ? r.top - dh - 10 : r.bottom + 10;
      dica.dataset.lado = emCima ? 'cima' : 'baixo';
    }
    dica.style.transform = `translate(${Math.round(limitar(x, 6, innerWidth - dw - 6))}px, ${Math.round(limitar(y, 6, innerHeight - dh - 6))}px)`;
    requestAnimationFrame(() => dica.classList.add('on'));
  };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest?.(COM_DICA) || null;
    if (el === alvo) return;
    if (!el) return esconder();
    clearTimeout(timer);
    dica.classList.remove('on');
    alvo = el;
    // passando de um ícone para o vizinho, o nome aparece sem esperar
    const seguido = !dica.hidden || performance.now() - sumiu < 400;
    dica.hidden = true;
    timer = setTimeout(mostrar, seguido ? 0 : 280);
  });
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) esconder(); });
  // clicou (abriu um painel, ligou o microfone): o nome sai da frente
  document.addEventListener('pointerdown', esconder, true);
  window.addEventListener('blur', esconder);
  document.addEventListener('pointerlockchange', esconder);
}
