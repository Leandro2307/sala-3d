// SPDX-License-Identifier: AGPL-3.0-only (junto com a libchiaki, que é AGPL-3.0 com exceção do OpenSSL)
//
// Ponte do PS5 (sala3d-ps5.exe) — o Remote Play do PS5 dentro da sala, sem a janela do chiaki-ng.
//
// Usa a biblioteca do chiaki-ng (libchiaki, github.com/streetpea/chiaki-ng, AGPL-3.0) para falar com o
// PS5: registro, acordar, a sessão de Remote Play, o vídeo, o som e o controle. Em vez de decodificar
// e mostrar numa janela (que a sala capturava e codificava de novo), a ponte entrega o H.264/H.265 que
// o PS5 mandou, do jeito que chegou, à página da sala por um WebSocket em 127.0.0.1. A página manda
// esses quadros direto para quem joga (turbo) e decodifica uma cópia para a tela da sala.
//
// Quem abre a ponte é o ajudante nativo (Ajudante.cs), com --porta 0 --token <aleatório> --pai <pid>.
// A primeira linha na saída padrão é {"porta":N}. Só aceita a página que traz o token (GET /ps5?t=...).
// Uma página por vez: a que chega derruba a anterior. Sem o ajudante (pai), a ponte sai.
//
// Do WebSocket, binário (byte 0 = tipo, 8 bytes de cabeçalho: tipo, marcas, perdidos u16, seq u32):
//   1 quadro de vídeo (Annex B, como saiu do PS5; marcas bit0 = recuperado pelo chiaki)
//   2 pacote de som (Opus, 48 kHz)
//   3 cabeçalho do vídeo (SPS/PPS do perfil) — vem antes do 1º quadro e de novo a cada página nova
// Texto (JSON), daqui para lá: oi, consoles, achados, registro, estado, conectado, som, tremor, pin,
// saiu, aviso. De lá para cá: consoles, descobrir, importar, registrar, conectar, pad, chave, pin,
// parar, dormir, ps (botão PS por um instante).
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <iphlpapi.h>
#include <process.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdarg.h>
#include <openssl/sha.h>

#include <chiaki/common.h>
#include <chiaki/log.h>
#include <chiaki/session.h>
#include <chiaki/discovery.h>
#include <chiaki/regist.h>
#include <chiaki/base64.h>
#include <chiaki/controller.h>

#define VERSAO "1.0.0"
#define MAX_CONSOLES 8
#define MAX_MSG (64 * 1024)

// ------------------------------------------------------------------ registro em disco
typedef struct {
	char id[16];          // MAC em hexa (12), o host-id da descoberta
	char nome[64];
	int target;
	uint8_t regist_key[CHIAKI_SESSION_AUTH_SIZE];
	uint8_t rp_key[0x10];
	uint32_t rp_key_type;
	char ip[64];          // o último em que foi achado
} Console;

static Console consoles[MAX_CONSOLES];
static int nConsoles = 0;
static char pastaDados[MAX_PATH];
static CRITICAL_SECTION travaConsoles;

// ------------------------------------------------------------------ estado
static ChiakiLog logChiaki;
static FILE *arquivoLog = NULL;
static CRITICAL_SECTION travaLog;
static char token[80];

static SOCKET cliente = INVALID_SOCKET;
static CRITICAL_SECTION travaEnvio;
static uint32_t seqVideo = 0, seqSom = 0;

static ChiakiSession *sessao = NULL;   // a sessão no ar (ou NULL)
static CRITICAL_SECTION travaSessao;
static HANDLE fimSessao = NULL;        // a sessão deve acabar (parar ou caiu)
static volatile LONG sessaoRodando = 0;
static ChiakiControllerState estadoPad;
static uint8_t *cabecalho = NULL;      // o último cabeçalho do vídeo (para a página nova)
static size_t cabecalhoTam = 0;
static ChiakiAudioHeader somCab;
static volatile LONG temSomCab = 0;
static char conectadoJson[256] = "";  // o último {"tipo":"conectado"...}: vai de novo para a página nova
static ULONGLONG ultimaChave = 0;

static ChiakiRegist regist;
static volatile LONG registRodando = 0;
static char registHost[64];

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

static void log_chiaki(ChiakiLogLevel nivel, const char *msg, void *user)
{
	(void)user;
	const char *n = nivel == CHIAKI_LOG_ERROR ? "E" : nivel == CHIAKI_LOG_WARNING ? "W" : nivel == CHIAKI_LOG_INFO ? "I" : "V";
	registrar_log("[chiaki %s] %s", n, msg);
	// erros e avisos vão também para a página (relatório do modo jogo)
	if(nivel == CHIAKI_LOG_ERROR || nivel == CHIAKI_LOG_WARNING)
	{
		char esc[600], json[700];
		escapar(msg, esc, sizeof(esc));
		snprintf(json, sizeof(json), "{\"tipo\":\"aviso\",\"nivel\":\"%s\",\"texto\":\"%s\"}", n, esc);
		enviar_texto(json);
	}
}

// ------------------------------------------------------------------ hexa
static void para_hexa(const uint8_t *b, size_t n, char *out)
{
	static const char *h = "0123456789abcdef";
	for(size_t i = 0; i < n; i++) { out[i * 2] = h[b[i] >> 4]; out[i * 2 + 1] = h[b[i] & 15]; }
	out[n * 2] = 0;
}

static bool de_hexa(const char *s, uint8_t *b, size_t n)
{
	if(strlen(s) < n * 2) return false;
	for(size_t i = 0; i < n; i++)
	{
		unsigned v;
		if(sscanf(s + i * 2, "%2x", &v) != 1) return false;
		b[i] = (uint8_t)v;
	}
	return true;
}

// ------------------------------------------------------------------ consoles registrados
// ps5.txt, um por linha: id;nome;target;regist_key;rp_key;rp_key_type;ip (chaves em hexa)
static void caminho_consoles(char *out)
{
	snprintf(out, MAX_PATH, "%s\\ps5.txt", pastaDados);
}

static void carregar_consoles(void)
{
	char caminho[MAX_PATH];
	caminho_consoles(caminho);
	FILE *f = fopen(caminho, "r");
	nConsoles = 0;
	if(!f) return;
	char linha[1024];
	while(nConsoles < MAX_CONSOLES && fgets(linha, sizeof(linha), f))
	{
		char *campos[7] = { 0 };
		int n = 0;
		char *p = linha;
		campos[n++] = p;
		while(*p && n < 7) { if(*p == ';') { *p = 0; campos[n++] = p + 1; } p++; }
		for(char *q = p; *q; q++) if(*q == '\r' || *q == '\n') *q = 0;
		if(n < 6) continue;
		Console *c = &consoles[nConsoles];
		memset(c, 0, sizeof(*c));
		snprintf(c->id, sizeof(c->id), "%s", campos[0]);
		snprintf(c->nome, sizeof(c->nome), "%s", campos[1]);
		c->target = atoi(campos[2]);
		if(!de_hexa(campos[3], c->regist_key, sizeof(c->regist_key)) || !de_hexa(campos[4], c->rp_key, sizeof(c->rp_key))) continue;
		c->rp_key_type = (uint32_t)strtoul(campos[5], NULL, 10);
		if(n > 6) snprintf(c->ip, sizeof(c->ip), "%s", campos[6]);
		nConsoles++;
	}
	fclose(f);
}

static void salvar_consoles(void)
{
	char caminho[MAX_PATH], tmp[MAX_PATH];
	caminho_consoles(caminho);
	snprintf(tmp, sizeof(tmp), "%s.novo", caminho);
	FILE *f = fopen(tmp, "w");
	if(!f) return;
	for(int i = 0; i < nConsoles; i++)
	{
		Console *c = &consoles[i];
		char rk[64], rp[64];
		para_hexa(c->regist_key, sizeof(c->regist_key), rk);
		para_hexa(c->rp_key, sizeof(c->rp_key), rp);
		fprintf(f, "%s;%s;%d;%s;%s;%u;%s\n", c->id, c->nome, c->target, rk, rp, c->rp_key_type, c->ip);
	}
	fclose(f);
	MoveFileExA(tmp, caminho, MOVEFILE_REPLACE_EXISTING);
}

static void limpar_nome(char *s)
{
	for(; *s; s++) if(*s == ';' || *s == '\r' || *s == '\n' || *s == '"' || *s == '\\') *s = ' ';
}

static void id_de_mac(const uint8_t *mac, char *out)
{
	snprintf(out, 16, "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

// guarda (ou atualiza) um console; devolve o índice
static int guardar_console(const Console *novo)
{
	EnterCriticalSection(&travaConsoles);
	int i;
	for(i = 0; i < nConsoles; i++) if(_stricmp(consoles[i].id, novo->id) == 0) break;
	if(i == nConsoles)
	{
		if(nConsoles == MAX_CONSOLES) i = MAX_CONSOLES - 1;
		else nConsoles++;
	}
	char ip[64];
	snprintf(ip, sizeof(ip), "%s", consoles[i].ip);
	consoles[i] = *novo;
	if(!consoles[i].ip[0]) snprintf(consoles[i].ip, sizeof(consoles[i].ip), "%s", ip);
	salvar_consoles();
	LeaveCriticalSection(&travaConsoles);
	return i;
}

static Console *achar_console(const char *id)
{
	for(int i = 0; i < nConsoles; i++) if(_stricmp(consoles[i].id, id) == 0) return &consoles[i];
	return NULL;
}

static void mandar_consoles(void)
{
	char json[4096];
	size_t j = (size_t)snprintf(json, sizeof(json), "{\"tipo\":\"consoles\",\"lista\":[");
	EnterCriticalSection(&travaConsoles);
	for(int i = 0; i < nConsoles && j < sizeof(json) - 200; i++)
	{
		Console *c = &consoles[i];
		j += (size_t)snprintf(json + j, sizeof(json) - j, "%s{\"id\":\"%s\",\"nome\":\"%s\",\"ps5\":%s,\"ip\":\"%s\"}",
			i ? "," : "", c->id, c->nome, chiaki_target_is_ps5((ChiakiTarget)c->target) ? "true" : "false", c->ip);
	}
	LeaveCriticalSection(&travaConsoles);
	snprintf(json + j, sizeof(json) - j, "]}");
	enviar_texto(json);
}

// ------------------------------------------------------------------ importar do chiaki-ng
// O chiaki-ng guarda os consoles registrados no registro do Windows (QSettings):
// HKCU\Software\Chiaki\Chiaki\registered_hosts\<n>\{server_mac, server_nickname, target, rp_regist_key,
// rp_key, rp_key_type}. Os bytes vão como texto "@ByteArray(...)" (cada caractere um byte), em REG_SZ ou,
// quando há bytes zero, em REG_BINARY com o texto em UTF-16.
static bool ler_bytes_qt(HKEY k, const char *nome, uint8_t *out, size_t n, size_t *lidos)
{
	DWORD tipo = 0, tam = 0;
	wchar_t wnome[64];
	MultiByteToWideChar(CP_UTF8, 0, nome, -1, wnome, 64);
	if(RegQueryValueExW(k, wnome, NULL, &tipo, NULL, &tam) != ERROR_SUCCESS || tam == 0 || tam > 4096) return false;
	uint8_t buf[4096 + 2];
	if(RegQueryValueExW(k, wnome, NULL, &tipo, buf, &tam) != ERROR_SUCCESS) return false;
	if(tipo != REG_SZ && tipo != REG_BINARY && tipo != REG_EXPAND_SZ) return false;
	size_t nch = tam / 2;
	const uint16_t *w = (const uint16_t *)buf;
	while(nch && w[nch - 1] == 0 && tipo != REG_BINARY) nch--;
	static const char *pre = "@ByteArray(";
	size_t pl = strlen(pre);
	size_t ini = 0;
	if(nch > pl)
	{
		bool tem = true;
		for(size_t i = 0; i < pl; i++) if(w[i] != (uint16_t)pre[i]) { tem = false; break; }
		if(tem) { ini = pl; if(nch && w[nch - 1] == ')') nch--; }
		else if(nch && w[0] == '@' && w[1] == '@') ini = 1; // "@@...": texto que começa com @
	}
	size_t m = 0;
	for(size_t i = ini; i < nch && m < n; i++) out[m++] = (uint8_t)(w[i] & 0xFF);
	if(lidos) *lidos = m;
	return true;
}

static bool ler_int_qt(HKEY k, const char *nome, int64_t *v)
{
	DWORD tipo = 0, tam = 0;
	wchar_t wnome[64];
	MultiByteToWideChar(CP_UTF8, 0, nome, -1, wnome, 64);
	uint8_t buf[512];
	tam = sizeof(buf) - 2;
	if(RegQueryValueExW(k, wnome, NULL, &tipo, buf, &tam) != ERROR_SUCCESS) return false;
	if(tipo == REG_DWORD) { *v = *(int32_t *)buf; return true; }
	if(tipo == REG_QWORD) { *v = *(int64_t *)buf; return true; }
	if(tipo == REG_SZ)
	{
		buf[tam] = 0; buf[tam + 1] = 0;
		char s[128];
		WideCharToMultiByte(CP_UTF8, 0, (wchar_t *)buf, -1, s, sizeof(s), NULL, NULL);
		*v = _strtoi64(s, NULL, 10);
		return true;
	}
	return false;
}

static int importar_chiaki(void)
{
	int achados = 0;
	for(int n = 1; n <= 16; n++)
	{
		wchar_t caminho[128];
		swprintf(caminho, 128, L"Software\\Chiaki\\Chiaki\\registered_hosts\\%d", n);
		HKEY k;
		if(RegOpenKeyExW(HKEY_CURRENT_USER, caminho, 0, KEY_READ, &k) != ERROR_SUCCESS) continue;
		Console c;
		memset(&c, 0, sizeof(c));
		uint8_t mac[6];
		size_t lidos = 0;
		int64_t v = 0;
		bool ok = ler_bytes_qt(k, "server_mac", mac, 6, &lidos) && lidos == 6;
		ok = ok && ler_bytes_qt(k, "rp_regist_key", c.regist_key, sizeof(c.regist_key), &lidos) && lidos == sizeof(c.regist_key);
		ok = ok && ler_bytes_qt(k, "rp_key", c.rp_key, sizeof(c.rp_key), &lidos) && lidos == sizeof(c.rp_key);
		if(ok)
		{
			id_de_mac(mac, c.id);
			c.target = ler_int_qt(k, "target", &v) ? (int)v : CHIAKI_TARGET_PS5_1;
			c.rp_key_type = ler_int_qt(k, "rp_key_type", &v) ? (uint32_t)v : 0;
			uint8_t nome[63];
			size_t nl = 0;
			if(ler_bytes_qt(k, "server_nickname", nome, sizeof(nome), &nl)) { memcpy(c.nome, nome, nl); c.nome[nl] = 0; }
			if(!c.nome[0]) snprintf(c.nome, sizeof(c.nome), "PS5");
			limpar_nome(c.nome);
			guardar_console(&c);
			achados++;
			registrar_log("importado do chiaki-ng: %s (%s)", c.nome, c.id);
		}
		RegCloseKey(k);
	}
	return achados;
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

// um quadro do WebSocket (servidor não mascara). cab: bytes do nosso cabeçalho antes dos dados
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
	// o caminho com o token: GET /ps5?t=<token>
	char esperado[128];
	snprintf(esperado, sizeof(esperado), "GET /ps5?t=%s ", token);
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
	char chave[128];
	size_t kl = 0;
	while(k[kl] && k[kl] != '\r' && kl < 100) { chave[kl] = k[kl]; kl++; }
	chave[kl] = 0;
	strcat(chave, "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
	uint8_t hash[SHA_DIGEST_LENGTH];
	SHA1((const uint8_t *)chave, strlen(chave), hash);
	char aceite[64];
	chiaki_base64_encode(hash, sizeof(hash), aceite, sizeof(aceite));
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

// ------------------------------------------------------------------ descoberta
typedef struct {
	char ip[64], id[16], nome[64], app[96];
	int estado; // 1 pronto, 2 dormindo
	bool ps5;
} Achado;

static Achado achados[16];
static int nAchados = 0;
static CRITICAL_SECTION travaAchados;

static void achou(ChiakiDiscoveryHost *h, void *user)
{
	(void)user;
	if(!h->host_addr) return;
	EnterCriticalSection(&travaAchados);
	int i;
	for(i = 0; i < nAchados; i++) if(strcmp(achados[i].ip, h->host_addr) == 0) break;
	if(i == nAchados && nAchados < 16) nAchados++;
	if(i < 16)
	{
		Achado *a = &achados[i];
		snprintf(a->ip, sizeof(a->ip), "%s", h->host_addr);
		snprintf(a->id, sizeof(a->id), "%s", h->host_id ? h->host_id : "");
		snprintf(a->nome, sizeof(a->nome), "%s", h->host_name ? h->host_name : "");
		snprintf(a->app, sizeof(a->app), "%s", h->running_app_name ? h->running_app_name : "");
		limpar_nome(a->nome);
		limpar_nome(a->app);
		a->estado = h->state == CHIAKI_DISCOVERY_HOST_STATE_READY ? 1 : h->state == CHIAKI_DISCOVERY_HOST_STATE_STANDBY ? 2 : 0;
		a->ps5 = chiaki_discovery_host_is_ps5(h);
	}
	LeaveCriticalSection(&travaAchados);
}

// o broadcast de cada rede IPv4 ligada (sem a de loopback), em ordem de rede; devolve quantos
static int broadcasts_locais(ULONG *out, int max)
{
	ULONG tam = 16384;
	IP_ADAPTER_ADDRESSES *lista = NULL;
	ULONG r = ERROR_BUFFER_OVERFLOW;
	for(int t = 0; t < 3 && r == ERROR_BUFFER_OVERFLOW; t++)
	{
		free(lista);
		lista = (IP_ADAPTER_ADDRESSES *)malloc(tam);
		if(!lista) return 0;
		r = GetAdaptersAddresses(AF_INET, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER, NULL, lista, &tam);
	}
	int n = 0;
	if(r == NO_ERROR)
	{
		for(IP_ADAPTER_ADDRESSES *ad = lista; ad && n < max; ad = ad->Next)
		{
			if(ad->OperStatus != IfOperStatusUp || ad->IfType == IF_TYPE_SOFTWARE_LOOPBACK) continue;
			for(IP_ADAPTER_UNICAST_ADDRESS *u = ad->FirstUnicastAddress; u && n < max; u = u->Next)
			{
				if(u->Address.lpSockaddr->sa_family != AF_INET) continue;
				UINT8 bits = u->OnLinkPrefixLength;
				if(bits == 0 || bits >= 31) continue;
				ULONG ip = ntohl(((struct sockaddr_in *)u->Address.lpSockaddr)->sin_addr.s_addr);
				if((ip >> 16) == 0xA9FE) continue; // 169.254 (sem DHCP)
				ULONG mascara = 0xFFFFFFFFu << (32 - bits);
				out[n++] = htonl(ip | ~mascara);
			}
		}
	}
	free(lista);
	return n;
}

// manda "SRCH" (PS5 e PS4) para o broadcast e, se houver, para um IP conhecido; espera ms
static void descobrir(int ms, const char *ipConhecido)
{
	EnterCriticalSection(&travaAchados);
	nAchados = 0;
	LeaveCriticalSection(&travaAchados);
	ULONG broadcasts[16];
	int nBroadcasts = broadcasts_locais(broadcasts, 16);
	ChiakiDiscovery d;
	if(chiaki_discovery_init(&d, &logChiaki, AF_INET) != CHIAKI_ERR_SUCCESS) return;
	ChiakiDiscoveryThread t;
	if(chiaki_discovery_thread_start(&t, &d, achou, NULL) != CHIAKI_ERR_SUCCESS) { chiaki_discovery_fini(&d); return; }
	for(int v = 0; v * 500 < ms; v++)
	{
		for(int ps5 = 1; ps5 >= 0; ps5--)
		{
			ChiakiDiscoveryPacket p;
			memset(&p, 0, sizeof(p));
			p.cmd = CHIAKI_DISCOVERY_CMD_SRCH;
			p.protocol_version = ps5 ? CHIAKI_DISCOVERY_PROTOCOL_VERSION_PS5 : CHIAKI_DISCOVERY_PROTOCOL_VERSION_PS4;
			struct sockaddr_in a;
			memset(&a, 0, sizeof(a));
			a.sin_family = AF_INET;
			a.sin_port = htons(ps5 ? CHIAKI_DISCOVERY_PORT_PS5 : CHIAKI_DISCOVERY_PORT_PS4);
			a.sin_addr.s_addr = htonl(INADDR_BROADCAST);
			chiaki_discovery_send(&d, &p, (struct sockaddr *)&a, sizeof(a));
			// 255.255.255.255 sai só pela rota de menor métrica (com Radmin/Hamachi/VPN, a da VPN e
			// não a de casa): manda também para o broadcast de cada rede ligada (192.168.1.255 etc.)
			for(int b = 0; b < nBroadcasts; b++)
			{
				a.sin_addr.s_addr = broadcasts[b];
				chiaki_discovery_send(&d, &p, (struct sockaddr *)&a, sizeof(a));
			}
			if(ipConhecido && ipConhecido[0] && inet_pton(AF_INET, ipConhecido, &a.sin_addr) == 1)
				chiaki_discovery_send(&d, &p, (struct sockaddr *)&a, sizeof(a));
		}
		Sleep(500);
	}
	chiaki_discovery_thread_stop(&t);
	chiaki_discovery_fini(&d);
}

static void mandar_achados(void)
{
	char json[4096];
	size_t j = (size_t)snprintf(json, sizeof(json), "{\"tipo\":\"achados\",\"lista\":[");
	EnterCriticalSection(&travaAchados);
	for(int i = 0; i < nAchados && j < sizeof(json) - 300; i++)
	{
		Achado *a = &achados[i];
		Console *c = achar_console(a->id);
		j += (size_t)snprintf(json + j, sizeof(json) - j,
			"%s{\"ip\":\"%s\",\"id\":\"%s\",\"nome\":\"%s\",\"estado\":\"%s\",\"ps5\":%s,\"registrado\":%s,\"app\":\"%s\"}",
			i ? "," : "", a->ip, a->id, a->nome, a->estado == 1 ? "pronto" : a->estado == 2 ? "dormindo" : "?",
			a->ps5 ? "true" : "false", c ? "true" : "false", a->app);
	}
	LeaveCriticalSection(&travaAchados);
	snprintf(json + j, sizeof(json) - j, "]}");
	enviar_texto(json);
}

// o console na rede: estado (0 nada, 1 pronto, 2 dormindo) e o IP de agora
static int procurar(Console *c, char *ip, int ms)
{
	descobrir(ms, c->ip);
	int estado = 0;
	EnterCriticalSection(&travaAchados);
	for(int i = 0; i < nAchados; i++)
	{
		if(_stricmp(achados[i].id, c->id) == 0)
		{
			estado = achados[i].estado;
			snprintf(ip, 64, "%s", achados[i].ip);
			break;
		}
	}
	LeaveCriticalSection(&travaAchados);
	return estado;
}

// ------------------------------------------------------------------ registro (PIN)
static void registro_cb(ChiakiRegistEvent *e, void *user)
{
	(void)user;
	char json[512];
	if(e->type == CHIAKI_REGIST_EVENT_TYPE_FINISHED_SUCCESS && e->registered_host)
	{
		ChiakiRegisteredHost *h = e->registered_host;
		Console c;
		memset(&c, 0, sizeof(c));
		id_de_mac(h->server_mac, c.id);
		snprintf(c.nome, sizeof(c.nome), "%s", h->server_nickname[0] ? h->server_nickname : "PS5");
		limpar_nome(c.nome);
		c.target = h->target;
		memcpy(c.regist_key, h->rp_regist_key, sizeof(c.regist_key));
		memcpy(c.rp_key, h->rp_key, sizeof(c.rp_key));
		c.rp_key_type = h->rp_key_type;
		snprintf(c.ip, sizeof(c.ip), "%s", registHost);
		guardar_console(&c);
		registrar_log("registrado: %s (%s)", c.nome, c.id);
		snprintf(json, sizeof(json), "{\"tipo\":\"registro\",\"ok\":true,\"id\":\"%s\",\"nome\":\"%s\"}", c.id, c.nome);
		enviar_texto(json);
		mandar_consoles();
	}
	else
	{
		snprintf(json, sizeof(json), "{\"tipo\":\"registro\",\"ok\":false,\"erro\":\"%s\"}",
			e->type == CHIAKI_REGIST_EVENT_TYPE_FINISHED_CANCELED ? "cancelado" : "falhou");
		enviar_texto(json);
	}
	InterlockedExchange(&registRodando, 2); // terminou: o fini fica para o próximo pedido
}

static void registrar(const char *m)
{
	char host[64] = "", conta[64] = "", pin[16] = "";
	json_texto(m, "host", host, sizeof(host));
	json_texto(m, "conta", conta, sizeof(conta));
	json_texto(m, "pin", pin, sizeof(pin));
	bool ps5 = json_num(m, "ps5", 1) != 0;
	if(InterlockedCompareExchange(&registRodando, 0, 2) == 2) chiaki_regist_fini(&regist);
	if(registRodando) { enviar_texto("{\"tipo\":\"registro\",\"ok\":false,\"erro\":\"ocupado\"}"); return; }
	ChiakiRegistInfo info;
	memset(&info, 0, sizeof(info));
	size_t tam = sizeof(info.psn_account_id);
	if(chiaki_base64_decode(conta, strlen(conta), info.psn_account_id, &tam) != CHIAKI_ERR_SUCCESS || tam != CHIAKI_PSN_ACCOUNT_ID_SIZE)
	{
		enviar_texto("{\"tipo\":\"registro\",\"ok\":false,\"erro\":\"conta\"}");
		return;
	}
	if(strlen(pin) != 8) { enviar_texto("{\"tipo\":\"registro\",\"ok\":false,\"erro\":\"pin\"}"); return; }
	snprintf(registHost, sizeof(registHost), "%s", host);
	info.target = ps5 ? CHIAKI_TARGET_PS5_1 : CHIAKI_TARGET_PS4_10;
	info.host = registHost;
	info.broadcast = false;
	info.psn_online_id = NULL;
	info.pin = (uint32_t)strtoul(pin, NULL, 10);
	info.console_pin = 0;
	info.holepunch_info = NULL;
	info.rudp = NULL;
	InterlockedExchange(&registRodando, 1);
	if(chiaki_regist_start(&regist, &logChiaki, &info, registro_cb, NULL) != CHIAKI_ERR_SUCCESS)
	{
		InterlockedExchange(&registRodando, 0);
		enviar_texto("{\"tipo\":\"registro\",\"ok\":false,\"erro\":\"falhou\"}");
	}
}

// ------------------------------------------------------------------ sessão
static bool video_cb(uint8_t *buf, size_t tam, int32_t perdidos, bool recuperado, void *user)
{
	(void)user;
	// o cabeçalho do perfil (SPS/PPS) chega pelo mesmo caminho, sozinho, antes do 1º quadro: guarda
	// para a página que chegar depois e manda como tipo 3. Ele não tem fatia de imagem (NAL 1 ou 5).
	bool soCabecalho = true;
	for(size_t i = 0; i + 3 < tam; i++)
	{
		if(buf[i] == 0 && buf[i + 1] == 0 && buf[i + 2] == 1)
		{
			int t = buf[i + 3] & 0x1f; // H.264
			int t5 = (buf[i + 3] >> 1) & 0x3f; // H.265
			if(sessao && chiaki_codec_is_h265(sessao->connect_info.video_profile.codec)) { if(t5 < 32) { soCabecalho = false; break; } }
			else if(t == 1 || t == 5) { soCabecalho = false; break; }
		}
	}
	if(soCabecalho)
	{
		EnterCriticalSection(&travaEnvio);
		free(cabecalho);
		cabecalho = malloc(tam);
		if(cabecalho) { memcpy(cabecalho, buf, tam); cabecalhoTam = tam; }
		LeaveCriticalSection(&travaEnvio);
		enviar_binario(3, 0, 0, 0, buf, tam);
		return true;
	}
	enviar_binario(1, recuperado ? 1 : 0, (uint16_t)(perdidos < 0 ? 0 : perdidos > 65535 ? 65535 : perdidos), ++seqVideo, buf, tam);
	return true;
}

static void som_cab_cb(ChiakiAudioHeader *h, void *user)
{
	(void)user;
	somCab = *h;
	InterlockedExchange(&temSomCab, 1);
	char json[160];
	snprintf(json, sizeof(json), "{\"tipo\":\"som\",\"canais\":%u,\"hz\":%u,\"amostras\":%u}", h->channels, h->rate, h->frame_size);
	enviar_texto(json);
}

static void som_cb(uint8_t *buf, size_t tam, void *user)
{
	(void)user;
	enviar_binario(2, 0, 0, ++seqSom, buf, tam);
}

static void evento_cb(ChiakiEvent *e, void *user)
{
	ChiakiSession *s = (ChiakiSession *)user;
	char json[512];
	switch(e->type)
	{
		case CHIAKI_EVENT_CONNECTED:
		{
			ChiakiConnectVideoProfile *p = &s->connect_info.video_profile;
			snprintf(json, sizeof(json), "{\"tipo\":\"conectado\",\"largura\":%u,\"altura\":%u,\"qps\":%u,\"kbps\":%u,\"codec\":\"%s\"}",
				p->width, p->height, p->max_fps, p->bitrate, chiaki_codec_is_h265(p->codec) ? "h265" : "h264");
			EnterCriticalSection(&travaEnvio);
			snprintf(conectadoJson, sizeof(conectadoJson), "%s", json);
			LeaveCriticalSection(&travaEnvio);
			registrar_log("conectado: %ux%u a %u qps, %u kbps", p->width, p->height, p->max_fps, p->bitrate);
			enviar_texto(json);
			break;
		}
		case CHIAKI_EVENT_LOGIN_PIN_REQUEST:
			snprintf(json, sizeof(json), "{\"tipo\":\"pin\",\"errado\":%s}", e->login_pin_request.pin_incorrect ? "true" : "false");
			enviar_texto(json);
			break;
		case CHIAKI_EVENT_RUMBLE:
			snprintf(json, sizeof(json), "{\"tipo\":\"tremor\",\"g\":%.3f,\"p\":%.3f}", e->rumble.left / 255.0, e->rumble.right / 255.0);
			enviar_texto(json);
			break;
		case CHIAKI_EVENT_QUIT:
		{
			char esc[300];
			escapar(e->quit.reason_str ? e->quit.reason_str : "", esc, sizeof(esc));
			snprintf(json, sizeof(json), "{\"tipo\":\"saiu\",\"motivo\":\"%s\",\"erro\":%s,\"texto\":\"%s\"}",
				chiaki_quit_reason_string(e->quit.reason), chiaki_quit_reason_is_error(e->quit.reason) ? "true" : "false", esc);
			registrar_log("saiu: %s %s", chiaki_quit_reason_string(e->quit.reason), esc);
			enviar_texto(json);
			SetEvent(fimSessao);
			break;
		}
		default:
			break;
	}
}

typedef struct {
	Console console;
	char ip[64];
	unsigned largura, altura, qps, kbps;
	bool h265;
} Pedido;

static void estado(const char *fase)
{
	char json[128];
	snprintf(json, sizeof(json), "{\"tipo\":\"estado\",\"fase\":\"%s\"}", fase);
	enviar_texto(json);
}

static unsigned __stdcall rodar_sessao(void *arg)
{
	Pedido *p = (Pedido *)arg;
	char ip[64];
	snprintf(ip, sizeof(ip), "%s", p->ip);
	// acha o console na rede; dormindo, acorda e espera ficar pronto (o PS5 leva uns 15–30 s)
	estado("procurando");
	int st = procurar(&p->console, ip, 1500);
	if(st == 2)
	{
		estado("acordando");
		char rk[CHIAKI_SESSION_AUTH_SIZE + 1];
		memcpy(rk, p->console.regist_key, CHIAKI_SESSION_AUTH_SIZE);
		rk[CHIAKI_SESSION_AUTH_SIZE] = 0;
		uint64_t credencial = _strtoui64(rk, NULL, 16);
		for(int tentativa = 0; tentativa < 30 && st != 1; tentativa++)
		{
			if(WaitForSingleObject(fimSessao, 0) == WAIT_OBJECT_0) break;
			if(tentativa % 5 == 0) chiaki_discovery_wakeup(&logChiaki, NULL, ip, credencial, chiaki_target_is_ps5((ChiakiTarget)p->console.target));
			st = procurar(&p->console, ip, 1500);
		}
	}
	if(st != 1 && !ip[0])
	{
		enviar_texto("{\"tipo\":\"saiu\",\"motivo\":\"nao-achou\",\"erro\":true,\"texto\":\"O PS5 nao respondeu na rede.\"}");
		goto fim;
	}
	if(st == 2)
	{
		enviar_texto("{\"tipo\":\"saiu\",\"motivo\":\"dormindo\",\"erro\":true,\"texto\":\"O PS5 nao acordou.\"}");
		goto fim;
	}
	if(WaitForSingleObject(fimSessao, 0) == WAIT_OBJECT_0) goto fim;
	// guarda o IP de agora (a próxima procura começa por ele)
	if(strcmp(ip, p->console.ip) != 0)
	{
		snprintf(p->console.ip, sizeof(p->console.ip), "%s", ip);
		guardar_console(&p->console);
	}
	estado("conectando");
	ChiakiConnectInfo ci;
	memset(&ci, 0, sizeof(ci));
	ci.ps5 = chiaki_target_is_ps5((ChiakiTarget)p->console.target);
	ci.host = ip;
	memcpy(ci.regist_key, p->console.regist_key, sizeof(ci.regist_key));
	memcpy(ci.morning, p->console.rp_key, sizeof(ci.morning));
	ci.video_profile.width = p->largura;
	ci.video_profile.height = p->altura;
	ci.video_profile.max_fps = p->qps;
	ci.video_profile.bitrate = p->kbps;
	ci.video_profile.codec = p->h265 && ci.ps5 ? CHIAKI_CODEC_H265 : CHIAKI_CODEC_H264;
	ci.video_profile_auto_downgrade = true;
	ci.enable_keyboard = false;
	ci.enable_dualsense = false; // tremor simples (RUMBLE), não a vibração em som do DualSense
	ci.audio_video_disabled = 0;
	ci.auto_regist = false;
	ci.holepunch_session = NULL;
	ci.rudp_sock = NULL;
	ci.packet_loss_max = 0.05;
	ci.enable_idr_on_fec_failure = true;
	ChiakiSession *s = calloc(1, sizeof(ChiakiSession));
	if(!s || chiaki_session_init(s, &ci, &logChiaki) != CHIAKI_ERR_SUCCESS)
	{
		free(s);
		enviar_texto("{\"tipo\":\"saiu\",\"motivo\":\"iniciar\",\"erro\":true,\"texto\":\"Nao deu para iniciar a sessao.\"}");
		goto fim;
	}
	chiaki_session_set_event_cb(s, evento_cb, s);
	chiaki_session_set_video_sample_cb(s, video_cb, NULL);
	ChiakiAudioSink som;
	memset(&som, 0, sizeof(som));
	som.header_cb = som_cab_cb;
	som.frame_cb = som_cb;
	chiaki_session_set_audio_sink(s, &som);
	chiaki_controller_state_set_idle(&estadoPad);
	EnterCriticalSection(&travaSessao);
	sessao = s;
	LeaveCriticalSection(&travaSessao);
	if(chiaki_session_start(s) != CHIAKI_ERR_SUCCESS)
	{
		EnterCriticalSection(&travaSessao);
		sessao = NULL;
		LeaveCriticalSection(&travaSessao);
		chiaki_session_fini(s);
		free(s);
		enviar_texto("{\"tipo\":\"saiu\",\"motivo\":\"iniciar\",\"erro\":true,\"texto\":\"Nao deu para abrir a sessao.\"}");
		goto fim;
	}
	WaitForSingleObject(fimSessao, INFINITE);
	EnterCriticalSection(&travaSessao);
	sessao = NULL;
	LeaveCriticalSection(&travaSessao);
	chiaki_session_stop(s);
	chiaki_session_join(s);
	chiaki_session_fini(s);
	free(s);
	registrar_log("sessao encerrada");
fim:
	EnterCriticalSection(&travaEnvio);
	free(cabecalho);
	cabecalho = NULL;
	cabecalhoTam = 0;
	conectadoJson[0] = 0;
	LeaveCriticalSection(&travaEnvio);
	InterlockedExchange(&temSomCab, 0);
	estado("parado");
	free(p);
	InterlockedExchange(&sessaoRodando, 0);
	return 0;
}

static void conectar(const char *m)
{
	if(InterlockedCompareExchange(&sessaoRodando, 1, 0) != 0)
	{
		enviar_texto("{\"tipo\":\"aviso\",\"nivel\":\"W\",\"texto\":\"ja-conectado\"}");
		return;
	}
	char id[32] = "";
	json_texto(m, "id", id, sizeof(id));
	EnterCriticalSection(&travaConsoles);
	Console *c = achar_console(id);
	Pedido *p = c ? calloc(1, sizeof(Pedido)) : NULL;
	if(p) p->console = *c;
	LeaveCriticalSection(&travaConsoles);
	if(!p)
	{
		InterlockedExchange(&sessaoRodando, 0);
		enviar_texto("{\"tipo\":\"saiu\",\"motivo\":\"sem-registro\",\"erro\":true,\"texto\":\"Console nao registrado.\"}");
		return;
	}
	json_texto(m, "ip", p->ip, sizeof(p->ip));
	if(!p->ip[0]) snprintf(p->ip, sizeof(p->ip), "%s", p->console.ip);
	unsigned altura = (unsigned)json_num(m, "altura", 720);
	ChiakiConnectVideoProfile perfil;
	chiaki_connect_video_profile_preset(&perfil,
		altura >= 1080 ? CHIAKI_VIDEO_RESOLUTION_PRESET_1080p : altura >= 720 ? CHIAKI_VIDEO_RESOLUTION_PRESET_720p : CHIAKI_VIDEO_RESOLUTION_PRESET_540p,
		json_num(m, "qps", 60) >= 60 ? CHIAKI_VIDEO_FPS_PRESET_60 : CHIAKI_VIDEO_FPS_PRESET_30);
	p->largura = perfil.width;
	p->altura = perfil.height;
	p->qps = perfil.max_fps;
	unsigned kbps = (unsigned)json_num(m, "kbps", 0);
	p->kbps = kbps >= 1000 && kbps <= 50000 ? kbps : perfil.bitrate;
	char codec[16] = "";
	json_texto(m, "codec", codec, sizeof(codec));
	p->h265 = strcmp(codec, "h265") == 0;
	ResetEvent(fimSessao);
	seqVideo = seqSom = 0;
	HANDLE t = (HANDLE)_beginthreadex(NULL, 0, rodar_sessao, p, 0, NULL);
	if(t) CloseHandle(t);
	else { free(p); InterlockedExchange(&sessaoRodando, 0); }
}

// o estado do controle da sala (bits do mapa padrão do navegador) -> o do PS5
static void pad(const char *m)
{
	static const uint32_t MAPA[18] = {
		CHIAKI_CONTROLLER_BUTTON_CROSS, CHIAKI_CONTROLLER_BUTTON_MOON, CHIAKI_CONTROLLER_BUTTON_BOX, CHIAKI_CONTROLLER_BUTTON_PYRAMID,
		CHIAKI_CONTROLLER_BUTTON_L1, CHIAKI_CONTROLLER_BUTTON_R1, 0, 0,
		CHIAKI_CONTROLLER_BUTTON_SHARE, CHIAKI_CONTROLLER_BUTTON_OPTIONS, CHIAKI_CONTROLLER_BUTTON_L3, CHIAKI_CONTROLLER_BUTTON_R3,
		CHIAKI_CONTROLLER_BUTTON_DPAD_UP, CHIAKI_CONTROLLER_BUTTON_DPAD_DOWN, CHIAKI_CONTROLLER_BUTTON_DPAD_LEFT, CHIAKI_CONTROLLER_BUTTON_DPAD_RIGHT,
		CHIAKI_CONTROLLER_BUTTON_PS, CHIAKI_CONTROLLER_BUTTON_TOUCHPAD };
	uint32_t b = (uint32_t)json_num(m, "b", 0);
	ChiakiControllerState st;
	chiaki_controller_state_set_idle(&st);
	for(int i = 0; i < 18; i++) if((b >> i) & 1) st.buttons |= MAPA[i];
	double lt = json_num(m, "lt", 0), rt = json_num(m, "rt", 0);
	if((b >> 6) & 1 && lt < 1) lt = 1;
	if((b >> 7) & 1 && rt < 1) rt = 1;
	#define EIXO(v) ((int16_t)((v) < -1 ? -32768 : (v) > 1 ? 32767 : (v) * 32767))
	#define GATILHO(v) ((uint8_t)((v) < 0 ? 0 : (v) > 1 ? 255 : (v) * 255))
	st.left_x = EIXO(json_num(m, "lx", 0));
	st.left_y = EIXO(json_num(m, "ly", 0));
	st.right_x = EIXO(json_num(m, "rx", 0));
	st.right_y = EIXO(json_num(m, "ry", 0));
	st.l2_state = GATILHO(lt);
	st.r2_state = GATILHO(rt);
	// touchpad (DualSense de quem joga, pelo WebHID): t0x/t0y e t1x/t1y de 0 a 1, -1 sem dedo. O PS5
	// segue cada dedo pelo id do toque: começa ao encostar, anda enquanto encostado, para ao soltar.
	static ChiakiControllerState toque;
	static int8_t idDedo[2] = { -1, -1 };
	static bool toqueIniciado = false;
	if(!toqueIniciado) { chiaki_controller_state_set_idle(&toque); toqueIniciado = true; }
	for(int d = 0; d < 2; d++)
	{
		double x = json_num(m, d ? "t1x" : "t0x", -1), y = json_num(m, d ? "t1y" : "t0y", -1);
		bool encostado = x >= 0 && y >= 0;
		uint16_t px = (uint16_t)((x > 1 ? 1 : x) * 1919), py = (uint16_t)((y > 1 ? 1 : y) * 1079);
		if(encostado && idDedo[d] < 0) idDedo[d] = chiaki_controller_state_start_touch(&toque, px, py);
		else if(encostado) chiaki_controller_state_set_touch_pos(&toque, (uint8_t)idDedo[d], px, py);
		else if(idDedo[d] >= 0) { chiaki_controller_state_stop_touch(&toque, (uint8_t)idDedo[d]); idDedo[d] = -1; }
	}
	st.touch_id_next = toque.touch_id_next;
	memcpy(st.touches, toque.touches, sizeof(st.touches));
	EnterCriticalSection(&travaSessao);
	estadoPad = st;
	if(sessao) chiaki_session_set_controller_state(sessao, &estadoPad);
	LeaveCriticalSection(&travaSessao);
}

static volatile LONG descobrindo = 0;
static unsigned __stdcall rodar_descoberta(void *arg)
{
	(void)arg;
	descobrir(2000, NULL);
	mandar_achados();
	InterlockedExchange(&descobrindo, 0);
	return 0;
}

static void tratar(const char *m)
{
	char tipo[32] = "";
	if(!json_texto(m, "tipo", tipo, sizeof(tipo))) return;
	if(strcmp(tipo, "pad") == 0) pad(m);
	else if(strcmp(tipo, "chave") == 0)
	{
		// quadro-chave para quem perdeu um quadro (no máximo um pedido a cada 250 ms)
		ULONGLONG agora = GetTickCount64();
		if(agora - ultimaChave < 250) return;
		ultimaChave = agora;
		EnterCriticalSection(&travaSessao);
		if(sessao) chiaki_session_request_idr(sessao);
		LeaveCriticalSection(&travaSessao);
	}
	else if(strcmp(tipo, "consoles") == 0) mandar_consoles();
	else if(strcmp(tipo, "descobrir") == 0)
	{
		// leva uns 2 s: fora da thread da página (o controle não espera)
		if(InterlockedCompareExchange(&descobrindo, 1, 0) != 0) return;
		HANDLE t = (HANDLE)_beginthreadex(NULL, 0, rodar_descoberta, NULL, 0, NULL);
		if(t) CloseHandle(t);
		else InterlockedExchange(&descobrindo, 0);
	}
	else if(strcmp(tipo, "importar") == 0)
	{
		int n = importar_chiaki();
		char json[96];
		snprintf(json, sizeof(json), "{\"tipo\":\"importados\",\"n\":%d}", n);
		enviar_texto(json);
		mandar_consoles();
	}
	else if(strcmp(tipo, "registrar") == 0) registrar(m);
	else if(strcmp(tipo, "conectar") == 0) conectar(m);
	else if(strcmp(tipo, "parar") == 0) SetEvent(fimSessao);
	else if(strcmp(tipo, "pin") == 0)
	{
		char pin[16] = "";
		json_texto(m, "pin", pin, sizeof(pin));
		EnterCriticalSection(&travaSessao);
		if(sessao) chiaki_session_set_login_pin(sessao, (const uint8_t *)pin, strlen(pin));
		LeaveCriticalSection(&travaSessao);
	}
	else if(strcmp(tipo, "dormir") == 0)
	{
		EnterCriticalSection(&travaSessao);
		if(sessao) chiaki_session_goto_bed(sessao);
		LeaveCriticalSection(&travaSessao);
	}
	else if(strcmp(tipo, "esquecer") == 0)
	{
		char id[32] = "";
		json_texto(m, "id", id, sizeof(id));
		EnterCriticalSection(&travaConsoles);
		for(int i = 0; i < nConsoles; i++)
		{
			if(_stricmp(consoles[i].id, id) != 0) continue;
			memmove(&consoles[i], &consoles[i + 1], sizeof(Console) * (size_t)(nConsoles - i - 1));
			nConsoles--;
			break;
		}
		salvar_consoles();
		LeaveCriticalSection(&travaConsoles);
		mandar_consoles();
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

// uma página nova (cada uma na sua thread: a que chega toma o lugar da anterior)
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
	snprintf(oi, sizeof(oi), "{\"tipo\":\"oi\",\"versao\":\"%s\",\"sessao\":%s}", VERSAO, sessaoRodando ? "true" : "false");
	enviar_texto(oi);
	mandar_consoles();
	// sessão já no ar (a página recarregou): o que ela precisa para continuar
	EnterCriticalSection(&travaEnvio);
	char con[256];
	snprintf(con, sizeof(con), "%s", conectadoJson);
	uint8_t *cab = NULL;
	size_t cabTam = cabecalhoTam;
	if(cabecalho && cabTam) { cab = malloc(cabTam); if(cab) memcpy(cab, cabecalho, cabTam); }
	LeaveCriticalSection(&travaEnvio);
	if(con[0]) enviar_texto(con);
	if(temSomCab) som_cab_cb(&somCab, NULL);
	if(cab) { enviar_binario(3, 0, 0, 0, cab, cabTam); free(cab); }
	if(con[0])
	{
		EnterCriticalSection(&travaSessao);
		if(sessao) chiaki_session_request_idr(sessao);
		LeaveCriticalSection(&travaSessao);
	}
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
	SetEvent(fimSessao);
	Sleep(1500);
	ExitProcess(0);
	return 0;
}

int main(int argc, char **argv)
{
	int porta = 0;
	DWORD pai = 0;
	token[0] = 0;
	for(int i = 1; i + 1 < argc; i++)
	{
		if(strcmp(argv[i], "--porta") == 0) porta = atoi(argv[++i]);
		else if(strcmp(argv[i], "--token") == 0) snprintf(token, sizeof(token), "%s", argv[++i]);
		else if(strcmp(argv[i], "--pai") == 0) pai = (DWORD)strtoul(argv[++i], NULL, 10);
		else if(strcmp(argv[i], "--dados") == 0) snprintf(pastaDados, sizeof(pastaDados), "%s", argv[++i]);
	}
	if(strlen(token) < 16)
	{
		fprintf(stderr, "uso: sala3d-ps5 --token <16+ caracteres> [--porta N] [--pai PID] [--dados pasta]\n");
		return 2;
	}
	if(!pastaDados[0])
	{
		const char *la = getenv("LOCALAPPDATA");
		snprintf(pastaDados, sizeof(pastaDados), "%s\\Sala3d", la ? la : ".");
	}
	CreateDirectoryA(pastaDados, NULL);
	InitializeCriticalSection(&travaLog);
	InitializeCriticalSection(&travaEnvio);
	InitializeCriticalSection(&travaSessao);
	InitializeCriticalSection(&travaConsoles);
	InitializeCriticalSection(&travaAchados);
	char caminhoLog[MAX_PATH];
	snprintf(caminhoLog, sizeof(caminhoLog), "%s\\ps5-ponte.log", pastaDados);
	arquivoLog = fopen(caminhoLog, "w");
	registrar_log("sala3d-ps5 %s", VERSAO);
	chiaki_log_init(&logChiaki, CHIAKI_LOG_ERROR | CHIAKI_LOG_WARNING | CHIAKI_LOG_INFO, log_chiaki, NULL);
	if(chiaki_lib_init() != CHIAKI_ERR_SUCCESS) { registrar_log("chiaki_lib_init falhou"); return 1; }
	fimSessao = CreateEventA(NULL, TRUE, FALSE, NULL);
	carregar_consoles();
	// primeira vez, sem nenhum console: traz os do chiaki-ng, se ele estiver neste PC
	if(nConsoles == 0) importar_chiaki();

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
