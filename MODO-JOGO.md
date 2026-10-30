# Modo jogo a 1080p60: onde estamos

Para o próximo Claude que pegar isto. Objetivo do usuário: jogar no PC do amigo (controle remoto pelo
modo jogo) com a tela chegando em **Full HD a 60 qps**, **sem instalar nada além da extensão**.

## O que já está no ar (commit f5fcc81)

- **Quem compartilha fica leve** (`public/js/main.js`, bloco "modo jogo" perto de `receberDireto`):
  quando quem controla liga o modo jogo, chega `{t:'modo', jogo:true}` → `controle.onModo`
  (`public/js/controle.js`, em `receber`) → `jogoAqui()`. Com `jogoNoMeuPc()` verdadeiro,
  `mundoVisivel()` dá falso (o 3D não é desenhado, teto de 12 qps) e `nivelDaTela`/`nivelDaCam` dão
  `'off'` (as telas e webcams dos outros param de chegar). O aviso tem "Desenhar a sala" para voltar.
- **Banda de jogo** (`public/js/rtc.js`): `SHARE_PRESETS[*].jogoBitrate` (Leve 9, Máxima 20, Ultra
  30 Mbps), aplicada em `envioPara` quando a tela está em `rtc.jogoTelas` (`rtc.modoJogo(key, on)`).
- **Menos atraso para quem joga**: `rtc.baixaLatencia(stream, on)` põe `jitterBufferTarget = 0` (e
  `playoutDelayHint = 0` no vídeo) nos receptores da tela; chamado em `jogoLa()` a partir de
  `controle.onJogo`.
- **Relatório** (`public/js/jogo-diag.js`, classe `DiagJogo`): a cada 2 s (`amostrarJogo` no
  main.js) lê `rtc.diagEnvio(key)` / `rtc.diagRecebe(trilha)` e calcula captura → codificado →
  enviado → recebido → decodificado → na tela (requestVideoFrameCallback), kbps, ms por quadro,
  `qualityLimitation`, codificador, perdas, RTT, caminho. Quem compartilha manda o resumo para quem
  joga por `controle-volta` `{t:'jogo-envio'}` (servidor: `voltaDoControle` no `server.js`). Abaixo
  de 50 qps por 6 s: aviso com o motivo e "Baixar relatório". Ao desligar o modo jogo: aviso com
  "Baixar relatório" (`modo-jogo-compartilha-*.json` / `modo-jogo-joga-*.json`). Console:
  linhas `[modo-jogo]`, `sala.relatorioJogo()` copia, `sala.baixarRelatorioJogo()` baixa; com
  `?debug=1`, `__sala3d.diagJogo`.

Testado com duas abas no Playwright (cópia na porta 3100): tudo flui de ponta a ponta. Nunca testado
com o jogo de verdade por mim — os relatórios abaixo são do usuário.

## O que os relatórios do usuário mostraram (2026-10-28, God of War 2018, PC de quem compartilha)

PC: 16 threads, **8 GB de RAM**, Chrome 156, `gpu: Intel UHD Graphics (0xA7A8)` (provável notebook
Raptor Lake), Wi-Fi, extensão 1.14.0, preset Máxima, superfície `window`.
Codec escolhido: **VP9** na placa Intel (`MediaFoundationVideoEncodeAccelerator (Intel® Hardware VP9
Encoder MFT)`), não H.264.

| Captura | Captura (qps) | Codificador | ms/quadro | Enviado (qps) |
|---|---|---|---|---|
| janela 1920×1032 | 25–32 | Intel VP9 na placa | 14–20 | ~29 |
| tela cheia 1918×1080 | 11–15 | **libvpx (software!)** | 45–58 | ~13 |
| janela 926×562 | 54–58 | Intel VP9 na placa | ~5 | **~56** |

Conclusões:
- **Não é a sala** (desenha: false, aba escondida o tempo todo) **nem a internet** (limitação
  `none` 100%, sem perda, chegou a 20 Mbps; estimativa de saída até ~49 Mbps).
- **É a quantidade de pixels na captura/codificação pela placa Intel.** O codificado acompanha a
  captura, e a captura cai junto com o tamanho: 2 MP → ~30 qps, 0,5 MP → ~57 qps. Suspeita: o
  capturador do Chrome segura quadros quando o codificador (17 ms/quadro em 1080p) ainda não
  devolveu o anterior.
- **Tela cheia exclusiva derruba para o codificador em software** (1918×1080 — largura estranha,
  talvez o MFT da Intel recuse e o Chrome caia no libvpx). Sempre janela sem bordas.
- O Chrome continua na Intel (`chrome://gpu`: `GL_RENDERER ANGLE (Intel, Intel(R) UHD Graphics
  (0x0000A7A8) ... D3D11-32.0.101.5972)`). **Ainda não sabemos se o PC tem placa dedicada**
  (pedi para olhar Gerenciador de Tarefas → Desempenho → GPU 1). God of War liso a 60 numa UHD é
  improvável: deve ter NVIDIA/AMD com a tela ligada na Intel (Optimus).

## Segundo relatório (2026-10-28 21:54, outro PC: RTX 3060 Ti, 16 GB, quem joga num celular no mesmo Wi-Fi)

- Janela de 926×562, captura ~32 qps (não sabemos a quantos qps o jogo rodava), codificador
  **OpenH264** (processador), RTT de 6 ms (`host/udp wifi`).
- **O problema era a banda**: limitação `bandwidth` 100%, estimativa de saída de 0,2 a 1,8 Mbps
  com teto de 20 Mbps. A tela saiu em **345×210 → 693×420**. Perdas de 2–7% no Wi-Fi derrubavam a
  estimativa; a fila de envio segurava ~44 ms por pacote. O `x-google-start-bitrate` não ajudou,
  porque a conexão já existia (com a voz) quando a tela entrou.
- O relatório dizia `captura` em tudo: em `motivoEnvio` a captura era testada primeiro.
- No teste local (NVIDIA, Chrome 156) o `encodingInfo` diz `powerEfficient: false` para **todos**
  os codecs e mesmo assim o Chrome codifica na placa (`NVIDIA H.264 Encoder MFT`). O OpenH264 do
  relatório deve vir da imagem minúscula (o libwebrtc passa para o software em resolução baixa),
  e não da escolha do codec. Falta confirmar com um relatório novo.

### O que entrou depois disso

- **Piso de banda para quem joga** (`rtc.js`: `bandaDeJogo`, `atualizarBandaJogo`, `bandaSdp`):
  `rtc.modoJogo(key, on, ids)` renegocia a conexão de quem joga com `x-google-start-bitrate` = 50%
  e `x-google-min-bitrate` = 30% (no máximo 6 Mbps) do `jogoBitrate` (na Máxima: começa em 10, piso de 6).
  `peer.negociar()` é o antigo `onnegotiationneeded`, que agora também é chamado direto
  (`renegociar`, e o vigia tenta de novo enquanto a conexão não estiver `stable`). No teste: de
  ~0,2 a ~10 Mbps em 10 s; o piso sai ao desligar.
- **Ajuste automático** (`ajustarJogo` no main.js): perda > 8% por 6 s → `soltarPisoJogo` (fica
  só o começo alto); imagem < 400 linhas por banda por 6 s → `imagemDeJogo(id, true)` põe
  `balanced`, por pelo menos 30 s, até `limite: none` de novo. Só abaixo de 400 linhas, porque o
  `balanced` desce até 15 qps em 480p.
- **Codec**: `escolherCodec` testa cada perfil de H.264 (High primeiro), AV1 e VP9 e guarda tudo
  em `codecsTestados()` (vai em `ambiente.codecs` e em `cru.codecs` do relatório). `?codec=h264|vp9|av1|vp8`
  força um para medir (testado: `?codec=vp9` sai em libvpx 1080p60).
- **Relatório**: `imagemBaixa` (resolução enviada < 60% da captura para quem está no nível
  máximo) vem antes da captura no motivo e também gera aviso; `filaMs` (espera na fila de
  envio); `bandaJogo`. O resumo para quem joga leva `imagemBaixa` (servidor: `voltaDoControle`).
- **Os dois lados num arquivo só** (relatório `versao: 2`): quem joga manda cada amostra dela
  pelo canal direto do controle (`rtc.mandarControle(dono, { j: { key, r, amb } })` em
  `amostrarJogo`); quem compartilha recebe em `receberDireto` (só de quem joga naquela tela) →
  `diagJogo.doQuemJoga`, e o relatório baixado no PC traz `quemJoga: [{ nome, resumo, ambiente,
  amostras }]`. Do celular não precisa baixar nada. Sem o canal direto aberto a amostra não vai
  (não passa pelo servidor).

## Terceiro relatório (2026-10-28 22:27, os dois lados: RTX 3060 Ti → iPhone no Safari, Minecraft)

- Captura 50–55 qps (melhor), na tela do iPhone média de 46 qps.
- **O piso de banda não segura**: o `x-google-min-bitrate=6000` estava no codec aplicado e a
  estimativa caiu a 0,9–4 Mbps com as perdas do Wi-Fi. O começo alto funcionou (1ª amostra: 10 Mbps).
- **O atraso está no iPhone**: buffer de 250–360 ms. O Safari não tem `jitterBufferTarget`
  (o "buffer mínimo" de `baixaLatencia` não vale lá; Chrome no iPhone é o mesmo WebKit). O buffer
  cresce com as perdas e com os quadros grandes que demoram a passar (fila de envio até 480 ms).
- A resolução pulava (1920 → 1280 → 960 → 1918 → 1437...): cada troca é um quadro-chave enorme.
- Ainda OpenH264. Nesse PC o `encodingInfo` diz H.264 `smooth: false` (no PC de teste, `true`):
  o Chrome dele não oferece o H.264 da NVIDIA. Pedido ao usuário: `chrome://gpu` → "Video
  Acceleration Information" e driver atualizado.
- Bug corrigido: o título da janela de quem joga ia em `ambiente.tela` (agora `janelaDoJogo`).

### O que entrou depois disso

- **Resolução fixa com banda curta** (`rtc.linhasDeJogo`, `ajustarJogo`): estimativa < 5 Mbps por
  4 s → no máximo 720 linhas para quem joga, com `degradationPreference =
  'maintain-framerate-and-resolution'` (só a nitidez cede; com `maintain-framerate` o navegador
  reduzia por cima da escala e 720p virava 360p). Volta à captura inteira com > 9 Mbps por 10 s,
  depois de 30 s fixa. Navegador que não conhece o valor (TypeError no `setParameters`):
  `rtc.semFixa` e fica no `maintain-framerate`. Testado: 720p a 60 qps.

## Por que o OpenH264 (medido no próprio PC do jogo, 2026-10-28)

O PC de desenvolvimento **é** o PC do jogo (RTX 3060 Ti, driver 610.88). `chrome://gpu` lista
H.264 e HEVC na placa até 1920×1080 a 121 qps, e o `encodingInfo` dá `powerEfficient: false` para
tudo (inútil para decidir). Codificando cada perfil numa conexão local (scratchpad
`testar-perfis-canvas.js`):

| Perfil | Codificador |
|---|---|
| H.264 Baseline `42001f`, Main `4d001f`, High `64001f` | NVIDIA H.264 Encoder MFT |
| **H.264 Constrained Baseline `42e01f`** | **OpenH264** |
| H.265 | NVIDIA HEVC Encoder MFT |
| VP9, AV1 | libvpx, libaom |

Chrome com Chrome combina `42001f` (placa). O **Safari só oferece `42e01f` e `640c1f`** (que o
Chrome não tem): com o iPhone, a tela sempre saía no processador.

### O que entrou (só na conexão de quem joga, com o modo jogo ligado)

- `preferirCodecDeJogo`: H.265 primeiro (o Chrome só o lista para enviar quando a placa codifica),
  depois o H.264 dos perfis da placa, o resto de reserva. Chamado por `codecDeJogo(peer)` em
  `atualizarBandaJogo`; ao desligar, `preferirCodec` de sempre.
- `trocarPerfil`: nas seções das telas de quem joga (`midsDeJogo`), o `42e01f` que chega vira
  `42001f` antes do `setRemoteDescription`, e o `42001f` que sai vira `42e01f` no que é mandado.
  O Chrome codifica Baseline na NVIDIA e o outro lado continua vendo o perfil que ofereceu.
- Rede de segurança (`vigiarDecodificacao` no main.js, com as amostras de quem joga): 3 amostras
  seguidas (6 s) sem quadro decodificado → `rtc.codecSeguroJogo(id)`: passo 1 tira o H.265, passo
  2 tira a troca de perfil (como era antes). Evento no relatório; `bandaJogo.recuoCodec`.
- Testado com um "Safari falso" (scratchpad `safari-falso.js`: o Chrome de quem joga só aceita
  `42e01f`, e com `__comH265` também o H.265): antes, OpenH264; com o modo jogo, NVIDIA H.264 a 60
  qps (só `42e01f`) e NVIDIA HEVC a 60 qps (com H.265), decodificando do outro lado. Chrome com
  Chrome: HEVC na placa, 1080p60. Os dois passos atrás também testados.
- **Falta confirmar com o iPhone de verdade**: se o Safari aceita o H.265 no WebRTC e decodifica o
  Baseline da NVIDIA. Se não, a rede de segurança volta em 6 s e o relatório mostra o evento.

## Quarto relatório (2026-10-29 02:35, God of War, RTX 3060 Ti → iPhone no PWA): "mais fluido"

- **A troca de perfil funcionou no iPhone de verdade**: codificador `D3D12VideoEncodeAccelerator`
  (H.264 na NVIDIA) em `42001f`, decodificado no Safari sem recuo. O H.265 não foi combinado (o
  Safari do iPhone não deve oferecer no WebRTC).
- Rede boa: 10–25 Mbps usados, estimativa 26–50 Mbps, quase sem perda. Buffer do iPhone caiu de
  250–360 ms para **55–150 ms**.
- **Gargalo 1: captura ~32 qps em 1920×1032** (numa janela de 948×688, ~55). Não dá para separar
  captura de jogo pelos números (janela menor também faz o jogo renderizar menos).
- **Gargalo 2: o iPhone mostra no máximo ~30 qps**: no fim decodificava 54 e a tela (rVFC) mostrava
  21–30. Provável Modo de Pouca Energia (o WebKit limita a 30 qps).
- A tela fixou em 720p logo no começo (estimativa ainda em 1,5 Mbps subindo) e ficou 30 s à toa.

### O que entrou depois disso

- `ajustarCaptura` (main.js) + `rtc.capturaDeJogo(key, linhas)`: captura < 45 qps em ≥ 900 linhas,
  sem limite de banda, por 6 s → `applyConstraints` para 720p; nas 3 amostras seguintes (a 1ª não
  conta) subiu ≥ 8 qps → fica, senão volta ao preset e não tenta de novo. Eventos "captura em 720p
  ajudou/não ajudou" respondem se o limite é a captura ou o jogo. Ao sair do modo jogo, volta ao preset.
  Testado (animação a 30 qps): testou, não ajudou, voltou a 1920×1080.
- A banda curta (720p fixo) só conta depois das 3 primeiras amostras do modo jogo.
- Motivo `tela` quando quem joga decodifica ≥ 40 e mostra < 70% disso (vem antes de `perdas`),
  com o texto do Modo de Pouca Energia do iPhone.

## Quinto e sexto relatórios (2026-10-29 02:52 Minecraft, 02:57 God of War, várias janelas)

- **God of War: o melhor até agora.** Captura 53–55 qps em todos os tamanhos (1920×1080 inclusive),
  placa o tempo todo, banda até 52 Mbps, iPhone mostrando 50–54 qps (o Modo de Pouca Energia
  saiu), buffer quase sempre 55–150 ms.
- **Minecraft pior**: os primeiros 30 s a 32 qps (o teste de captura em 720p não ajudou: era o
  jogo; depois subiu a 54 no mesmo tamanho) e **~75 s no OpenH264**: ao diminuir a janela, a escala
  do 720p fixo, calculada para o tamanho antigo, deu 617×375 e depois 1279×720.
- **Medida ímpar → processador** (testado: `testar-impar.js`): 1279×720, 1280×719, 617×375 e uma
  captura de 1283×751 (mesmo com a saída par) vão para o OpenH264; 1280×720, 618×376, 1340×720 na placa.
  Abaixo de ~360 linhas o Chrome usa o processador de propósito.
- **Depois de cair, não volta sozinho** (`testar-volta.js`): nem escala nova, nem `active`
  desligado e ligado, nem `replaceTrack`, nem renegociar o codec. Volta quando o tamanho da própria
  captura muda para medidas pares (`applyConstraints`).
- O Chrome arredonda a largura e trunca a altura com erro de conta (751 / (751/736) → 735): a
  escala mira 0,25 acima do par.
- Teto de ~54–55 qps em todos os tamanhos e nos dois jogos: provável o ritmo da captura neste PC,
  não o jogo. Ainda não investigado.

### O que entrou depois disso

- `escalaPar` em `envioPara`: toda redução sai com as duas medidas pares (validado em 14
  tamanhos: `testar-escalas.js`); sem redução, escala 1 (escala minúscula dava medida imprevisível).
- A escala é refeita quando a captura muda de tamanho: `vigiar` (pelo `getSettings`) e
  `rtc.capturaMedida` (pelas estatísticas, a cada 2 s no modo jogo).
- Para quem joga, sempre `maintain-framerate-and-resolution`: o navegador reduzindo sozinho
  (3/4, 1/2, 3/8) dava medida ímpar. Com banda curta quem reduz é o 720p fixo.
- `rtc.reiniciarCodificador` + `vigiarCodificador` (main.js): no processador num H.264 que a
  placa faz, com 360 linhas ou mais → captura no par logo abaixo; voltou à placa e a captura de
  antes era par → volta a ela. Captura ímpar fica no par logo abaixo (limite: se a janela crescer
  depois, a captura fica presa nesse tamanho até sair do modo jogo). Ao sair do modo jogo, preset.
- Evento "codificador trocou" no relatório (de, para, medidas).

## Sétimo e oitavo relatórios (2026-10-29 12:04 e 12:14, PC com Intel UHD → iPhone, Minecraft)

- 12:04, janela de 926×562 o tempo todo: captura 57, enviado 57, iPhone mostra ~55, buffer
  25–42 ms, sem perda. O "não é Full HD" era só o tamanho da janela (o envio não reduziu nada).
- 12:14, várias janelas: **o qps acompanha os pixels e a cena**, não a sala nem a rede:
  1920×1032 → 16–25; 1280×688 → 17–27 em ação mas **52–55 com a cena parada** (kbps < 1 Mbps,
  menu); 1280×664–720 → 44–55; 1166×644 → 55–57. Na Intel quem segura é o próprio jogo
  renderizando (a captura só pega o que o jogo desenha); o "captura em 720p ajudou" (16,5 → 25)
  provavelmente foi a cena mudando. Codificador na placa (Intel H.265 MFT) a 6–8 ms/quadro, banda
  até 44 Mbps.
- Teto de 55–58 com o jogo leve, igual ao do PC com a RTX.

### O que entrou depois disso

- `?qps=75` (30 a 240) na sala de quem compartilha: a captura é pedida a esse ritmo (`QPS_CAPTURA`,
  `rtc.qpsCaptura()`, no `getDisplayMedia` e nos `applyConstraints` do modo jogo); o envio continua
  em no máximo 60 (`maxFramerate` do nível). Hipótese: com o teto exatamente em 60 o Chrome joga
  fora o quadro que chega um pouco adiantado. Conferido no Chromium do Playwright que 75 e 120 são
  aceitos (antes e depois de reduzir a captura). Vai em `ambiente.qpsCaptura` do relatório.
  **Virou o padrão** (2026-10-29, a pedido do usuário, sem o relatório com 75 ainda): toda captura
  de janela/tela sai a 75 (`QPS_PADRAO`), o envio a no máximo 60; `?qps=60` volta ao de antes.
  Conferir no próximo relatório: `ambiente.qpsCaptura` 75, captura acima de 58 e enviado ~60 com
  o jogo leve; e se o PC com Intel não piorou com a captura mais rápida (se piorar, 75 só no modo jogo).
- **Relatório com 75 (2026-10-29 12:45, Intel UHD → iPhone, Minecraft): não ajudou.** A trilha
  saiu a `frameRate: 75`, mas na mesma janela de 926×562 a captura ficou em 51–58 e o enviado em
  51–56 (com 60 eram 57/57). A captura nunca passou de 58: a hipótese do quadro adiantado estava
  errada, o teto de ~57 vem do ritmo em que o Windows/Chrome entrega a janela do jogo. Na Intel,
  1280×688–720 deu 36–54 (antes 44–55). O iPhone mostrou ~8 qps a menos do que decodificava no
  começo (motivo `tela`). **Voltou para 60** (`QPS_PADRAO`); o `?qps=N` continua para medir.
- **"Otimizações para jogos em janela" do Windows desligada (2026-10-29 13:06 e 13:10, Intel UHD →
  iPhone, Minecraft): a janela de 1920×1032 foi de 16–25 qps (12:14 e 12:45, ligada) para mediana
  47, máx. 53** (Intel VP9 a 13 ms/quadro, ~10 Mbps). 926×562: 52–55 (igual). Preset Leve:
  1280×688 → 43, 1278×720 → 47. Pode ter a ver com a cena, mas a diferença é grande: com a
  otimização ligada o jogo apresenta no modelo "flip" e a captura da janela na Intel sofre. Falta
  confirmar ligada × desligada na mesma cena, e se o PC com a RTX também ganha.
- No mesmo relatório: ao ir para 1920×1032 o codificador caiu no libvpx e voltou com a captura
  em 720p; em 12:47:22 a captura de 1278×720 saiu como **1280×698** (escala estranha) e caiu no
  libvpx por 2 s. Vale olhar o `escalaPar` com captura de largura 1278.

## Jogabilidade (2026-10-29): controle, teclas, imagem e som

Revisão do lado do controle, que até aqui não tinha medida nenhuma. Extensão 1.15.0, ajudante 1.8.0.

- **PC em tela cheia com o teclado travado** (`jogoNoPc` no main.js): o modo jogo põe o `#focus` em
  tela cheia sem moldura (`body.jogo-pc`) e chama `navigator.keyboard.lock()`. Sem isso o Chrome
  ficava com Ctrl+W/T/N (correr no Minecraft é Ctrl+W: a aba da sala fechava). O Esc curto vai para o
  jogo (deduplicado com o do ponteiro solto por `controle.escEm`); segurar o Esc sai da tela cheia.
- **Tecla presa**: quem joga manda `{t:'vivo'}` a cada 500 ms; o ajudante (`VigiarJogo`) solta tudo
  depois de 1,5 s sem notícia com tecla ou botão apertado. A sala de quem compartilha manda
  `modo: false` ao ajudante quando ninguém mais joga na tela (inclusive quem saiu ou caiu). Aba
  escondida (`visibilitychange`) solta teclado, toque e controle.
- **Botões do lado do mouse**: `x1`/`x2` (antes viravam clique esquerdo), no ajudante
  (`MOUSEEVENTF_XDOWN`), nas abas (`back`/`forward` do CDP) e sem o "voltar" do Chrome na sala.
- **Alt segurado** vai na hora no modo jogo; a repetição de tecla não vai (só o Backspace);
  a roda vai em dentes inteiros (`girarJogo`, pelo `wheelDeltaY`).
- **Movimento sem trava**: canal `controle-mov` (`ordered:false, maxRetransmits:0`, ver
  `rtc.canalMovimento`) levando o total andado `{e, x, y, s}`; quem recebe aplica a diferença
  (`somasDoJogo` em `receberDireto`). Perda não custa movimento nem segura teclas. Do lado de
  quem compartilha, com a extensão 1.15+, o movimento vai por uma porta fixa até o ajudante
  (`janela-rapida`, `chrome.runtime.connect`), sem resposta. **Não conferido de ponta a ponta**: o
  teste no Playwright pega o mouse de quem está usando o PC.
- **Menu automático**: o ajudante olha o cursor a cada 100 ms (`GetCursorInfo`/`GetClipCursor`) e
  avisa `{tipo:'cursor', livre}`; vai na resposta dos eventos → `controle.onCursor` → volta
  `{t:'cursor'}` para quem joga → `controle.cursorLivre`: no PC solta o ponteiro e o mouse vai pela
  posição (`abs`); no celular os botões de menu entram sozinhos. Opção "Menu do jogo automático".
  Falta conferir com Minecraft e God of War de verdade se a detecção acerta.
- **Quem só assiste** a uma tela em jogo fica no máximo em 540p a 30 (`rtc.assiste`), em
  `maintain-resolution` (sem medida ímpar no processador do PC do jogo). O relatório conta os
  `codificadores` ativos.
- **Piso de banda** sai também com a fila de envio acima de 60 ms ou a ida e volta no dobro da
  menor vista (`ajustarJogo`).
- **Som estéreo** para quem joga (`comEstereo`: stereo=1 na descrição remota de quem manda e nas
  seções só de recebimento de quem recebe). O relatório de quem joga traz `somBufferMs` e
  `bufferMinimoMs`: se o vídeo estiver esperando o som (sincronia), aparece ali. Separar os streams
  não foi feito: a sala acha o som da tela pelo id do stream.
- **Relatório de quem joga**: `controleRttMs` (ping pelo canal), `ajudanteMs`, `atrasoMs` (do dedo
  ao olho, estimado), `movimentoCru` (`unadjustedMovement` aceito), `controleFisico`.
- **Opções** (`jogo-opcoes.js`; no PC em "Opções" ao lado do Modo jogo, no celular no painel do
  toque): imagem mais lisa (buffer de 40 ms), menu automático, selo de desempenho (`#jogo-selo`) e,
  no celular, mira pelo giroscópio (sinais do `devicemotion` deduzidos, não testados num aparelho).
- **Controle de videogame** (`gamepad-jogo.js`): Gamepad API → teclado e mouse, pelo mapa `pad` de
  cada layout em `toque-jogo.js`. Sem instalar nada. O controle virtual de Xbox (ViGEmBus) ficou de
  fora: precisa de driver e de uma DLL de terceiros no PC de quem compartilha.
- **Toque**: fração de pixel guardada (mirar devagar não some mais), analógico flutuante
  (`.tj-zona`), editor "Mover botões" (posições por layout no localStorage).
- Teste barato que ficou para o usuário: o teto de ~57 qps com o jogo limitado a 120 qps e V-Sync
  desligado — se a captura chegar a 60, o limite era o jogo perdendo quadros.

## Relatórios de 2026-10-30 (1440p/720p em casa; de longe, na casa de outra pessoa)

- Em casa: captura 54–58, NVIDIA H.265 (12 ms em 1080p, 7 ms em 720p), iPhone mostrando 53–56. As
  travadas (0,75–3,4 s) vieram todas de quedas da banda do Wi-Fi (35 → 8, 23 → 3,5 Mbps) com 16–24
  Mbps saindo: fila de envio de 240 ms a 1 s. O preset Ultra num monitor 1080p não ganha imagem
  (a captura fica em 1920×1080), só mais banda e mais risco.
- De longe (`modo-jogo-joga-*`, só o lado do iPhone): rede boa (5–19 Mbps chegando, ida e volta
  45–80 ms, caminho pelo TURN da Cloudflare: `relay/udp` do lado do PC), mas **a captura presa em
  30–37 qps os 3 minutos**. Com rede e codificador folgados, o provável é o jogo sem foco: o limite
  de quadros em segundo plano da NVIDIA (costuma vir em 30), ou o monitor/suspensão do PC sozinho.
  O Safari 27 aceitou o `jitterBufferTarget = 0` (antes vinha nulo); o buffer ainda variou 60–360 ms.

### O que entrou depois disso

- `jogoBitrate` mais baixo (Leve 7, Máxima 14, Ultra 20 Mbps): com o codificador da placa 14 Mbps
  dão 1080p60 limpo e sobra folga para as quedas do Wi-Fi. O piso (`bandaDeJogo`) acompanha (4,2 Mbps
  na Máxima).
- `ajustarJogo`: o modo jogo **começa em 720p** (`linhasDeJogo(id, 720)` na 1ª amostra) e sobe
  para a captura inteira com a banda acima de 9 Mbps por 6 s, no mínimo 8 s depois de começar.
  Testado: 720p → 1080p em ~12 s, sempre na NVIDIA.
- Motivo `fundo` (captura entre 26 e 38 qps) com o aviso do limite em segundo plano da NVIDIA, do
  foco da janela e da tela/suspensão do Windows. Vai com "No PC de quem compartilha:" para quem joga.

## O atraso (2026-10-30: Wi-Fi de outra casa e 5G)

Somando as medianas do Wi-Fi: captura ~20–35 + codificação ~12 (1080p) + fila ~0–40 + rede ~18 +
**buffer do iPhone ~100 (p90 285, até 450)** + decodificação ~6,5 + tela ~10–17 ≈ 180–200 ms, mais
~40 ms do toque até o jogo: os 200–300 ms que o usuário sente. No 5G: ida e volta de ~170 ms (até
889) pelo TURN e buffer de 230–660 ms — a rede móvel, sem conserto no código.

- O buffer do iPhone cresce com a chegada irregular: depois de uma fila de 1 s ficou em 400–450 ms
  por ~20 s; com a captura a ~30 qps, 160–260 ms; com a captura estável em 53–55, **15–60 ms**.
- **Sincronia som/imagem não é o problema** (testado): numa conexão local do Chrome o vídeo ficou
  com ~5 ms de buffer com o som no mesmo stream ou separado; no Safari de verdade (`somBufferMs` do
  relatório) o vídeo ficou muitas vezes bem abaixo do som (17 × 121, 47 × 292 ms) — não espera por
  ele. Separar os dois não foi feito. O som do jogo, esse sim, chega com ~200 ms de buffer médio.
- Os ~30 qps "do Ultra": o preset não faz isso sozinho (`medir-preset.js`: Leve, Máxima e Ultra dão
  os mesmos ~55 qps numa janela). Num relatório a captura em 720p subiu de 21 para 32: a placa no
  limite. O aviso `fundo` agora diz isso (limitar o jogo a 60, gráficos, preset Leve).

### O que entrou depois disso

- `ajustarJogo`: **fila de envio acima de 150 ms numa amostra → 720p na hora** (e cada fila alta
  seguinte segura o 720p por mais 30 s), sem esperar a estimativa de banda cair.
- `envioPara`: com a tela fixa abaixo da captura (720p), **a banda cai junto com os pixels**
  (no mínimo metade): 720p de 1080 vai com 7 Mbps na Máxima.
- Opção **"Menos atraso (720p)"** (`opcoesJogo.rapido`, nos dois painéis de opções): quem joga
  manda `{t:'modo', jogo:true, rapido}` (`avisarRapido`, também a cada mudança da opção; passa por
  `eventoDeControle` no controle.js e no server.js) → `controle.onModo(sh, jogo, deId, rapido)` →
  `rtc.rapidoJogo(id, ligar)`: 720p fixo e até 8 Mbps para essa pessoa. Testado (Chrome que só
  aceita o que o Safari aceita): 1280×720 a 60 qps, 7 Mbps, NVIDIA, mesmo com a banda folgada; ao
  desligar, 1080p e 14 Mbps. A reação à fila não foi testada aqui (não dá para provocar a queda).

## Próximos passos sugeridos

0. **Pedir um relatório novo dos dois lados** com o jogo em janela sem bordas 1920×1080 a 60 qps
   fixos: conferir se, com o piso, a imagem fica em 1080/720 e se o codificador vira
   `NVIDIA H.264 Encoder MFT`. Se continuar OpenH264 com imagem grande, olhar `chrome://gpu`
   ("Video Acceleration Information") no PC do jogo.

1. **Esperar o teste em Leve (720p)** que pedi: jogo em janela sem bordas 1920×1080, preset Leve
   (captura já sai reduzida a 1280×720). Se chegar perto de 60, a redução na captura resolve.
2. **Se 720p resolver: queda automática no modo jogo.** Hoje `maintain-framerate` só baixa a
   resolução por banda/CPU (`qualityLimitation`), e aqui ela era `none` — o navegador não percebe.
   Ideia: em `amostrarJogo`, se `captura < 45` por ~3 amostras com `altura >= 1000`, aplicar
   `track.applyConstraints({ width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 60 } })`
   na trilha da tela (ou `scaleResolutionDownBy` 1.5 no envio — testar qual libera a captura; a
   captura reduzida é a aposta, porque a cópia/conversão de 1080p também pesa). Voltar a subir se
   ficar estável em 58+ por um tempo. Registrar no relatório (`diagJogo.evento`).
3. **Codec**: `escolherCodec()` (rtc.js) caiu em VP9 porque o `encodingInfo` não deu H.264 como
   `powerEfficient` neste PC. Vale testar H.264 na Intel (Quick Sync costuma ser mais rápido que o
   VP9 MFT) — por exemplo, um preferido por `?codec=h264` só para medir os ms/quadro.
4. **Aviso mais certeiro**: em `jogo-diag.js`, quando `motivo === 'captura'` e o `ambiente.gpu`
   for Intel/integrada, dizer para pôr o Chrome em "Alto desempenho" (Configurações → Sistema →
   Tela → Gráficos), fechar com `chrome://quit` e conferir em `chrome://gpu`; e quando o
   codificador for `libvpx`/`OpenH264`, dizer que tela cheia exclusiva derruba a placa.
5. Falta o relatório **de quem joga** (`modo-jogo-joga-*.json`) para ver decodificação/tela do
   outro lado — até agora só veio o de quem compartilha.

## Cuidados (ver também a memória do projeto)

- `main.js`, `rtc.js`, `controle.js` e `server.js` estão com CRLF: trocas por script precisam
  converter `\n` → `\r\n` (a ferramenta Edit lida sozinha).
- Outra sessão do Claude pode estar mexendo no repo: commitar só os próprios trechos.
- Teste com duas pessoas: cópia na porta 3100 com junção da `node_modules`/`public`, `?debug=1`,
  Playwright com o Chromium em `~/AppData/Local/ms-playwright/chromium-1248`. Para simular o modo
  jogo: na aba que joga `__sala3d.controle.onJogo(video, key)`; na que compartilha
  `__sala3d.controle.onModo(share, true, idDeQuemJoga)`.
- O usuário fala português: responder sempre em pt-BR.
