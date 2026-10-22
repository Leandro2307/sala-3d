// O acabamento de cinema do lado de fora: brilho em volta do que é claro (o sol, as nuvens, a
// areia ao sol), cores puxadas para o "fim de tarde" de jogo de mundo aberto (luz quente, sombra
// azulada, um pouco mais de contraste) e a vinheta nos cantos.
//
// A cena continua sendo desenhada direto na tela, como sempre: com o MSAA do canvas e o tone
// mapping de cada material (o vídeo das telas, que não passa por ele, continua com a cor certa).
// Depois do desenho, a imagem é copiada para uma textura e redesenhada com o acabamento. Desenhar
// a cena num alvo (o jeito do EffectComposer) mudaria o programa de todos os materiais (o three
// só faz tone mapping no desenho da tela): recompilaria tudo a cada vez que se liga ou desliga.
//
// nivel 0: nada. 1: só as cores e a vinheta (um desenho a mais). 2: e o brilho, numa cadeia de
// meias resoluções (dual Kawase), que custa pouco mais que uma cópia da tela.
import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

// o que passa do limiar vira brilho; o joelho suaviza a entrada (sem borda dura)
const CLAROS = /* glsl */ `
  uniform sampler2D tela;
  uniform vec2 texel;
  uniform float limiar;
  varying vec2 vUv;
  void main() {
    // 4 amostras (a meia resolução, cada uma cobre 2x2 pixels): o brilho não pisca em detalhe fino
    vec3 c = texture2D(tela, vUv + texel * vec2(-0.5, -0.5)).rgb;
    c += texture2D(tela, vUv + texel * vec2(0.5, -0.5)).rgb;
    c += texture2D(tela, vUv + texel * vec2(-0.5, 0.5)).rgb;
    c += texture2D(tela, vUv + texel * vec2(0.5, 0.5)).rgb;
    c *= 0.25;
    c *= c; // a tela está em sRGB: perto do linear, o brilho fica concentrado no que é claro mesmo
    float l = max(c.r, max(c.g, c.b));
    float joelho = 0.25;
    float s = clamp(l - limiar + joelho, 0.0, 2.0 * joelho);
    s = s * s / (4.0 * joelho + 1e-4);
    float peso = max(s, l - limiar) / max(l, 1e-4);
    gl_FragColor = vec4(c * peso, 1.0);
  }`;

const DESCE = /* glsl */ `
  uniform sampler2D fonte;
  uniform vec2 texel;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(fonte, vUv).rgb * 4.0;
    c += texture2D(fonte, vUv - texel).rgb;
    c += texture2D(fonte, vUv + texel).rgb;
    c += texture2D(fonte, vUv + vec2(texel.x, -texel.y)).rgb;
    c += texture2D(fonte, vUv - vec2(texel.x, -texel.y)).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
  }`;

const SOBE = /* glsl */ `
  uniform sampler2D fonte;
  uniform vec2 texel;
  varying vec2 vUv;
  void main() {
    vec2 h = texel * 0.5;
    vec3 c = texture2D(fonte, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
    c += texture2D(fonte, vUv + vec2(-h.x, h.y)).rgb * 2.0;
    c += texture2D(fonte, vUv + vec2(0.0, h.y * 2.0)).rgb;
    c += texture2D(fonte, vUv + vec2(h.x, h.y)).rgb * 2.0;
    c += texture2D(fonte, vUv + vec2(h.x * 2.0, 0.0)).rgb;
    c += texture2D(fonte, vUv + vec2(h.x, -h.y)).rgb * 2.0;
    c += texture2D(fonte, vUv + vec2(0.0, -h.y * 2.0)).rgb;
    c += texture2D(fonte, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
    gl_FragColor = vec4(c / 12.0, 1.0);
  }`;

// o quadro final: a tela, o brilho somado e as cores. força: 0..1 (a entrada e a saída do cinema
// passam suave)
const FINAL = /* glsl */ `
  uniform sampler2D tela;
  uniform sampler2D brilho;
  uniform float comBrilho;
  uniform float forcaBrilho;
  uniform float forca;
  uniform float aspecto;
  uniform vec3 sol; // onde o sol está na tela (xy, 0..1) e quanto ele está de frente (z)
  varying vec2 vUv;
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  void main() {
    vec4 t = texture2D(tela, vUv);
    vec3 orig = t.rgb;
    vec3 c = orig;
    if (comBrilho > 0.5) {
      // o brilho foi somado em quase-linear: volta para a tela somando antes da raiz
      vec3 b = texture2D(brilho, vUv).rgb;
      c = sqrt(c * c + b * forcaBrilho);
    }
    // clarão do sol na lente: só se o sol aparece mesmo (o pixel dele e a volta estão claros; atrás
    // de uma árvore ou de um prédio, some)
    if (sol.z > 0.0) {
      vec2 o = vec2(0.012 / aspecto, 0.012);
      float vis = luma(texture2D(tela, sol.xy).rgb) + luma(texture2D(tela, sol.xy + o).rgb)
        + luma(texture2D(tela, sol.xy - o).rgb) + luma(texture2D(tela, sol.xy + vec2(o.x, -o.y)).rgb)
        + luma(texture2D(tela, sol.xy - vec2(o.x, -o.y)).rgb);
      vis = smoothstep(0.75, 0.97, vis / 5.0) * sol.z;
      vec2 ds = (vUv - sol.xy) * vec2(aspecto, 1.0);
      float r = length(ds);
      float halo = exp(-r * 3.2) * 0.32 + exp(-r * 14.0) * 0.35;
      float risco = exp(-abs(ds.y) * 90.0) * exp(-abs(ds.x) * 2.2) * 0.22;
      // um anel fraco do outro lado do centro, como reflexo entre as lentes
      float anel = smoothstep(0.05, 0.0, abs(length((vUv - (1.0 - sol.xy)) * vec2(aspecto, 1.0)) - 0.09)) * 0.06;
      c += vec3(1.0, 0.86, 0.62) * (halo + risco) * vis + vec3(0.55, 0.8, 1.0) * anel * vis;
    }
    // contraste em S, segurando o meio do tom
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
    // saturação: um pouco mais nos tons médios, menos no que já estoura
    float l = luma(c);
    c = mix(vec3(l), c, 1.03);
    // split toning: sombra puxa para o azul-petróleo, luz para o dourado
    vec3 sombra = vec3(-0.01, 0.012, 0.03);
    vec3 luz = vec3(0.05, 0.022, -0.03);
    float ws = 1.0 - smoothstep(0.0, 0.55, l);
    float wl = smoothstep(0.45, 1.0, l);
    c += sombra * ws + luz * wl;
    // pretos um pouco mais fundos
    c = max(c - 0.012, 0.0) / 0.988;
    // vinheta
    vec2 d = (vUv - 0.5) * vec2(aspecto, 1.0);
    float v = smoothstep(1.15, 0.35, length(d));
    c *= mix(0.78, 1.0, v);
    c = clamp(c, 0.0, 1.0);
    // o canvas é transparente onde o player do telão aparece por trás (buraco: alfa 0): ali e
    // na borda dele a imagem passa como veio
    gl_FragColor = vec4(mix(orig, c, forca * t.a), t.a);
  }`;

const NIVEIS_BRILHO = 5;

export class PosProcesso {
  constructor(renderer) {
    this.renderer = renderer;
    this.nivel = 0;
    this.forca = 0; // vai até 1 com o lado de fora à vista (ver desenhar)
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // um triângulo que cobre a tela inteira
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.cena = new THREE.Scene();
    this.cena.add(this.quad);
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
    });
    this.matClaros = mat(CLAROS, { tela: { value: null }, texel: { value: new THREE.Vector2() }, limiar: { value: 0.78 } });
    this.matDesce = mat(DESCE, { fonte: { value: null }, texel: { value: new THREE.Vector2() } });
    this.matSobe = mat(SOBE, { fonte: { value: null }, texel: { value: new THREE.Vector2() } });
    this.matSobe.blending = THREE.AdditiveBlending; // cada nível soma no de cima
    this.matFinal = mat(FINAL, {
      tela: { value: null }, brilho: { value: null }, comBrilho: { value: 0 }, forcaBrilho: { value: 0.4 },
      forca: { value: 0 }, aspecto: { value: 1 }, sol: { value: new THREE.Vector3() },
    });
    this.copia = null; // a imagem da cena (FramebufferTexture)
    this.alvos = []; // a cadeia do brilho: 1/2, 1/4, 1/8...
    this.w = 0;
    this.h = 0;
    this._tam = new THREE.Vector2();
  }

  setNivel(n) {
    this.nivel = n;
    if (n < 2) this.liberarBrilho();
  }

  liberarBrilho() {
    for (const a of this.alvos) a.dispose();
    this.alvos = [];
  }

  // a cópia e os alvos no tamanho do desenho atual (a qualidade automática muda a resolução)
  acertarTamanho() {
    const { x: w, y: h } = this.renderer.getDrawingBufferSize(this._tam);
    if (w === this.w && h === this.h && this.copia && (this.nivel < 2 || this.alvos.length)) return;
    if (w !== this.w || h !== this.h || !this.copia) {
      this.copia?.dispose();
      this.copia = new THREE.FramebufferTexture(w, h);
      this.copia.minFilter = this.copia.magFilter = THREE.LinearFilter;
      this.liberarBrilho();
    }
    this.w = w;
    this.h = h;
    if (this.nivel >= 2 && !this.alvos.length) {
      let aw = w;
      let ah = h;
      for (let i = 0; i < NIVEIS_BRILHO; i++) {
        aw = Math.max(1, aw >> 1);
        ah = Math.max(1, ah >> 1);
        this.alvos.push(new THREE.WebGLRenderTarget(aw, ah, {
          type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        }));
      }
    }
  }

  passar(material, alvo) {
    this.quad.material = material;
    this.renderer.setRenderTarget(alvo);
    this.renderer.render(this.cena, this.cam);
  }

  // Depois do desenho da cena na tela. ligado: o lado de fora está à vista. dt em segundos.
  // sol: { x, y, z } da setSol (ou null). Devolve se desenhou algo.
  desenhar(ligado, dt, sol = null) {
    const alvo = ligado && this.nivel > 0 ? 1 : 0;
    this.forca += Math.sign(alvo - this.forca) * Math.min(Math.abs(alvo - this.forca), dt * 2.5);
    if (this.forca <= 0.001 || this.nivel === 0) return false;
    const r = this.renderer;
    this.acertarTamanho();
    r.copyFramebufferToTexture(this.copia);
    const autoClear = r.autoClear;
    r.autoClear = false;
    try {
      const brilho = this.nivel >= 2 && this.alvos.length;
      if (brilho) {
        const u = this.matClaros.uniforms;
        u.tela.value = this.copia;
        u.texel.value.set(1 / this.w, 1 / this.h);
        this.passar(this.matClaros, this.alvos[0]);
        for (let i = 1; i < this.alvos.length; i++) {
          const f = this.alvos[i - 1];
          this.matDesce.uniforms.fonte.value = f.texture;
          this.matDesce.uniforms.texel.value.set(1 / f.width, 1 / f.height);
          this.passar(this.matDesce, this.alvos[i]);
        }
        for (let i = this.alvos.length - 1; i > 0; i--) {
          const f = this.alvos[i];
          this.matSobe.uniforms.fonte.value = f.texture;
          this.matSobe.uniforms.texel.value.set(1 / f.width, 1 / f.height);
          this.passar(this.matSobe, this.alvos[i - 1]);
        }
      }
      const u = this.matFinal.uniforms;
      u.tela.value = this.copia;
      u.brilho.value = brilho ? this.alvos[0].texture : null;
      u.comBrilho.value = brilho ? 1 : 0;
      u.forca.value = this.forca;
      u.aspecto.value = this.w / this.h;
      if (sol && this.nivel >= 2) u.sol.value.copy(sol);
      else u.sol.value.set(0, 0, 0);
      this.passar(this.matFinal, null);
    } finally {
      r.setRenderTarget(null);
      r.autoClear = autoClear;
    }
    return true;
  }

  dispose() {
    this.liberarBrilho();
    this.copia?.dispose();
    for (const m of [this.matClaros, this.matDesce, this.matSobe, this.matFinal]) m.dispose();
    this.quad.geometry.dispose();
  }
}
