// Mantém só as animações que o jogo usa e descarta o resto.
//
//   npx -y -p @gltf-transform/core -p @gltf-transform/functions //       -p @gltf-transform/extensions -p meshoptimizer //       node scripts/podar-modelo.js Knight Barbarian
//
// Lê de models-brutos/<nome>.glb e grava public/models/<nome>.min.glb.
// Os personagens do KayKit trazem 76 clipes; o jogo usa 7. Sem podar, cada um
// pesa 3,5 MB — e isso é baixado pelo celular de quem escolhe o personagem.
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { prune, dedup, resample, sparse, meshopt } = require('@gltf-transform/functions');
const { MeshoptEncoder } = require('meshoptimizer');

const MANTER = [
  'Unarmed_Idle',
  'Walking_A',
  'Running_A',
  'Jump_Idle',
  'Jump_Full_Short',
  'Sit_Chair_Idle',
  'Unarmed_Melee_Attack_Punch_A',
  'Cheer',
];

(async () => {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(require('@gltf-transform/extensions').ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  for (const nome of process.argv.slice(2)) {
    const entrada = path.join(__dirname, '..', 'models-brutos', nome + '.glb');
    const saida = path.join(__dirname, '..', 'public', 'models', nome + '.min.glb');
    const antes = fs.statSync(entrada).size;

    const doc = await io.read(entrada);
    const raiz = doc.getRoot();
    const todas = raiz.listAnimations();
    let removidas = 0;
    for (const a of todas) {
      if (MANTER.includes(a.getName())) continue;
      a.dispose();
      removidas++;
    }
    // resample tira keyframes redundantes (sequências que repetem o mesmo valor);
    // é o que realmente encolhe animação exportada quadro a quadro.
    // meshopt comprime malha E animação; o three.js tem o decodificador pronto
    await doc.transform(dedup(), resample(), prune(), sparse(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(saida, doc);

    const depois = fs.statSync(saida).size;
    const ficaram = doc.getRoot().listAnimations().map((a) => a.getName());
    console.log(
      nome.padEnd(11),
      Math.round(antes / 1024) + ' KB -> ' + Math.round(depois / 1024) + ' KB',
      '(-' + Math.round((1 - depois / antes) * 100) + '%)',
      '| removidas ' + removidas + ', ficaram: ' + ficaram.join(', '),
    );
  }
})().catch((e) => { console.error('falha:', e.message); process.exit(1); });
