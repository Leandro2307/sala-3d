#!/bin/bash
# Compila a ponte do PS5 (sala3d-ps5.exe) no MSYS2 (ambiente UCRT64), num .exe só, sem DLLs.
# Uso (no Git Bash ou no MSYS2):
#   /c/msys64/usr/bin/bash.exe -l extensao/nativo/ps5/compilar.sh /c/caminho/chiaki-ng
# O chiaki-ng tem que estar clonado com os submódulos (ver LEIA-ME.md). Na primeira vez a biblioteca
# dele é compilada em <chiaki-ng>/build-sala3d (uns minutos); depois, só a ponte.
set -e
export PATH=/ucrt64/bin:/usr/bin:$PATH
AQUI="$(cd "$(dirname "$0")" && pwd)"
CHIAKI="${1:-$CHIAKI}"
[ -d "$CHIAKI/lib/include/chiaki" ] || { echo "diga onde esta o chiaki-ng: bash compilar.sh /c/caminho/chiaki-ng"; exit 1; }
B="$CHIAKI/build-sala3d"
if [ ! -f "$B/lib/libchiaki.a" ]; then
  # só a biblioteca, estática; o curl sem nada de fora (a ponte só usa o Remote Play na rede de casa)
  cmake -S "$CHIAKI" -B "$B" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DCHIAKI_ENABLE_GUI=OFF -DCHIAKI_ENABLE_CLI=OFF -DCHIAKI_ENABLE_TESTS=OFF \
    -DCHIAKI_ENABLE_FFMPEG_DECODER=OFF -DCHIAKI_ENABLE_PI_DECODER=OFF -DCHIAKI_ENABLE_SETSU=OFF \
    -DCHIAKI_ENABLE_STEAMDECK_NATIVE=OFF -DCHIAKI_ENABLE_SPEEX=OFF -DCHIAKI_ENABLE_STEAM_SHORTCUT=OFF \
    -DCHIAKI_LIB_ENABLE_OPUS=OFF -DCHIAKI_GUI_ENABLE_SDL_GAMECONTROLLER=OFF -DBUILD_SHARED_LIBS=OFF \
    -DUSE_NGHTTP2=OFF -DCURL_USE_LIBPSL=OFF -DCURL_USE_LIBSSH2=OFF -DUSE_LIBIDN2=OFF -DCURL_ZLIB=OFF \
    -DCURL_BROTLI=OFF -DCURL_ZSTD=OFF -DCMAKE_C_FLAGS=-DMINIUPNP_STATICLIB
  cmake --build "$B"
fi
gcc -O2 -Wall -Wno-unused-function -Wno-format-truncation -o "$AQUI/sala3d-ps5.exe" "$AQUI/ponte.c" \
  -I"$CHIAKI/lib/include" -I"$B/lib/include" -DCURL_STATICLIB \
  "$B/lib/libchiaki.a" "$B/third-party/curl/lib/libcurl.a" \
  "$B/third-party/libjerasure.a" "$B/third-party/libgf_complete.a" "$B/third-party/nanopb/libprotobuf-nanopb.a" \
  -static -ljson-c -lminiupnpc -levent -lssl -lcrypto -lz \
  -lws2_32 -lwsock32 -liphlpapi -lbcrypt -lcrypt32 -lsecur32 -lnormaliz -lwldap32 -ladvapi32 -luser32 -lpthread
strip "$AQUI/sala3d-ps5.exe"
ls -la "$AQUI/sala3d-ps5.exe"
