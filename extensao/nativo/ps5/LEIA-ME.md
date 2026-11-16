# Ponte do PS5 (sala3d-ps5.exe)

O Remote Play do PS5 dentro da sala, sem a janela do chiaki-ng. O ajudante do Windows (1.16+) abre
este programa quando alguém clica em **PS5 direto** (Ajustes, menu "Suas telas" ou `/ps5`). Ele fala
com o PS5 pela biblioteca do [chiaki-ng](https://github.com/streetpea/chiaki-ng) e entrega à página
da sala, por um WebSocket em `127.0.0.1` com um token aleatório:

- o vídeo H.264 **do jeito que o PS5 mandou** (a sala repassa os mesmos quadros a quem joga, no turbo);
- o som em Opus (idem);
- e recebe o controle de quem joga, que chega no PS5 como um controle de PS5 (sem ViGEmBus).

Antes: PS5 → codifica → chiaki-ng decodifica → janela → a sala captura → codifica de novo → quem joga.
Agora: PS5 → codifica → ponte → quem joga decodifica.

## Arquivos

- `ponte.c`: o programa (WebSocket, registro, descoberta, sessão). Protocolo no cabeçalho.
- `compilar.sh`: compila no MSYS2 (UCRT64) num `.exe` só, sem DLLs.
- `sala3d-ps5.exe`: o compilado (vai no repositório: o PC do PS5 não precisa compilar nada).

Os consoles registrados ficam em `%LOCALAPPDATA%\Sala3d\ps5.txt` e o log em `ps5-ponte.log`, na
mesma pasta. Na primeira vez, sem nenhum console, a ponte traz os registros do chiaki-ng deste PC
(registro do Windows, `HKCU\Software\Chiaki\Chiaki\registered_hosts`).

## Compilar a ponte

1. MSYS2 (instala sem administrador): `msys2-x86_64-latest.sfx.exe -y -oC:\Users\<você>\`.
2. No MSYS2: `pacman -S mingw-w64-ucrt-x86_64-{gcc,cmake,ninja,openssl,protobuf,python,python-protobuf,python-setuptools,json-c,miniupnpc,libevent,pkgconf}`.
3. `git clone --recurse-submodules https://github.com/streetpea/chiaki-ng.git` (testado no commit `43728af`, 2026-11-03).
4. `C:\Users\<você>\msys64\usr\bin\bash.exe -l extensao/nativo/ps5/compilar.sh /c/caminho/chiaki-ng`

## Licença

A libchiaki é AGPL-3.0 (com exceção para o OpenSSL), e a ponte, ligada a ela, também: o código está
aqui (`ponte.c`, `compilar.sh`) e o do chiaki-ng no link acima. O resto da sala não é ligado à
biblioteca (fala com a ponte por WebSocket, como com qualquer outro programa).
