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

Quem estiver com a sala aberta durante o deploy não precisa fazer nada: quando o servidor volta,
a página percebe que ele mudou de versão (o commit) e recarrega sozinha, voltando para a mesma sala.

## TURN: necessário para amigos em redes diferentes

O vídeo e a voz vão direto de um computador para o outro (WebRTC). Na mesma rede isso sempre
funciona; em redes diferentes, muita internet no Brasil (fibra com CGNAT, 4G) e o Brave bloqueiam
a conexão direta — a tela fica preta e a sala avisa "Não deu para conectar voz e vídeo". O TURN é
a ponte que resolve.

**Recomendado: TURN da Cloudflare (grátis, 1 TB/mês).** O servidor gera uma credencial que vence
em 48 h, então ninguém consegue usar a sua cota para sempre pegando a senha do site.

1. Crie uma conta grátis em [dash.cloudflare.com](https://dash.cloudflare.com) (não precisa de domínio).
2. No menu, abra **Realtime → TURN Server** e clique em **Create** (dê um nome, por exemplo `sala-3d`).
3. Ele mostra o **Turn Token ID** e o **API Token**. Copie os dois na hora: o API Token só aparece uma vez.
4. No Render: **Environment → Add Environment Variable**:

| Chave | Valor |
|---|---|
| `CF_TURN_KEY_ID` | o Turn Token ID |
| `CF_TURN_TOKEN` | o API Token |

Salvar as variáveis reinicia o serviço sozinho. Para conferir, abra `https://sala-3d.onrender.com/config`:
tem que aparecer `turn.cloudflare.com`.

**Reserva:** sem essas variáveis (ou se a Cloudflare não responder), o `server.js` usa a conta grátis
da Metered do dono da sala (20 GB/mês, e a senha fica exposta no `/config`). Para trocar de conta
Metered, crie uma em [metered.ca](https://www.metered.ca/stun-turn), abra **TURN Credentials** e
ponha no Render:

| Chave | Valor |
|---|---|
| `TURN_URL` | `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp` |
| `TURN_USER` | (o usuário mostrado no painel) |
| `TURN_PASS` | (a senha mostrada no painel) |

O TURN só entra como último recurso, quando a conexão direta falha. Ele repassa o vídeo inteiro:
uma tela em 1080p gasta cerca de 1 GB por hora por pessoa assistindo.

## Salas com senha de entrada (opcional)

O dono da sala pode pôr uma senha para entrar (painel **Sala da empresa → Senha para entrar**).
Quem acerta a senha não precisa digitá-la de novo naquele navegador. Para isso continuar valendo
depois de um reinício do servidor, crie no Render a variável `PASSE_SECRET` com um texto
aleatório longo (sem ela, depois de cada reinício a senha é pedida mais uma vez).

## Enquanto isso: link na hora, sem deploy

```bash
npm run publico
```

Sobe o servidor e o túnel Cloudflare juntos e imprime o link público.
Grátis e instantâneo, mas exige seu PC ligado e a URL muda a cada vez.
