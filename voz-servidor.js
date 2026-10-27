// A rota antiga /ct-voz/:id.mp3 (de quando o servidor sintetizava os gritos na hora). Hoje as vozes
// da mesa de cartas são mp3 gravados em public/audio/cartas (scripts/gerar-vozes-cartas.js), com o
// nome de arquivoVoz (cartas-regras.js); um cliente antigo ainda pode pedir a rota durante o deploy.
function servir(_req, res) {
  res.status(410).end();
}

module.exports = { servir };
