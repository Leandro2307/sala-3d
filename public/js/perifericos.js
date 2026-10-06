// Teclado e mouse em cada posto de trabalho do escritório.
//
// Os de todo mundo são instâncias (um desenho só para dezenas de postos). O do posto em que VOCÊ
// está sentado vira um de verdade, que se mexe junto: a tecla que você aperta afunda (a mesma,
// no mesmo lugar do teclado) e o mouse anda no mouse pad conforme você mexe o seu — até quando
// está digitando ou mexendo dentro de um site no navegador da tela (a extensão repassa).
import * as THREE from 'three';

// teclado 60% ABNT2: [code, rótulo, largura em unidades]
const LINHAS = [
  [['Backquote', "'"], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Digit6', '6'], ['Digit7', '7'], ['Digit8', '8'], ['Digit9', '9'], ['Digit0', '0'], ['Minus', '-'], ['Equal', '='], ['Backspace', '⌫', 2]],
  [['Tab', 'Tab', 1.5], ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'], ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P'], ['BracketLeft', '´'], ['BracketRight', '['], ['Backslash', ']', 1.5]],
  [['CapsLock', 'Caps', 1.75], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyH', 'H'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', 'Ç'], ['Quote', '~'], ['Enter', 'Enter', 2.25]],
  [['ShiftLeft', 'Shift', 2.25], ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'], ['KeyN', 'N'], ['KeyM', 'M'], ['Comma', ','], ['Period', '.'], ['Slash', ';'], ['ShiftRight', 'Shift', 2.75]],
  [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', '⊞', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', '', 6.25], ['AltRight', 'AltGr', 1.25], ['ArrowLeft', '←', 1.25], ['ArrowDown', '↓', 1.25], ['ArrowRight', '→', 1.25]],
];
const COLUNAS = 15; // unidades por linha
const LETRAS = LINHAS.flat().filter(([c]) => /^Key/.test(c)).map(([c]) => c);
// algumas teclas que não estão no 60% caem numa vizinha
const APELIDO = { ArrowUp: 'ArrowDown', Escape: 'Backquote', Delete: 'Backspace', NumpadEnter: 'Enter', ControlRight: 'ControlLeft', MetaRight: 'MetaLeft', IntlRo: 'Slash' };

// medidas (metros)
const TECLADO = { w: 0.44, h: 0.02, d: 0.15 };
const PAD = { w: 0.26, d: 0.21, x: 0.4 }; // mouse pad à direita do teclado
const PX = { w: 1024, h: Math.round((1024 * TECLADO.d) / TECLADO.w) };
const MARGEM = 18;
const UNIDADE = (PX.w - MARGEM * 2) / COLUNAS;

// onde fica cada tecla na textura
const TECLAS = new Map();
LINHAS.forEach((linha, r) => {
  let x = MARGEM;
  const alto = (PX.h - MARGEM * 2) / LINHAS.length;
  for (const [code, rotulo, larg = 1] of linha) {
    TECLAS.set(code, { x, y: MARGEM + r * alto, w: larg * UNIDADE, h: alto, rotulo });
    x += larg * UNIDADE;
  }
});

function desenharTeclado(ctx, apertadas = new Set()) {
  ctx.fillStyle = '#151922';
  ctx.fillRect(0, 0, PX.w, PX.h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [code, k] of TECLAS) {
    const baixa = apertadas.has(code);
    const p = 3;
    ctx.fillStyle = baixa ? '#0b0e14' : '#2a303d';
    ctx.beginPath();
    ctx.roundRect(k.x + p, k.y + p + (baixa ? 3 : 0), k.w - p * 2, k.h - p * 2 - (baixa ? 1 : 3), 7);
    ctx.fill();
    if (!baixa) {
      // borda de baixo da tecla (dá o volume) — some quando ela afunda
      ctx.fillStyle = '#1a1f29';
      ctx.fillRect(k.x + p + 4, k.y + k.h - p - 3, k.w - p * 2 - 8, 3);
    }
    if (k.rotulo) {
      ctx.fillStyle = baixa ? '#6ee7c8' : '#cbd5e1';
      ctx.font = `600 ${k.rotulo.length > 2 ? 17 : 24}px system-ui, sans-serif`;
      ctx.fillText(k.rotulo, k.x + k.w / 2, k.y + k.h / 2 + (baixa ? 3 : -1));
    }
  }
}

function texturaDoTeclado() {
  const cv = document.createElement('canvas');
  cv.width = PX.w;
  cv.height = PX.h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { cv, ctx: cv.getContext('2d'), tex };
}

export function criarPerifericos(raiz, postos) {
  const lista = postos.filter((p) => p.mesa);
  const corpo = new THREE.MeshStandardMaterial({ color: 0x1b1f28, roughness: 0.55, metalness: 0.2 });
  const estatico = texturaDoTeclado();
  desenharTeclado(estatico.ctx);
  const topo = new THREE.MeshStandardMaterial({ map: estatico.tex, roughness: 0.6 });
  // caixa: +x, -x, +y (o topo, com as teclas), -y, +z, -z
  const geoTeclado = new THREE.BoxGeometry(TECLADO.w, TECLADO.h, TECLADO.d);
  const matsTeclado = [corpo, corpo, topo, corpo, corpo, corpo];
  const geoPad = new THREE.BoxGeometry(PAD.w, 0.004, PAD.d);
  const matPad = new THREE.MeshStandardMaterial({ color: 0x23293a, roughness: 0.95 });
  const geoMouse = new THREE.SphereGeometry(0.032, 20, 14);
  geoMouse.scale(0.95, 0.5, 1.55);
  const matMouse = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.35, metalness: 0.25 });

  const n = lista.length;
  const teclados = new THREE.InstancedMesh(geoTeclado, matsTeclado, n);
  const pads = new THREE.InstancedMesh(geoPad, matPad, n);
  const mouses = new THREE.InstancedMesh(geoMouse, matMouse, n);
  const base = new THREE.Object3D();
  const _m = new THREE.Matrix4();
  const lugar = (p, dx, dy, dz) => {
    base.position.set(...p.mesa.pos);
    base.rotation.set(0, p.mesa.rotY, 0);
    base.updateMatrix();
    return _m.makeTranslation(dx, dy, dz).premultiply(base.matrix);
  };
  lista.forEach((p, i) => {
    teclados.setMatrixAt(i, lugar(p, 0, TECLADO.h / 2, 0));
    pads.setMatrixAt(i, lugar(p, PAD.x, 0.002, 0));
    mouses.setMatrixAt(i, lugar(p, PAD.x, 0.018, 0.02));
  });
  for (const m of [teclados, pads, mouses]) {
    m.castShadow = m !== pads;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    raiz.add(m);
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------------------------------------------------------------- o do seu posto
  let ativo = null; // { i, grupo, teclado, mouse, din, apertadas, alvo, pos, clique, ultimo }
  const redesenhar = () => {
    desenharTeclado(ativo.din.ctx, ativo.apertadas);
    ativo.din.tex.needsUpdate = true;
  };

  return {
    // senta num posto (id) ou levanta (null)
    ativar(id) {
      if (ativo?.id === id) return;
      if (ativo) {
        teclados.setMatrixAt(ativo.i, lugar(lista[ativo.i], 0, TECLADO.h / 2, 0));
        mouses.setMatrixAt(ativo.i, lugar(lista[ativo.i], PAD.x, 0.018, 0.02));
        teclados.instanceMatrix.needsUpdate = true;
        mouses.instanceMatrix.needsUpdate = true;
        ativo.grupo.removeFromParent();
        ativo.din.tex.dispose();
        ativo.matTopo.dispose();
        ativo = null;
      }
      const i = lista.findIndex((p) => p.id === id);
      if (i === -1) return;
      // a instância some e entra um teclado/mouse "de verdade" no mesmo lugar
      teclados.setMatrixAt(i, zero);
      mouses.setMatrixAt(i, zero);
      teclados.instanceMatrix.needsUpdate = true;
      mouses.instanceMatrix.needsUpdate = true;
      const grupo = new THREE.Group();
      grupo.position.set(...lista[i].mesa.pos);
      grupo.rotation.y = lista[i].mesa.rotY;
      const din = texturaDoTeclado();
      const matTopo = new THREE.MeshStandardMaterial({ map: din.tex, roughness: 0.6 });
      const teclado = new THREE.Mesh(geoTeclado, [corpo, corpo, matTopo, corpo, corpo, corpo]);
      teclado.position.y = TECLADO.h / 2;
      const mouse = new THREE.Mesh(geoMouse, matMouse);
      mouse.position.set(PAD.x, 0.018, 0.02);
      for (const m of [teclado, mouse]) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      grupo.add(teclado, mouse);
      raiz.add(grupo);
      ativo = { id, i, grupo, mouse, din, matTopo, apertadas: new Set(), alvo: new THREE.Vector2(), pos: new THREE.Vector2(), clique: 0, soltas: new Map() };
      redesenhar();
    },

    // tecla (code do KeyboardEvent). code null: uma letra qualquer (campo de senha não diz qual)
    tecla(code, desceu) {
      if (!ativo) return;
      let c = APELIDO[code] || code;
      if (c == null) {
        if (!desceu) return;
        c = LETRAS[Math.floor(Math.random() * LETRAS.length)];
        ativo.soltas.set(c, performance.now() + 110); // sobe sozinha
      }
      if (!TECLAS.has(c)) return;
      if (desceu === ativo.apertadas.has(c)) return;
      if (desceu) ativo.apertadas.add(c);
      else ativo.apertadas.delete(c);
      redesenhar();
    },

    // mouse: o movimento da tela vira movimento no mouse pad (e volta devagar para o meio)
    mouse(dx, dy) {
      if (!ativo) return;
      const k = 0.00022;
      ativo.alvo.x = THREE.MathUtils.clamp(ativo.alvo.x + dx * k, -PAD.w / 2 + 0.04, PAD.w / 2 - 0.04);
      ativo.alvo.y = THREE.MathUtils.clamp(ativo.alvo.y + dy * k, -PAD.d / 2 + 0.05, PAD.d / 2 - 0.05);
    },

    clique(desceu) {
      if (ativo) ativo.clique = desceu ? 1 : 0;
    },

    soltarTudo() {
      if (!ativo || !ativo.apertadas.size) return;
      ativo.apertadas.clear();
      redesenhar();
    },

    update(dt) {
      if (!ativo) return;
      const a = ativo;
      // tecla de senha (qualquer uma) sobe sozinha
      if (a.soltas.size) {
        const agora = performance.now();
        for (const [c, ate] of a.soltas) {
          if (agora < ate) continue;
          a.soltas.delete(c);
          a.apertadas.delete(c);
          redesenhar();
        }
      }
      a.alvo.multiplyScalar(Math.exp(-dt * 0.8)); // sem mexer, o mouse volta para o meio do pad
      a.pos.lerp(a.alvo, 1 - Math.exp(-dt * 18));
      a.mouse.position.set(PAD.x + a.pos.x, 0.018 - a.clique * 0.003, 0.02 + a.pos.y);
      a.mouse.rotation.y = -a.pos.x * 1.2;
    },
  };
}
