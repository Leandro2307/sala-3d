#!/bin/bash
# Compila a ponte do PC (sala3d-pc.exe) no MSYS2 (ambiente UCRT64), num .exe só, sem DLLs.
# Uso (no Git Bash): /c/msys64/usr/bin/bash.exe -l extensao/nativo/pc/compilar.sh
# Precisa de: pacman -S mingw-w64-ucrt-x86_64-{gcc,opus,ffnvcodec-headers}
set -e
export PATH=/ucrt64/bin:/usr/bin:$PATH
AQUI="$(cd "$(dirname "$0")" && pwd)"
gcc -O2 -Wall -Wno-unused-function -Wno-format-truncation -o "$AQUI/sala3d-pc.exe" "$AQUI/ponte-pc.c" \
  -static -lopus -ld3d11 -ldxgi -lole32 -luuid -lws2_32 -lbcrypt -lcrypt32 -lwinmm -luser32 -lgdi32
strip "$AQUI/sala3d-pc.exe"
ls -la "$AQUI/sala3d-pc.exe"
