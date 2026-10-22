# Personagens em 3D

Coloque aqui arquivos **`.glb`** e registre-os em `public/js/personagens.js`, dentro de
`PERSONAGENS` (o servidor lê a mesma lista para saber quais ids aceitar):

```js
export const PERSONAGENS = {
  padrao: { id: 'padrao', label: 'Boneco', url: null },
  leao: {
    id: 'leao',
    label: 'Leão alado',
    url: '/models/leao.glb',
    altura: 1.8,          // o sistema redimensiona sozinho para esta altura
    giro: 0,              // radianos, se o modelo não nascer virado para +Z
    resumo: 'Voa e cospe fogo',  // aparece no modal de escolha
    credito: 'iRahulRajput (CC BY) — sketchfab.com/...',
  },
};
```

Depois gere a miniatura do modal de escolha (com a sala rodando em `localhost:3000`):

```
node scripts/miniaturas.js leao
```

Ela vai para `public/img/personagens/leao.webp`. Sem ela o modal mostra o espaço vazio.

O sistema já cuida de: **escalar** para a altura certa, **assentar os pés em y=0**,
centralizar em x/z, ligar as animações aos estados do jogo e **misturar** uma na
outra na troca.


## Personagens que já vêm no jogo

| Personagem | Origem | Licença | Arquivo |
|---|---|---|---|
| Atos | Gerado no Blender por `scripts/modelar-atos.py` | do projeto | `atos.glb` (273 KB) |
| Atos clássico | Gerado no Blender por `scripts/modelar-atos-classico.py` | do projeto | `atos-classico.glb` (181 KB) |
| Robô | Tomás Laulhé (Quaternius), ajustes de Don McCurdy | CC0 | `robo.glb` (453 KB) |
| Cavaleiro, Bárbaro, Mago, Ladino, Encapuzado | KayKit Adventurers, de Kay Lousberg | CC0 | ~400 KB cada |
| Esqueleto, Esqueleto Guerreiro, Esqueleto Ladino, Esqueleto Mago | KayKit Skeletons, de Kay Lousberg | CC0 | ~400 KB cada |
| Optimus, Solus Prime | OrangeSauceu, a partir de *Transformers: Earth Wars* | marcado CC BY pelo autor do envio | 779 KB / 1,2 MB |
| Bumblebee | Pipogame (@joseclaudio162001), a partir de *Transformers Alliance* | marcado CC BY pelo autor do envio | `bumblebee.glb` (1,1 MB) |
| Jazz, Ratchet, Brawn | orangesauceu, a partir de *Transformers Alliance* | marcado CC BY pelo autor do envio | 1,1 / 1,1 / 1,2 MB |

O Atos não vem de pacote: o script modela a bola, monta o esqueleto, anima os 7
clipes e exporta já com meshopt. Ele é a logo virada bola: visto de frente, a
bola mostra a logo exata (pupila, íris, o anel e as duas fendas em espiral), e as
fendas saem pelas laterais e se juntam numa costura fina nas costas. A curvinha de
baixo à direita vira uma escama em relevo na lateral, com o dobro da altura da logo
(do tamanho exato ela sumia entre a mão e o pé). As medidas da logo, todas arcos de
círculo, ficam no começo do script. O Atos clássico, a bolinha de olhos de pílula
que veio antes, continua no catálogo, com o script dele e a mesma curvinha. Ele não tem perna nem
pé: anda e corre flutuando em ondas, como fantasma, do chão até o alto e de volta. A altura da onda
é do jogo (`flutua` no cadastro, `flutuar()` no `modelo.js`), para começar e parar de andar sem
pulo; o clipe só inclina o corpo e arrasta as mãos no mesmo compasso. Para mudar cor, tamanho
ou movimento, edite o script, rode a linha do cabeçalho dele, gere a miniatura de
novo (`node scripts/miniaturas.js atos`) e suba `versao` no cadastro: o navegador
guarda `/models` e `/img` por um dia sem perguntar ao servidor, e sem o número
novo no endereço quem já abriu a sala continua vendo o modelo antigo.

Optimus e Solus trazem a animação de **transformar em veículo** — é o que faz o
`G` virar o personagem de verdade, em vez de trocar pelo carro desenhado em
código. Em compensação vieram sem ciclo de andar. `Walk`, `Run` e `Jump` (e o
`Idle` do Optimus, que só tinha a transformação) são gerados por
`scripts/animar-transformers.js` e gravados dentro dos próprios `.glb`: pernas por
IK com o pé plantado no chão, pé rolando do calcanhar para a ponta, quadril e
peito girando ao contrário, braços balançando. Para mexer no passo, mude os
números no começo do script, rode a linha do cabeçalho dele e suba `versao` no
cadastro.

Bumblebee (Camaro), Jazz (esportivo), Ratchet (ambulância) e Brawn (jipe) vêm do
*Transformers Alliance*, baixados do Sketchfab
([Bumblebee](https://sketchfab.com/3d-models/tf-alliance-bumblebee-rotf-0dca36328e2d47fd9fcfd650237ed371),
[Jazz](https://sketchfab.com/3d-models/f639ce3ae0784f6f82be9ea06377fba0),
[Ratchet](https://sketchfab.com/3d-models/3937ded1c06241f48e47e7383262e2a3),
[Brawn](https://sketchfab.com/3d-models/9de7d8f9dd2a4c68963c4391400dce1f)): o
`.glb` do botão de download vai para `models-brutos/` com o nome que está em
`MODELOS` no script. Trazem o transformar e golpes, mas não
andam, e o parado e os golpes ficam **de lado** (lá a luta é vista de lado: o robô
olha para -x, o carro para +z). São dois passos (`models-brutos/` fica fora do git):

1. `scripts/preparar-alliance.js` tira o prefixo dos clipes, fica só com
   `transform_v` (vira carro), `transform_r` (volta a robô) e o de comemorar (o
   aceno); tira o plano de sombra, as armas (o jogo põe a dele) e o símbolo dos
   Decepticons, que fica por cima do dos Autobots; e **vira os clipes de frente**
   girando o `_rootJoint`. Na transformação o giro acompanha o clipe: o robô vai
   virando para a frente enquanto vira carro, e o carro termina como já estava.
   Texturas em webp de 1024 px e meshopt: de 5–10 MB para ~1 MB.
2. `scripts/animar-transformers.js bumblebee jazz ratchet brawn` grava `Idle`
   (de pé e de frente), `Walk`, `Run`, `Jump` e `Punch` (direto de direita, da
   guarda), com o mesmo IK do Optimus, achando os ossos do Biped do 3ds Max
   (`Bip001 …`). Em Jazz, Ratchet e Brawn a base é o repouso do arquivo, que já é
   o robô de pé, de perna reta; no Bumblebee o repouso é o carro, e a base é o
   primeiro quadro do `idle01` (que o script apaga depois).

Rode sempre os dois, nessa ordem: o segundo sozinho não acha mais o `idle01` do
Bumblebee. O Bumblebee só traz a ida (`transform_v`): a volta a robô é ela de trás
para frente (`voltaAoContrario` no cadastro, ver `transformar()` em `modelo.js`).
Como o repouso dele é o carro, a `altura` do cadastro é a do carro (0,544 deixa o
robô com 2,6 m) e o `raioVista` passa de 4 h; nos outros três o repouso é o robô, e
a `altura` é a dele de pé.

> Atenção sobre os Transformers: as tags dos arquivos originais indicam que são
> assets dos jogos *Transformers: Earth Wars* e *Transformers Alliance*. Os
> personagens são da Hasbro, e quem publicou os modelos não detém esse direito — a
> marcação "CC BY" deles não vale sobre os personagens. Ficam aqui por escolha do
> dono do projeto; se a página for divulgada, o risco prático é uma notificação de
> remoção.

Os do KayKit vêm com 76 a 95 animações; o jogo usa 7. Foram podados com
`@gltf-transform` (remover os clipes extras + `meshopt`): de 3,5–4,7 MB para
**~400 KB** cada — e o servidor ainda serve tudo com gzip. (Até outubro de 2026 eles
tinham 2 MB: a poda apagava a animação mas deixava os dados dela no arquivo.)

O "Sitting" do robô é o movimento de **sentar** (0,4 s), não a pose sentada: no
cadastro ele está em `poses`, que toca uma vez e segura o último quadro. Sem isso
o robô descia e subia sem parar. Sentado, o jogo desce cada modelo até o osso do
quadril encostar no assento — serve para quem senta como no chão e para quem senta
como numa cadeira.

Para repetir a poda em outro pacote, use `scripts/podar-modelo.js` — ele mantém
só os clipes listados, roda `dedup`, `resample`, `prune`, `sparse` e `meshopt`.
As dependências não ficam no projeto; o cabeçalho do script traz a linha `npx`
que as baixa na hora.

O carregador já tem o decodificador meshopt ligado, então `.glb` comprimido
funciona direto.

## O modelo precisa estar rigado E animado

Sem esqueleto e sem animação, o personagem vira uma **estátua deslizando** pelo
chão. Um `.glb` bonito não basta: ele precisa ter os clipes dentro.

Os clipes são encontrados pelo nome, sem diferenciar maiúsculas:

| Estado no jogo | Nomes aceitos no clipe |
|---|---|
| parado | `idle`, `breath`, `stand`, `parado` |
| andando | `walk`, `andar`, `caminh` |
| correndo | `run`, `sprint`, `corr` |
| no ar | `jump`, `fall`, `air`, `pul` |
| sentado | `sit`, `sent` |

Faltou algum? Ele cai no mais parecido (correr vira andar, no ar vira parado), e
o jogo não quebra. Se o arquivo não carregar, o boneco padrão volta sozinho.

### Guerreira: rig 100% procedural

`guerreira.glb` veio de um FBX **sem esqueleto e sem animação** (estátua gerada por IA, malha de
uma ilha só: cabelo, capa e corpo grudados). O pipeline é código, não trabalho manual no Blender:

1. `scripts/rigar-guerreira.py` — separa o cabelo (amarelo ligado ao alto da cabeça) e a capa
   (abaixo do cinto, tudo o que não cabe nos tubos dos membros; o forro nem é azul), monta o
   esqueleto (26 ossos, com `Breast_L/R` e `Cape_L/R`) e pinta os pesos ele mesmo: os automáticos
   do Blender misturavam capa com coxa e o flanco do tronco com o braço. A estátua está num passo
   de passarela com **as pernas cruzadas** (a direita à frente, cruzando para a esquerda; a
   esquerda atrás, na ponta do pé), então as juntas ficam medidas à mão em `JUNTAS`. Onde a
   estátua encosta partes que se movem separadas (braçadeira na capa, cotovelo na cintura,
   dedos na capa), as faces que ligam as duas são cortadas, as lascas que sobram saem e os
   furinhos são tapados.
2. `scripts/animar-guerreira.py` — keyframeia Idle, Walk, Run, Jump, Sit, Punch e Wave (curvas em
   `scripts/guerreira_comum.py`), grava uma folha de quadros de cada clipe para conferir e exporta
   o GLB. Toda pose parte de uma pose neutra (pernas retas, pés lado a lado) e não da estátua; as
   pernas andando, correndo e paradas vão por IK, com o pé no chão. A capa segue 40% do passo da
   coxa do lado.
3. O balanço dos seios não é keyframado: é física em tempo de execução (classe `MolaOsso` em
   `public/js/modelo.js`, ligada pelo campo `molas` do cadastro).

Para refazer: `blender -b --factory-startup --python scripts/rigar-guerreira.py -- <fbx> <pasta-saida>`
e depois `blender -b <pasta-saida>/guerreira.blend --python scripts/animar-guerreira.py -- <blend> public/models/guerreira.glb <pasta-saida>`
(com `so-render` no fim, só as folhas, sem exportar). Suba `versao` no cadastro.
`scripts/testar-guerreira.js` valida no Chrome invisível (sala no ar): clipe por estado,
amplitude do joelho correndo, a mola no pulo e a mola correndo em linha reta (tem de ficar longe
do limite).

## Como transformar um modelo parado em animado

A maioria dos modelos de banco (inclusive os gerados por IA) **não tem rig**.
O caminho usual é o [Mixamo](https://www.mixamo.com) — grátis, da Adobe:

1. Se o modelo passa de ~30.000 triângulos, reduza **antes** (passo 1 do
   Blender, abaixo). Depois de riggado, cortar dá mais trabalho.
2. Envie o modelo em **Upload Character**: um `.fbx`, ou um `.zip` com o `.obj`,
   o `.mtl` e as texturas.
3. O auto-rigger marca queixo, pulsos, cotovelos e joelhos. Funciona bem com
   **humanoides bípedes**; quadrúpedes ele não rigga.
4. Baixe uma animação de cada estado (Idle, Walking, Running, Jump; Sitting e
   Punching são opcionais), **todas do mesmo upload** para os ossos terem os
   mesmos nomes:
   - Format **FBX Binary (.fbx)**, 30 fps;
   - a primeira (Idle) com **Skin: With Skin**, porque é ela que traz a malha;
     as outras com **Without Skin**, que são mais leves;
   - quando a animação tiver a opção **In Place**, marque. Quem move o
     personagem é o jogo. Sem isso ele anda para a frente e volta a cada ciclo.
5. Junte tudo num `.glb` no Blender, conforme o passo a passo abaixo.

## Passo a passo no Blender

As opções de exportação foram conferidas no Blender 5.2 (`winget install
BlenderFoundation.Blender`). Os outros menus valem para 4.x e 5.x, mas podem
mudar um pouco de uma versão para outra.

### 1. Reduzir os triângulos (antes do Mixamo)

1. **File → Import** no formato do modelo.
2. Ligue a contagem: menu **Overlays** (canto superior direito da viewport) →
   **Statistics**.
3. Selecione a malha → aba da chave inglesa (**Modifiers**) → **Add Modifier →
   Generate → Decimate**.
4. Modo **Collapse**. Baixe o **Ratio** (0,3 = sobram 30%) até ficar abaixo de
   30.000 triângulos. Confira rosto e mãos, que são os primeiros a deformar.
   Troque a viewport para **Material Preview** (tecla **Z**) e veja se a
   textura continua no lugar.

   > **Modelo gerado por IA** (image-to-3D, como os do Sketchfab marcados
   > *supavoxel*, Meshy, Tripo…): a textura vem picotada em centenas de pedaços,
   > e o Decimate **embaralha** tudo. Nesse caso faça a redução numa cópia, crie
   > um mapa UV novo nela (**UV → Smart UV Project**) e passe a cor da original
   > para a cópia com **bake** (Cycles, *Selected to Active*).
5. Aplique: setinha do modificador → **Apply** (ou **Ctrl+A** com o mouse em
   cima dele).
6. **File → Export → FBX**. Em **Path Mode** escolha **Copy** e ligue o ícone ao
   lado (**Embed Textures**) para as texturas irem junto. Esse arquivo é o que
   vai para o Mixamo.

### 2. Importar os FBX do Mixamo

1. Comece de uma cena vazia: **File → New → General**, **A** para selecionar
   tudo e **X → Delete** (some o cubo, a câmera e a luz).
2. **File → Import → FBX** → o arquivo **With Skin** (Idle). Entra um
   `Armature` com a malha dentro. Para ver as texturas, troque a viewport para
   **Material Preview** (tecla **Z**).
3. Importe os outros FBX, um por vez. Cada um cria um armature novo, sem malha,
   só com a animação.

O tamanho não importa: o jogo redimensiona pela `altura` do cadastro.

### 3. Dar nome às animações

Cada FBX traz uma *action* chamada `Armature|mixamo.com|Layer0`, que o jogo não
reconhece. Faça isto em cada armature:

1. Clique no armature no **Outliner** (lista de objetos, canto superior direito).
2. Troque o painel de baixo (Timeline) para **Dope Sheet** e, no cabeçalho dele,
   mude o modo para **Action Editor**.
3. Dê dois cliques no nome da action e renomeie para o estado que ela
   representa: `Idle`, `Walk`, `Run`, `Jump` ou `Sit`. Gestos opcionais:
   `Punch` (soco) e `Wave` (aceno).
4. Clique no **escudo** ao lado do nome (**Fake User**). Sem ele, a action é
   descartada quando você apagar o armature extra no passo 4.

Use nomes curtos e únicos. O jogo acha o parado procurando `idle`, `stand`… em
qualquer clipe, então um sentado chamado `Sitting Idle` pode acabar sendo usado
como parado.

### 4. Ficar com um armature só

1. No Outliner, selecione os armatures extras (os que vieram sem malha) e apague
   com **X → Delete**. As actions ficam guardadas por causa do escudo.
2. Selecione o armature que sobrou. No Action Editor, abra a lista de actions
   (ícone à esquerda do nome), escolha cada uma e aperte **Espaço** para ver se
   ela toca no personagem. No Blender 4.4 ou mais novo, se o boneco não se
   mexer, escolha o *slot* no campo ao lado do nome da action. Termine com `Idle`
   escolhida.
3. Aperte **1** no teclado numérico (vista **Front**): o personagem tem que
   estar **olhando para você**, porque essa é a frente que vira +Z no jogo. Se
   estiver de costas ou de lado, é mais simples usar `giro` no cadastro
   (`Math.PI` = meia volta, `Math.PI / 2` = um quarto) do que girar no Blender.

### 5. Exportar o `.glb`

**File → Export → glTF 2.0 (.glb/.gltf)**. Como a cena só tem o personagem, não
precisa selecionar nada. No painel da direita:

| Seção | Opção | Valor |
|---|---|---|
| (topo) | Format | **glTF Binary (.glb)** |
| Transform | +Y Up | ligado (padrão) |
| Data → Mesh | Apply Modifiers | ligado |
| Data → Material | Images | **JPEG** se a textura não tiver transparência (arquivo bem menor); senão, Automatic |
| Data → Draco Compression | caixinha no título | **desligada**: o jogo não tem o decodificador Draco e o modelo não carrega |
| Data → Meshopt Compression | caixinha no título | **ligada**, extensão `EXT_meshopt_compression` (padrão): o jogo lê e a malha encolhe |
| Animation | Animation Mode | **Actions** |
| Animation → Armature | Export all Armature Actions | **ligado** (padrão): sem isso só sai a action escolhida |
| Animation → Rest & Ranges | Limit to Playback Range | **desligado** (padrão): senão as animações são cortadas no tamanho da timeline |

Salve direto em `public/models/`, com nome curto, sem espaço nem acento
(`meuheroi.glb`).

### 6. Conferir antes de cadastrar

1. Arraste o `.glb` para o [glTF Viewer](https://gltf-viewer.donmccurdy.com). No
   painel **Animation** os clipes têm que aparecer como `Idle`, `Walk`… e não
   como `Armature|mixamo.com|Layer0`. Toque cada um.
2. Veja o tamanho do arquivo. O teto é ~5 MB (ver *Orçamento de peso*).
3. Cadastre em `PERSONAGENS` (exemplo no topo) e abra a sala.

### 7. Comprimir mais (opcional)

O Meshopt da exportação só comprime a malha. Se o arquivo ainda passar do teto,
`scripts/podar-modelo.js` também enxuga as animações (`resample` + `meshopt`).
Ele lê de `models-brutos/<nome>.glb` e grava `public/models/<nome>.min.glb` (ou, com
`<nome>:<saida>`, `public/models/<saida>.glb`). Instruções de instalação no
cabeçalho do script.

**Atenção:** ele mantém **só** os clipes da lista `MANTER`, que hoje tem os
nomes do KayKit. Coloque lá os seus (`Idle`, `Walk`…) antes de rodar, senão ele
apaga todas as animações.

### Quando dá errado

| Sintoma | Causa provável |
|---|---|
| Aparece o boneco padrão | o arquivo não carregou: `url` errada, ou exportado com Draco |
| Estátua deslizando (em T ou parado) | o `.glb` saiu sem animação: confira o glTF Viewer |
| Só uma animação funciona | as outras perderam o escudo (Fake User) e foram descartadas, ou *Export all Armature Actions* estava desligado |
| Uma animação não mexe o boneco | foi baixada de outro upload no Mixamo e os ossos têm outros nomes |
| Anda e volta para trás a cada passo | animação baixada sem **In Place** |
| De costas ou de lado | ajuste `giro` no cadastro |

## Orçamento de peso

A sala inteira hoje baixa cerca de **1 MB por visitante**, e precisa rodar em
celular. Para o jogo continuar fluido:

| | Limite recomendado |
|---|---|
| Triângulos | até ~30.000 por personagem |
| Arquivo `.glb` | até ~5 MB (com as texturas dentro) |
| Texturas | 1024 px costuma bastar |

Modelos de vitrine passam fácil de 250.000 triângulos — isso derruba o celular e
estoura a banda. Reduza no Blender antes de usar (passo 1 do Blender, acima).

## Direitos

Confira a licença de cada modelo. **CC BY** exige crédito ao autor — use o campo
`credito` e mantenha o nome visível. Personagens de jogos e filmes continuam
pertencendo a quem os criou, mesmo quando alguém publica um modelo deles num
banco gratuito: quem fez o upload não detém esse direito.

## Armas

`armas/*.glb` vêm do **Ultimate Guns Pack** de [Quaternius](https://quaternius.com)
(baixados do [poly.pizza](https://poly.pizza/bundle/Ultimate-Guns-Pack-cpgUfI4t2F)), em domínio
público (CC0). As medidas de cada uma (empunhadura, boca do cano, janela de ejeção) e os números
de jogo (cadência, dano, alcance) ficam em `public/js/armas-dados.js`; coice, clarão, cápsulas e
a visão em 1ª pessoa, em `public/js/armas.js`.

## Monstro do Caça-Fantasmas

`fantasmas/dama.glb` é o monstro do Caça-Fantasmas (`public/js/fantasmas*.js`): a
["Ghost Lady v2 (WIP)"](https://sketchfab.com/3d-models/ghost-lady-v2-wip-a453a33fb311400d9dda4b113d59b7bc),
de **Loves_Art**, licença **CC BY 4.0** (o crédito aparece na tela de entrada do jogo). Os 12 tipos
aparecem como ela, como no Phasmophobia: a cara não entrega o tipo, só as provas (`DAMA` em
`fantasmas-dados.js`). O jogo troca o material dela pelo assombrado (`materialAssombrado` em
`fantasmas-3d.js`): mais escuro, com uma borda fria que acende na caçada.

O `.glb` do botão de download (160 MB, 102 mil triângulos, texturas de 4096 px e só o clipe de andar)
vai para `models-brutos/ghost-lady.glb`, e `scripts/preparar-dama.js` grava o do jogo (~600 KB,
20 mil triângulos, texturas de 1024 px):

- o vestido, o véu e o cabelo vinham sem esqueleto, como uma simulação de pano gravada quadro a
  quadro que só servia para aquele andar; o script liga cada ponto deles ao esqueleto do corpo. A
  manga é de morcego (costurada na lateral do corpete até a cintura): do braço até essa costura ela
  passa aos poucos do braço para o tronco, senão o braço erguido puxava uma tira de pano. A saia
  segue as duas coxas e o quadril juntos, e não abre como calça;
- saem os olhos e os cílios (o rosto fica sob o cabelo) e o pedaço do corpo que o vestido cobre;
- o andar do arquivo fica com o passo menor (`PASSO`), e o script faz o parado (curvada, a cabeça
  tombada, com um tranco de vez em quando), a corrida da caçada (curvada, os braços esticados para
  pegar) e o ataque do susto (os braços sobem para agarrar o rosto de quem está na frente).

Para mexer: mude os números no script, rode a linha do cabeçalho dele e suba o `?v=` de
`MODELO_URL` em `fantasmas-dados.js`. Com `DEPURAR=1 SAIDA=<arquivo>` ele grava uma cópia com o
vestido pintado por região (braços, tronco, pernas), para conferir num visor.

Até outubro de 2026 eram 12 monstros de desenho animado de Quaternius (poly.pizza), um por tipo;
estão no histórico do git.
