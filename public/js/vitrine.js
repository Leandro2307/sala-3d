// Vitrine de personagem: um palco 3D pequeno, com luz de estúdio, que mostra um personagem
// girando devagar e fazendo as animações dele. Usada no modal de escolha (prévia ao vivo) e
// pelo scripts/miniaturas.js (que tira a foto de cada um para o catálogo).
import * as THREE from 'three';
import { Avatar } from './avatars.js';
import { isTouch } from './touch.js';

const _caixa = new THREE.Box3();
const _centro = new THREE.Vector3();
const _tam = new THREE.Vector3();
const ALTURA_BANCO = 0.6;

export class Vitrine {
  constructor(canvas, { girar = true, fotos = false } = {}) {
    this.canvas = canvas;
    // fotos: o buffer fica guardado depois do quadro, para o toDataURL das miniaturas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: fotos });
    // no celular 1,5× já fica nítido no modal pequeno, e é um segundo WebGL disputando a placa
    this.renderer.setPixelRatio(fotos ? 1 : Math.min(isTouch ? 1.5 : 2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);

    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x30283f, 1.6));
    const chave = new THREE.DirectionalLight(0xffffff, 2.4);
    chave.position.set(2.5, 4, 3.5);
    this.scene.add(chave);
    const contra = new THREE.DirectionalLight(0x6ee7c8, 1.6); // contorno verde-água, a cor da sala
    contra.position.set(-3, 2.5, -3);
    this.scene.add(contra);
    // sombra redonda no chão, desenhada (sem shadow map)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    this.sombra = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    this.sombra.rotation.x = -Math.PI / 2;
    this.sombra.position.y = 0.005;
    this.scene.add(this.sombra);
    // banquinho para a prévia de "sentar" (o jogo põe o boneco na altura do assento)
    this.banco = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.26, ALTURA_BANCO, 20),
      new THREE.MeshStandardMaterial({ color: 0x2a3142, roughness: 0.6, metalness: 0.2 }),
    );
    this.banco.position.y = ALTURA_BANCO / 2;
    this.banco.visible = false;
    this.scene.add(this.banco);

    this.avatar = null;
    this.anim = 0; // 0 parado, 1 andando, 2 correndo, 3 no ar, 4 sentado
    this.girar = girar;
    this.angulo = 0.45;
    this.t = 0;
    this.pedido = 0;
    this.rodando = false;
    this.ultimo = 0;
    this.tamanho(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
  }

  tamanho(w, h) {
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.avatar) this.enquadrar();
  }

  // Põe um personagem no palco (o boneco padrão leva a cor, a camiseta e a foto de quem escolhe).
  // Devolve false se outro pedido chegou antes deste terminar de carregar.
  async mostrar(def, { cor = '#7c9cff', camiseta = 'none', foto = null } = {}) {
    const pedido = ++this.pedido;
    const av = new Avatar({ name: '', color: cor, isLocal: true });
    if (def?.url) {
      const r = await av.setPersonagem(def);
      if (r?.ok === false) throw new Error(r.erro || 'não carregou');
    } else {
      if (camiseta && camiseta !== 'none') av.setShirt(camiseta);
      if (foto) av.setPhoto(foto);
    }
    if (pedido !== this.pedido) {
      this.soltar(av);
      return false;
    }
    if (this.avatar) this.soltar(this.avatar);
    this.avatar = av;
    this.scene.add(av.group);
    av.inner.rotation.y = this.angulo;
    this.passo(0.4);
    this.enquadrar();
    return true;
  }

  // o dispose do boneco para o personagem e o tira do palco; as malhas do modelo são do cache (o
  // jogo usa as mesmas): ficam
  soltar(av) {
    av.dispose();
  }

  // câmera de frente, enquadrando o corpo inteiro com uma folga
  enquadrar(suave = false) {
    this.avatar.inner.updateMatrixWorld(true);
    _caixa.setFromObject(this.avatar.inner, true);
    if (_caixa.isEmpty()) _caixa.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1.9, 0.5));
    _caixa.getCenter(_centro);
    _caixa.getSize(_tam);
    const alto = Math.max(_tam.y, 1.2);
    const tg = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(alto / 2 / tg, Math.max(_tam.x, _tam.z) / 2 / (tg * this.camera.aspect)) * 1.26 + Math.max(_tam.x, _tam.z) / 2;
    this.camAlvo = {
      pos: new THREE.Vector3(_centro.x, _centro.y + alto * 0.06, _centro.z + dist),
      olhar: _centro.clone(),
    };
    if (!this.camOlhar || !suave) {
      this.camera.position.copy(this.camAlvo.pos);
      this.camOlhar = this.camAlvo.olhar.clone();
    }
    this.camera.lookAt(this.camOlhar);
    this.sombra.scale.setScalar(Math.max(_tam.x, _tam.z, 0.8));
  }

  animar(n) {
    // sentar/levantar muda a altura (banquinho): reenquadra quando a pose assentar
    if ((n === 4) !== (this.anim === 4)) this.enquadrarEm = this.t + 0.7;
    this.anim = n;
  }

  // aceno ou soco: o que o modelo tiver
  gesto(nome) {
    if (!this.avatar) return;
    if (nome === 'wave') this.avatar.emote('wave');
    else if (nome === 'punch') this.avatar.punch();
  }

  passo(dt) {
    if (!this.avatar) return;
    this.t += dt;
    this.avatar.anim = this.anim;
    const sentado = this.anim === 4;
    this.banco.visible = sentado;
    this.avatar.group.position.y = sentado ? ALTURA_BANCO : 0;
    this.avatar.update(dt, this.t);
    if (this.girar) {
      this.angulo += dt * 0.5;
      this.avatar.inner.rotation.y = this.angulo;
    }
    if (this.enquadrarEm && this.t >= this.enquadrarEm) {
      this.enquadrarEm = 0;
      this.enquadrar(true);
    }
    if (this.camAlvo) {
      const k = Math.min(1, dt * 5);
      this.camera.position.lerp(this.camAlvo.pos, k);
      this.camOlhar.lerp(this.camAlvo.olhar, k);
      this.camera.lookAt(this.camOlhar);
    }
  }

  quadro() {
    this.renderer.render(this.scene, this.camera);
  }

  iniciar() {
    if (this.rodando) return;
    this.rodando = true;
    this.ultimo = performance.now();
    const loop = (agora) => {
      if (!this.rodando) return;
      // no celular 30 quadros bastam para o giro lento, e o jogo atrás continua com a placa
      if (isTouch && agora - this.ultimo < 1000 / 30 - 4) {
        requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min(0.05, (agora - this.ultimo) / 1000);
      this.ultimo = agora;
      this.passo(dt);
      this.quadro();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  parar() {
    this.rodando = false;
  }

  dispose() {
    this.parar();
    this.pedido++; // um modelo que ainda está carregando é descartado ao chegar
    if (this.avatar) this.soltar(this.avatar);
    this.avatar = null;
    this.sombra.geometry.dispose();
    this.sombra.material.map.dispose();
    this.sombra.material.dispose();
    this.banco.geometry.dispose();
    this.banco.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
