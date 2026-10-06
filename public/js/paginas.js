// Páginas fixas: um site aberto direto numa tela do mundo (o dono da sala escolhe qual, em Sala
// da empresa). Não é compartilhamento: cada pessoa abre a página no próprio navegador, num iframe
// no CSS3D atrás da tela — a mesma técnica do player do telão: um "buraco" transparente no WebGL
// deixa ver o iframe, e o que passa na frente (gente, parede) tapa ele direitinho. Mexer na
// página (tecla E) é como numa aba normal: liso, sem servidor nem VPS no meio.
//
// O iframe só existe perto da tela (abre ao chegar, fecha ao ir embora): uma página aberta em
// cada sala do prédio ao mesmo tempo pesaria à toa.
import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const LARGURA_PX = 1280; // a "janela" da página: 1280 px de largura, como um notebook
const ABRIR = 32; // metros: perto assim, a página carrega
const FECHAR = 48; // longe assim, fecha (com folga, para não ficar abrindo e fechando na porta)

const siteDe = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export class Paginas {
  constructor(world) {
    this.world = world;
    this.itens = new Map(); // tela (ScreenDisplay) -> item
    this.emUso = null; // a página em que a pessoa está mexendo (foco)
    this._pos = new THREE.Vector3();
  }

  // a lista inteira do que deve estar no ar: [{ tela, url }]. O resto sai.
  sincronizar(lista) {
    const quer = new Map(lista.map((p) => [p.tela, p.url]));
    for (const [tela, item] of this.itens) if (quer.get(tela) !== item.url) this.tirar(tela);
    for (const [tela, url] of quer) if (!this.itens.has(tela)) this.colocar(tela, url);
  }

  colocar(tela, url) {
    const alto = Math.round((LARGURA_PX * tela.h) / tela.w);
    const el = document.createElement('div');
    el.className = 'pagina-surface';
    el.style.width = `${LARGURA_PX}px`;
    el.style.height = `${alto}px`;
    const css = new CSS3DObject(el);
    css.visible = false;
    this.world.cssScene.add(css);
    // o buraco no WebGL, um tiquinho na frente da tela (o vídeo de quem compartilha fica em 0.02)
    const buraco = new THREE.Mesh(
      new THREE.PlaneGeometry(tela.w, tela.h),
      new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, toneMapped: false, fog: false }),
    );
    buraco.position.z = 0.016;
    buraco.visible = false;
    buraco.userData.screen = tela;
    tela.group.add(buraco);
    this.itens.set(tela, { tela, url, atual: url, el, css, buraco, iframe: null });
    this.posicionar(this.itens.get(tela));
  }

  tirar(tela) {
    const item = this.itens.get(tela);
    if (!item) return;
    if (this.emUso === item) this.emUso = null;
    this.fechar(item);
    this.world.cssScene.remove(item.css);
    item.el.remove();
    item.buraco.removeFromParent();
    item.buraco.geometry.dispose();
    item.buraco.material.dispose();
    this.itens.delete(tela);
  }

  // o iframe no mesmo lugar e tamanho da tela (as telas não andam: basta ao pôr e ao abrir)
  posicionar(item) {
    const { tela, css, buraco } = item;
    tela.group.updateWorldMatrix(true, true);
    buraco.getWorldPosition(css.position);
    buraco.getWorldQuaternion(css.quaternion);
    css.scale.setScalar(tela.w / LARGURA_PX);
  }

  abrir(item) {
    if (item.iframe) return;
    const f = document.createElement('iframe');
    f.src = item.atual;
    f.title = siteDe(item.atual);
    f.allow = 'clipboard-read; clipboard-write; fullscreen; autoplay';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    item.el.appendChild(f);
    item.iframe = f;
    this.posicionar(item);
    item.css.visible = true;
    item.buraco.visible = true;
  }

  fechar(item) {
    if (!item.iframe) return;
    item.iframe.remove();
    item.iframe = null;
    item.css.visible = false;
    item.buraco.visible = false;
    item.atual = item.url; // fechou: a próxima visita começa na página fixa
  }

  // a cada pouco: abre as que ficaram perto, fecha as que ficaram longe
  atualizar() {
    const cam = this.world.camera.position;
    for (const item of this.itens.values()) {
      if (!item.tela.group.visible) {
        this.fechar(item);
        continue;
      }
      item.tela.surface.getWorldPosition(this._pos);
      const d = this._pos.distanceTo(cam);
      if (!item.iframe && d < ABRIR) this.abrir(item);
      else if (item.iframe && d > FECHAR && this.emUso !== item) this.fechar(item);
    }
  }

  tem(tela) { return this.itens.has(tela); }

  rotulo(tela) {
    const item = this.itens.get(tela);
    return item ? siteDe(item.atual) : '';
  }

  // ---------------------------------------------------------------- foco (mexendo na página)
  usar(tela) {
    const item = this.itens.get(tela);
    if (!item) return null;
    this.abrir(item);
    this.emUso = item;
    return item;
  }

  soltar() {
    if (document.activeElement?.tagName === 'IFRAME') document.activeElement.blur();
    this.emUso = null;
  }

  // abre outro endereço só para você, nesta tela (a página fixa volta com "Início")
  irPara(url) {
    const item = this.emUso;
    if (!item || !item.iframe) return;
    item.atual = url;
    item.iframe.src = url;
    item.iframe.title = siteDe(url);
  }

  inicio() {
    if (this.emUso) this.irPara(this.emUso.url);
  }

  recarregar() {
    const f = this.emUso?.iframe;
    if (f) f.src = this.emUso.atual;
  }

  get enderecoAtual() { return this.emUso?.atual ?? ''; }
}
