# Instruções para testar e melhorar a voz neural

## 1. Instalar dependências corretamente

O projeto usa o pacote **msedge-tts** para gerar a voz neural do Microsoft Edge. Ele precisa estar instalado em `node_modules`.

```powershell
# Na pasta do projeto
cd "C:\Users\Leandro\Desktop\Compartilhar tela"

# Instala todas as dependências (repetir se ocorrer EPERM)
npm install
```

> No Windows pode acontecer o erro `EPERM: operation not permitted, mkdir ...`.  Tente executar o comando novamente – o erro costuma ser transitório (Regra 7). Se persistir, certifique‑se de que nenhum antivírus ou editor está bloqueando a criação de pastas dentro `node_modules`.

## 2. Iniciar o servidor

```powershell
# Inicia o servidor em modo daemon (continua rodando em background)
node server.js --port 3000
```

O servidor ficará ouvindo na porta **3000** (ou na porta configurada em `process.env.PORT`).

## 3. Aquecer (esquentar) as frases

O módulo `voz-servidor.js` tem a função `esquentar(frases)` que gera antecipadamente todos os áudios das frases usadas nos gritos.  Isso evita que a primeira chamada dispare a API e caia no fallback.

Crie um pequeno script (já incluído como `test-voice.js`) e ajuste o array `frases` com todas as frases do seu jogo:

```js
const Voz = require('./voz-servidor');

const frases = [
  'Teste de voz',
  // <<< adicione aqui as demais frases que aparecem nos gritos >>>
];

Voz.esquentar(frases);
console.log('Esquentando... aguarde alguns segundos');
```

Execute-o **após** iniciar o servidor:

```powershell
node test-voice.js
```

Ele chamará `urlDaFrase` para cada frase, colocando‑as na fila.  O próprio módulo já controla o back‑off e evita o limite 429.

## 4. Verificar o endpoint de áudio

Depois que a fila terminar (alguns segundos), use o ID retornado por `urlDaFrase` para buscar o MP3:

```powershell
# Substitua <ID> pelo valor retornado (ex.: a3f9c2d1e4b5)
curl http://localhost:3000/ct-voz/<ID>.mp3 --output teste.mp3
```

Se o download retornar **200** e o arquivo `teste.mp3` não estiver vazio, a voz está funcionando.

## 5. Por que às vezes cai para o fallback?

- **Limite da API (429)** – o Edge TTS permite apenas algumas solicitações rápidas por IP. Quando a fila tenta sintetizar várias frases seguidas, o motor responde 429 e o código volta `null`. O módulo já implementa back‑off exponencial (até 5 min) e tenta novamente.
- **Fila cheia** – a implementação limita a fila a 500 itens (`fila.length < 500`). Se ultrapassar, os novos pedidos são descartados e o cliente usa a voz do sistema.
- **Primeira chamada** – antes de a frase estar no cache, o cliente recebe `null` até a síntese terminar.

## 6. Estratégias para reduzir quedas

1. **Pré‑aquecimento** – chame `Voz.esquentar` uma única vez na inicialização do servidor com a lista completa de frases.  Assim, todas ficam na fila logo de início.
2. **Aumentar o limite da fila** – se precisar de mais que 500 frases simultâneas, altere a condição em `urlDaFrase` (linha 85) para um número maior.
3. **Persistir o cache** – atualmente o cache está em memória (`porId`, `porChave`). Você pode serializá‑lo em disco (ex.: gravar em `./cache/voz.json`) e recarregar ao iniciar o servidor, evitando repetir sínteses em reinicializações.
4. **Usar Azure Speech Containers** – caso o limite da API seja impeditivo, considere rodar o contêiner oficial da Microsoft (qualidade idêntica, porém sem 429). Consulte a [documentação](https://learn.microsoft.com/azure/cognitive-services/speech-service/speech-container-howto).
5. **Monitorar erros** – o log já imprime `Voz neural limitada pela API (429/rede)…`. Você pode adicionar um webhook ou enviar métricas a um serviço de observabilidade para alertas.

## 7. Próximos passos recomendados

- Execute novamente `npm install` se ainda houver erro EPERM (repetir até 2 vezes).
- Inicie o servidor (`node server.js`).
- Execute o script de aquecimento (`node test-voice.js`).
- Teste o endpoint com `curl` ou navegando para `http://localhost:3000/ct-voz/<ID>.mp3`.
- Se o problema de fallback persistir, considere migrar para Azure Speech Containers conforme explicação acima.
