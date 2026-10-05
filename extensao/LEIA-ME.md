# Sala 3D — controle das abas (extensão do Chrome)

Deixa os amigos clicarem, rolarem e digitarem nas abas que você compartilha na Sala 3D.
Só precisa dela **quem compartilha**. Quem só controla não instala nada.

## Instalar (uma vez)

1. Abra `chrome://extensions` no Chrome (ou `edge://extensions` no Edge).
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha esta pasta `extensao`.
4. Abra a Sala 3D, clique no ícone de quebra-cabeça do Chrome → **Sala 3D — controle das abas**
   → **Liberar este site**. Só libere o endereço da sua sala.

## Janelas e tela inteira (opcional, só Windows)

Sozinha, a extensão só controla **abas**. Para deixarem mexer numa **janela** qualquer (um jogo,
o Explorer, outro programa) ou na **tela inteira**:

1. Dê dois cliques em `nativo\instalar.bat` (não precisa de administrador).
2. Em `chrome://extensions`, clique em **Recarregar** na extensão e recarregue a página da sala.

Aí quem controla mexe no **mouse e no teclado de verdade** do seu PC, sempre dentro da janela
ou tela compartilhada. A tecla Windows nunca é enviada. **Ctrl+Alt+End** no seu teclado corta o
controle na hora (só volta quando você liberar de novo). Para tirar: `nativo\desinstalar.bat`.
Se mover a pasta do projeto, rode o `instalar.bat` de novo.

## Usar

1. Compartilhe uma **aba** do Chrome — ou uma janela/tela, se instalou o ajudante acima.
2. No botão de compartilhar → **Suas telas**, clique no ícone de cursor da tela para
   **permitir controle**. Clique de novo para tirar.
3. Quem quiser mexer tem dois jeitos:
   - **Mesa** (tecla **Tab**): todas as telas da sala lado a lado, como monitores. Nas telas
     liberadas não precisa apertar nada: o mouse mexe na tela que está embaixo dele e o
     teclado vai para a última clicada. **Alt+1…9** troca de monitor, **Alt+Enter** amplia.
   - **Uma tela só**: abre a sua tela (E ou clique) e aperta **Controlar**.

   As suas **abas** também dá para controlar daqui (bom para testar sozinho). Janela e tela
   inteira, não: o ajudante moveria o seu próprio mouse e ele brigaria com ele mesmo.

   Nos dois, **Esc** volta para a sala com o mouse já girando a visão do boneco, e
   **Shift+Esc** manda um Esc para a tela. Ctrl+V cola texto.

Enquanto alguém controla, o Chrome mostra uma barra amarela dizendo que a extensão está
depurando o navegador. É assim que ela consegue clicar na aba. Fechar essa barra corta o
controle na hora.

## Segurança

- Só os sites liberados no ícone da extensão podem pedir controle.
- Só as telas em que você ligou "permitir controle" aceitam cliques dos outros.
- A sala só pede controle da aba que você compartilhou. Um site liberado, porém, teria
  como pedir outras abas: por isso libere só o endereço da sua sala.
