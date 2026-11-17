# Ponte do PC (sala3d-pc.exe)

O "Remote Play" deste PC dentro da sala, como o PS5 direto. O ajudante do Windows (1.19+) abre este
programa quando alguém clica em **Compartilhar o PC direto** (menu "Suas telas") ou digita `/pc`.

- Captura um monitor pelo Windows (Desktop Duplication, a mesma do OBS), com o ponteiro do mouse.
- Converte para NV12 e reduz (720p/1080p) no processador de vídeo da placa (D3D11).
- Codifica na placa com o NVENC (H.264 High, ULTRA_LOW_LATENCY, CBR com buffer de 2 quadros, sem
  quadros B, 1 referência, quadro-chave só quando a página pede), a 30, 60 ou 120 qps.
- O som do PC **menos o do navegador** (captura por processo do Windows 10 2004+; a voz da sala, que
  toca no Chrome, não volta como eco para quem joga), em Opus de 10 ms.
- Entrega tudo à página por um WebSocket em `127.0.0.1` com token, **no mesmo protocolo da ponte do PS5**
  (ver o cabeçalho de `ponte-pc.c`): a sala usa a mesma fonte (`Ps5Fonte`) e o mesmo repasse no turbo.

Antes: tela → captura do Chrome (~54 qps no máximo) → OpenH264 no processador → quem joga.
Agora: tela → placa (conversão e NVENC) → ponte → a sala repassa os mesmos quadros → quem joga.

O controle de quem joga não passa pela ponte: é o de uma tela inteira (o ajudante, com o rótulo
`screen:N:0` que a ponte informa para o monitor escolhido). O turbo baixa e sobe a banda da ponte pela
fila que quem joga mede (mensagem `banda`).

## Arquivos

- `ponte-pc.c`: o programa (WebSocket, monitores, captura, conversão, NVENC, som).
- `compilar.sh`: compila no MSYS2 (UCRT64) num `.exe` só, sem DLLs (~480 KB).
- `sala3d-pc.exe`: o compilado (vai no repositório).

Log em `%LOCALAPPDATA%\Sala3d\pc-ponte.log` (a cada 10 s: quadros, repetidos, ms para codificar).

## Compilar

1. MSYS2 (instala sem administrador): `msys2-x86_64-latest.sfx.exe -y -oC:\Users\<você>\`.
2. No MSYS2: `pacman -S mingw-w64-ucrt-x86_64-{gcc,opus,ffnvcodec-headers}`.
3. `C:\Users\<você>\msys64\usr\bin\bash.exe -l extensao/nativo/pc/compilar.sh`

## Testar sem a sala

- `sala3d-pc.exe --teste`: lista os monitores, diz se o NVENC abre e qual navegador está acima.
- `--excluir <pid>`: o processo cujo som fica de fora (sem isso, o navegador acima da ponte).

## Limites

- Só placa NVIDIA por enquanto (NVENC, driver com a API 13). Sem ela, o painel avisa; a Tela inteira
  com o modo turbo continua funcionando. AMD/Intel (Media Foundation) é o próximo passo.
- Captura o monitor inteiro (não uma janela): o jogo em tela cheia sem borda no monitor que não é o
  da sala.
