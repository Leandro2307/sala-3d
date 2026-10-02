// Ringue de luta, no chão embaixo do parkour. Quem está em cima do tablado pode socar;
// cada soco empurra o outro, e quem cai do ringue (ou zera a vida) leva um nocaute.

export const RING = {
  x: 0,
  z: 20,
  size: 15, // lado do tablado
  matTop: 1.0, // altura do piso do ringue
  matThickness: 1.0,
  postHeight: 2.9,
  postRadius: 0.16,
  ropes: [0.75, 1.4, 2.05], // alturas das cordas, a partir do tablado
  colors: {
    mat: 0x1e2435,
    matLine: 0xf43f5e,
    post: 0xf43f5e,
    rope: 0xfbbf24,
    skirt: 0x0f1320,
  },
};

export const COMBAT = {
  maxHealth: 100,
  damage: 13,
  reach: 2.4, // alcance do soco em metros
  arc: 0.45, // cosseno do ângulo: só acerta quem está razoavelmente à frente
  cooldown: 0.42, // segundos entre socos
  knockback: 14, // empurrão horizontal na vítima
  lift: 5.2, // componente para cima do empurrão
  koKnockback: 20,
  koLift: 9,
  regenDelay: 5, // segundos sem apanhar antes de começar a recuperar
  regenRate: 9, // vida por segundo
  respawnDelay: 2.2, // segundos nocauteado antes de voltar
  creditoRingOut: 7, // segundos: cair do ringue depois de apanhar ainda conta para quem bateu
  // arma (só para quem escolheu a camiseta 22 — o servidor confere de novo)
  danoTiro: 22,
  empurraoTiro: 6,
  cadenciaTiro: 0.3, // segundos entre tiros
  alcanceTiro: 80,
};

// Cantos do ringue, para nascer/renascer sem cair em cima de alguém.
export function ringCorners() {
  // bem para dentro: nascer colado no canto deixava o poste na frente da câmera
  const h = RING.size / 2 - 4.2;
  return [
    [RING.x - h, RING.matTop, RING.z - h],
    [RING.x + h, RING.matTop, RING.z - h],
    [RING.x - h, RING.matTop, RING.z + h],
    [RING.x + h, RING.matTop, RING.z + h],
  ];
}

// Está em cima do tablado? (usado para liberar o soco e para detectar queda)
export function insideRing(pos, margin = 0) {
  const h = RING.size / 2 + margin;
  return Math.abs(pos.x - RING.x) <= h && Math.abs(pos.z - RING.z) <= h && pos.y >= RING.matTop - 0.6;
}
