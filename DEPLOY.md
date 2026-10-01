# Colocar a Sala 3D no ar 24/7 (Render, grátis)

O projeto já está pronto: commit feito, `.gitignore` protegendo a chave privada e
`render.yaml` configurando o serviço sozinho. Faltam só os dois passos que dependem
das **suas contas** — eu não consigo fazer login por você.

## 1. Mandar o código pro GitHub

O `gh` (GitHub CLI) já está instalado. Abra um terminal **novo** (o PATH mudou) e rode:

```bash
gh auth login          # abre o navegador pra você entrar no GitHub
gh repo create sala-3d --private --source=. --push
```

> Repositório privado funciona no Render, inclusive no plano grátis.
> Se preferir sem o `gh`: crie o repo em github.com e rode
> `git remote add origin <url>` e `git push -u origin main`.

## 2. Criar o serviço no Render

1. Entre em **[dashboard.render.com](https://dashboard.render.com)** (dá pra criar conta com o próprio GitHub).
2. **New → Blueprint**.
3. Escolha o repositório `sala-3d` e clique em **Apply**.

O Render lê o `render.yaml` e configura tudo: plano grátis, `npm ci`, `npm start`,
região Virginia (a mais perto do Brasil) e health check em `/config`.

Em 2-3 minutos sai o link fixo:

```
https://sala-3d.onrender.com
```

Esse link **não muda mais** e é HTTPS — então microfone e voz funcionam.

## O que esperar do plano grátis

| | |
|---|---|
| Link | Fixo, não muda nunca |
| HTTPS | Automático (microfone funciona) |
| Dorme | Depois de 15 min **sem ninguém** na sala |
| Acordar | O primeiro a entrar espera ~1 minuto |
| Enquanto tem gente | **Não dorme** — o jogo manda posições sem parar, e isso conta como tráfego |
| Horas/mês | 750 (um serviço 24/7 usa 730, então cabe exatamente um) |

Nada se perde quando ele dorme: o estado da sala já vive só na memória, e o próprio
código apaga sala vazia depois de 30 minutos.

## Atualizar depois

Todo `git push` na branch `main` faz o Render redeployar sozinho:

```bash
git add -A && git commit -m "o que mudou" && git push
```

## Opcional: TURN, se algum amigo não conseguir conectar

O WebRTC é P2P e às vezes 4G ou rede de empresa bloqueia. Aí vale um TURN.
No Render: **Environment → Add Environment Variable**:

| Chave | Valor |
|---|---|
| `TURN_URL` | `turn:standard.relay.metered.ca:80` |
| `TURN_USER` | (seu usuário do Open Relay) |
| `TURN_PASS` | (sua senha do Open Relay) |

Pegue as credenciais grátis em [metered.ca/tools/openrelay](https://www.metered.ca/tools/openrelay/)
— 20 GB/mês. Atenção: TURN repassa o vídeo inteiro, e tela em 1080p gasta cerca de
1 GB por hora. Ele só entra como último recurso, quando o P2P falha.

## Enquanto isso: link na hora, sem deploy

```bash
npm run publico
```

Sobe o servidor e o túnel Cloudflare juntos e imprime o link público.
Grátis e instantâneo, mas exige seu PC ligado e a URL muda a cada vez.
