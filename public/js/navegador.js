// Navegador dentro das telas: abas, barra de endereço, voltar/avançar e "nova aba" com atalhos,
// como um Chrome, direto numa tela do mundo — sem compartilhar nada e sem a VPS no meio.
//
// Cada tela pode ter um navegador de dois jeitos:
// - página fixa: o dono da sala pôs um site naquela tela de parede (Sala da empresa). Todo
//   mundo vê o site; ele volta ao início quando a pessoa vai embora;
// - pessoal: a pessoa clicou no (+) de uma tela livre e abriu o navegador. Só ela vê, e as abas
//   ficam guardadas no navegador dela (voltam quando ela volta à sala).
//
// É tudo do navegador de quem olha: um iframe por aba, no CSS3D atrás de um "buraco"
// transparente no WebGL (a técnica do player do telão) — o que passa na frente tapa a tela
// direitinho. Com a tela em foco (tecla E) o clique atravessa o 3D e cai no site: liso como uma
// aba normal. Sites como YouTube e Google proíbem abrir dentro de outra página; a extensão Sala
// 3D (1.7+) tira essa trava só nas telas da sala e conta o endereço e o título de cada aba.
//
// Para rodar em PC leve, só fica aberto o que importa: o navegador de um monitor de posto abre
// de perto (quem está sentado ali); o de tela de parede, só com a pessoa na mesma sala. De costas
// para ele, ou com a sala dele escondida pelo 3D, ele para de ser desenhado (continua carregado), e
// aba escondida sem tocar nada há 2 min é descarregada (recarrega ao voltar nela, como o
// "economia de memória" do Chrome), inclusive no navegador em uso.
//
// Cada site aberto pesa na memória do aparelho, então há limite: no PC de pouca memória ficam
// abertos no máximo 4 (os mais perto primeiro; um aberto nunca fecha para dar lugar a outro); no
// celular só o site em uso fica carregado, e a aba que sai da frente é descarregada na hora.
import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { isTouch } from './touch.js';
import * as qualidade from './qualidade.js';

const LARGURA_PX = 1280; // a "janela": 1280 px de largura, como um notebook
const PERTO_POSTO = 8; // metros: monitor de posto abre perto assim
const PERTO_PAREDE = 18; // tela de parede: na mesma sala e até esta distância
const FOLGA = 1.4; // fecha só bem mais longe do que abre (sem abre-e-fecha na porta)
const DESCARTAR_MS = 120_000; // aba escondida, sem tocar vídeo/som, por 2 min: descarrega
const MAX_ABAS = 8;
// celular: só o site em uso fica carregado (no iPhone ele mora no processo da sala, e o Safari
// recarrega a aba toda quando a memória aperta)
const SO_EM_USO = isTouch;
// PC de até 4 GB: os 3 do posto + 1; PC forte: sem limite, como sempre foi
const MAX_ABERTOS = qualidade.POUCA_MEMORIA ? 4 : Infinity;
// Chrome 128+ (o zoom do CSS entra no iframe): o site fica 2x maior com zoom 2 e encolhe de volta,
// para o Chrome não redesenhar os sites a cada giro da câmera (ver .nv.zoom2 no style.css). Nos
// outros navegadores o zoom pode não entrar no site, que ficaria minúsculo.
const ZOOM2 = Number(navigator.userAgentData?.brands?.find((b) => b.brand === 'Chromium')?.version
  ?? /Chrom(?:e|ium)\/(\d+)/.exec(navigator.userAgent)?.[1]) >= 128;
// sem "allow-top-navigation": o site lá dentro não consegue tirar a pessoa da sala
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox '
  + 'allow-modals allow-downloads allow-presentation allow-pointer-lock allow-storage-access-by-user-activation';
const ATALHOS = [
  { nome: 'YouTube', url: 'https://www.youtube.com/', cor: '#ff0033' },
  { nome: 'Google', url: 'https://www.google.com/', cor: '#4285f4' },
  { nome: 'Gmail', url: 'https://mail.google.com/', cor: '#ea4335' },
  { nome: 'WhatsApp', url: 'https://web.whatsapp.com/', cor: '#25d366' },
  { nome: 'Drive', url: 'https://drive.google.com/', cor: '#fbbc04' },
  { nome: 'Wikipédia', url: 'https://pt.wikipedia.org/', cor: '#6b7280' },
];
const GUARDADOS = 'sala3d-navegadores'; // localStorage: { [sala]: { [chave]: { abas, ativa } } }
const RECENTES = 'sala3d-recentes'; // os últimos sites abertos (atalhos da nova aba)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const siteDe = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
};
const ler = (chave, padrao) => {
  try {
    return JSON.parse(localStorage.getItem(chave) || 'null') ?? padrao;
  } catch {
    return padrao;
  }
};
const gravar = (chave, valor) => {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch { /* modo privado */ }
};

// ícones da barra (traço, como o resto da sala)
const IC = {
  voltar: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  avancar: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  recarregar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  inicio: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  fora: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  desligar: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
};
const ic = (n, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;

let seq = 0;

// o ícone do próprio site (nada de serviço de terceiros sabendo o que a pessoa abre)
const favicon = (url) => {
  try {
    return url ? new URL('/favicon.ico', url).href : null;
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------ um navegador numa tela
class Navegador {
  constructor(dono, tela, { chave, inicio = null, pessoal = null }) {
    this.dono = dono;
    this.tela = tela;
    this.chave = chave;
    this.inicio = inicio; // página fixa da tela (null = navegador pessoal sem página fixa)
    this.pessoal = !!pessoal;
    const guardadas = pessoal?.abas?.length ? pessoal.abas : [inicio];
    this.abas = guardadas.slice(0, MAX_ABAS).map((url) => this.novaAba(url));
    this.ativa = this.abas[Math.min(pessoal?.ativa ?? 0, this.abas.length - 1)];
    this.aberto = false;

    const alto = Math.round((LARGURA_PX * tela.h) / tela.w);
    this.el = document.createElement('div');
    this.el.className = ZOOM2 ? 'nv zoom2' : 'nv';
    this.el.style.width = `${LARGURA_PX}px`;
    this.el.style.height = `${alto}px`;
    this.el.innerHTML = `<div class="nv-abas"></div>
      <form class="nv-barra" autocomplete="off">
        <button type="button" class="nv-btn" data-nv="voltar" title="Voltar">${ic('voltar')}</button>
        <button type="button" class="nv-btn" data-nv="avancar" title="Avançar">${ic('avancar')}</button>
        <button type="button" class="nv-btn" data-nv="recarregar" title="Recarregar">${ic('recarregar')}</button>
        <button type="button" class="nv-btn" data-nv="inicio" title="Início">${ic('inicio')}</button>
        <input class="nv-end" name="endereco" spellcheck="false" placeholder="Pesquise no Google ou digite um endereço">
        <button type="button" class="nv-btn" data-nv="fora" title="Abrir esta aba no Chrome">${ic('fora')}</button>
        ${this.pessoal ? `<button type="button" class="nv-btn" data-nv="desligar" title="Fechar o navegador desta tela">${ic('desligar')}</button>` : ''}
      </form>
      <div class="nv-corpo"></div>`;
    this.elAbas = this.el.querySelector('.nv-abas');
    this.barra = this.el.querySelector('.nv-barra');
    this.corpo = this.el.querySelector('.nv-corpo');
    this.ligarEventos();

    this.css = new CSS3DObject(this.el);
    this.css.visible = false;
    dono.world.cssScene.add(this.css);
    // o buraco no WebGL, um tiquinho na frente da tela (o vídeo de quem compartilha fica em 0.02)
    this.buraco = new THREE.Mesh(
      new THREE.PlaneGeometry(tela.w, tela.h),
      new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, toneMapped: false, fog: false }),
    );
    this.buraco.position.z = 0.016;
    this.buraco.visible = false;
    this.buraco.userData.screen = tela;
    tela.group.add(this.buraco);
    this.posicionar();
    // em que sala a tela fica (um passo na frente dela): de parede, só abre com a pessoa lá
    this.centro = tela.surface.getWorldPosition(new THREE.Vector3());
    this.raio = Math.hypot(tela.w, tela.h) / 2; // a tela cabe numa bola deste raio em volta do centro
    const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(tela.surface.getWorldQuaternion(new THREE.Quaternion()));
    const ponto = this.centro.clone().addScaledVector(frente, 1);
    this.sala = dono.world.salaEm?.(ponto.x, ponto.z) ?? null;
    this.naVista = true;
    this.desenhar();
  }

  novaAba(url = null) {
    return { id: ++seq, url: url || null, titulo: '', iframe: null, ponte: false, tocando: false, escondidaDesde: 0, pilha: url ? [url] : [], pos: url ? 0 : -1 };
  }

  posicionar() {
    this.tela.group.updateWorldMatrix(true, true);
    this.buraco.getWorldPosition(this.css.position);
    this.buraco.getWorldQuaternion(this.css.quaternion);
    this.css.scale.setScalar(this.tela.w / LARGURA_PX);
  }

  // ---------------------------------------------------------------- perto / longe
  abrir() {
    if (this.aberto) return;
    this.aberto = true;
    this.naVista = true;
    this.posicionar();
    this.css.visible = true;
    this.buraco.visible = true;
    this.mostrar(this.ativa);
  }

  // fora da vista: o Chrome para de desenhar (as abas continuam carregadas, vídeo continua tocando)
  vista(v) {
    if (!this.aberto || v === this.naVista) return;
    this.naVista = v;
    this.css.visible = v;
    this.buraco.visible = v;
  }

  // aba escondida há muito tempo e quieta: descarrega (volta a carregar quando for para a frente)
  descartarParadas(agora) {
    for (const a of this.abas) {
      if (a === this.ativa || !a.iframe || a.tocando || !a.escondidaDesde) continue;
      if (agora - a.escondidaDesde > DESCARTAR_MS) this.tirarQuadro(a);
    }
  }

  fechar() {
    if (!this.aberto) return;
    this.aberto = false;
    for (const a of this.abas) this.tirarQuadro(a);
    this.corpo.querySelector('.nv-inicio')?.remove();
    this.css.visible = false;
    this.buraco.visible = false;
    // página fixa: quem voltar começa do início (as abas pessoais ficam guardadas)
    if (!this.pessoal) {
      this.abas = [this.novaAba(this.inicio)];
      this.ativa = this.abas[0];
      this.desenhar();
    }
  }

  destruir() {
    this.fechar();
    this.dono.world.cssScene.remove(this.css);
    this.el.remove();
    this.buraco.removeFromParent();
    this.buraco.geometry.dispose();
    this.buraco.material.dispose();
  }

  // ---------------------------------------------------------------- abas
  quadro(aba) {
    if (aba.iframe || !aba.url) return aba.iframe;
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', SANDBOX);
    f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-read; clipboard-write; microphone; camera';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.src = aba.url;
    aba.iframe = f;
    this.corpo.appendChild(f);
    return f;
  }

  tirarQuadro(aba) {
    aba.iframe?.remove();
    aba.iframe = null;
    aba.ponte = false;
    aba.tocando = false;
  }

  // deixa a aba na frente (as outras continuam carregadas por trás, como no Chrome)
  mostrar(aba) {
    this.ativa = aba;
    if (!this.aberto) return this.desenhar();
    const agora = performance.now();
    for (const a of this.abas) {
      if (!a.iframe) continue;
      const esconder = a !== aba;
      // no celular a aba que sai da frente é descarregada na hora (ver SO_EM_USO)
      if (esconder && SO_EM_USO) {
        this.tirarQuadro(a);
        continue;
      }
      if (esconder && !a.iframe.hidden) a.escondidaDesde = agora;
      a.iframe.hidden = esconder;
    }
    aba.escondidaDesde = 0;
    this.corpo.querySelector('.nv-inicio')?.remove();
    if (aba.url) this.quadro(aba).hidden = false;
    else this.corpo.appendChild(this.paginaInicial());
    this.desenhar();
  }

  abrirAba(url = null) {
    if (this.abas.length >= MAX_ABAS) this.fecharAba(this.abas.find((a) => a !== this.ativa));
    const aba = this.novaAba(url);
    this.abas.push(aba);
    this.mostrar(aba);
    if (url) this.dono.lembrar(url);
    this.mudou();
    if (!url) setTimeout(() => this.corpo.querySelector('.nv-inicio input')?.focus(), 30);
    return aba;
  }

  fecharAba(aba) {
    if (!aba) return;
    const i = this.abas.indexOf(aba);
    this.tirarQuadro(aba);
    this.abas.splice(i, 1);
    if (!this.abas.length) {
      // a última aba: no navegador pessoal fecha tudo; na página fixa volta ao início
      if (this.pessoal && !this.inicio) return this.dono.desligar(this.tela);
      this.abas.push(this.novaAba(this.inicio));
    }
    if (aba === this.ativa || !this.abas.includes(this.ativa)) this.mostrar(this.abas[Math.min(i, this.abas.length - 1)]);
    else this.desenhar();
    this.mudou();
  }

  // Início: a página fixa da tela, ou a nova guia (atalhos)
  paraOInicio() {
    if (this.inicio) return this.ir(this.inicio);
    const aba = this.ativa;
    if (!aba) return;
    this.tirarQuadro(aba);
    aba.url = null;
    aba.titulo = '';
    this.mostrar(aba);
    this.mudou();
  }

  // vai para um endereço na aba da frente
  ir(url) {
    const aba = this.ativa;
    if (!url || !aba) return;
    aba.pilha = aba.pilha.slice(0, aba.pos + 1).concat(url);
    aba.pos = aba.pilha.length - 1;
    this.carregar(aba, url);
    this.dono.lembrar(url);
  }

  carregar(aba, url) {
    aba.url = url;
    aba.titulo = '';
    if (!this.aberto) return this.desenhar();
    if (aba.iframe) aba.iframe.src = url;
    this.mostrar(aba);
    this.mudou();
  }

  voltar(passo) {
    const aba = this.ativa;
    if (!aba?.iframe) return;
    // com a extensão, quem volta é o próprio site (histórico de verdade, até dentro do YouTube)
    if (aba.ponte) {
      aba.iframe.contentWindow?.postMessage({ sala3dCmd: passo < 0 ? 'voltar' : 'avancar' }, '*');
      return;
    }
    const alvo = aba.pos + passo;
    if (alvo < 0 || alvo >= aba.pilha.length) return;
    aba.pos = alvo;
    this.carregar(aba, aba.pilha[alvo]);
  }

  // ---------------------------------------------------------------- o que a página conta (extensão)
  // a extensão (quadro.js) conta endereço e título; links de aba nova chegam aqui também
  recebeu(aba, m) {
    if (m.t === 'pagina') {
      aba.ponte = true;
      if (typeof m.url === 'string' && /^https?:/.test(m.url)) aba.url = m.url;
      aba.titulo = String(m.titulo || '').slice(0, 120);
      this.desenhar();
      this.mudou();
    } else if (m.t === 'aba' && typeof m.url === 'string' && /^https?:/.test(m.url)) {
      this.abrirAba(m.url);
    } else if (m.t === 'midia') {
      aba.tocando = !!m.tocando;
    }
  }

  // ---------------------------------------------------------------- desenho
  desenhar() {
    this.elAbas.innerHTML = this.abas.map((a) => {
      const nome = a.titulo || (a.url ? siteDe(a.url) : 'Nova guia');
      const icone = favicon(a.url);
      return `<div class="nv-aba${a === this.ativa ? ' ativa' : ''}" data-aba="${a.id}" title="${esc(nome)}">
        ${icone ? `<img class="nv-fav" src="${esc(icone)}" alt="" data-letra="${esc((siteDe(a.url)[0] || '•').toUpperCase())}">` : `<i class="nv-fav letra">${a.url ? esc((siteDe(a.url)[0] || '•').toUpperCase()) : '+'}</i>`}
        <span>${esc(nome)}</span>
        <button type="button" class="nv-fechar" data-fechar="${a.id}" title="Fechar guia">${ic('x', 14)}</button>
      </div>`;
    }).join('') + `<button type="button" class="nv-nova" data-nv="nova" title="Nova guia">${ic('mais', 18)}</button>`;
    // site sem favicon.ico: fica a inicial
    for (const img of this.elAbas.querySelectorAll('img.nv-fav')) {
      img.addEventListener('error', () => {
        const i = document.createElement('i');
        i.className = 'nv-fav letra';
        i.textContent = img.dataset.letra;
        img.replaceWith(i);
      }, { once: true });
    }
    const campo = this.barra.elements.endereco;
    if (document.activeElement !== campo) campo.value = this.ativa?.url || '';
    const aba = this.ativa;
    this.barra.querySelector('[data-nv="voltar"]').disabled = !aba?.iframe || (!aba.ponte && aba.pos <= 0);
    this.barra.querySelector('[data-nv="avancar"]').disabled = !aba?.iframe || (!aba.ponte && aba.pos >= aba.pilha.length - 1);
  }

  paginaInicial() {
    const div = document.createElement('div');
    div.className = 'nv-inicio';
    const recentes = this.dono.recentes().filter((u) => !ATALHOS.some((a) => siteDe(a.url) === siteDe(u))).slice(0, 6);
    const atalhos = [
      ...(this.inicio ? [{ nome: siteDe(this.inicio), url: this.inicio, cor: '#0ea5e9' }] : []),
      ...ATALHOS,
      ...recentes.map((url) => ({ nome: siteDe(url), url, cor: '#64748b' })),
    ];
    div.innerHTML = `<form class="nv-busca" autocomplete="off">
        <div class="nv-logo">Sala 3D</div>
        <input name="q" spellcheck="false" placeholder="Pesquise no Google ou digite um endereço">
      </form>
      <div class="nv-atalhos">${atalhos.map((a) => `<button type="button" data-ir="${esc(a.url)}">
        <i style="--c:${a.cor}">${esc(a.nome[0] || '•').toUpperCase()}</i><span>${esc(a.nome)}</span></button>`).join('')}</div>
      ${this.dono.temPonte() ? '' : '<p class="nv-dica">YouTube, Google e outros sites que não deixam abrir dentro de outra página precisam da extensão Sala 3D (1.7) neste Chrome, com este site liberado no ícone dela.</p>'}`;
    return div;
  }

  // ---------------------------------------------------------------- cliques e teclado
  ligarEventos() {
    this.el.addEventListener('click', (e) => {
      const fechar = e.target.closest('[data-fechar]');
      if (fechar) {
        e.stopPropagation();
        return this.fecharAba(this.abas.find((a) => a.id === Number(fechar.dataset.fechar)));
      }
      const aba = e.target.closest('[data-aba]');
      if (aba) return this.mostrar(this.abas.find((a) => a.id === Number(aba.dataset.aba)));
      const ir = e.target.closest('[data-ir]');
      if (ir) return this.ir(ir.dataset.ir);
      const b = e.target.closest('[data-nv]');
      if (!b) return;
      b.blur();
      const acao = b.dataset.nv;
      if (acao === 'nova') this.abrirAba();
      else if (acao === 'voltar') this.voltar(-1);
      else if (acao === 'avancar') this.voltar(1);
      else if (acao === 'recarregar' && this.ativa?.url) this.carregar(this.ativa, this.ativa.url);
      else if (acao === 'inicio') this.paraOInicio();
      else if (acao === 'fora' && this.ativa?.url) window.open(this.ativa.url, '_blank', 'noopener');
      else if (acao === 'desligar') this.dono.desligar(this.tela);
    });
    // clique do meio na aba fecha, como no Chrome
    this.el.addEventListener('auxclick', (e) => {
      const aba = e.target.closest('[data-aba]');
      if (aba && e.button === 1) this.fecharAba(this.abas.find((a) => a.id === Number(aba.dataset.aba)));
    });
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      const campo = e.target.elements.endereco || e.target.elements.q;
      const url = this.dono.endereco(campo.value);
      campo.blur();
      if (url) this.ir(url);
    });
    this.el.addEventListener('focusin', (e) => { if (e.target.matches('input')) e.target.select(); });
  }

  mudou() {
    if (this.pessoal) this.dono.guardar(this);
  }
}

// ------------------------------------------------------------------ todos os navegadores
export class Navegadores {
  // endereco: texto digitado -> url (ou null); temPonte: a extensão 1.7+ está ligada aqui;
  // sala: () => nome da sala (as abas pessoais ficam guardadas por sala); aoEntrada: tecla e mouse
  // de dentro dos sites (teclado e mouse do posto)
  // aoTrocarTela(lado): Alt+← / Alt+→ dentro do site (a extensão repassa)
  constructor(world, { endereco, temPonte, sala, aoEntrada, aoDesligar, aoTrocarTela }) {
    this.world = world;
    this.endereco = endereco;
    this.temPonte = temPonte;
    this.sala = sala;
    this.aoEntrada = aoEntrada;
    this.aoDesligar = aoDesligar;
    this.aoTrocarTela = aoTrocarTela;
    this.itens = new Map(); // tela -> Navegador
    this.emUso = null; // o navegador em foco
    this._frente = new THREE.Vector3();
    this._ate = new THREE.Vector3();
    window.addEventListener('message', (e) => this.mensagem(e));
  }


  // ---------------------------------------------------------------- abas guardadas (pessoais)
  guardados() {
    return ler(GUARDADOS, {})[this.sala()] || {};
  }

  pessoal(chave) {
    return chave ? this.guardados()[chave] || null : null;
  }

  guardar(nav) {
    if (!nav.chave) return;
    const tudo = ler(GUARDADOS, {});
    const daSala = tudo[this.sala()] || {};
    daSala[nav.chave] = { abas: nav.abas.map((a) => a.url).filter(Boolean), ativa: Math.max(0, nav.abas.indexOf(nav.ativa)) };
    if (!daSala[nav.chave].abas.length) daSala[nav.chave].abas = [];
    tudo[this.sala()] = daSala;
    gravar(GUARDADOS, tudo);
  }

  // o (+) da tela: abre o navegador pessoal nela (com uma nova guia)
  ligar(chave) {
    const tudo = ler(GUARDADOS, {});
    const daSala = tudo[this.sala()] || {};
    if (!daSala[chave]) daSala[chave] = { abas: [], ativa: 0 };
    tudo[this.sala()] = daSala;
    gravar(GUARDADOS, tudo);
  }

  desligar(tela) {
    const nav = this.itens.get(tela);
    if (!nav) return;
    const tudo = ler(GUARDADOS, {});
    if (tudo[this.sala()]) delete tudo[this.sala()][nav.chave];
    gravar(GUARDADOS, tudo);
    this.aoDesligar?.(tela);
  }

  lembrar(url) {
    const lista = ler(RECENTES, []).filter((u) => siteDe(u) !== siteDe(url));
    lista.unshift(url);
    gravar(RECENTES, lista.slice(0, 12));
  }

  recentes() { return ler(RECENTES, []); }

  // ---------------------------------------------------------------- o que deve estar no ar
  // lista: [{ tela, chave, inicio, pessoal }]. O resto sai.
  sincronizar(lista) {
    const quer = new Map(lista.map((p) => [p.tela, p]));
    for (const [tela, nav] of this.itens) {
      const p = quer.get(tela);
      if (!p || p.chave !== nav.chave || p.inicio !== nav.inicio || !!p.pessoal !== nav.pessoal) {
        if (this.emUso === nav) this.emUso = null;
        nav.destruir();
        this.itens.delete(tela);
      }
    }
    for (const [tela, p] of quer) if (!this.itens.has(tela)) this.itens.set(tela, new Navegador(this, tela, p));
  }

  // a cada pouco: abre o que ficou perto (na mesma sala), fecha o que ficou longe, para de
  // desenhar o que saiu da vista e descarrega as abas paradas
  atualizar() {
    const cam = this.world.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(this._frente);
    const salaDaCamera = this.world.salaEm?.(cam.position.x, cam.position.z) ?? null;
    const agora = performance.now();
    // Desenhado com a sala dele no ar (sala escondida pelo 3D: segue carregado) e sem estar de costas
    // para ele — a tela inteira atrás da câmera. Fora da vista, de lado, continua desenhado: esconder
    // é display: none, e ao mostrar de novo o Chrome montava e desenhava o site inteiro, um tranco a
    // cada olhada para o lado. Com um navegador em foco, os do lado também (aparece um pedaço deles).
    const ver = (nav) => {
      const deCostas = this._ate.copy(nav.centro).sub(cam.position).dot(this._frente) < -nav.raio;
      nav.vista(nav.tela.group.parent?.visible !== false && !deCostas);
      nav.descartarParadas(agora);
    };
    const paraAbrir = []; // { nav, d }: fechados que ficaram perto
    const abertosAgora = []; // { nav, d }: os abertos que contam no limite
    let abertos = 0; // fora o em uso
    for (const nav of this.itens.values()) {
      if (!nav.tela.group.visible || (SO_EM_USO && this.emUso !== nav)) {
        nav.fechar();
        continue;
      }
      if (this.emUso === nav) {
        nav.abrir();
        nav.vista(true);
        nav.descartarParadas(agora);
        continue;
      }
      const d = nav.centro.distanceTo(cam.position);
      const perto = nav.tela.posto ? PERTO_POSTO : PERTO_PAREDE;
      const mesmaSala = !!nav.tela.posto || !nav.sala || !salaDaCamera || nav.sala === salaDaCamera;
      if (!nav.aberto) {
        if (d < perto && mesmaSala) paraAbrir.push({ nav, d });
        continue;
      }
      if (d > perto * FOLGA || !mesmaSala) {
        nav.fechar();
        continue;
      }
      abertos++;
      abertosAgora.push({ nav, d });
      ver(nav);
    }
    // O mais perto primeiro, até o limite do aparelho. Cheio, o aberto mais longe cede a vaga a
    // quem ficou bem mais perto (a folga evita o abre-e-fecha): senão as páginas de parede que
    // abriram primeiro seguravam as vagas e o monitor do próprio posto nunca abria.
    paraAbrir.sort((a, b) => a.d - b.d);
    for (const c of paraAbrir) {
      if (abertos >= MAX_ABERTOS) {
        let longe = null;
        for (const a of abertosAgora) if (!longe || a.d > longe.d) longe = a;
        if (!longe || c.d * FOLGA >= longe.d) break;
        longe.nav.fechar();
        abertosAgora.splice(abertosAgora.indexOf(longe), 1);
        abertos--;
      }
      c.nav.abrir();
      abertos++;
      abertosAgora.push(c);
      ver(c.nav);
    }
  }

  tem(tela) { return this.itens.has(tela); }

  rotulo(tela) {
    const nav = this.itens.get(tela);
    if (!nav) return '';
    const a = nav.ativa;
    return a?.url ? `Usar ${a.titulo ? a.titulo.slice(0, 40) : siteDe(a.url)}` : 'Usar o navegador';
  }

  // ---------------------------------------------------------------- foco
  usar(tela) {
    const nav = this.itens.get(tela);
    if (!nav) return null;
    nav.abrir();
    this.emUso = nav;
    this.atualizar();
    return nav;
  }

  soltar() {
    if (document.activeElement && this.emUso?.el.contains(document.activeElement)) document.activeElement.blur();
    if (document.activeElement?.tagName === 'IFRAME') document.activeElement.blur();
    this.emUso = null;
    this.atualizar();
  }

  get enderecoAtual() { return this.emUso?.ativa?.url || ''; }

  // ---------------------------------------------------------------- recados dos sites (extensão)
  mensagem(e) {
    const m = e.data?.sala3dQuadro;
    if (!m || typeof m !== 'object' || !e.source) return;
    for (const nav of this.itens.values()) {
      const aba = nav.abas.find((a) => a.iframe?.contentWindow === e.source);
      if (!aba) continue;
      if (m.t === 'pagina' || m.t === 'aba' || m.t === 'midia') nav.recebeu(aba, m);
      else if (m.t === 'trocarTela') this.aoTrocarTela?.(m.lado > 0 ? 1 : -1);
      else this.aoEntrada?.(m);
      return;
    }
  }
}
