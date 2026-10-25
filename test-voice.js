const Voz = require('./voz-servidor');

(async () => {
  const frase = 'Teste de voz';
  // força geração para voz 0
  const id = Voz.urlDaFrase(frase, 0);
  console.log('ID returned initially (may be null):', id);
  // aguarda algum tempo para síntese completar
  await new Promise(r => setTimeout(r, 5000));
  const id2 = Voz.urlDaFrase(frase, 0);
  console.log('ID after wait:', id2);
  if (id2) {
    const http = require('http');
    http.get({hostname:'localhost', port:3000, path:`/ct-voz/${id2}.mp3`}, (res) => {
      console.log('Status code:', res.statusCode);
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        console.log('Received bytes:', Buffer.concat(data).length);
      });
    }).on('error', err => console.error('Request error', err));
  }
})();
