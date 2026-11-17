// Ponte do PC (sala3d-pc.exe) — o "Remote Play" deste PC dentro da sala, como o PS5 direto.
//
// O modo jogo normal captura a tela pelo Chrome (que trava em ~54 qps) e codifica no processador
// (OpenH264). Aqui a imagem sai do Windows (Desktop Duplication, a mesma do OBS), vira NV12 na placa
// (processador de vídeo do D3D11) e é codificada pela própria placa (NVENC, como o Sunshine e o Steam
// Link), com o atraso mínimo: sem quadros B, CBR com buffer de 1 a 2 quadros, quadro-chave só quando
// pedem. O som é o do PC menos o do navegador (captura por processo do Windows 10 2004+: a voz da sala
// que toca no Chrome não volta como eco para quem joga), em Opus de 10 ms.
//
// A página recebe isso no MESMO protocolo da ponte do PS5 (ps5/ponte.c) e usa a mesma fonte
// (Ps5Fonte): decodifica uma cópia para a tela da sala e repassa os quadros para quem joga (turbo).
// O controle de quem joga não passa por aqui: é o do modo jogo de sempre (ajudante: SendInput/ViGEm).
//
// Quem abre é o ajudante (Ajudante.cs), com --porta 0 --token <aleatório> --pai <pid>. A 1ª linha na
// saída padrão é {"porta":N,"versao":"..."}. Só aceita a página com o token (GET /pc?t=...).
//
// Binário daqui para lá (8 bytes de cabeçalho: tipo, marcas, perdidos u16, seq u32):
//   1 quadro de vídeo (H.264 Annex B; o quadro-chave leva SPS/PPS), 2 som (Opus 48 kHz), 3 SPS/PPS
// Texto daqui para lá: oi, monitores, conectado, som, saiu, aviso.
// De lá para cá: monitores, iniciar {monitor, altura, qps, kbps, cursor, som}, parar, chave, banda {kbps}.
#define COBJMACROS
#define WIN32_LEAN_AND_MEAN
#include <initguid.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <process.h>
#include <tlhelp32.h>
#include <bcrypt.h>
#include <wincrypt.h>
#include <d3d11.h>
#include <d3d11_4.h>
#include <mmsystem.h>
#include <dxgi1_2.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdarg.h>
#include <math.h>
#include <ffnvcodec/nvEncodeAPI.h>
#include <opus/opus.h>

#define VERSAO "1.0.0"
#define MAX_MSG (64 * 1024)
#define MAX_MON 8

// ------------------------------------------------------------------ estado
static FILE *arquivoLog = NULL;
static CRITICAL_SECTION travaLog;
static char token[80];
static char pastaDados[MAX_PATH];

static SOCKET cliente = INVALID_SOCKET;
static CRITICAL_SECTION travaEnvio;
static uint32_t seqVideo = 0, seqSom = 0;

// o pedido da página (vale para a próxima sessão de vídeo)
typedef struct { int monitor, altura, qps, kbps; bool cursor, som; } Pedido;
static Pedido pedido = { 0, 1080, 60, 20000, true, true };
static CRITICAL_SECTION travaSessao;
static HANDLE threadVideo = NULL, threadSom = NULL;
static volatile LONG pararVideo = 0, pararSom = 0;
static volatile LONG pedirIdr = 0;
static volatile LONG novoKbps = 0;
static char conectadoJson[512] = "";   // o último "conectado": vai de novo para a página nova
static uint8_t *cabecalho = NULL;       // o último SPS/PPS
static size_t cabecalhoTam = 0;
static volatile LONG somNoAr = 0;
static DWORD pidExcluir = 0;          // --excluir: o processo cujo som fica de fora (senão, o navegador acima)

// ------------------------------------------------------------------ log
static void registrar_log(const char *fmt, ...)
{
	EnterCriticalSection(&travaLog);
	if(arquivoLog)
	{
		SYSTEMTIME t;
		GetLocalTime(&t);
		fprintf(arquivoLog, "%02d:%02d:%02d.%03d ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds);
		va_list a;
		va_start(a, fmt);
		vfprintf(arquivoLog, fmt, a);
		va_end(a);
		fputc('\n', arquivoLog);
		fflush(arquivoLog);
	}
	LeaveCriticalSection(&travaLog);
}

static void enviar_texto(const char *json);

static void escapar(const char *s, char *out, size_t n)
{
	size_t j = 0;
	for(; *s && j + 7 < n; s++)
	{
		unsigned char c = (unsigned char)*s;
		if(c == '"' || c == '\\') { out[j++] = '\\'; out[j++] = c; }
		else if(c < 0x20) { j += snprintf(out + j, n - j, "\\u%04x", c); }
		else out[j++] = c;
	}
	out[j] = 0;
}

// um aviso para o log e para a página (relatório do modo jogo)
static void avisar(const char *fmt, ...)
{
	char msg[400], esc[600], json[700];
	va_list a;
	va_start(a, fmt);
	vsnprintf(msg, sizeof(msg), fmt, a);
	va_end(a);
	registrar_log("aviso: %s", msg);
	escapar(msg, esc, sizeof(esc));
	snprintf(json, sizeof(json), "{\"tipo\":\"aviso\",\"texto\":\"%s\"}", esc);
	enviar_texto(json);
}

static double agora_ms(void)
{
	static LARGE_INTEGER f = { 0 };
	if(!f.QuadPart) QueryPerformanceFrequency(&f);
	LARGE_INTEGER c;
	QueryPerformanceCounter(&c);
	return (double)c.QuadPart * 1000.0 / (double)f.QuadPart;
}

// ------------------------------------------------------------------ WebSocket
static bool enviar_tudo(SOCKET s, const uint8_t *b, size_t n)
{
	while(n)
	{
		int r = send(s, (const char *)b, (int)(n > 0x7fffffff ? 0x7fffffff : n), 0);
		if(r <= 0) return false;
		b += r;
		n -= (size_t)r;
	}
	return true;
}

static void enviar_quadro_ws(int opcode, const uint8_t *cab, size_t cabTam, const uint8_t *dados, size_t tam)
{
	EnterCriticalSection(&travaEnvio);
	if(cliente == INVALID_SOCKET) { LeaveCriticalSection(&travaEnvio); return; }
	uint8_t h[14];
	size_t hl = 0, total = cabTam + tam;
	h[hl++] = 0x80 | (uint8_t)opcode;
	if(total < 126) h[hl++] = (uint8_t)total;
	else if(total < 65536) { h[hl++] = 126; h[hl++] = (uint8_t)(total >> 8); h[hl++] = (uint8_t)total; }
	else { h[hl++] = 127; for(int i = 7; i >= 0; i--) h[hl++] = (uint8_t)((uint64_t)total >> (i * 8)); }
	bool ok = enviar_tudo(cliente, h, hl) && (!cabTam || enviar_tudo(cliente, cab, cabTam)) && (!tam || enviar_tudo(cliente, dados, tam));
	if(!ok)
	{
		closesocket(cliente);
		cliente = INVALID_SOCKET;
	}
	LeaveCriticalSection(&travaEnvio);
}

static void enviar_texto(const char *json)
{
	enviar_quadro_ws(1, NULL, 0, (const uint8_t *)json, strlen(json));
}

static void enviar_binario(uint8_t tipo, uint8_t marcas, uint16_t perdidos, uint32_t seq, const uint8_t *dados, size_t tam)
{
	uint8_t cab[8] = { tipo, marcas, (uint8_t)(perdidos >> 8), (uint8_t)perdidos,
		(uint8_t)(seq >> 24), (uint8_t)(seq >> 16), (uint8_t)(seq >> 8), (uint8_t)seq };
	enviar_quadro_ws(2, cab, sizeof(cab), dados, tam);
}

static bool receber_tudo(SOCKET s, uint8_t *b, size_t n)
{
	while(n)
	{
		int r = recv(s, (char *)b, (int)n, 0);
		if(r <= 0) return false;
		b += r;
		n -= (size_t)r;
	}
	return true;
}

// SHA-1 + base64 do Windows (sem OpenSSL)
static bool aceite_ws(const char *chave, char *out, DWORD n)
{
	uint8_t hash[20];
	if(BCryptHash(BCRYPT_SHA1_ALG_HANDLE, NULL, 0, (PUCHAR)chave, (ULONG)strlen(chave), hash, sizeof(hash)) != 0)
	{
		// Windows antigo (sem os pseudo-handles): abre o algoritmo
		BCRYPT_ALG_HANDLE alg;
		if(BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA1_ALGORITHM, NULL, 0) != 0) return false;
		NTSTATUS st = BCryptHash(alg, NULL, 0, (PUCHAR)chave, (ULONG)strlen(chave), hash, sizeof(hash));
		BCryptCloseAlgorithmProvider(alg, 0);
		if(st != 0) return false;
	}
	return CryptBinaryToStringA(hash, sizeof(hash), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, out, &n) != 0;
}

static bool aperto_de_mao(SOCKET s)
{
	char req[4096];
	size_t n = 0;
	while(n < sizeof(req) - 1)
	{
		int r = recv(s, req + n, (int)(sizeof(req) - 1 - n), 0);
		if(r <= 0) return false;
		n += (size_t)r;
		req[n] = 0;
		if(strstr(req, "\r\n\r\n")) break;
	}
	char esperado[128];
	snprintf(esperado, sizeof(esperado), "GET /pc?t=%s ", token);
	if(strncmp(req, esperado, strlen(esperado)) != 0)
	{
		const char *nao = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
		send(s, nao, (int)strlen(nao), 0);
		return false;
	}
	char *k = NULL;
	for(char *p = req; (p = strstr(p, "\r\n")); p += 2)
	{
		if(_strnicmp(p + 2, "Sec-WebSocket-Key:", 18) == 0) { k = p + 20; break; }
	}
	if(!k) return false;
	while(*k == ' ') k++;
	char chave[160];
	size_t kl = 0;
	while(k[kl] && k[kl] != '\r' && kl < 100) { chave[kl] = k[kl]; kl++; }
	chave[kl] = 0;
	strcat(chave, "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
	char aceite[64];
	if(!aceite_ws(chave, aceite, sizeof(aceite))) return false;
	char resp[256];
	snprintf(resp, sizeof(resp), "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", aceite);
	return enviar_tudo(s, (const uint8_t *)resp, strlen(resp));
}

// ------------------------------------------------------------------ JSON mínimo (mensagens planas)
static const char *json_valor(const char *m, const char *chave)
{
	char busca[64];
	snprintf(busca, sizeof(busca), "\"%s\"", chave);
	const char *p = strstr(m, busca);
	if(!p) return NULL;
	p += strlen(busca);
	while(*p == ' ' || *p == '\t') p++;
	if(*p != ':') return NULL;
	p++;
	while(*p == ' ' || *p == '\t') p++;
	return p;
}

static bool json_texto(const char *m, const char *chave, char *out, size_t n)
{
	const char *p = json_valor(m, chave);
	if(!p || *p != '"') return false;
	p++;
	size_t j = 0;
	while(*p && *p != '"' && j + 1 < n)
	{
		if(*p == '\\' && p[1]) p++;
		out[j++] = *p++;
	}
	out[j] = 0;
	return true;
}

static double json_num(const char *m, const char *chave, double padrao)
{
	const char *p = json_valor(m, chave);
	if(!p) return padrao;
	if(strncmp(p, "true", 4) == 0) return 1;
	if(strncmp(p, "false", 5) == 0) return 0;
	char *fim;
	double v = strtod(p, &fim);
	return fim == p ? padrao : v;
}

// ------------------------------------------------------------------ monitores
// Cada saída (monitor) de cada placa, na ordem do DXGI. O rótulo "screen:N:0" usa o índice do
// EnumDisplayDevices (o mesmo do capturador do Chrome), que é como o ajudante acha o monitor para
// mandar o mouse e o teclado.
typedef struct {
	int adaptador, saida;
	char nome[64];          // \\.\DISPLAY1
	char placa[128];
	int x, y, w, h;
	int indiceWin;          // EnumDisplayDevices
	bool principal;
} Monitor;
static Monitor monitores[MAX_MON];
static int nMonitores = 0;

static int indice_windows(const char *nome)
{
	DISPLAY_DEVICEA dd;
	for(DWORD i = 0; i < 32; i++)
	{
		memset(&dd, 0, sizeof(dd));
		dd.cb = sizeof(dd);
		if(!EnumDisplayDevicesA(NULL, i, &dd, 0)) break;
		if(strcmp(dd.DeviceName, nome) == 0) return (int)i;
	}
	return -1;
}

static void listar_monitores(void)
{
	nMonitores = 0;
	IDXGIFactory1 *f = NULL;
	if(FAILED(CreateDXGIFactory1(&IID_IDXGIFactory1, (void **)&f))) return;
	IDXGIAdapter1 *a;
	for(UINT ia = 0; IDXGIFactory1_EnumAdapters1(f, ia, &a) == S_OK; ia++)
	{
		DXGI_ADAPTER_DESC1 ad;
		IDXGIAdapter1_GetDesc1(a, &ad);
		IDXGIOutput *o;
		for(UINT io = 0; nMonitores < MAX_MON && IDXGIAdapter1_EnumOutputs(a, io, &o) == S_OK; io++)
		{
			DXGI_OUTPUT_DESC od;
			IDXGIOutput_GetDesc(o, &od);
			if(od.AttachedToDesktop)
			{
				Monitor *m = &monitores[nMonitores++];
				memset(m, 0, sizeof(*m));
				m->adaptador = (int)ia;
				m->saida = (int)io;
				WideCharToMultiByte(CP_UTF8, 0, od.DeviceName, -1, m->nome, sizeof(m->nome), NULL, NULL);
				WideCharToMultiByte(CP_UTF8, 0, ad.Description, -1, m->placa, sizeof(m->placa), NULL, NULL);
				m->x = od.DesktopCoordinates.left;
				m->y = od.DesktopCoordinates.top;
				m->w = od.DesktopCoordinates.right - od.DesktopCoordinates.left;
				m->h = od.DesktopCoordinates.bottom - od.DesktopCoordinates.top;
				m->principal = m->x == 0 && m->y == 0;
				m->indiceWin = indice_windows(m->nome);
			}
			IDXGIOutput_Release(o);
		}
		IDXGIAdapter1_Release(a);
	}
	IDXGIFactory1_Release(f);
}

static int hz_do_monitor(const char *nome)
{
	DEVMODEA dm;
	memset(&dm, 0, sizeof(dm));
	dm.dmSize = sizeof(dm);
	return EnumDisplaySettingsA(nome, ENUM_CURRENT_SETTINGS, &dm) ? (int)dm.dmDisplayFrequency : 0;
}

// ------------------------------------------------------------------ NVENC
static NV_ENCODE_API_FUNCTION_LIST nv;
static bool nvOk = false;
static char nvErro[160] = "";

static bool carregar_nvenc(void)
{
	if(nvOk) return true;
	HMODULE dll = LoadLibraryA("nvEncodeAPI64.dll");
	if(!dll) { snprintf(nvErro, sizeof(nvErro), "sem-nvenc"); return false; }
	typedef NVENCSTATUS (NVENCAPI *Criar)(NV_ENCODE_API_FUNCTION_LIST *);
	typedef NVENCSTATUS (NVENCAPI *MaxVer)(uint32_t *);
	Criar criar = (Criar)(void *)GetProcAddress(dll, "NvEncodeAPICreateInstance");
	MaxVer maxVer = (MaxVer)(void *)GetProcAddress(dll, "NvEncodeAPIGetMaxSupportedVersion");
	if(!criar || !maxVer) { snprintf(nvErro, sizeof(nvErro), "sem-nvenc"); return false; }
	uint32_t v = 0;
	maxVer(&v);
	uint32_t precisa = (NVENCAPI_MAJOR_VERSION << 4) | NVENCAPI_MINOR_VERSION;
	if(v < precisa)
	{
		snprintf(nvErro, sizeof(nvErro), "driver-antigo");
		registrar_log("NVENC do driver %u.%u, a ponte precisa de %u.%u", v >> 4, v & 15, NVENCAPI_MAJOR_VERSION, NVENCAPI_MINOR_VERSION);
		return false;
	}
	memset(&nv, 0, sizeof(nv));
	nv.version = NV_ENCODE_API_FUNCTION_LIST_VER;
	if(criar(&nv) != NV_ENC_SUCCESS) { snprintf(nvErro, sizeof(nvErro), "sem-nvenc"); return false; }
	nvOk = true;
	return true;
}

// ------------------------------------------------------------------ vídeo
typedef struct {
	ID3D11Device *dev;
	ID3D11DeviceContext *ctx;
	IDXGIOutputDuplication *dup;
	ID3D11Texture2D *tDesk, *tGdi, *tNv12;
	ID3D11VideoDevice *vdev;
	ID3D11VideoContext *vctx;
	ID3D11VideoProcessorEnumerator *vpe;
	ID3D11VideoProcessor *vp;
	ID3D11VideoProcessorInputView *vin;
	ID3D11VideoProcessorOutputView *vout;
	void *enc;
	NV_ENC_REGISTERED_PTR reg;
	NV_ENC_OUTPUT_PTR bs;
	NV_ENC_INITIALIZE_PARAMS ip;
	NV_ENC_CONFIG cfg;
	int w, h, tw, th, qps, kbps;
	Monitor mon;
	bool temImagem;
} Video;

#define SOLTAR(p) do { if(p) { (p)->lpVtbl->Release(p); (p) = NULL; } } while(0)

static void fechar_video(Video *v)
{
	if(v->enc)
	{
		if(v->reg) nv.nvEncUnregisterResource(v->enc, v->reg);
		if(v->bs) nv.nvEncDestroyBitstreamBuffer(v->enc, v->bs);
		nv.nvEncDestroyEncoder(v->enc);
		v->enc = NULL;
		v->reg = NULL;
		v->bs = NULL;
	}
	SOLTAR(v->vin);
	SOLTAR(v->vout);
	SOLTAR(v->vp);
	SOLTAR(v->vpe);
	SOLTAR(v->vctx);
	SOLTAR(v->vdev);
	SOLTAR(v->tDesk);
	SOLTAR(v->tGdi);
	SOLTAR(v->tNv12);
	SOLTAR(v->dup);
	SOLTAR(v->ctx);
	SOLTAR(v->dev);
}

static ID3D11Texture2D *textura(ID3D11Device *dev, int w, int h, DXGI_FORMAT f, UINT bind, UINT misc)
{
	D3D11_TEXTURE2D_DESC d;
	memset(&d, 0, sizeof(d));
	d.Width = (UINT)w;
	d.Height = (UINT)h;
	d.MipLevels = 1;
	d.ArraySize = 1;
	d.Format = f;
	d.SampleDesc.Count = 1;
	d.Usage = D3D11_USAGE_DEFAULT;
	d.BindFlags = bind;
	d.MiscFlags = misc;
	ID3D11Texture2D *t = NULL;
	return SUCCEEDED(ID3D11Device_CreateTexture2D(dev, &d, NULL, &t)) ? t : NULL;
}

// a duplicação do monitor (de novo quando o Windows a derruba: troca de modo, UAC, tela cheia)
static HRESULT abrir_duplicacao(Video *v)
{
	SOLTAR(v->dup);
	IDXGIFactory1 *f = NULL;
	HRESULT hr = CreateDXGIFactory1(&IID_IDXGIFactory1, (void **)&f);
	if(FAILED(hr)) return hr;
	IDXGIAdapter1 *a = NULL;
	IDXGIOutput *o = NULL;
	IDXGIOutput1 *o1 = NULL;
	hr = IDXGIFactory1_EnumAdapters1(f, (UINT)v->mon.adaptador, &a);
	if(SUCCEEDED(hr)) hr = IDXGIAdapter1_EnumOutputs(a, (UINT)v->mon.saida, &o);
	if(SUCCEEDED(hr)) hr = IDXGIOutput_QueryInterface(o, &IID_IDXGIOutput1, (void **)&o1);
	if(SUCCEEDED(hr)) hr = IDXGIOutput1_DuplicateOutput(o1, (IUnknown *)v->dev, &v->dup);
	SOLTAR(o1);
	SOLTAR(o);
	SOLTAR(a);
	SOLTAR(f);
	return hr;
}

static bool abrir_codificador(Video *v)
{
	NV_ENC_OPEN_ENCODE_SESSION_EX_PARAMS op;
	memset(&op, 0, sizeof(op));
	op.version = NV_ENC_OPEN_ENCODE_SESSION_EX_PARAMS_VER;
	op.device = v->dev;
	op.deviceType = NV_ENC_DEVICE_TYPE_DIRECTX;
	op.apiVersion = NVENCAPI_VERSION;
	NVENCSTATUS st = nv.nvEncOpenEncodeSessionEx(&op, &v->enc);
	if(st != NV_ENC_SUCCESS) { registrar_log("nvEncOpenEncodeSessionEx %d", st); v->enc = NULL; return false; }

	NV_ENC_PRESET_CONFIG pc;
	memset(&pc, 0, sizeof(pc));
	pc.version = NV_ENC_PRESET_CONFIG_VER;
	pc.presetCfg.version = NV_ENC_CONFIG_VER;
	GUID preset = NV_ENC_PRESET_P3_GUID;
	st = nv.nvEncGetEncodePresetConfigEx(v->enc, NV_ENC_CODEC_H264_GUID, preset, NV_ENC_TUNING_INFO_ULTRA_LOW_LATENCY, &pc);
	if(st != NV_ENC_SUCCESS) { registrar_log("nvEncGetEncodePresetConfigEx %d", st); return false; }
	v->cfg = pc.presetCfg;
	NV_ENC_CONFIG *c = &v->cfg;
	c->profileGUID = NV_ENC_H264_PROFILE_HIGH_GUID;
	c->gopLength = NVENC_INFINITE_GOPLENGTH;
	c->frameIntervalP = 1;
	c->rcParams.rateControlMode = NV_ENC_PARAMS_RC_CBR;
	c->rcParams.averageBitRate = (uint32_t)v->kbps * 1000u;
	c->rcParams.maxBitRate = c->rcParams.averageBitRate;
	// buffer de 2 quadros: o quadro-chave cabe sem estourar e o atraso fica em ~1 quadro
	c->rcParams.vbvBufferSize = c->rcParams.averageBitRate / (uint32_t)v->qps * 2u;
	c->rcParams.vbvInitialDelay = c->rcParams.vbvBufferSize;
	NV_ENC_CONFIG_H264 *h = &c->encodeCodecConfig.h264Config;
	h->idrPeriod = NVENC_INFINITE_GOPLENGTH;
	h->repeatSPSPPS = 1;
	h->outputAUD = 0;
	// uma referência só: o SPS sai com max_dec_frame_buffering 1 (com 3, de fábrica, há decodificador que
	// segura até 3 quadros antes de mostrar)
	h->maxNumRefFrames = 1;
	// VUI: cores BT.709 em faixa limitada (o que o processador de vídeo faz) e "nada fora de ordem"
	// (sem isso o decodificador da placa do Chrome segura quadros)
	NV_ENC_CONFIG_H264_VUI_PARAMETERS *u = &h->h264VUIParameters;
	u->videoSignalTypePresentFlag = 1;
	u->videoFormat = NV_ENC_VUI_VIDEO_FORMAT_UNSPECIFIED;
	u->videoFullRangeFlag = 0;
	u->colourDescriptionPresentFlag = 1;
	u->colourPrimaries = NV_ENC_VUI_COLOR_PRIMARIES_BT709;
	u->transferCharacteristics = NV_ENC_VUI_TRANSFER_CHARACTERISTIC_BT709;
	u->colourMatrix = NV_ENC_VUI_MATRIX_COEFFS_BT709;
	u->bitstreamRestrictionFlag = 1;

	memset(&v->ip, 0, sizeof(v->ip));
	v->ip.version = NV_ENC_INITIALIZE_PARAMS_VER;
	v->ip.encodeGUID = NV_ENC_CODEC_H264_GUID;
	v->ip.presetGUID = preset;
	v->ip.tuningInfo = NV_ENC_TUNING_INFO_ULTRA_LOW_LATENCY;
	v->ip.encodeWidth = (uint32_t)v->tw;
	v->ip.encodeHeight = (uint32_t)v->th;
	v->ip.darWidth = (uint32_t)v->tw;
	v->ip.darHeight = (uint32_t)v->th;
	v->ip.maxEncodeWidth = (uint32_t)v->tw;
	v->ip.maxEncodeHeight = (uint32_t)v->th;
	v->ip.frameRateNum = (uint32_t)v->qps;
	v->ip.frameRateDen = 1;
	v->ip.enablePTD = 1;
	v->ip.encodeConfig = &v->cfg;
	st = nv.nvEncInitializeEncoder(v->enc, &v->ip);
	if(st != NV_ENC_SUCCESS) { registrar_log("nvEncInitializeEncoder %d", st); return false; }

	NV_ENC_CREATE_BITSTREAM_BUFFER cb;
	memset(&cb, 0, sizeof(cb));
	cb.version = NV_ENC_CREATE_BITSTREAM_BUFFER_VER;
	st = nv.nvEncCreateBitstreamBuffer(v->enc, &cb);
	if(st != NV_ENC_SUCCESS) { registrar_log("nvEncCreateBitstreamBuffer %d", st); return false; }
	v->bs = cb.bitstreamBuffer;

	NV_ENC_REGISTER_RESOURCE rr;
	memset(&rr, 0, sizeof(rr));
	rr.version = NV_ENC_REGISTER_RESOURCE_VER;
	rr.resourceType = NV_ENC_INPUT_RESOURCE_TYPE_DIRECTX;
	rr.width = (uint32_t)v->tw;
	rr.height = (uint32_t)v->th;
	rr.resourceToRegister = v->tNv12;
	rr.bufferFormat = NV_ENC_BUFFER_FORMAT_NV12;
	rr.bufferUsage = NV_ENC_INPUT_IMAGE;
	st = nv.nvEncRegisterResource(v->enc, &rr);
	if(st != NV_ENC_SUCCESS) { registrar_log("nvEncRegisterResource %d", st); return false; }
	v->reg = rr.registeredResource;

	// o SPS/PPS para a página (tipo 3)
	uint8_t sps[512];
	uint32_t spsTam = 0;
	NV_ENC_SEQUENCE_PARAM_PAYLOAD sp;
	memset(&sp, 0, sizeof(sp));
	sp.version = NV_ENC_SEQUENCE_PARAM_PAYLOAD_VER;
	sp.inBufferSize = sizeof(sps);
	sp.spsppsBuffer = sps;
	sp.outSPSPPSPayloadSize = &spsTam;
	if(nv.nvEncGetSequenceParams(v->enc, &sp) == NV_ENC_SUCCESS && spsTam)
	{
		EnterCriticalSection(&travaEnvio);
		free(cabecalho);
		cabecalho = malloc(spsTam);
		if(cabecalho) { memcpy(cabecalho, sps, spsTam); cabecalhoTam = spsTam; }
		LeaveCriticalSection(&travaEnvio);
		enviar_binario(3, 0, 0, 0, sps, spsTam);
	}
	return true;
}

// o processador de vídeo: BGRA do tamanho do monitor -> NV12 do tamanho da imagem, BT.709 limitado
static bool abrir_conversor(Video *v)
{
	if(FAILED(ID3D11Device_QueryInterface(v->dev, &IID_ID3D11VideoDevice, (void **)&v->vdev))) return false;
	if(FAILED(ID3D11DeviceContext_QueryInterface(v->ctx, &IID_ID3D11VideoContext, (void **)&v->vctx))) return false;
	D3D11_VIDEO_PROCESSOR_CONTENT_DESC cd;
	memset(&cd, 0, sizeof(cd));
	cd.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
	cd.InputFrameRate.Numerator = (UINT)v->qps;
	cd.InputFrameRate.Denominator = 1;
	cd.InputWidth = (UINT)v->w;
	cd.InputHeight = (UINT)v->h;
	cd.OutputFrameRate = cd.InputFrameRate;
	cd.OutputWidth = (UINT)v->tw;
	cd.OutputHeight = (UINT)v->th;
	cd.Usage = D3D11_VIDEO_USAGE_OPTIMAL_SPEED;
	if(FAILED(ID3D11VideoDevice_CreateVideoProcessorEnumerator(v->vdev, &cd, &v->vpe))) return false;
	if(FAILED(ID3D11VideoDevice_CreateVideoProcessor(v->vdev, v->vpe, 0, &v->vp))) return false;
	D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC iv;
	memset(&iv, 0, sizeof(iv));
	iv.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
	if(FAILED(ID3D11VideoDevice_CreateVideoProcessorInputView(v->vdev, (ID3D11Resource *)v->tGdi, v->vpe, &iv, &v->vin))) return false;
	D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC ov;
	memset(&ov, 0, sizeof(ov));
	ov.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
	if(FAILED(ID3D11VideoDevice_CreateVideoProcessorOutputView(v->vdev, (ID3D11Resource *)v->tNv12, v->vpe, &ov, &v->vout))) return false;
	D3D11_VIDEO_PROCESSOR_COLOR_SPACE cin, cout;
	memset(&cin, 0, sizeof(cin));
	memset(&cout, 0, sizeof(cout));
	cin.RGB_Range = 0;          // RGB 0-255
	cout.YCbCr_Matrix = 1;      // BT.709
	cout.Nominal_Range = D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_16_235;
	ID3D11VideoContext_VideoProcessorSetStreamColorSpace(v->vctx, v->vp, 0, &cin);
	ID3D11VideoContext_VideoProcessorSetOutputColorSpace(v->vctx, v->vp, &cout);
	ID3D11VideoContext_VideoProcessorSetStreamFrameFormat(v->vctx, v->vp, 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
	ID3D11VideoContext_VideoProcessorSetStreamAutoProcessingMode(v->vctx, v->vp, 0, FALSE);
	RECT src = { 0, 0, v->w, v->h }, dst = { 0, 0, v->tw, v->th };
	ID3D11VideoContext_VideoProcessorSetStreamSourceRect(v->vctx, v->vp, 0, TRUE, &src);
	ID3D11VideoContext_VideoProcessorSetStreamDestRect(v->vctx, v->vp, 0, TRUE, &dst);
	ID3D11VideoContext_VideoProcessorSetOutputTargetRect(v->vctx, v->vp, TRUE, &dst);
	return true;
}

// tudo o que a sessão de vídeo precisa; erro: o motivo (para a página)
static const char *abrir_video(Video *v, const Pedido *p)
{
	memset(v, 0, sizeof(*v));
	listar_monitores();
	if(p->monitor < 0 || p->monitor >= nMonitores) return "monitor";
	v->mon = monitores[p->monitor];
	v->qps = p->qps;
	v->kbps = p->kbps;
	if(!carregar_nvenc()) return nvErro;

	IDXGIFactory1 *f = NULL;
	IDXGIAdapter1 *a = NULL;
	if(FAILED(CreateDXGIFactory1(&IID_IDXGIFactory1, (void **)&f))) return "dxgi";
	HRESULT hr = IDXGIFactory1_EnumAdapters1(f, (UINT)v->mon.adaptador, &a);
	SOLTAR(f);
	if(FAILED(hr)) return "dxgi";
	D3D_FEATURE_LEVEL nivel;
	hr = D3D11CreateDevice((IDXGIAdapter *)a, D3D_DRIVER_TYPE_UNKNOWN, NULL,
		D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT, NULL, 0, D3D11_SDK_VERSION, &v->dev, &nivel, &v->ctx);
	SOLTAR(a);
	if(FAILED(hr)) { registrar_log("D3D11CreateDevice %08lx", hr); return "d3d11"; }
	// o NVENC usa o mesmo dispositivo em outra thread dele
	ID3D11Multithread *mt = NULL;
	if(SUCCEEDED(ID3D11DeviceContext_QueryInterface(v->ctx, &IID_ID3D11Multithread, (void **)&mt))) { ID3D11Multithread_SetMultithreadProtected(mt, TRUE); SOLTAR(mt); }

	hr = abrir_duplicacao(v);
	if(FAILED(hr)) { registrar_log("DuplicateOutput %08lx", hr); return hr == DXGI_ERROR_NOT_CURRENTLY_AVAILABLE ? "duplicacao-ocupada" : "duplicacao"; }
	DXGI_OUTDUPL_DESC dd;
	IDXGIOutputDuplication_GetDesc(v->dup, &dd);
	v->w = (int)dd.ModeDesc.Width;
	v->h = (int)dd.ModeDesc.Height;
	if(dd.Rotation == DXGI_MODE_ROTATION_ROTATE90 || dd.Rotation == DXGI_MODE_ROTATION_ROTATE270) { int t = v->w; v->w = v->h; v->h = t; }
	// o tamanho da imagem: a altura pedida (sem aumentar), na proporção do monitor, em números pares
	int alt = p->altura > 0 && p->altura < v->h ? p->altura : v->h;
	v->th = alt & ~1;
	v->tw = ((int)lround((double)v->w * alt / v->h)) & ~1;
	if(v->tw > 4096 || v->th > 4096) { v->th = (int)(4096.0 * v->th / v->tw) & ~1; v->tw = 4096; }

	v->tDesk = textura(v->dev, v->w, v->h, DXGI_FORMAT_B8G8R8A8_UNORM, 0, 0);
	v->tGdi = textura(v->dev, v->w, v->h, DXGI_FORMAT_B8G8R8A8_UNORM, D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE, D3D11_RESOURCE_MISC_GDI_COMPATIBLE);
	v->tNv12 = textura(v->dev, v->tw, v->th, DXGI_FORMAT_NV12, D3D11_BIND_RENDER_TARGET, 0);
	if(!v->tDesk || !v->tGdi || !v->tNv12) return "texturas";
	if(!abrir_conversor(v)) return "conversor";
	if(!abrir_codificador(v)) return "nvenc-sessao";
	return NULL;
}

// o ponteiro do mouse por cima da imagem (a duplicação não desenha o cursor)
static void desenhar_cursor(Video *v)
{
	CURSORINFO ci;
	memset(&ci, 0, sizeof(ci));
	ci.cbSize = sizeof(ci);
	if(!GetCursorInfo(&ci) || !(ci.flags & CURSOR_SHOWING) || !ci.hCursor) return;
	static HCURSOR ultimo = NULL;
	static int hx = 0, hy = 0, cw = 32, ch = 32;
	if(ci.hCursor != ultimo)
	{
		ICONINFO ii;
		if(!GetIconInfo(ci.hCursor, &ii)) return;
		hx = (int)ii.xHotspot;
		hy = (int)ii.yHotspot;
		BITMAP bm;
		if(ii.hbmColor && GetObject(ii.hbmColor, sizeof(bm), &bm)) { cw = bm.bmWidth; ch = bm.bmHeight; }
		else if(ii.hbmMask && GetObject(ii.hbmMask, sizeof(bm), &bm)) { cw = bm.bmWidth; ch = bm.bmHeight / 2; }
		if(ii.hbmColor) DeleteObject(ii.hbmColor);
		if(ii.hbmMask) DeleteObject(ii.hbmMask);
		ultimo = ci.hCursor;
	}
	int x = ci.ptScreenPos.x - v->mon.x - hx, y = ci.ptScreenPos.y - v->mon.y - hy;
	if(x + cw <= 0 || y + ch <= 0 || x >= v->w || y >= v->h) return;
	IDXGISurface1 *s = NULL;
	if(FAILED(ID3D11Texture2D_QueryInterface(v->tGdi, &IID_IDXGISurface1, (void **)&s))) return;
	HDC dc;
	if(SUCCEEDED(IDXGISurface1_GetDC(s, FALSE, &dc)))
	{
		DrawIconEx(dc, x, y, ci.hCursor, 0, 0, 0, NULL, DI_NORMAL);
		IDXGISurface1_ReleaseDC(s, NULL);
	}
	SOLTAR(s);
}

// converte e codifica a imagem guardada; manda o quadro para a página
static bool codificar(Video *v, bool cursor, bool idr, uint64_t ts, double *msCod)
{
	double t0 = agora_ms();
	ID3D11DeviceContext_CopyResource(v->ctx, (ID3D11Resource *)v->tGdi, (ID3D11Resource *)v->tDesk);
	if(cursor) desenhar_cursor(v);
	D3D11_VIDEO_PROCESSOR_STREAM st;
	memset(&st, 0, sizeof(st));
	st.Enable = TRUE;
	st.pInputSurface = v->vin;
	if(FAILED(ID3D11VideoContext_VideoProcessorBlt(v->vctx, v->vp, v->vout, 0, 1, &st))) { registrar_log("VideoProcessorBlt falhou"); return false; }

	NV_ENC_MAP_INPUT_RESOURCE map;
	memset(&map, 0, sizeof(map));
	map.version = NV_ENC_MAP_INPUT_RESOURCE_VER;
	map.registeredResource = v->reg;
	NVENCSTATUS s = nv.nvEncMapInputResource(v->enc, &map);
	if(s != NV_ENC_SUCCESS) { registrar_log("nvEncMapInputResource %d", s); return false; }
	NV_ENC_PIC_PARAMS pp;
	memset(&pp, 0, sizeof(pp));
	pp.version = NV_ENC_PIC_PARAMS_VER;
	pp.inputBuffer = map.mappedResource;
	pp.bufferFmt = map.mappedBufferFmt;
	pp.inputWidth = (uint32_t)v->tw;
	pp.inputHeight = (uint32_t)v->th;
	pp.outputBitstream = v->bs;
	pp.pictureStruct = NV_ENC_PIC_STRUCT_FRAME;
	pp.inputTimeStamp = ts;
	if(idr) pp.encodePicFlags = NV_ENC_PIC_FLAG_FORCEIDR | NV_ENC_PIC_FLAG_OUTPUT_SPSPPS;
	s = nv.nvEncEncodePicture(v->enc, &pp);
	bool ok = s == NV_ENC_SUCCESS;
	if(ok)
	{
		NV_ENC_LOCK_BITSTREAM lb;
		memset(&lb, 0, sizeof(lb));
		lb.version = NV_ENC_LOCK_BITSTREAM_VER;
		lb.outputBitstream = v->bs;
		s = nv.nvEncLockBitstream(v->enc, &lb);
		if(s == NV_ENC_SUCCESS)
		{
			*msCod = agora_ms() - t0;
			enviar_binario(1, 0, 0, seqVideo++, lb.bitstreamBufferPtr, lb.bitstreamSizeInBytes);
			nv.nvEncUnlockBitstream(v->enc, v->bs);
		}
		else { registrar_log("nvEncLockBitstream %d", s); ok = false; }
	}
	else registrar_log("nvEncEncodePicture %d", s);
	nv.nvEncUnmapInputResource(v->enc, map.mappedResource);
	return ok;
}

static void mudar_banda(Video *v, int kbps)
{
	v->kbps = kbps;
	v->cfg.rcParams.averageBitRate = (uint32_t)kbps * 1000u;
	v->cfg.rcParams.maxBitRate = v->cfg.rcParams.averageBitRate;
	v->cfg.rcParams.vbvBufferSize = v->cfg.rcParams.averageBitRate / (uint32_t)v->qps * 2u;
	v->cfg.rcParams.vbvInitialDelay = v->cfg.rcParams.vbvBufferSize;
	NV_ENC_RECONFIGURE_PARAMS rp;
	memset(&rp, 0, sizeof(rp));
	rp.version = NV_ENC_RECONFIGURE_PARAMS_VER;
	rp.reInitEncodeParams = v->ip;
	rp.reInitEncodeParams.encodeConfig = &v->cfg;
	NVENCSTATUS s = nv.nvEncReconfigureEncoder(v->enc, &rp);
	registrar_log("banda %d kbps (%d)", kbps, s);
}

static void mandar_conectado(const Video *v, const Pedido *p)
{
	char json[512];
	snprintf(json, sizeof(json), "{\"tipo\":\"conectado\",\"largura\":%d,\"altura\":%d,\"qps\":%d,\"kbps\":%d,\"codec\":\"h264\","
		"\"monitor\":%d,\"rotulo\":\"screen:%d:0\",\"origem\":\"%dx%d\",\"hz\":%d,\"cursor\":%s}",
		v->tw, v->th, v->qps, v->kbps, p->monitor, v->mon.indiceWin < 0 ? p->monitor : v->mon.indiceWin, v->w, v->h,
		hz_do_monitor(v->mon.nome), p->cursor ? "true" : "false");
	EnterCriticalSection(&travaEnvio);
	snprintf(conectadoJson, sizeof(conectadoJson), "%s", json);
	LeaveCriticalSection(&travaEnvio);
	enviar_texto(json);
}

static void mandar_saiu(const char *motivo, bool erro)
{
	char json[200];
	snprintf(json, sizeof(json), "{\"tipo\":\"saiu\",\"erro\":%s,\"motivo\":\"%s\"}", erro ? "true" : "false", motivo);
	EnterCriticalSection(&travaEnvio);
	conectadoJson[0] = 0;
	LeaveCriticalSection(&travaEnvio);
	enviar_texto(json);
}

static unsigned __stdcall rodar_video(void *arg)
{
	Pedido p = *(Pedido *)arg;
	free(arg);
	CoInitializeEx(NULL, COINIT_MULTITHREADED);
	SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
	Video v;
	const char *erro = abrir_video(&v, &p);
	if(erro)
	{
		registrar_log("video nao abriu: %s", erro);
		fechar_video(&v);
		mandar_saiu(erro, true);
		CoUninitialize();
		return 0;
	}
	registrar_log("video: %s %dx%d -> %dx%d a %d qps, %d kbps (%s)", v.mon.nome, v.w, v.h, v.tw, v.th, v.qps, v.kbps, v.mon.placa);
	mandar_conectado(&v, &p);

	// O ritmo: um relógio na cadência pedida, com folga de 1/4 de quadro para cada lado. O quadro novo da
	// tela que chega dentro da folga sai na hora (e o relógio anda uma cadência, não para a hora dele):
	// o jogo a 60 num monitor de 144/165 Hz não cai para 52 por um quadro chegar 1 ms depois do tique.
	const double intervalo = 1000.0 / v.qps, folga = intervalo / 4;
	double alvo = agora_ms(), ultimoEnvio = 0, ultimoLog = agora_ms();
	bool novo = false, primeiro = true;
	int quadros = 0, repetidos = 0, perdidosDup = 0;
	double somaCod = 0, maxCod = 0;
	uint64_t ts = 0;
	InterlockedExchange(&pedirIdr, 0);
	while(!pararVideo)
	{
		double agora = agora_ms();
		// com quadro guardado: até a hora dele; sem: espera a tela mudar (no máximo 20 ms, para ver os pedidos)
		double ate = novo ? alvo - folga - agora : 20;
		int espera = ate < 0 ? 0 : (int)ate;
		if(espera > 20) espera = 20;
		DXGI_OUTDUPL_FRAME_INFO fi;
		IDXGIResource *r = NULL;
		HRESULT hr = v.dup ? IDXGIOutputDuplication_AcquireNextFrame(v.dup, (UINT)espera, &fi, &r) : DXGI_ERROR_ACCESS_LOST;
		if(SUCCEEDED(hr))
		{
			ID3D11Texture2D *t = NULL;
			if(SUCCEEDED(IDXGIResource_QueryInterface(r, &IID_ID3D11Texture2D, (void **)&t)))
			{
				D3D11_TEXTURE2D_DESC d;
				ID3D11Texture2D_GetDesc(t, &d);
				if((int)d.Width == v.w && (int)d.Height == v.h)
				{
					ID3D11DeviceContext_CopyResource(v.ctx, (ID3D11Resource *)v.tDesk, (ID3D11Resource *)t);
					v.temImagem = true;
					novo = true;
					if(fi.AccumulatedFrames > 1) perdidosDup += (int)fi.AccumulatedFrames - 1;
				}
				SOLTAR(t);
			}
			SOLTAR(r);
			IDXGIOutputDuplication_ReleaseFrame(v.dup);
		}
		else if(hr == DXGI_ERROR_ACCESS_LOST || hr == DXGI_ERROR_INVALID_CALL)
		{
			// o Windows derrubou a duplicação (troca de modo, tela cheia, UAC): abre de novo
			Sleep(50);
			HRESULT h2 = abrir_duplicacao(&v);
			if(SUCCEEDED(h2))
			{
				DXGI_OUTDUPL_DESC dd;
				IDXGIOutputDuplication_GetDesc(v.dup, &dd);
				if((int)dd.ModeDesc.Width != v.w || (int)dd.ModeDesc.Height != v.h)
				{
					// o monitor mudou de resolução: começa tudo de novo (a página recebe outro SPS)
					registrar_log("o monitor mudou para %ux%u: reabrindo", dd.ModeDesc.Width, dd.ModeDesc.Height);
					fechar_video(&v);
					erro = abrir_video(&v, &p);
					if(erro) { registrar_log("video nao reabriu: %s", erro); break; }
					mandar_conectado(&v, &p);
					primeiro = true;
				}
				else registrar_log("duplicacao reaberta");
			}
			continue;
		}
		else if(hr != DXGI_ERROR_WAIT_TIMEOUT)
		{
			registrar_log("AcquireNextFrame %08lx", hr);
			Sleep(10);
		}

		agora = agora_ms();
		LONG kb = InterlockedExchange(&novoKbps, 0);
		if(kb > 0 && kb != v.kbps) mudar_banda(&v, (int)kb);
		// sem nada novo na tela, de 100 em 100 ms vai um quadro igual (a outra ponta sabe que estamos vivos)
		bool vez = novo ? agora >= alvo - folga : agora - ultimoEnvio >= 100;
		bool idr = primeiro || (pedirIdr && agora - ultimoEnvio >= intervalo - folga);
		if(v.temImagem && (vez || idr))
		{
			if(idr) InterlockedExchange(&pedirIdr, 0);
			// no tempo: o relógio anda uma cadência; atrasado demais (a tela parada): recomeça daqui
			alvo = agora - alvo > intervalo ? agora + intervalo : alvo + intervalo;
			double ms = 0;
			if(!novo) repetidos++;
			if(codificar(&v, p.cursor, idr, ts++, &ms))
			{
				primeiro = false;
				quadros++;
				somaCod += ms;
				if(ms > maxCod) maxCod = ms;
			}
			novo = false;
			ultimoEnvio = agora;
		}
		if(agora - ultimoLog >= 10000)
		{
			registrar_log("10 s: %d quadros (%d repetidos), codificar %.1f ms (max %.1f), %d quadros da tela pulados",
				quadros, repetidos, quadros ? somaCod / quadros : 0, maxCod, perdidosDup);
			quadros = repetidos = perdidosDup = 0;
			somaCod = maxCod = 0;
			ultimoLog = agora;
		}
	}
	fechar_video(&v);
	if(!pararVideo) mandar_saiu("video", true);
	CoUninitialize();
	registrar_log("video parou");
	return 0;
}

// ------------------------------------------------------------------ som
// O som do PC menos o do navegador (a voz da sala toca no Chrome: sem isso, quem joga ouviria a própria
// voz de volta). Windows 10 2004+: captura por processo, "tudo menos a árvore deste processo". Antes
// disso, o som inteiro do PC (com aviso).
typedef struct { DWORD TargetProcessId; DWORD ProcessLoopbackMode; } LoopbackProcesso;
typedef struct { DWORD ActivationType; LoopbackProcesso ProcessLoopbackParams; } AtivacaoAudio;
typedef HRESULT (WINAPI *AtivarAsync)(LPCWSTR, REFIID, PROPVARIANT *, IActivateAudioInterfaceCompletionHandler *, IActivateAudioInterfaceAsyncOperation **);
DEFINE_GUID(IID_IAgileObject_, 0x94ea2b94, 0xe9cc, 0x49e0, 0xc0, 0xff, 0xee, 0x64, 0xca, 0x8f, 0x5b, 0x90);

typedef struct { IActivateAudioInterfaceCompletionHandler base; HANDLE ev; } Concluido;
static HRESULT STDMETHODCALLTYPE cc_qi(IActivateAudioInterfaceCompletionHandler *t, REFIID riid, void **pp)
{
	if(IsEqualIID(riid, &IID_IUnknown) || IsEqualIID(riid, &IID_IActivateAudioInterfaceCompletionHandler) || IsEqualIID(riid, &IID_IAgileObject_))
	{
		*pp = t;
		return S_OK;
	}
	*pp = NULL;
	return E_NOINTERFACE;
}
static ULONG STDMETHODCALLTYPE cc_ref(IActivateAudioInterfaceCompletionHandler *t) { (void)t; return 1; }
static HRESULT STDMETHODCALLTYPE cc_fim(IActivateAudioInterfaceCompletionHandler *t, IActivateAudioInterfaceAsyncOperation *op)
{
	(void)op;
	SetEvent(((Concluido *)t)->ev);
	return S_OK;
}
static IActivateAudioInterfaceCompletionHandlerVtbl ccVtbl = { cc_qi, cc_ref, cc_ref, cc_fim };

// o processo do navegador (o de cima de todos com o mesmo nome) acima desta ponte
static DWORD pid_do_navegador(void)
{
	static const char *nomes[] = { "chrome.exe", "msedge.exe", "brave.exe", "opera.exe", "vivaldi.exe", "chromium.exe", "firefox.exe" };
	HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	if(snap == INVALID_HANDLE_VALUE) return 0;
	enum { MAXP = 4096 };
	static PROCESSENTRY32 lista[MAXP];
	int n = 0;
	PROCESSENTRY32 e;
	e.dwSize = sizeof(e);
	for(BOOL ok = Process32First(snap, &e); ok && n < MAXP; ok = Process32Next(snap, &e)) lista[n++] = e;
	CloseHandle(snap);
	DWORD atual = GetCurrentProcessId(), achado = 0;
	char nomeAchado[MAX_PATH] = "";
	for(int passo = 0; passo < 16; passo++)
	{
		int i;
		for(i = 0; i < n && lista[i].th32ProcessID != atual; i++);
		if(i == n) break;
		DWORD pai = lista[i].th32ParentProcessID;
		int j;
		for(j = 0; j < n && lista[j].th32ProcessID != pai; j++);
		if(j == n || pai == 0) break;
		const char *nome = lista[j].szExeFile;
		if(achado)
		{
			if(_stricmp(nome, nomeAchado) != 0) break;
			achado = pai;
		}
		else
		{
			for(size_t k = 0; k < sizeof(nomes) / sizeof(nomes[0]); k++)
				if(_stricmp(nome, nomes[k]) == 0) { achado = pai; snprintf(nomeAchado, sizeof(nomeAchado), "%s", nome); break; }
		}
		atual = pai;
	}
	if(achado) registrar_log("navegador: %s pid %lu (o som dele fica de fora)", nomeAchado, achado);
	return achado;
}

static IAudioClient *audio_sem_navegador(DWORD pid)
{
	HMODULE dll = LoadLibraryA("Mmdevapi.dll");
	AtivarAsync ativar = dll ? (AtivarAsync)(void *)GetProcAddress(dll, "ActivateAudioInterfaceAsync") : NULL;
	if(!ativar || !pid) return NULL;
	AtivacaoAudio aa = { 1, { pid, 1 } }; // PROCESS_LOOPBACK, EXCLUDE_TARGET_PROCESS_TREE
	PROPVARIANT pv;
	memset(&pv, 0, sizeof(pv));
	pv.vt = VT_BLOB;
	pv.blob.cbSize = sizeof(aa);
	pv.blob.pBlobData = (BYTE *)&aa;
	Concluido cc = { { &ccVtbl }, CreateEventA(NULL, FALSE, FALSE, NULL) };
	IActivateAudioInterfaceAsyncOperation *op = NULL;
	HRESULT hr = ativar(L"VAD\\Process_Loopback", &IID_IAudioClient, &pv, &cc.base, &op);
	IAudioClient *ac = NULL;
	if(SUCCEEDED(hr) && WaitForSingleObject(cc.ev, 5000) == WAIT_OBJECT_0)
	{
		HRESULT hrAtivou = E_FAIL;
		IUnknown *u = NULL;
		if(SUCCEEDED(IActivateAudioInterfaceAsyncOperation_GetActivateResult(op, &hrAtivou, &u)) && SUCCEEDED(hrAtivou) && u)
		{
			IUnknown_QueryInterface(u, &IID_IAudioClient, (void **)&ac);
			IUnknown_Release(u);
		}
		else registrar_log("captura por processo: %08lx", hrAtivou);
	}
	else registrar_log("ActivateAudioInterfaceAsync %08lx", hr);
	if(op) IActivateAudioInterfaceAsyncOperation_Release(op);
	CloseHandle(cc.ev);
	return ac;
}

static IAudioClient *audio_tudo(void)
{
	IMMDeviceEnumerator *en = NULL;
	IMMDevice *d = NULL;
	IAudioClient *ac = NULL;
	if(SUCCEEDED(CoCreateInstance(&CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL, &IID_IMMDeviceEnumerator, (void **)&en))
		&& SUCCEEDED(IMMDeviceEnumerator_GetDefaultAudioEndpoint(en, eRender, eConsole, &d)))
		IMMDevice_Activate(d, &IID_IAudioClient, CLSCTX_ALL, NULL, (void **)&ac);
	SOLTAR(d);
	SOLTAR(en);
	return ac;
}

#define SOM_HZ 48000
#define SOM_QUADRO 480   // 10 ms

static unsigned __stdcall rodar_som(void *arg)
{
	(void)arg;
	CoInitializeEx(NULL, COINIT_MULTITHREADED);
	SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
	WAVEFORMATEX wf;
	memset(&wf, 0, sizeof(wf));
	wf.wFormatTag = WAVE_FORMAT_PCM;
	wf.nChannels = 2;
	wf.nSamplesPerSec = SOM_HZ;
	wf.wBitsPerSample = 16;
	wf.nBlockAlign = 4;
	wf.nAvgBytesPerSec = SOM_HZ * 4;
	const char *modo = "processo";
	IAudioClient *ac = audio_sem_navegador(pidExcluir ? pidExcluir : pid_do_navegador());
	HANDLE ev = CreateEventA(NULL, FALSE, FALSE, NULL);
	HRESULT hr = E_FAIL;
	if(ac)
	{
		hr = IAudioClient_Initialize(ac, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK, 200000, 0, &wf, NULL);
		if(FAILED(hr)) { registrar_log("captura por processo Initialize %08lx", hr); SOLTAR(ac); }
	}
	if(!ac)
	{
		modo = "tudo";
		ac = audio_tudo();
		if(ac)
		{
			hr = IAudioClient_Initialize(ac, AUDCLNT_SHAREMODE_SHARED,
				AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
				200000, 0, &wf, NULL);
			if(FAILED(hr)) { registrar_log("loopback Initialize %08lx", hr); SOLTAR(ac); }
		}
	}
	IAudioCaptureClient *cap = NULL;
	if(ac && (FAILED(IAudioClient_SetEventHandle(ac, ev)) || FAILED(IAudioClient_GetService(ac, &IID_IAudioCaptureClient, (void **)&cap)) || FAILED(IAudioClient_Start(ac))))
	{
		registrar_log("o som nao comecou");
		SOLTAR(cap);
		SOLTAR(ac);
	}
	int erroOpus = 0;
	OpusEncoder *op = ac ? opus_encoder_create(SOM_HZ, 2, OPUS_APPLICATION_RESTRICTED_LOWDELAY, &erroOpus) : NULL;
	if(!op)
	{
		registrar_log("sem som (opus %d)", erroOpus);
		avisar("sem o som do PC: a captura do Windows nao abriu");
		SOLTAR(cap);
		SOLTAR(ac);
		CloseHandle(ev);
		CoUninitialize();
		return 0;
	}
	opus_encoder_ctl(op, OPUS_SET_BITRATE(128000));
	registrar_log("som: %s", modo);
	if(strcmp(modo, "tudo") == 0) avisar("som do PC inteiro (este Windows nao separa o som do navegador: a voz da sala pode voltar como eco)");
	InterlockedExchange(&somNoAr, 1);
	enviar_texto("{\"tipo\":\"som\",\"hz\":48000,\"canais\":2}");

	int16_t pcm[SOM_QUADRO * 2 * 8];
	int nPcm = 0; // amostras (por canal) no pcm
	uint8_t saida[1500];
	double ultimoDado = agora_ms(), proxSilencio = 0;
	static const int16_t zeros[SOM_QUADRO * 2] = { 0 };
	while(!pararSom)
	{
		WaitForSingleObject(ev, 10);
		UINT32 n = 0;
		while(SUCCEEDED(IAudioCaptureClient_GetNextPacketSize(cap, &n)) && n)
		{
			BYTE *dados;
			UINT32 quadros;
			DWORD marcas;
			if(FAILED(IAudioCaptureClient_GetBuffer(cap, &dados, &quadros, &marcas, NULL, NULL))) break;
			for(UINT32 i = 0; i < quadros; )
			{
				UINT32 cabe = SOM_QUADRO - (UINT32)nPcm;
				UINT32 k = quadros - i < cabe ? quadros - i : cabe;
				if(marcas & AUDCLNT_BUFFERFLAGS_SILENT) memset(pcm + nPcm * 2, 0, k * 4);
				else memcpy(pcm + nPcm * 2, dados + i * 4, k * 4);
				nPcm += (int)k;
				i += k;
				if(nPcm == SOM_QUADRO)
				{
					int b = opus_encode(op, pcm, SOM_QUADRO, saida, sizeof(saida));
					if(b > 0) enviar_binario(2, 0, 0, seqSom++, saida, (size_t)b);
					nPcm = 0;
				}
			}
			IAudioCaptureClient_ReleaseBuffer(cap, quadros);
			ultimoDado = agora_ms();
			proxSilencio = 0;
		}
		// nada tocando: o Windows não manda nada; vai silêncio de 10 em 10 ms (o tocador do outro lado
		// não fica achando que o som acabou)
		double agora = agora_ms();
		if(agora - ultimoDado > 40)
		{
			if(!proxSilencio) proxSilencio = agora;
			while(proxSilencio <= agora)
			{
				int b = opus_encode(op, zeros, SOM_QUADRO, saida, sizeof(saida));
				if(b > 0) enviar_binario(2, 0, 0, seqSom++, saida, (size_t)b);
				proxSilencio += 10;
			}
			nPcm = 0;
		}
	}
	InterlockedExchange(&somNoAr, 0);
	IAudioClient_Stop(ac);
	opus_encoder_destroy(op);
	SOLTAR(cap);
	SOLTAR(ac);
	CloseHandle(ev);
	CoUninitialize();
	registrar_log("som parou");
	return 0;
}

// ------------------------------------------------------------------ sessão
static void parar_tudo(void)
{
	InterlockedExchange(&pararVideo, 1);
	InterlockedExchange(&pararSom, 1);
	if(threadVideo) { WaitForSingleObject(threadVideo, 5000); CloseHandle(threadVideo); threadVideo = NULL; }
	if(threadSom) { WaitForSingleObject(threadSom, 3000); CloseHandle(threadSom); threadSom = NULL; }
	EnterCriticalSection(&travaEnvio);
	conectadoJson[0] = 0;
	LeaveCriticalSection(&travaEnvio);
}

static bool video_rodando(void)
{
	return threadVideo && WaitForSingleObject(threadVideo, 0) == WAIT_TIMEOUT;
}

static void iniciar(const char *m)
{
	EnterCriticalSection(&travaSessao);
	parar_tudo();
	Pedido p;
	p.monitor = (int)json_num(m, "monitor", 0);
	p.altura = (int)json_num(m, "altura", 1080);
	p.qps = (int)json_num(m, "qps", 60);
	p.kbps = (int)json_num(m, "kbps", 20000);
	p.cursor = json_num(m, "cursor", 1) != 0;
	p.som = json_num(m, "som", 1) != 0;
	if(p.qps < 10) p.qps = 10;
	if(p.qps > 240) p.qps = 240;
	if(p.kbps < 1000) p.kbps = 1000;
	if(p.kbps > 150000) p.kbps = 150000;
	pedido = p;
	InterlockedExchange(&pararVideo, 0);
	InterlockedExchange(&pararSom, 0);
	InterlockedExchange(&novoKbps, 0);
	registrar_log("iniciar: monitor %d, %dp, %d qps, %d kbps, cursor %d, som %d", p.monitor, p.altura, p.qps, p.kbps, p.cursor, p.som);
	Pedido *copia = malloc(sizeof(Pedido));
	if(copia) { *copia = p; threadVideo = (HANDLE)_beginthreadex(NULL, 0, rodar_video, copia, 0, NULL); }
	if(p.som) threadSom = (HANDLE)_beginthreadex(NULL, 0, rodar_som, NULL, 0, NULL);
	LeaveCriticalSection(&travaSessao);
}

static void mandar_monitores(void)
{
	listar_monitores();
	bool nvenc = carregar_nvenc();
	char json[4096], placa[300] = "";
	size_t o = (size_t)snprintf(json, sizeof(json), "{\"tipo\":\"monitores\",\"nvenc\":%s,\"erroNvenc\":\"%s\",\"lista\":[", nvenc ? "true" : "false", nvenc ? "" : nvErro);
	for(int i = 0; i < nMonitores && o < sizeof(json) - 400; i++)
	{
		Monitor *m = &monitores[i];
		char nome[100], pl[260];
		escapar(m->nome, nome, sizeof(nome));
		escapar(m->placa, pl, sizeof(pl));
		if(!placa[0]) snprintf(placa, sizeof(placa), "%s", pl);
		o += (size_t)snprintf(json + o, sizeof(json) - o, "%s{\"i\":%d,\"nome\":\"%s\",\"placa\":\"%s\",\"w\":%d,\"h\":%d,\"x\":%d,\"y\":%d,\"hz\":%d,\"principal\":%s,\"rotulo\":\"screen:%d:0\"}",
			i ? "," : "", i, nome, pl, m->w, m->h, m->x, m->y, hz_do_monitor(m->nome), m->principal ? "true" : "false", m->indiceWin < 0 ? i : m->indiceWin);
	}
	snprintf(json + o, sizeof(json) - o, "]}");
	enviar_texto(json);
}

static void tratar(const char *m)
{
	char tipo[32];
	if(!json_texto(m, "tipo", tipo, sizeof(tipo))) return;
	if(strcmp(tipo, "monitores") == 0) mandar_monitores();
	else if(strcmp(tipo, "iniciar") == 0) iniciar(m);
	else if(strcmp(tipo, "parar") == 0)
	{
		EnterCriticalSection(&travaSessao);
		parar_tudo();
		LeaveCriticalSection(&travaSessao);
		mandar_saiu("parou", false);
		registrar_log("parar");
	}
	else if(strcmp(tipo, "chave") == 0) InterlockedExchange(&pedirIdr, 1);
	else if(strcmp(tipo, "banda") == 0)
	{
		int kb = (int)json_num(m, "kbps", 0);
		if(kb >= 1000 && kb <= 150000) InterlockedExchange(&novoKbps, kb);
	}
}

// uma página: lê as mensagens dela até cair
static void atender(SOCKET s)
{
	uint8_t *buf = malloc(MAX_MSG + 1);
	if(!buf) return;
	for(;;)
	{
		uint8_t h[2];
		if(!receber_tudo(s, h, 2)) break;
		int op = h[0] & 0x0f;
		bool mascara = (h[1] & 0x80) != 0;
		uint64_t tam = h[1] & 0x7f;
		if(tam == 126) { uint8_t e[2]; if(!receber_tudo(s, e, 2)) break; tam = ((uint64_t)e[0] << 8) | e[1]; }
		else if(tam == 127) { uint8_t e[8]; if(!receber_tudo(s, e, 8)) break; tam = 0; for(int i = 0; i < 8; i++) tam = (tam << 8) | e[i]; }
		uint8_t mk[4] = { 0 };
		if(mascara && !receber_tudo(s, mk, 4)) break;
		if(tam > MAX_MSG) break;
		if(tam && !receber_tudo(s, buf, (size_t)tam)) break;
		for(uint64_t i = 0; i < tam; i++) buf[i] ^= mk[i & 3];
		buf[tam] = 0;
		if(op == 8) break;
		if(op == 9) { enviar_quadro_ws(10, NULL, 0, buf, (size_t)tam); continue; }
		if(op == 1) tratar((const char *)buf);
	}
	free(buf);
}

static unsigned __stdcall pagina(void *arg)
{
	SOCKET s = (SOCKET)(uintptr_t)arg;
	int sim = 1;
	setsockopt(s, IPPROTO_TCP, TCP_NODELAY, (const char *)&sim, sizeof(sim));
	int buf = 4 * 1024 * 1024;
	setsockopt(s, SOL_SOCKET, SO_SNDBUF, (const char *)&buf, sizeof(buf));
	if(!aperto_de_mao(s)) { closesocket(s); return 0; }
	EnterCriticalSection(&travaEnvio);
	if(cliente != INVALID_SOCKET) { shutdown(cliente, SD_BOTH); closesocket(cliente); }
	cliente = s;
	LeaveCriticalSection(&travaEnvio);
	registrar_log("pagina conectada");
	char oi[160];
	snprintf(oi, sizeof(oi), "{\"tipo\":\"oi\",\"versao\":\"%s\",\"sessao\":%s}", VERSAO, video_rodando() ? "true" : "false");
	enviar_texto(oi);
	mandar_monitores();
	// a imagem já no ar (a página recarregou): o que ela precisa para continuar
	EnterCriticalSection(&travaEnvio);
	char con[512];
	snprintf(con, sizeof(con), "%s", conectadoJson);
	uint8_t *cab = NULL;
	size_t cabTam = cabecalhoTam;
	if(cabecalho && cabTam) { cab = malloc(cabTam); if(cab) memcpy(cab, cabecalho, cabTam); }
	LeaveCriticalSection(&travaEnvio);
	if(con[0])
	{
		enviar_texto(con);
		if(somNoAr) enviar_texto("{\"tipo\":\"som\",\"hz\":48000,\"canais\":2}");
		if(cab) enviar_binario(3, 0, 0, 0, cab, cabTam);
		InterlockedExchange(&pedirIdr, 1);
	}
	free(cab);
	atender(s);
	EnterCriticalSection(&travaEnvio);
	if(cliente == s) { cliente = INVALID_SOCKET; closesocket(s); }
	LeaveCriticalSection(&travaEnvio);
	registrar_log("pagina saiu");
	return 0;
}

// ------------------------------------------------------------------ o ajudante (pai) saiu: sai junto
static unsigned __stdcall vigiar_pai(void *arg)
{
	HANDLE pai = (HANDLE)arg;
	WaitForSingleObject(pai, INFINITE);
	registrar_log("o ajudante saiu: saindo");
	InterlockedExchange(&pararVideo, 1);
	InterlockedExchange(&pararSom, 1);
	Sleep(800);
	ExitProcess(0);
	return 0;
}

int main(int argc, char **argv)
{
	int porta = 0;
	DWORD pai = 0;
	token[0] = 0;
	bool teste = false;
	for(int i = 1; i < argc; i++)
	{
		if(strcmp(argv[i], "--teste") == 0) { teste = true; continue; }
		if(i + 1 >= argc) break;
		if(strcmp(argv[i], "--porta") == 0) porta = atoi(argv[++i]);
		else if(strcmp(argv[i], "--token") == 0) snprintf(token, sizeof(token), "%s", argv[++i]);
		else if(strcmp(argv[i], "--pai") == 0) pai = (DWORD)strtoul(argv[++i], NULL, 10);
		else if(strcmp(argv[i], "--excluir") == 0) pidExcluir = (DWORD)strtoul(argv[++i], NULL, 10);
		else if(strcmp(argv[i], "--dados") == 0) snprintf(pastaDados, sizeof(pastaDados), "%s", argv[++i]);
	}
	if(strlen(token) < 16 && !teste)
	{
		fprintf(stderr, "uso: sala3d-pc --token <16+ caracteres> [--porta N] [--pai PID] [--dados pasta]\n");
		return 2;
	}
	// coordenadas do mouse e do monitor em pixels de verdade (escala do Windows)
	SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
	timeBeginPeriod(1);
	if(!pastaDados[0])
	{
		const char *la = getenv("LOCALAPPDATA");
		snprintf(pastaDados, sizeof(pastaDados), "%s\\Sala3d", la ? la : ".");
	}
	CreateDirectoryA(pastaDados, NULL);
	InitializeCriticalSection(&travaLog);
	InitializeCriticalSection(&travaEnvio);
	InitializeCriticalSection(&travaSessao);
	char caminhoLog[MAX_PATH];
	snprintf(caminhoLog, sizeof(caminhoLog), "%s\\pc-ponte.log", pastaDados);
	arquivoLog = fopen(caminhoLog, "w");
	registrar_log("sala3d-pc %s", VERSAO);
	WSADATA wsa;
	WSAStartup(MAKEWORD(2, 2), &wsa);

	// --teste: lista os monitores e abre o codificador uns segundos (sem página), para conferir aqui
	if(teste)
	{
		listar_monitores();
		for(int i = 0; i < nMonitores; i++)
			printf("monitor %d: %s %dx%d em %d,%d (%s) win=%d %d Hz\n", i, monitores[i].nome, monitores[i].w, monitores[i].h, monitores[i].x, monitores[i].y, monitores[i].placa, monitores[i].indiceWin, hz_do_monitor(monitores[i].nome));
		printf("nvenc: %s %s\n", carregar_nvenc() ? "ok" : "nao", nvErro);
		printf("navegador acima: %lu\n", pid_do_navegador());
		fflush(stdout);
		return 0;
	}

	if(pai)
	{
		HANDLE h = OpenProcess(SYNCHRONIZE, FALSE, pai);
		if(h) { HANDLE t = (HANDLE)_beginthreadex(NULL, 0, vigiar_pai, h, 0, NULL); if(t) CloseHandle(t); }
	}

	SOCKET ouvinte = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	struct sockaddr_in a;
	memset(&a, 0, sizeof(a));
	a.sin_family = AF_INET;
	a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
	a.sin_port = htons((u_short)porta);
	if(ouvinte == INVALID_SOCKET || bind(ouvinte, (struct sockaddr *)&a, sizeof(a)) != 0 || listen(ouvinte, 4) != 0)
	{
		registrar_log("nao deu para ouvir na porta %d", porta);
		printf("{\"erro\":\"porta\"}\n");
		fflush(stdout);
		return 1;
	}
	int al = sizeof(a);
	getsockname(ouvinte, (struct sockaddr *)&a, &al);
	printf("{\"porta\":%d,\"versao\":\"%s\"}\n", ntohs(a.sin_port), VERSAO);
	fflush(stdout);
	registrar_log("ouvindo em 127.0.0.1:%d", ntohs(a.sin_port));

	for(;;)
	{
		SOCKET s = accept(ouvinte, NULL, NULL);
		if(s == INVALID_SOCKET) continue;
		HANDLE t = (HANDLE)_beginthreadex(NULL, 0, pagina, (void *)(uintptr_t)s, 0, NULL);
		if(t) CloseHandle(t);
		else closesocket(s);
	}
	return 0;
}
