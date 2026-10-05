// Mantém só as animações que o jogo usa e descarta o resto.
//
//   npm i --prefix ../gt @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
//   NODE_PATH=../gt/node_modules node scripts/podar-modelo.js Knight Skeleton_Mage:esqueleto-mago
//
// (o npx -p não deixa o require achar os pacotes: instale numa pasta fora do projeto e
// aponte o NODE_PATH para ela.)
//
// Lê de models-brutos/<nome>.glb e grava public/models/<nome>.min.glb — ou, com
// "<nome>:<saida>", grava public/models/<saida>.glb.
// Os personagens do KayKit trazem 76 clipes; o jogo usa 7. Sem podar, cada um
// pesa 3,5 MB — e isso é baixado pelo celular de quem escolhe o personagem.
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { prune, dedup, resample, sparse, meshopt } = require('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');

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
  await MeshoptDecoder.ready; // para reler um .glb que já foi comprimido
  const io = new NodeIO().registerExtensions(require('@gltf-transform/extensions').ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  for (const arg of process.argv.slice(2)) {
    const [nome, destino] = arg.split(':');
    const entrada = path.join(__dirname, '..', 'models-brutos', nome + '.glb');
    const saida = path.join(__dirname, '..', 'public', 'models', destino ? destino + '.glb' : nome + '.min.glb');
    const antes = fs.statSync(entrada).size;

    const doc = await io.read(entrada);
    const raiz = doc.getRoot();
    const todas = raiz.listAnimations();
    let removidas = 0;
    for (const a of todas) {
      if (MANTER.includes(a.getName())) continue;
      // apagar só a animação deixa os samplers (e os dados deles) para trás, órfãos: o
      // arquivo podado ficava com 10 mil accessors e 2 MB em vez de ~400 KB
      for (const c of a.listChannels()) c.dispose();
      for (const sp of a.listSamplers()) {
        const dados = [sp.getInput(), sp.getOutput()];
        sp.dispose();
        for (const d of dados) if (d && !d.listParents().some((p) => p.propertyType !== 'Root')) d.dispose();
      }
      a.dispose();
      removidas++;
    }
    // sobra de podas antigas: accessor que ninguém usa
    for (const d of raiz.listAccessors()) if (!d.listParents().some((p) => p.propertyType !== 'Root')) d.dispose();
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
