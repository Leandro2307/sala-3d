# Sala 3D — controle das abas (extensão do Chrome)

Deixa os amigos clicarem, rolarem e digitarem nas abas que você compartilha na Sala 3D, mostra
abas na sala sem a faixa do Chrome e abre qualquer site no navegador das telas da sala.
Só precisa dela **quem compartilha**. Quem só controla não instala nada.

## Instalar (uma vez)

1. Abra `chrome://extensions` no Chrome (ou `edge://extensions` no Edge).
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha esta pasta `extensao`.
4. Abra a Sala 3D, clique no ícone de quebra-cabeça do Chrome → **Sala 3D — controle das abas**
   → **Liberar este site**. O botão só aparece na página de uma Sala 3D: libere só a sua.

## Atualizar

Quando o servidor tem uma versão mais nova, a sala avisa (e Ajustes → Extensão de controle mostra
**Atualizar**). Baixe o .zip de novo, extraia **por cima da pasta de antes** (substituindo os
arquivos) e, em `chrome://extensions`, clique em **Recarregar** na extensão. Sem esse clique o
Chrome continua rodando a versão antiga.

Desde a 1.11 não precisa recarregar a página da sala depois: a extensão nova se apresenta sozinha
nas abas abertas. Se a pasta veio de outro lugar, carregue-a de novo pelo **Carregar sem compactação**.

## Mostrar uma aba sem a faixa do Chrome

Pelo botão de compartilhar da sala, o Chrome põe no topo da Sala 3D a faixa
**“Compartilhando ... com esta guia”** (uma por aba), e o site não consegue esconder.
Pela extensão não tem faixa:

1. Com a sala aberta (e o site liberado), vá para a aba que quer mostrar.
2. Aperte **Alt+Shift+S** — ou clique no ícone da extensão → **Mostrar esta aba na Sala 3D**.
3. A aba entra numa tela livre, com som. No escritório, se a sala precisar que você escolha a
   tela, ela vem para a frente sozinha.

O ícone da extensão mostra o resultado (**…** enquanto vai, **ok** ou **!** com o motivo) e,
enquanto a aba estiver na sala, um **ponto vermelho** — é o lembrete de que ela está sendo
mostrada, já que pela extensão não aparece a faixa. Para tirar a aba, aperte **Alt+Shift+S** nela
de novo (ou use o X da tela na sala).

O atalho pode ser trocado em `chrome://extensions/shortcuts` (o ícone da extensão tem um link
direto). Se outra extensão já usar Alt+Shift+S, o Chrome deixa este sem atalho: o ícone e a sala
avisam, e mostram o atalho certo quando você escolher outro.

## Usar o controle

1. Compartilhe uma **aba** do Chrome — ou uma janela/tela, se instalou o ajudante (mais abaixo).
2. No botão de compartilhar → **Suas telas**, clique no ícone de cursor da tela para
   **permitir controle**. Clique de novo para tirar.
3. Quem quiser mexer tem dois jeitos:
   - **Mesa** (tecla **Tab**): todas as telas da sala lado a lado, como monitores. Nas telas
     liberadas não precisa apertar nada: o mouse mexe na tela que está embaixo dele e o
     teclado vai para a última clicada. **Alt+1…9** troca de monitor, **Alt+Enter** amplia.
   - **Uma tela só**: abre a sua tela (E ou clique) e já sai mexendo.

   Nos dois, **Esc** volta para a sala com o mouse já girando a visão do boneco, e
   **Shift+Esc** manda um Esc para a tela. **Ctrl+V** cola o texto de quem controla.

   As suas **abas** também dá para controlar daqui (bom para testar sozinho). Janela e tela
   inteira, não: o ajudante moveria o seu próprio mouse e ele brigaria com ele mesmo.

Enquanto alguém controla uma aba, o Chrome mostra uma barra amarela dizendo que a extensão está
depurando o navegador — é assim que ela consegue clicar na aba. A barra some um minuto depois do
último movimento de quem controla. **Fechar a barra corta o controle na hora**; o ícone da
extensão também tem **Cortar o controle agora** (abas e janelas de uma vez). Para deixar de novo,
ligue "Permitir controle" na sala.

### Numa aba controlada

- **Navegar não corta o controle.** Clicar num link ou trocar de site pausa o controle só
  enquanto a página nova carrega. Em páginas do próprio Chrome (`chrome://…`) ele desliga e
  volta sozinho quando a aba abre um site comum.
- **Link que abriria aba nova abre na própria aba compartilhada** — quem está vendo não
  enxergaria a aba nova. Ctrl+clique (aba em segundo plano), Shift+clique (janela nova) e
  janelinhas de login ficam como sempre.
- **Barra de navegação** para quem controla, na mesa e no foco: voltar, avançar, recarregar e
  endereço (texto que não é endereço vira pesquisa no Google). A sala vê só o domínio do site
  aberto, nunca o endereço completo.
- **Duplo e triplo clique** selecionam palavra e parágrafo, como no seu Chrome.
- **AltGr** escreve o que escreve no seu teclado: @, €, ° — e, no ABNT2, / e ? pelo AltGr+Q/W.
- **Listas (`<select>`)**: a lista de opções do Chrome é uma janelinha fora da página, que não
  aparece no vídeo e não recebe o clique de quem controla. Enquanto a aba está sob controle, a
  extensão faz o Chrome desenhar a lista dentro da página (o `<select>` personalizável): todo
  mundo vê, e o clique escolhe. Ela volta ao normal quando o controle é solto.
- **Avisos do site** (alert, confirm, prompt e o "sair do site?") também são janelas do Chrome:
  a página fica parada esperando. A pergunta aparece para quem mexeu por último na aba, que
  responde de lá. Você também pode responder no seu Chrome — aí ela some para a outra pessoa.
- **Ctrl+C** de quem controla: o texto selecionado vai para a área de transferência dela (e
  para a sua, como sempre foi). Campo de senha nunca.
- **Clique direito** abre o menu do próprio site, se ele tiver; o menu do Chrome, que ninguém
  veria (e ficaria aberto na sua tela), não abre.

## Janelas e tela inteira (opcional, só Windows)

Sozinha, a extensão só controla **abas**. Para deixarem mexer numa **janela** qualquer (um jogo,
o Explorer, outro programa) ou na **tela inteira**:

1. Dê dois cliques em `nativo\instalar.bat` (não precisa de administrador).
2. Em `chrome://extensions`, clique em **Recarregar** na extensão.

Aí quem controla mexe no **mouse e no teclado de verdade** do seu PC, sempre dentro da janela
ou tela compartilhada. A tecla Windows nunca é enviada. **Ctrl+Alt+End** no seu teclado corta o
controle na hora (só volta quando você liberar de novo). Para tirar: `nativo\desinstalar.bat`.
Se mover a pasta do projeto, rode o `instalar.bat` de novo.

**Programa aberto como administrador** (pelo "Executar como administrador", ou um launcher que
abre o jogo assim): o Windows não deixa o ajudante, que é um programa comum, mexer nele. Os
cliques e as teclas somem sem erro nenhum. Desde a extensão 1.12 (ajudante 1.5) a sala avisa:
você, na hora de liberar o controle da janela (ou no primeiro clique, na tela inteira), e quem
estava mexendo. Feche o programa e abra sem administrador. Se ele sempre abre assim, desmarque
"Executar este programa como administrador" em Propriedades → Compatibilidade do atalho (e do
.exe do launcher).

O guia da sala (Ajustes → Extensão de controle) e o ícone da extensão dizem se o ajudante está
instalado. Ele se compila na primeira vez que abre e guarda o resultado em
`%LOCALAPPDATA%\Sala3d`: depois disso abre bem mais rápido, e só compila de novo quando o
`Ajudante.cs` muda (quando você atualiza a pasta). Se a janela compartilhada fechar, a sala avisa
em vez de deixar os cliques sumirem.

### Modo jogo

No controle comum de janela, jogo tipo Minecraft não gira a câmera nem anda com WASD: o jogo lê
o mouse pelo **movimento relativo** e as teclas pelo **código físico**, não pelo lugar do cursor
nem pelo texto digitado. Quem controla abre a tela da janela e clica em **Modo jogo** (ou aperta
**F8**): o mouse vira câmera e as teclas andam com o personagem. **Esc** pausa o jogo e solta o
mouse (para mexer nos menus); clicar na tela prende o mouse de novo.

Menos atraso: pela conexão direta a câmera sai ~125 vezes por segundo, lida na hora em que o mouse
mexe. O nome da tela em foco mostra o atraso medido (**~80 ms**, por exemplo: a rede mais a espera
de cada quadro até ficar pronto) e **via TURN** quando a conexão não fechou direto (com **(TCP)** é
uma rede que bloqueia UDP, e o atraso sobe). No PC de quem compartilha, limite os quadros do jogo
(60 no Minecraft, em Vídeo → Taxa de quadros máxima): com a placa de vídeo a 100% a captura da
janela fica esperando, e a imagem chega atrasada.

No **celular**, o modo jogo põe um controle de toque por cima da tela: analógico à esquerda,
arrastar o dedo para olhar e os botões do jogo. Desde a extensão 1.13 (ajudante 1.6) o ajudante
conta à sala que programa está na janela (na tela inteira, o da frente), e o celular troca sozinho
para os botões do jogo: **Minecraft** (barra de itens, chat, agachar e correr que ficam ligados),
**God of War** (os comandos de fábrica do PC: leve, pesado, esquiva, defender, mirar, machado,
Atreus, rúnico, fúria) ou **genérico** para os outros. Só o nome do jogo reconhecido vai para a
sala, nunca o título da janela. Com a extensão antiga, ou num jogo que ela não reconhece, toque no
nome do layout, no canto de cima, para escolher à mão (ali também fica a sensibilidade).

Nos menus do jogo (inventário, pausa, mapa), a tela do celular vira **tela de toque** (extensão
1.14, ajudante 1.7): tocar num lugar leva o cursor do PC até ali e clica, e arrastar leva o cursor
junto sem clicar. Com o ajudante antigo, o toque clica onde o cursor já está.

## Navegador nas telas da sala

Mirando numa tela livre (ou num monitor do seu posto) e clicando no **+**, dá para abrir um
**navegador** ali mesmo: abas, barra de endereço, voltar e avançar, como no Chrome. Só você vê,
e as abas ficam guardadas naquela tela. Com a tela na mira, **E** usa o navegador; **Esc** volta
a andar. As páginas fixas que o dono da sala põe nas telas usam o mesmo navegador.

Sozinha, a sala só consegue abrir sites que deixam aparecer dentro de outra página. A extensão
tira essa trava **só dentro das telas da Sala 3D** (nas abas do site liberado): YouTube, Google e
os outros abrem normalmente. Ela também conta o endereço e o título de cada aba na hora em que
mudam, faz o voltar/avançar funcionar dentro do site, abre os links de "aba nova" como aba do
navegador da sala (Ctrl+clique e botão do meio abrem por trás, como no Chrome) e faz o teclado e o
mouse do seu posto se mexerem enquanto você digita no site (em campo de senha ela não diz qual
tecla foi).

**Login nas telas.** Dentro de outra página o Chrome não grava o cookie de sessão da maioria dos
sites (SameSite), e o login não "pegava": o site voltava deslogado. A extensão grava esses cookies
de novo de um jeito que vale dentro das telas, aproveita o login que você já tem nas abas normais
do Chrome e libera cookies de terceiros com a sala como página principal. Às vezes a página
recarrega sozinha uma vez logo depois de entrar: é o cookie chegando. Alguns sites (o login do
Google, por exemplo) podem recusar entrar dentro de outra página: entre pelo botão **Abrir esta
aba no Chrome**, volte para a tela e clique em **Recarregar** na barra do navegador da sala: ela
abre logada.

## O ícone da extensão

- **Esta aba**: mostrar na sala ou tirar de lá, com o atalho de verdade e um link para trocá-lo.
- **Alguém está mexendo**: quais abas e janelas estão sob controle agora, e **Cortar o controle
  agora**.
- **Site da Sala 3D**: liberar a sala aberta (só aparece numa Sala 3D) e a lista dos liberados.
- Embaixo, a versão da extensão e se o ajudante do Windows está instalado.

## Segurança

- Só os sites liberados no ícone da extensão podem pedir controle, e o botão de liberar só
  aparece na página de uma Sala 3D.
- Só as telas em que você ligou "permitir controle" aceitam cliques dos outros.
- A sala só pede controle da aba que você compartilhou. Um site liberado, porém, teria
  como pedir outras abas: por isso libere só o endereço da sua sala.
- O texto do Ctrl+C só vai para quem controlava a tela e apertou o Ctrl+C nela; ninguém recebe
  texto na área de transferência sem ter pedido.
- A trava "não abrir dentro de outra página" (X-Frame-Options / CSP) só é tirada nos sites
  abertos dentro das telas da aba da Sala 3D. As outras abas do Chrome não mudam, e se a aba da
  sala for para outro site, a trava volta nela na hora. O site aberto na tela não consegue mudar
  a página da sala (o quadro dele não tem permissão para isso).
- Os cookies dos sites que você abre nas telas passam a ser SameSite=None no Chrome todo (é o
  mesmo cookie das abas normais). Isso tira desses sites uma proteção contra pedidos vindos de
  outros sites; os outros sites do Chrome não mudam.
