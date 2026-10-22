// O céu da sala: sempre meio da tarde, com sol e céu limpo, nas cores do tema do mapa (temas3d.js).
// Aqui só se acertam as cores do céu, das nuvens, da névoa e as luzes (sol e hemisfério); o sol
// acompanha quem está jogando (World.focarSol move o alvo dele), então a posição é refeita a cada quadro.
import * as THREE from 'three';
import { TEMA, SOL_DA_TARDE } from './temas3d.js';

const CEU = TEMA.ceu.map((c) => new THREE.Color(c));
const BRANCO = new THREE.Color('#ffffff');
const SOL = new THREE.Vector3(...SOL_DA_TARDE).normalize();
// a luz da tarde puxa para o dourado (a cor do tema é a do meio-dia)
const DOURADO = new THREE.Color('#ffc98a');

export class Clima {
  constructor(world) {
    this.world = world;
    this.pronto = false;
  }

  // cores e forças são fixas: entram uma vez (o céu e as nuvens nascem com a natureza, depois do World)
  aplicar() {
    const w = this.world;
    const ceu = w.natureza?.ceu;
    if (!ceu) return;
    const u = ceu.mat.uniforms;
    u.topo.value.copy(CEU[0]);
    u.meio.value.copy(CEU[1]);
    u.horizonte.value.copy(CEU[2]);
    u.base.value.copy(CEU[3]);
    u.brilho.value.copy(CEU[4]);
    u.solDir.value.copy(SOL);
    u.disco.value.setRGB(1.6, 1.58, 1.46);
    ceu.estrelasMat.uniforms.visivel.value = 0;
    ceu.estrelas.visible = false;
    if (ceu.nuvensMat) {
      ceu.nuvensMat.color.set(TEMA.nuvens);
      ceu.nuvensMat.emissive.set('#8a96a8');
      ceu.nuvensMat.emissiveIntensity = 0.55;
    }
    if (w.sun) {
      w.sun.color.set(TEMA.sol.cor).lerp(DOURADO, 0.4);
      // mais forte que o do meio-dia: fora, a luz do hemisfério fica menor (World.acertarLuzFora)
      w.sun.intensity = TEMA.sol.forca * 1.3;
      w.sunOffset.copy(SOL).multiplyScalar(66);
    }
    if (w.hemi) {
      w.hemi.color.copy(CEU[1]).lerp(BRANCO, 0.45);
      w.hemi.groundColor.set(TEMA.hemi.chao);
      w.hemi.intensity = TEMA.hemi.forca;
      w.hemiBase = TEMA.hemi.forca; // fora, com a luz do céu, o World diminui (acertarLuzFora)
    }
    w.renderer.toneMappingExposure = TEMA.exposicao;
    const fog = w.scene.fog;
    if (fog) {
      fog.color.set(TEMA.nevoa.cor);
      // perto/longe passam pela distância de visão dos Ajustes (World.aplicarNevoa)
      // começa mais perto que a do tema: a serra e o fundo da mata ficam azulados pela distância
      w.nevoaBase = { perto: TEMA.nevoa.perto * 0.4, longe: TEMA.nevoa.longe * 0.85 };
      w.aplicarNevoa();
    }
    this.pronto = true;
  }

  update() {
    if (!this.pronto) this.aplicar();
    const sun = this.world.sun;
    if (sun) sun.position.copy(sun.target.position).add(this.world.sunOffset);
  }
}
