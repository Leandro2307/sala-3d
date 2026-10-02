# Personagens em 3D

Coloque aqui arquivos **`.glb`** e registre-os em `public/js/modelo.js`, dentro de
`PERSONAGENS`:

```js
export const PERSONAGENS = {
  padrao: { id: 'padrao', label: 'Boneco', url: null },
  leao: {
    id: 'leao',
    label: 'Leão alado',
    url: '/models/leao.glb',
    altura: 1.8,          // o sistema redimensiona sozinho para esta altura
    giro: 0,              // radianos, se o modelo não nascer virado para +Z
    credito: 'iRahulRajput (CC BY) — sketchfab.com/...',
  },
};
```

O sistema já cuida de: **escalar** para a altura certa, **assentar os pés em y=0**,
centralizar em x/z, ligar as animações aos estados do jogo e **misturar** uma na
outra na troca.


## Personagens que já vêm no jogo

| Personagem | Origem | Licença | Arquivo |
|---|---|---|---|
| Robô | Tomás Laulhé (Quaternius), ajustes de Don McCurdy | CC0 | `robo.glb` (453 KB) |
| Cavaleiro, Bárbaro, Mago, Ladino | KayKit Adventurers, de Kay Lousberg | CC0 | ~2 MB cada |
| Optimus, Solus Prime | OrangeSauceu, a partir de *Transformers: Earth Wars* | marcado CC BY pelo autor do envio | 706 KB / 1,1 MB |

Os dois últimos trazem a animação de **transformar em veículo** — é o que faz o
`G` virar o personagem de verdade, em vez de trocar pelo carro desenhado em
código. Em compensação não têm ciclo de andar: deslizam ao caminhar.

> Atenção sobre os Transformers: as tags do arquivo original indicam que são
> assets do jogo *Transformers: Earth Wars*. Optimus Prime é da Hasbro, e quem
> publicou o modelo não detém esse direito — a marcação "CC BY" dele não vale
> sobre o personagem. Ficam aqui por escolha do dono do projeto; se a página for
> divulgada, o risco prático é uma notificação de remoção.

Os quatro do KayKit vêm com 76 animações; o jogo usa 7. Foram podados com
`@gltf-transform` (remover os clipes extras + `meshopt`), o que cortou **74%**
do tamanho — e o servidor ainda serve tudo com gzip.

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

## Como transformar um modelo parado em animado

A maioria dos modelos de banco (inclusive os gerados por IA) **não tem rig**.
O caminho usual é o [Mixamo](https://www.mixamo.com) — grátis, da Adobe:

1. Envie o modelo (`.fbx` ou `.obj`) em **Upload Character**.
2. O auto-rigger marca queixo, pulsos, cotovelos e joelhos. Funciona bem com
   **humanoides bípedes**; quadrúpedes ele não rigga.
3. Baixe uma animação de cada estado (Idle, Walking, Running, Jump) em **FBX**.
4. Junte tudo num `.glb` com animações (Blender: importe os FBX, renomeie as
   *actions* para `Idle`/`Walk`/`Run`/`Jump`, exporte em glTF marcando
   **Animation → Export all armature actions**).

## Orçamento de peso

A sala inteira hoje baixa cerca de **1 MB por visitante**, e precisa rodar em
celular. Para o jogo continuar fluido:

| | Limite recomendado |
|---|---|
| Triângulos | até ~30.000 por personagem |
| Arquivo `.glb` | até ~5 MB (com as texturas dentro) |
| Texturas | 1024 px costuma bastar |

Modelos de vitrine passam fácil de 250.000 triângulos — isso derruba o celular e
estoura a banda. Vale reduzir no Blender (*Decimate*) antes de usar.

## Direitos

Confira a licença de cada modelo. **CC BY** exige crédito ao autor — use o campo
`credito` e mantenha o nome visível. Personagens de jogos e filmes continuam
pertencendo a quem os criou, mesmo quando alguém publica um modelo deles num
banco gratuito: quem fez o upload não detém esse direito.
