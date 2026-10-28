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

## Próximos passos sugeridos

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
