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

## TURN: necessário para amigos em redes diferentes

O vídeo e a voz vão direto de um computador para o outro (WebRTC). Na mesma rede isso sempre
funciona; em redes diferentes, muita internet no Brasil (fibra com CGNAT, 4G) e o Brave bloqueiam
a conexão direta — a tela fica preta e a sala avisa "Não deu para conectar voz e vídeo". O TURN é
a ponte que resolve.

**Já vem configurado:** o `server.js` usa por padrão a conta grátis da Metered do dono da sala.
Só mexa nisto se quiser trocar de conta (ou a cota de 20 GB/mês acabar):

1. Crie uma conta grátis em [metered.ca](https://www.metered.ca/stun-turn) (plano free: 20 GB/mês).
2. No painel, crie um app e abra **TURN Credentials**: ele mostra um usuário, uma senha e a lista
   de endereços.
3. No Render: **Environment → Add Environment Variable**:

| Chave | Valor |
|---|---|
| `TURN_URL` | `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp` |
| `TURN_USER` | (o usuário mostrado no painel) |
| `TURN_PASS` | (a senha mostrada no painel) |

Se o painel mostrar outro endereço (por exemplo `a.relay.metered.ca`), use o dele no lugar de
`global.relay.metered.ca`. Salvar as variáveis reinicia o serviço sozinho.

O TURN só entra como último recurso, quando a conexão direta falha. Ele repassa o vídeo inteiro:
uma tela em 1080p gasta cerca de 1 GB por hora por pessoa assistindo.

## Enquanto isso: link na hora, sem deploy

```bash
npm run publico
```

Sobe o servidor e o túnel Cloudflare juntos e imprime o link público.
Grátis e instantâneo, mas exige seu PC ligado e a URL muda a cada vez.
